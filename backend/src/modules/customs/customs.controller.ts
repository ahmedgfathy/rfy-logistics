import type { Request, Response } from 'express';
import {
  Prisma,
  type AciStatus,
  type CustomsFile,
  type CustomsFileStatus,
  type DeclarationStatus,
  type HsCode,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { defaultCompanyId } from '../../lib/company';
import { money } from '../../lib/money';
import { nextNumber } from '../../lib/numbers';
import { ApiError } from '../../middleware/error';
import { currentUser } from '../../middleware/auth';
import { recordAuditTx } from '../../services/audit.service';
import { paginationMeta, parsePagination } from '../../utils/pagination';
import { calculateDeclarationLine, calculateDeclarationTotals } from './customs.calculations';
import type {
  AciCreateInput,
  AciUpdateInput,
  CustomsFileCreateInput,
  CustomsFileQuery,
  CustomsFileStatusInput,
  CustomsFileUpdateInput,
  DeclarationAssessInput,
  DeclarationCancelInput,
  DeclarationCreateInput,
  DeclarationLineInput,
  DeclarationQuery,
  DeclarationReleaseInput,
  DeclarationUpdateInput,
  HsCodeCreateInput,
  HsCodeQuery,
  HsCodeUpdateInput,
} from './customs.schemas';

const fileStatusTransitions: Record<CustomsFileStatus, readonly CustomsFileStatus[]> = {
  DRAFT: ['ACI_PENDING', 'DECLARATION_DRAFT', 'UNDER_REVIEW', 'INSPECTION', 'PAYMENT_PENDING', 'CANCELLED'],
  ACI_PENDING: ['ACI_ACCEPTED', 'DECLARATION_DRAFT', 'PAYMENT_PENDING', 'CANCELLED'],
  ACI_ACCEPTED: ['DECLARATION_DRAFT', 'PAYMENT_PENDING', 'CANCELLED'],
  DECLARATION_DRAFT: ['UNDER_REVIEW', 'INSPECTION', 'PAYMENT_PENDING', 'CANCELLED'],
  UNDER_REVIEW: ['DECLARATION_DRAFT', 'INSPECTION', 'PAYMENT_PENDING', 'CANCELLED'],
  INSPECTION: ['UNDER_REVIEW', 'PAYMENT_PENDING', 'CANCELLED'],
  PAYMENT_PENDING: ['RELEASED', 'UNDER_REVIEW', 'INSPECTION', 'CANCELLED'],
  RELEASED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

const aciStatusTransitions: Record<AciStatus, readonly AciStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: [],
  REJECTED: ['SUBMITTED', 'CANCELLED'],
  CANCELLED: [],
};

const declarationAssessableStatuses: DeclarationStatus[] = ['DRAFT', 'SUBMITTED'];
const declarationReleasableStatuses: DeclarationStatus[] = ['ASSESSED', 'PAID'];
const regulatoryFinalDeclarationStatuses: DeclarationStatus[] = ['ASSESSED', 'PAID', 'RELEASED'];
const terminalFileStatuses: CustomsFileStatus[] = ['RELEASED', 'CLOSED', 'CANCELLED'];

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'private, no-store');
}

function assertFileTransition(from: CustomsFileStatus, to: CustomsFileStatus): void {
  if (from === to || !fileStatusTransitions[from].includes(to)) {
    throw ApiError.badRequest(`Cannot change customs file status from ${from} to ${to}`);
  }
}

function assertAciTransition(from: AciStatus, to: AciStatus): void {
  if (from === to || !aciStatusTransitions[from].includes(to)) {
    throw ApiError.badRequest(`Cannot change ACI status from ${from} to ${to}`);
  }
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function uniqueViolationTargets(error: Prisma.PrismaClientKnownRequestError): string[] {
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.map(String);
  return typeof target === 'string' ? [target] : [];
}

function rethrowDeclarationNumberConflict(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    uniqueViolationTargets(error).some((target) => target.includes('declarationNumber'))
  ) {
    throw new ApiError(409, 'CONFLICT', 'This declaration number already exists for the customs file');
  }
  throw error;
}

function rethrowHsCodeConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ApiError(409, 'CONFLICT', 'An HS code with this code already exists');
  }
  throw error;
}

async function lockCustomsFileTx(tx: Prisma.TransactionClient, id: string, companyId: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT cf.id FROM "CustomsFile" cf
    WHERE cf.id = ${id}::uuid AND cf."companyId" = ${companyId}::uuid
    FOR UPDATE OF cf
  `);
  if (!rows[0]) throw ApiError.notFound('Customs file not found');
}

async function lockHsCodeTx(tx: Prisma.TransactionClient, id: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM "HsCode" WHERE id = ${id}::uuid FOR UPDATE
  `);
  if (!rows[0]) throw ApiError.notFound('HS code not found');
}

async function lockDeclarationTx(tx: Prisma.TransactionClient, id: string, companyId: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT d.id FROM "CustomsDeclaration" d
    JOIN "CustomsFile" cf ON cf.id = d."customsFileId"
    WHERE d.id = ${id}::uuid AND cf."companyId" = ${companyId}::uuid
    FOR UPDATE OF d
  `);
  if (!rows[0]) throw ApiError.notFound('Customs declaration not found');
}

async function findCustomsFileTx(
  tx: Prisma.TransactionClient,
  id: string,
  companyId: string,
): Promise<CustomsFile> {
  const file = await tx.customsFile.findFirst({ where: { id, companyId } });
  if (!file) throw ApiError.notFound('Customs file not found');
  return file;
}

async function findDeclarationTx(tx: Prisma.TransactionClient, id: string, companyId: string) {
  const declaration = await tx.customsDeclaration.findFirst({
    where: { id, customsFile: { companyId } },
    include: { lines: { orderBy: { lineNumber: 'asc' } } },
  });
  if (!declaration) throw ApiError.notFound('Customs declaration not found');
  return declaration;
}

function assertFileIsOpen(file: CustomsFile, operation: string): void {
  if (terminalFileStatuses.includes(file.status)) {
    throw ApiError.badRequest(`Cannot ${operation} a ${file.status.toLowerCase()} customs file`);
  }
}

async function assertDeclarationNumberAvailableTx(
  tx: Prisma.TransactionClient,
  customsFileId: string,
  declarationNumber: string | null | undefined,
  excludeId?: string,
): Promise<void> {
  if (!declarationNumber) return;
  const duplicate = await tx.customsDeclaration.findFirst({
    where: {
      customsFileId,
      declarationNumber,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new ApiError(409, 'CONFLICT', 'This declaration number already exists for the customs file');
  }
}

async function assertNoDeclarationBillsTx(tx: Prisma.TransactionClient, declarationId: string): Promise<void> {
  const billCount = await tx.bill.count({ where: { declarationId } });
  if (billCount > 0) throw ApiError.badRequest('A bill-linked declaration cannot be edited or cancelled');
}

async function assertFileMetadataEditableTx(tx: Prisma.TransactionClient, file: CustomsFile): Promise<void> {
  if (terminalFileStatuses.includes(file.status)) {
    throw ApiError.badRequest(`Cannot edit metadata for a ${file.status.toLowerCase()} customs file`);
  }
  const [regulatedDeclarations, acceptedFilings] = await Promise.all([
    tx.customsDeclaration.count({
      where: {
        customsFileId: file.id,
        OR: [
          { status: { in: regulatoryFinalDeclarationStatuses } },
          { declarationNumber: { not: null } },
        ],
      },
    }),
    tx.aciFiling.count({ where: { customsFileId: file.id, status: 'ACCEPTED' } }),
  ]);
  if (regulatedDeclarations > 0 || acceptedFilings > 0) {
    throw ApiError.badRequest('Customs file metadata cannot be changed after regulatory finalization');
  }
}

function hsCodeEffectiveOn(
  code: Pick<HsCode, 'isActive' | 'effectiveFrom' | 'effectiveTo'>,
  date: Date,
): boolean {
  return (
    code.isActive &&
    code.effectiveFrom.getTime() <= date.getTime() &&
    (!code.effectiveTo || date.getTime() < code.effectiveTo.getTime())
  );
}

async function prepareDeclarationLines(
  tx: Prisma.TransactionClient,
  lines: DeclarationLineInput[],
  declarationDate: Date,
  existingHsCodeIds: ReadonlySet<string> = new Set(),
) {
  const lineNumbers = lines.map((line, index) => line.lineNumber ?? index + 1);
  if (new Set(lineNumbers).size !== lineNumbers.length) {
    throw ApiError.badRequest('Declaration line numbers must be unique');
  }

  const hsCodeIds = [
    ...new Set(
      lines
        .map((line) => line.hsCodeId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
  const hsCodes = hsCodeIds.length
    ? await tx.hsCode.findMany({
        where: { id: { in: hsCodeIds } },
        select: {
          id: true,
          code: true,
          defaultDutyRate: true,
          defaultTaxRate: true,
          isActive: true,
          effectiveFrom: true,
          effectiveTo: true,
        },
      })
    : [];
  const hsCodesById = new Map(hsCodes.map((hsCode) => [hsCode.id, hsCode]));
  for (const hsCodeId of hsCodeIds) {
    const hsCode = hsCodesById.get(hsCodeId);
    if (!hsCode) throw ApiError.notFound('HS code not found');
    if (!existingHsCodeIds.has(hsCodeId) && !hsCodeEffectiveOn(hsCode, declarationDate)) {
      throw ApiError.badRequest(`HS code ${hsCode.code} is not active for the declaration date`);
    }
  }

  return lines.map((line, index) => {
    const hsCode = line.hsCodeId ? hsCodesById.get(line.hsCodeId) : undefined;
    const snapshot = (line.hsCodeSnapshot ?? hsCode?.code ?? '').trim().toUpperCase();
    if (
      line.hsCodeSnapshot &&
      hsCode &&
      !existingHsCodeIds.has(hsCode.id) &&
      snapshot !== hsCode.code.toUpperCase()
    ) {
      throw ApiError.badRequest('HS code snapshot does not match the selected HS code');
    }
    const dutyRatePercent = line.dutyRatePercent ?? hsCode?.defaultDutyRate.toString() ?? '0';
    const taxRatePercent = line.taxRatePercent ?? hsCode?.defaultTaxRate.toString() ?? '0';
    return {
      lineNumber: lineNumbers[index],
      hsCodeId: line.hsCodeId ?? null,
      hsCodeSnapshot: snapshot,
      description: line.description,
      originCountry: line.originCountry,
      quantity: line.quantity,
      quantityUnit: line.quantityUnit,
      weightKg: line.weightKg ?? null,
      customsValue: line.customsValue,
      currency: line.currency,
      exchangeRate: line.exchangeRate,
      dutyRatePercent,
      taxRatePercent,
      calculation: calculateDeclarationLine({
        customsValue: line.customsValue,
        exchangeRate: line.exchangeRate,
        dutyRatePercent,
        taxRatePercent,
        otherAmount: line.otherAmount,
      }),
    };
  });
}

async function transitionFileStatusTx(
  tx: Prisma.TransactionClient,
  input: {
    file: CustomsFile;
    status: CustomsFileStatus;
    description: string;
    userId: string;
    ip?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<CustomsFile> {
  const { file, status, description, userId, ip } = input;
  assertFileTransition(file.status, status);
  const now = new Date();
  const updated = await tx.customsFile.update({
    where: { id: file.id, version: file.version },
    data: {
      status,
      version: { increment: 1 },
      ...(status === 'CLOSED' || status === 'CANCELLED' ? { closedAt: now } : {}),
      events: {
        create: {
          status,
          description,
          occurredAt: now,
          createdById: userId,
        },
      },
    },
  });
  await recordAuditTx(tx, {
    userId,
    action: 'customs.file.status_changed',
    entity: 'CustomsFile',
    entityId: file.id,
    metadata: {
      from: file.status,
      to: status,
      ...input.metadata,
    } as Prisma.InputJsonValue,
    ip,
  });
  return updated;
}

async function assertFileReadyForReleaseTx(tx: Prisma.TransactionClient, customsFileId: string): Promise<void> {
  const declarations = await tx.customsDeclaration.findMany({
    where: { customsFileId },
    select: {
      id: true,
      status: true,
      totalPayable: true,
      paidAmount: true,
      balance: true,
    },
  });
  const active = declarations.filter((declaration) => declaration.status !== 'CANCELLED');
  if (!active.length || active.some((declaration) => declaration.status !== 'RELEASED')) {
    throw ApiError.badRequest('All active declarations must be released before the customs file can be released');
  }
  if (
    active.some(
      (declaration) =>
        declaration.paidAmount.lt(declaration.totalPayable) ||
        declaration.balance.isNegative() ||
        declaration.balance.gt(0),
    )
  ) {
    throw ApiError.badRequest('All declarations must be fully paid with no negative balance before release');
  }
}

export async function listCustomsFiles(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const query = res.locals.query as CustomsFileQuery;
  const pagination = parsePagination(query, 25);
  const search = query.search?.trim() ?? '';
  const where: Prisma.CustomsFileWhereInput = {
    companyId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.direction ? { direction: query.direction } : {}),
    ...(query.shipmentId ? { shipmentId: query.shipmentId } : {}),
    ...(query.importerId ? { importerId: query.importerId } : {}),
    ...(query.brokerId ? { brokerId: query.brokerId } : {}),
  };
  if (search) {
    where.OR = [
      { number: { contains: search, mode: 'insensitive' } },
      { portCode: { contains: search, mode: 'insensitive' } },
      { customsOffice: { contains: search, mode: 'insensitive' } },
      { shipment: { trackingNumber: { contains: search, mode: 'insensitive' } } },
      { shipment: { reference: { contains: search, mode: 'insensitive' } } },
      { importer: { nameEn: { contains: search, mode: 'insensitive' } } },
      { importer: { nameAr: { contains: search, mode: 'insensitive' } } },
      { broker: { nameEn: { contains: search, mode: 'insensitive' } } },
      { broker: { nameAr: { contains: search, mode: 'insensitive' } } },
      {
        declarations: {
          some: {
            OR: [
              { number: { contains: search, mode: 'insensitive' } },
              { declarationNumber: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      },
    ];
  }

  const [total, files] = await Promise.all([
    prisma.customsFile.count({ where }),
    prisma.customsFile.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        shipment: { select: { id: true, trackingNumber: true, reference: true, status: true } },
        importer: { select: { id: true, code: true, nameEn: true, nameAr: true } },
        broker: { select: { id: true, code: true, nameEn: true, nameAr: true } },
        _count: { select: { aciFilings: true, declarations: true, events: true } },
      },
    }),
  ]);
  noStore(res);
  res.json({ data: files, meta: paginationMeta(total, pagination) });
}

export async function createCustomsFile(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as CustomsFileCreateInput;
  const created = await prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.findFirst({ where: { id: body.shipmentId, companyId } });
    if (!shipment) throw ApiError.notFound('Shipment not found');

    const importer = await tx.businessPartner.findFirst({
      where: { id: body.importerId, companyId, deletedAt: null },
    });
    if (!importer) throw ApiError.notFound('Importer not found');

    if (body.brokerId) {
      const broker = await tx.businessPartner.findFirst({
        where: { id: body.brokerId, companyId, deletedAt: null },
      });
      if (!broker) throw ApiError.notFound('Broker not found');
    }

    if (body.assignedToId) {
      const assignee = await tx.user.findFirst({ where: { id: body.assignedToId, isActive: true } });
      if (!assignee) throw ApiError.notFound('Assigned user not found');
    }

    const number = await nextNumber(tx, companyId, 'CUSTOMS_FILE', 'CF');
    const file = await tx.customsFile.create({
      data: {
        companyId,
        number,
        shipmentId: body.shipmentId,
        importerId: body.importerId,
        brokerId: body.brokerId ?? null,
        direction: body.direction,
        portCode: body.portCode,
        customsOffice: body.customsOffice ?? null,
        openedAt: body.openedAt ?? undefined,
        notes: body.notes ?? null,
        assignedToId: body.assignedToId ?? null,
        events: {
          create: {
            status: 'DRAFT',
            description: 'Customs file created',
            createdById: user.id,
          },
        },
      },
    });
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'customs.file.created',
      entity: 'CustomsFile',
      entityId: file.id,
      metadata: {
        number,
        shipmentId: body.shipmentId,
        importerId: body.importerId,
        brokerId: body.brokerId ?? null,
        direction: body.direction,
        portCode: body.portCode,
      },
      ip: req.ip,
    });
    return file;
  });
  noStore(res);
  res.status(201).json({ data: created });
}

export async function getCustomsFile(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const file = await prisma.customsFile.findFirst({
    where: { id: req.params.id, companyId },
    include: {
      shipment: { select: { id: true, trackingNumber: true, reference: true, status: true } },
      importer: { select: { id: true, code: true, nameEn: true, nameAr: true } },
      broker: { select: { id: true, code: true, nameEn: true, nameAr: true } },
      aciFilings: { orderBy: { createdAt: 'desc' } },
      declarations: {
        orderBy: { updatedAt: 'desc' },
        include: {
          lines: { orderBy: { lineNumber: 'asc' } },
          charges: { orderBy: { label: 'asc' } },
        },
      },
      events: { orderBy: { occurredAt: 'desc' } },
    },
  });
  if (!file) throw ApiError.notFound('Customs file not found');
  noStore(res);
  res.json({ data: file });
}

export async function updateCustomsFile(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as CustomsFileUpdateInput;
  const updated = await prisma.$transaction(async (tx) => {
    await lockCustomsFileTx(tx, req.params.id, companyId);
    const existing = await findCustomsFileTx(tx, req.params.id, companyId);
    await assertFileMetadataEditableTx(tx, existing);

    if (body.shipmentId) {
      const shipment = await tx.shipment.findFirst({ where: { id: body.shipmentId, companyId } });
      if (!shipment) throw ApiError.notFound('Shipment not found');
    }
    if (body.importerId) {
      const importer = await tx.businessPartner.findFirst({
        where: { id: body.importerId, companyId, deletedAt: null },
      });
      if (!importer) throw ApiError.notFound('Importer not found');
    }
    if (body.brokerId) {
      const broker = await tx.businessPartner.findFirst({
        where: { id: body.brokerId, companyId, deletedAt: null },
      });
      if (!broker) throw ApiError.notFound('Broker not found');
    }
    if (body.assignedToId) {
      const assignee = await tx.user.findFirst({ where: { id: body.assignedToId, isActive: true } });
      if (!assignee) throw ApiError.notFound('Assigned user not found');
    }

    const data: Prisma.CustomsFileUncheckedUpdateInput = { version: { increment: 1 } };
    if (body.shipmentId !== undefined) data.shipmentId = body.shipmentId;
    if (body.importerId !== undefined) data.importerId = body.importerId;
    if (body.brokerId !== undefined) data.brokerId = body.brokerId;
    if (body.direction !== undefined) data.direction = body.direction;
    if (body.portCode !== undefined) data.portCode = body.portCode;
    if (body.customsOffice !== undefined) data.customsOffice = body.customsOffice;
    if (body.openedAt !== undefined) data.openedAt = body.openedAt;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.assignedToId !== undefined) data.assignedToId = body.assignedToId;

    const file = await tx.customsFile
      .update({ where: { id: existing.id, version: existing.version }, data })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
          throw ApiError.badRequest('Customs file changed concurrently; please retry');
        }
        throw error;
      });

    const metadataFields = [
      'shipmentId',
      'importerId',
      'brokerId',
      'direction',
      'portCode',
      'customsOffice',
      'openedAt',
      'notes',
      'assignedToId',
    ] as const;
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'customs.file.updated',
      entity: 'CustomsFile',
      entityId: file.id,
      metadata: jsonValue({
        fields: Object.keys(body),
        before: Object.fromEntries(metadataFields.map((field) => [field, existing[field]])),
        after: Object.fromEntries(metadataFields.map((field) => [field, file[field]])),
      }),
      ip: req.ip,
    });
    return file;
  });
  noStore(res);
  res.json({ data: updated });
}

export async function updateCustomsFileStatus(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as CustomsFileStatusInput;
  const updated = await prisma.$transaction(async (tx) => {
    const file = await findCustomsFileTx(tx, req.params.id, companyId);
    assertFileTransition(file.status, body.status);
    if (body.status === 'RELEASED') {
      await assertFileReadyForReleaseTx(tx, file.id);
    }
    return transitionFileStatusTx(tx, {
      file,
      status: body.status,
      description: body.description ?? `Customs file status changed from ${file.status} to ${body.status}`,
      userId: user.id,
      ip: req.ip,
    });
  });
  noStore(res);
  res.json({ data: updated });
}

export async function createAciFiling(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as AciCreateInput;
  const created = await prisma.$transaction(async (tx) => {
    await lockCustomsFileTx(tx, req.params.id, companyId);
    const file = await findCustomsFileTx(tx, req.params.id, companyId);
    assertFileIsOpen(file, 'create an ACI filing for');

    if (body.acidNumber) {
      const existing = await tx.aciFiling.findUnique({ where: { acidNumber: body.acidNumber } });
      if (existing) throw new ApiError(409, 'CONFLICT', 'An ACI filing with this ACID number already exists');
    }

    const now = new Date();
    const filing = await tx.aciFiling.create({
      data: {
        customsFileId: file.id,
        acidNumber: body.acidNumber ?? null,
        nafezaRequestNumber: body.nafezaRequestNumber ?? null,
        nafezaItemNumber: body.nafezaItemNumber ?? null,
        status: body.status,
        submittedAt:
          body.submittedAt ??
          (body.status === 'DRAFT' || body.status === 'CANCELLED' ? null : now),
        respondedAt:
          body.respondedAt ?? (body.status === 'ACCEPTED' || body.status === 'REJECTED' ? now : null),
        responseReference: body.responseReference ?? null,
        payloadHash: body.payloadHash ?? null,
        notes: body.notes ?? null,
      },
    });
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'customs.aci.created',
      entity: 'AciFiling',
      entityId: filing.id,
      metadata: {
        customsFileId: file.id,
        status: filing.status,
        acidNumber: filing.acidNumber,
        nafezaRequestNumber: filing.nafezaRequestNumber,
        nafezaItemNumber: filing.nafezaItemNumber,
      },
      ip: req.ip,
    });
    return filing;
  });
  noStore(res);
  res.status(201).json({ data: created });
}

export async function updateAciFiling(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as AciUpdateInput;
  const updated = await prisma.$transaction(async (tx) => {
    const filingReference = await tx.aciFiling.findFirst({
      where: { id: req.params.id, customsFile: { companyId } },
      select: { customsFileId: true },
    });
    if (!filingReference) throw ApiError.notFound('ACI filing not found');
    await lockCustomsFileTx(tx, filingReference.customsFileId, companyId);
    const existing = await tx.aciFiling.findFirst({
      where: { id: req.params.id, customsFile: { companyId } },
      include: { customsFile: { select: { id: true, status: true } } },
    });
    if (!existing) throw ApiError.notFound('ACI filing not found');
    if (terminalFileStatuses.includes(existing.customsFile.status)) {
      throw ApiError.badRequest('Cannot update an ACI filing on a closed customs file');
    }
    if (body.status !== undefined) assertAciTransition(existing.status, body.status);

    const data: Prisma.AciFilingUpdateManyMutationInput = {};
    if (body.acidNumber !== undefined) data.acidNumber = body.acidNumber;
    if (body.nafezaRequestNumber !== undefined) data.nafezaRequestNumber = body.nafezaRequestNumber;
    if (body.nafezaItemNumber !== undefined) data.nafezaItemNumber = body.nafezaItemNumber;
    if (body.responseReference !== undefined) data.responseReference = body.responseReference;
    if (body.payloadHash !== undefined) data.payloadHash = body.payloadHash;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.submittedAt !== undefined) data.submittedAt = body.submittedAt;
    if (body.respondedAt !== undefined) data.respondedAt = body.respondedAt;

    if (body.status !== undefined) {
      data.status = body.status;
      if (body.status === 'SUBMITTED') {
        data.submittedAt = body.submittedAt ?? existing.submittedAt ?? new Date();
        data.respondedAt = body.respondedAt ?? null;
        if (body.responseReference === undefined) data.responseReference = null;
      }
      if (body.status === 'ACCEPTED' || body.status === 'REJECTED') {
        data.respondedAt = body.respondedAt ?? existing.respondedAt ?? new Date();
      }
    }

    const result = await tx.aciFiling.updateMany({
      where: {
        id: existing.id,
        ...(body.status !== undefined ? { status: existing.status } : {}),
      },
      data,
    });
    if (result.count !== 1) throw ApiError.badRequest('ACI filing changed concurrently; please retry');
    const filing = await tx.aciFiling.findUnique({ where: { id: existing.id } });
    if (!filing) throw ApiError.notFound('ACI filing not found');

    await recordAuditTx(tx, {
      userId: user.id,
      action: 'customs.aci.updated',
      entity: 'AciFiling',
      entityId: filing.id,
      metadata: {
        customsFileId: filing.customsFileId,
        from: existing.status,
        to: filing.status,
        acidNumber: filing.acidNumber,
        nafezaRequestNumber: filing.nafezaRequestNumber,
        nafezaItemNumber: filing.nafezaItemNumber,
      },
      ip: req.ip,
    });
    return filing;
  });
  noStore(res);
  res.json({ data: updated });
}

export async function listCustomsDeclarations(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const query = res.locals.query as DeclarationQuery;
  const pagination = parsePagination(query, 25);
  const search = query.search?.trim() ?? '';
  const where: Prisma.CustomsDeclarationWhereInput = {
    customsFile: { companyId },
    ...(query.status ? { status: query.status } : {}),
    ...(query.direction ? { direction: query.direction } : {}),
    ...(query.customsFileId ? { customsFileId: query.customsFileId } : {}),
  };
  if (search) {
    where.OR = [
      { number: { contains: search, mode: 'insensitive' } },
      { declarationNumber: { contains: search, mode: 'insensitive' } },
      { customsFile: { number: { contains: search, mode: 'insensitive' } } },
      { customsFile: { shipment: { trackingNumber: { contains: search, mode: 'insensitive' } } } },
      { lines: { some: { hsCodeSnapshot: { contains: search, mode: 'insensitive' } } } },
      { lines: { some: { description: { contains: search, mode: 'insensitive' } } } },
    ];
  }

  const [total, declarations] = await Promise.all([
    prisma.customsDeclaration.count({ where }),
    prisma.customsDeclaration.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        customsFile: {
          select: {
            id: true,
            number: true,
            status: true,
            shipment: { select: { id: true, trackingNumber: true, reference: true } },
          },
        },
        _count: { select: { lines: true, charges: true, documents: true } },
      },
    }),
  ]);
  noStore(res);
  res.json({ data: declarations, meta: paginationMeta(total, pagination) });
}

export async function createCustomsDeclaration(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as DeclarationCreateInput;
  const created = await prisma.$transaction(async (tx) => {
    await lockCustomsFileTx(tx, body.customsFileId, companyId);
    const file = await findCustomsFileTx(tx, body.customsFileId, companyId);
    assertFileIsOpen(file, 'create a declaration for');
    if (body.direction && body.direction !== file.direction) {
      throw ApiError.badRequest('Declaration direction must match the customs file direction');
    }

    const declarationDate = body.declarationDate ?? new Date();
    const preparedLines = await prepareDeclarationLines(tx, body.lines, declarationDate);
    const calculations = preparedLines.map((line) => line.calculation);
    const totals = calculateDeclarationTotals(calculations, body.paidAmount);
    await assertDeclarationNumberAvailableTx(tx, file.id, body.declarationNumber);

    const number = await nextNumber(tx, companyId, 'DECLARATION', 'DEC');
    const declaration = await tx.customsDeclaration.create({
      data: {
        customsFileId: file.id,
        number,
        declarationNumber: body.declarationNumber ?? null,
        direction: body.direction ?? file.direction,
        declarationDate,
        currency: 'EGP',
        ...totals,
        paidAmount: body.paidAmount,
        lines: {
          create: preparedLines.map(({ calculation, ...line }) => ({
            ...line,
            ...calculation,
          })),
        },
      },
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
    });

    if (['DRAFT', 'ACI_PENDING', 'ACI_ACCEPTED'].includes(file.status)) {
      await transitionFileStatusTx(tx, {
        file,
        status: 'DECLARATION_DRAFT',
        description: `Declaration ${declaration.number} created`,
        userId: user.id,
        ip: req.ip,
        metadata: { declarationId: declaration.id, declarationNumber: declaration.number },
      });
    }

    await recordAuditTx(tx, {
      userId: user.id,
      action: 'customs.declaration.created',
      entity: 'CustomsDeclaration',
      entityId: declaration.id,
      metadata: {
        customsFileId: file.id,
        number: declaration.number,
        declarationNumber: declaration.declarationNumber,
        totalPayable: declaration.totalPayable.toFixed(2),
        paidAmount: declaration.paidAmount.toFixed(2),
        balance: declaration.balance.toFixed(2),
      },
      ip: req.ip,
    });
    return declaration;
  }).catch(rethrowDeclarationNumberConflict);
  noStore(res);
  res.status(201).json({ data: created });
}

export async function getCustomsDeclaration(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const declaration = await prisma.customsDeclaration.findFirst({
    where: { id: req.params.id, customsFile: { companyId } },
    include: {
      customsFile: {
        select: {
          id: true,
          number: true,
          status: true,
          direction: true,
          portCode: true,
          shipment: { select: { id: true, trackingNumber: true, reference: true } },
          importer: { select: { id: true, code: true, nameEn: true, nameAr: true } },
        },
      },
      lines: {
        orderBy: { lineNumber: 'asc' },
        include: { hsCode: { select: { id: true, code: true, descriptionEn: true, descriptionAr: true } } },
      },
      charges: {
        orderBy: { label: 'asc' },
        include: { chargeItem: { select: { id: true, code: true, nameEn: true, nameAr: true } } },
      },
      bills: { select: { id: true, number: true, status: true }, orderBy: { createdAt: 'desc' } },
      documents: { include: { document: true } },
    },
  });
  if (!declaration) throw ApiError.notFound('Customs declaration not found');
  noStore(res);
  res.json({ data: declaration });
}

export async function updateCustomsDeclaration(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as DeclarationUpdateInput;
  const updated = await prisma.$transaction(async (tx) => {
    await lockDeclarationTx(tx, req.params.id, companyId);
    const existing = await findDeclarationTx(tx, req.params.id, companyId);
    if (existing.status !== 'DRAFT') {
      throw ApiError.badRequest(`Cannot edit a declaration in ${existing.status} status`);
    }
    await assertNoDeclarationBillsTx(tx, existing.id);
    await lockCustomsFileTx(tx, existing.customsFileId, companyId);
    const file = await findCustomsFileTx(tx, existing.customsFileId, companyId);
    assertFileIsOpen(file, 'edit a declaration for');

    const direction = body.direction ?? existing.direction;
    if (direction !== file.direction) {
      throw ApiError.badRequest('Declaration direction must match the customs file direction');
    }
    const declarationNumber =
      body.declarationNumber === undefined ? existing.declarationNumber : body.declarationNumber;
    await assertDeclarationNumberAvailableTx(tx, existing.customsFileId, declarationNumber, existing.id);
    const declarationDate = body.declarationDate ?? existing.declarationDate ?? new Date();
    const paidAmount = body.paidAmount ?? existing.paidAmount;
    const existingHsCodeIds = new Set(
      existing.lines.flatMap((line) => (line.hsCodeId ? [line.hsCodeId] : [])),
    );
    const sourceLines: DeclarationLineInput[] = body.lines ?? existing.lines.map((line) => ({
      lineNumber: line.lineNumber,
      hsCodeId: line.hsCodeId,
      hsCodeSnapshot: line.hsCodeSnapshot,
      description: line.description,
      originCountry: line.originCountry,
      quantity: line.quantity.toString(),
      quantityUnit: line.quantityUnit,
      weightKg: line.weightKg?.toString() ?? null,
      customsValue: line.customsValue.toString(),
      currency: line.currency,
      exchangeRate: line.exchangeRate.toString(),
      dutyRatePercent: line.dutyRatePercent.toString(),
      taxRatePercent: line.taxRatePercent.toString(),
      otherAmount: line.otherAmount.toString(),
    }));
    const preparedLines = await prepareDeclarationLines(tx, sourceLines, declarationDate, existingHsCodeIds);
    const totals = calculateDeclarationTotals(preparedLines.map((line) => line.calculation), paidAmount);

    const result = await tx.customsDeclaration.updateMany({
      where: { id: existing.id, status: 'DRAFT', version: existing.version },
      data: {
        declarationNumber,
        declarationDate,
        direction,
        paidAmount,
        ...totals,
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) throw ApiError.badRequest('Declaration changed concurrently; please retry');

    if (body.lines) {
      await tx.declarationLine.deleteMany({ where: { declarationId: existing.id } });
      await tx.declarationLine.createMany({
        data: preparedLines.map(({ calculation, ...line }) => ({ ...line, ...calculation, declarationId: existing.id })),
      });
    }

    const declaration = await tx.customsDeclaration.findUnique({
      where: { id: existing.id },
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
    });
    if (!declaration) throw ApiError.notFound('Customs declaration not found');
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'customs.declaration.updated',
      entity: 'CustomsDeclaration',
      entityId: declaration.id,
      metadata: jsonValue({
        customsFileId: declaration.customsFileId,
        fields: Object.keys(body),
        linesReplaced: body.lines !== undefined,
        fromVersion: existing.version,
        toVersion: declaration.version,
        before: {
          declarationNumber: existing.declarationNumber,
          declarationDate: existing.declarationDate,
          direction: existing.direction,
          paidAmount: existing.paidAmount,
          totalPayable: existing.totalPayable,
          balance: existing.balance,
          lineCount: existing.lines.length,
        },
        after: {
          declarationNumber: declaration.declarationNumber,
          declarationDate: declaration.declarationDate,
          direction: declaration.direction,
          paidAmount: declaration.paidAmount,
          totalPayable: declaration.totalPayable,
          balance: declaration.balance,
          lineCount: declaration.lines.length,
        },
      }),
      ip: req.ip,
    });
    return declaration;
  }).catch(rethrowDeclarationNumberConflict);
  noStore(res);
  res.json({ data: updated });
}

export async function cancelCustomsDeclaration(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as DeclarationCancelInput;
  const cancelled = await prisma.$transaction(async (tx) => {
    await lockDeclarationTx(tx, req.params.id, companyId);
    const existing = await findDeclarationTx(tx, req.params.id, companyId);
    if (existing.status !== 'DRAFT') {
      throw ApiError.badRequest(`Cannot cancel a declaration in ${existing.status} status`);
    }
    await assertNoDeclarationBillsTx(tx, existing.id);
    await lockCustomsFileTx(tx, existing.customsFileId, companyId);
    const file = await findCustomsFileTx(tx, existing.customsFileId, companyId);
    assertFileIsOpen(file, 'cancel a declaration for');
    if (existing.declarationNumber) {
      throw ApiError.badRequest('A declaration with an external declaration number cannot be cancelled');
    }
    if (existing.paidAmount.gt(0)) {
      throw ApiError.badRequest('A declaration with recorded payment cannot be cancelled');
    }
    const paidCharges = await tx.declarationCharge.count({
      where: { declarationId: existing.id, isPaid: true },
    });
    if (paidCharges > 0) throw ApiError.badRequest('A declaration with paid charges cannot be cancelled');
    if (existing.assessedDate || existing.releasedDate) {
      throw ApiError.badRequest('An assessed or released declaration cannot be cancelled');
    }

    const result = await tx.customsDeclaration.updateMany({
      where: { id: existing.id, status: 'DRAFT', version: existing.version },
      data: { status: 'CANCELLED', version: { increment: 1 } },
    });
    if (result.count !== 1) throw ApiError.badRequest('Declaration changed concurrently; please retry');
    const declaration = await tx.customsDeclaration.findUnique({ where: { id: existing.id } });
    if (!declaration) throw ApiError.notFound('Customs declaration not found');
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'customs.declaration.cancelled',
      entity: 'CustomsDeclaration',
      entityId: declaration.id,
      metadata: {
        customsFileId: declaration.customsFileId,
        number: declaration.number,
        from: existing.status,
        to: declaration.status,
        fromVersion: existing.version,
        toVersion: declaration.version,
        reason: body.reason ?? null,
      },
      ip: req.ip,
    });
    return declaration;
  });
  noStore(res);
  res.json({ data: cancelled });
}

export async function assessCustomsDeclaration(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as DeclarationAssessInput;
  const assessed = await prisma.$transaction(async (tx) => {
    const existing = await tx.customsDeclaration.findFirst({
      where: { id: req.params.id, customsFile: { companyId } },
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
    });
    if (!existing) throw ApiError.notFound('Customs declaration not found');
    if (!declarationAssessableStatuses.includes(existing.status)) {
      throw ApiError.badRequest(`Cannot assess a declaration in ${existing.status} status`);
    }
    if (!existing.lines.length) throw ApiError.badRequest('A declaration must have at least one line before assessment');

    const file = await findCustomsFileTx(tx, existing.customsFileId, companyId);
    assertFileIsOpen(file, 'assess a declaration for');
    const declarationNumber =
      body.declarationNumber === undefined ? existing.declarationNumber : body.declarationNumber;
    await assertDeclarationNumberAvailableTx(tx, existing.customsFileId, declarationNumber, existing.id);
    const calculations = existing.lines.map((line) =>
      calculateDeclarationLine({
        customsValue: line.customsValue,
        exchangeRate: line.exchangeRate,
        dutyRatePercent: line.dutyRatePercent,
        taxRatePercent: line.taxRatePercent,
        otherAmount: line.otherAmount,
      }),
    );
    const totals = calculateDeclarationTotals(calculations, existing.paidAmount);
    const now = new Date();
    const result = await tx.customsDeclaration.updateMany({
      where: {
        id: existing.id,
        status: { in: declarationAssessableStatuses },
        version: existing.version,
      },
      data: {
        status: 'ASSESSED',
        declarationNumber,
        declarationDate: body.declarationDate ?? existing.declarationDate ?? now,
        assessedDate: body.assessedDate ?? now,
        ...totals,
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) throw ApiError.badRequest('Declaration changed concurrently; please retry');
    const declaration = await tx.customsDeclaration.findUnique({
      where: { id: existing.id },
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
    });
    if (!declaration) throw ApiError.notFound('Customs declaration not found');

    if (file.status !== 'PAYMENT_PENDING') {
      await transitionFileStatusTx(tx, {
        file,
        status: 'PAYMENT_PENDING',
        description: `Declaration ${declaration.number} assessed; payment pending`,
        userId: user.id,
        ip: req.ip,
        metadata: { declarationId: declaration.id, declarationNumber: declaration.number },
      });
    }

    await recordAuditTx(tx, {
      userId: user.id,
      action: 'customs.declaration.assessed',
      entity: 'CustomsDeclaration',
      entityId: declaration.id,
      metadata: {
        customsFileId: declaration.customsFileId,
        from: existing.status,
        to: declaration.status,
        totalPayable: declaration.totalPayable.toFixed(2),
        balance: declaration.balance.toFixed(2),
      },
      ip: req.ip,
    });
    return declaration;
  }).catch(rethrowDeclarationNumberConflict);
  noStore(res);
  res.json({ data: assessed });
}

export async function releaseCustomsDeclaration(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as DeclarationReleaseInput;
  const released = await prisma.$transaction(async (tx) => {
    const existing = await findDeclarationTx(tx, req.params.id, companyId);
    if (!declarationReleasableStatuses.includes(existing.status)) {
      throw ApiError.badRequest(`Cannot release a declaration in ${existing.status} status`);
    }
    const file = await findCustomsFileTx(tx, existing.customsFileId, companyId);
    assertFileIsOpen(file, 'release a declaration for');

    const paidAmount = money(body.paidAmount);
    if (existing.totalPayable.isNegative() || existing.balance.isNegative() || existing.paidAmount.isNegative()) {
      throw ApiError.badRequest('Declaration contains an invalid negative balance or payment amount');
    }
    if (paidAmount.lt(existing.paidAmount)) {
      throw ApiError.badRequest('Paid amount cannot be lower than the amount already recorded');
    }
    if (paidAmount.lt(existing.totalPayable)) {
      throw ApiError.badRequest('Paid amount must be at least the total payable before release');
    }
    const rawBalance = existing.totalPayable.minus(paidAmount);
    const balance = rawBalance.isNegative() ? money(0) : rawBalance;

    const result = await tx.customsDeclaration.updateMany({
      where: {
        id: existing.id,
        status: { in: declarationReleasableStatuses },
        version: existing.version,
      },
      data: {
        status: 'RELEASED',
        paidAmount,
        balance,
        releasedDate: body.releasedDate ?? new Date(),
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) throw ApiError.badRequest('Declaration changed concurrently; please retry');
    await tx.declarationCharge.updateMany({
      where: { declarationId: existing.id },
      data: { isPaid: true },
    });

    const pendingDeclarations = await tx.customsDeclaration.count({
      where: {
        customsFileId: file.id,
        status: { notIn: ['RELEASED', 'CANCELLED'] },
      },
    });
    let fileReleased = false;
    if (pendingDeclarations === 0) {
      if (file.status !== 'PAYMENT_PENDING') {
        await transitionFileStatusTx(tx, {
          file,
          status: 'PAYMENT_PENDING',
          description: `Declaration ${existing.number} paid; payment pending`,
          userId: user.id,
          ip: req.ip,
          metadata: { declarationId: existing.id },
        });
      }
      const paymentPendingFile = await findCustomsFileTx(tx, file.id, companyId);
      await transitionFileStatusTx(tx, {
        file: paymentPendingFile,
        status: 'RELEASED',
        description: `Declaration ${existing.number} released`,
        userId: user.id,
        ip: req.ip,
        metadata: { declarationId: existing.id },
      });
      fileReleased = true;
    } else if (file.status !== 'PAYMENT_PENDING') {
      await transitionFileStatusTx(tx, {
        file,
        status: 'PAYMENT_PENDING',
        description: `Declaration ${existing.number} paid; other declarations remain open`,
        userId: user.id,
        ip: req.ip,
        metadata: { declarationId: existing.id },
      });
    }

    const declaration = await tx.customsDeclaration.findUnique({
      where: { id: existing.id },
      include: {
        lines: { orderBy: { lineNumber: 'asc' } },
        charges: { orderBy: { label: 'asc' } },
      },
    });
    if (!declaration) throw ApiError.notFound('Customs declaration not found');
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'customs.declaration.released',
      entity: 'CustomsDeclaration',
      entityId: declaration.id,
      metadata: {
        customsFileId: declaration.customsFileId,
        from: existing.status,
        to: declaration.status,
        paidAmount: declaration.paidAmount.toFixed(2),
        totalPayable: declaration.totalPayable.toFixed(2),
        balance: declaration.balance.toFixed(2),
        paymentReference: body.paymentReference ?? null,
        customsFileReleased: fileReleased,
      },
      ip: req.ip,
    });
    return declaration;
  });
  noStore(res);
  res.json({ data: released });
}

export async function listHsCodes(req: Request, res: Response): Promise<void> {
  const query = res.locals.query as HsCodeQuery;
  const pagination = parsePagination(query, 25);
  const search = query.search?.trim() ?? '';
  const where: Prisma.HsCodeWhereInput = {
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
  };
  if (search) {
    where.OR = [
      { code: { contains: search, mode: 'insensitive' } },
      { descriptionEn: { contains: search, mode: 'insensitive' } },
      { descriptionAr: { contains: search, mode: 'insensitive' } },
    ];
  }
  const [total, hsCodes] = await Promise.all([
    prisma.hsCode.count({ where }),
    prisma.hsCode.findMany({
      where,
      orderBy: { code: 'asc' },
      skip: pagination.skip,
      take: pagination.limit,
    }),
  ]);
  noStore(res);
  res.json({ data: hsCodes, meta: paginationMeta(total, pagination) });
}

export async function createHsCode(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const body = req.body as HsCodeCreateInput;
  const created = await prisma.$transaction(async (tx) => {
    const existing = await tx.hsCode.findUnique({ where: { code: body.code }, select: { id: true } });
    if (existing) throw new ApiError(409, 'CONFLICT', 'An HS code with this code already exists');
    const hsCode = await tx.hsCode.create({ data: body });
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'customs.hs_code.created',
      entity: 'HsCode',
      entityId: hsCode.id,
      metadata: {
        code: hsCode.code,
        defaultDutyRate: hsCode.defaultDutyRate.toString(),
        defaultTaxRate: hsCode.defaultTaxRate.toString(),
      },
      ip: req.ip,
    });
    return hsCode;
  }).catch(rethrowHsCodeConflict);
  noStore(res);
  res.status(201).json({ data: created });
}

export async function updateHsCode(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const body = req.body as HsCodeUpdateInput;
  const updated = await prisma.$transaction(async (tx) => {
    await lockHsCodeTx(tx, req.params.id);
    const existing = await tx.hsCode.findUnique({ where: { id: req.params.id } });
    if (!existing) throw ApiError.notFound('HS code not found');
    if (body.code && body.code !== existing.code) {
      const duplicate = await tx.hsCode.findUnique({ where: { code: body.code }, select: { id: true } });
      if (duplicate) throw new ApiError(409, 'CONFLICT', 'An HS code with this code already exists');
    }

    const now = new Date();
    const effectiveFrom = body.effectiveFrom ?? existing.effectiveFrom;
    let effectiveTo = body.effectiveTo !== undefined ? body.effectiveTo : existing.effectiveTo;
    const isActive = body.isActive ?? existing.isActive;
    if (body.isActive === false && existing.isActive && !effectiveTo && effectiveFrom.getTime() < now.getTime()) {
      effectiveTo = now;
    }
    if (
      body.isActive === true &&
      !existing.isActive &&
      body.effectiveTo === undefined &&
      effectiveTo &&
      effectiveTo.getTime() <= now.getTime()
    ) {
      effectiveTo = null;
    }
    if (effectiveTo && effectiveTo.getTime() <= effectiveFrom.getTime()) {
      throw ApiError.badRequest('Effective end must be after effective start');
    }

    const hsCode = await tx.hsCode.update({
      where: { id: existing.id },
      data: {
        ...(body.code !== undefined ? { code: body.code } : {}),
        ...(body.descriptionEn !== undefined ? { descriptionEn: body.descriptionEn } : {}),
        ...(body.descriptionAr !== undefined ? { descriptionAr: body.descriptionAr } : {}),
        ...(body.defaultDutyRate !== undefined ? { defaultDutyRate: body.defaultDutyRate } : {}),
        ...(body.defaultTaxRate !== undefined ? { defaultTaxRate: body.defaultTaxRate } : {}),
        isActive,
        effectiveFrom,
        effectiveTo,
      },
    });
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'customs.hs_code.updated',
      entity: 'HsCode',
      entityId: hsCode.id,
      metadata: jsonValue({
        fields: Object.keys(body),
        before: {
          code: existing.code,
          descriptionEn: existing.descriptionEn,
          descriptionAr: existing.descriptionAr,
          defaultDutyRate: existing.defaultDutyRate,
          defaultTaxRate: existing.defaultTaxRate,
          isActive: existing.isActive,
          effectiveFrom: existing.effectiveFrom,
          effectiveTo: existing.effectiveTo,
        },
        after: {
          code: hsCode.code,
          descriptionEn: hsCode.descriptionEn,
          descriptionAr: hsCode.descriptionAr,
          defaultDutyRate: hsCode.defaultDutyRate,
          defaultTaxRate: hsCode.defaultTaxRate,
          isActive: hsCode.isActive,
          effectiveFrom: hsCode.effectiveFrom,
          effectiveTo: hsCode.effectiveTo,
        },
      }),
      ip: req.ip,
    });
    return hsCode;
  }).catch(rethrowHsCodeConflict);
  noStore(res);
  res.json({ data: updated });
}
