import crypto from 'node:crypto';
import { Prisma, type ShipmentStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { defaultCompanyId } from '../../lib/company';
import { readIdempotentResponse, requireIdempotencyKey, saveIdempotentResponse } from '../../lib/idempotency';
import { nextNumber } from '../../lib/numbers';
import { ApiError } from '../../middleware/error';
import { currentUser } from '../../middleware/auth';
import { recordAuditTx } from '../../services/audit.service';
import { parsePagination, paginationMeta } from '../../utils/pagination';
import type {
  ContainerCreateBody,
  ContainerUpdateBody,
  PackageCreateBody,
  PackageUpdateBody,
  ShipmentCreateBody,
  ShipmentEventBody,
  ShipmentUpdateBody,
  VendorCancelBody,
  VendorCreateBody,
  VendorUpdateBody,
} from './operations.schemas';

const terminalStatuses: readonly ShipmentStatus[] = ['DELIVERED', 'CANCELLED'];
const shipmentTransitions: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  BOOKED: ['ORIGIN_PICKUP', 'DEPARTED_ORIGIN', 'IN_TRANSIT', 'DELAYED', 'CANCELLED'],
  ORIGIN_PICKUP: ['DEPARTED_ORIGIN', 'IN_TRANSIT', 'DELAYED', 'CANCELLED'],
  DEPARTED_ORIGIN: ['IN_TRANSIT', 'CUSTOMS_CLEARANCE', 'DELAYED', 'CANCELLED'],
  IN_TRANSIT: ['CUSTOMS_CLEARANCE', 'OUT_FOR_DELIVERY', 'DELAYED', 'CANCELLED'],
  CUSTOMS_CLEARANCE: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELAYED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'DELAYED', 'CANCELLED'],
  DELIVERED: [],
  DELAYED: ['ORIGIN_PICKUP', 'DEPARTED_ORIGIN', 'IN_TRANSIT', 'CUSTOMS_CLEARANCE', 'OUT_FOR_DELIVERY', 'CANCELLED'],
  CANCELLED: [],
};

interface OperationResult<T> {
  status: number;
  body: { data: T };
}

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'private, no-store');
}

async function lockCompanyTx(tx: Prisma.TransactionClient, companyId: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM "Company" WHERE id = ${companyId}::uuid FOR UPDATE`,
  );
  if (!rows[0]) throw ApiError.notFound('Company not found');
}

async function writeOperation<T>(
  req: Request,
  companyId: string,
  operation: string,
  status: number,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<OperationResult<T>> {
  const key = req.headers['idempotency-key'] === undefined ? null : requireIdempotencyKey(req);
  const fingerprint = crypto.createHash('sha256')
    .update(JSON.stringify({ body: req.body ?? null, params: req.params ?? null, query: req.query ?? null }))
    .digest('hex');
  const scopedKey = key ? `${operation}:${key}` : '';

  return prisma.$transaction(async (tx) => {
    if (key) {
      await lockCompanyTx(tx, companyId);
      const cached = await readIdempotentResponse(tx, companyId, scopedKey);
      if (cached !== null) {
        const record = cached as { fingerprint?: unknown; status?: unknown; body?: unknown };
        if (record.fingerprint !== fingerprint) {
          throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'This Idempotency-Key was already used for a different request');
        }
        return { status: typeof record.status === 'number' ? record.status : status, body: record.body as { data: T } };
      }
    }

    const data = await work(tx);
    const body = { data };
    if (key) {
      await saveIdempotentResponse(tx, companyId, scopedKey, JSON.parse(JSON.stringify({ fingerprint, status, body })) as Prisma.InputJsonValue);
    }
    return { status, body };
  });
}

async function lockShipment(tx: Prisma.TransactionClient, companyId: string, id: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM "Shipment" WHERE id = ${id}::uuid AND "companyId" = ${companyId}::uuid FOR UPDATE`,
  );
  if (!rows[0]) throw ApiError.notFound('Shipment not found');
  return tx.shipment.findUniqueOrThrow({
    where: { id },
    include: { _count: { select: { customsFiles: true, invoices: true, bills: true } } },
  });
}

function isTerminal(shipment: { status: ShipmentStatus }): boolean {
  return terminalStatuses.includes(shipment.status);
}

function assertEditable(shipment: { status: ShipmentStatus }, operation = 'edited'): void {
  if (isTerminal(shipment)) {
    throw new ApiError(409, 'TERMINAL_SHIPMENT', `A ${shipment.status} shipment cannot be ${operation}`);
  }
}

function assertVersion(shipment: { version: number }, expectedVersion?: number): void {
  if (expectedVersion !== undefined && expectedVersion !== shipment.version) {
    throw new ApiError(409, 'VERSION_CONFLICT', 'The shipment changed after it was loaded. Refresh and try again.', {
      expectedVersion,
      currentVersion: shipment.version,
    });
  }
}

function assertExpectedStatus(shipment: { status: ShipmentStatus }, expectedStatus?: ShipmentStatus): void {
  if (expectedStatus !== undefined && expectedStatus !== shipment.status) {
    throw new ApiError(409, 'STATUS_CONFLICT', 'The shipment status changed after it was loaded. Refresh and try again.', {
      expectedStatus,
      currentStatus: shipment.status,
    });
  }
}

function assertConcurrentWrite(count: number): void {
  if (!count) {
    throw new ApiError(409, 'VERSION_CONFLICT', 'The shipment changed while this operation was being saved. Refresh and try again.');
  }
}

function assertTransition(from: ShipmentStatus, to: ShipmentStatus): void {
  if (from !== to && !shipmentTransitions[from].includes(to)) {
    throw new ApiError(409, 'INVALID_TRANSITION', `A ${from} shipment cannot move to ${to}`);
  }
}

function assertDateOrder(value: { etd?: Date | null; eta?: Date | null }): void {
  if (value.etd && value.eta && value.eta.getTime() < value.etd.getTime()) {
    throw ApiError.badRequest('ETA cannot be earlier than ETD');
  }
}

function hasRegulatoryFinancialLinks(shipment: { _count: { customsFiles: number; invoices: number; bills: number } }): boolean {
  return shipment._count.customsFiles > 0 || shipment._count.invoices > 0 || shipment._count.bills > 0;
}

function assertCargoEditable(shipment: Parameters<typeof assertEditable>[0] & Parameters<typeof hasRegulatoryFinancialLinks>[0]): void {
  assertEditable(shipment, 'have cargo changed or removed');
  if (hasRegulatoryFinancialLinks(shipment)) {
    throw new ApiError(409, 'CARGO_REFERENCED', 'Cargo cannot be changed or removed after customs or financial records are linked');
  }
}

async function touchShipment(
  tx: Prisma.TransactionClient,
  shipment: { id: string; version: number; status: ShipmentStatus },
): Promise<void> {
  const result = await tx.shipment.updateMany({
    where: { id: shipment.id, version: shipment.version, status: shipment.status },
    data: { version: { increment: 1 } },
  });
  assertConcurrentWrite(result.count);
}

async function requireCustomer(tx: Prisma.TransactionClient, companyId: string, customerId: string): Promise<void> {
  const customer = await tx.businessPartner.findFirst({
    where: { id: customerId, companyId, deletedAt: null, type: { in: ['CUSTOMER', 'BOTH'] } },
    select: { id: true },
  });
  if (!customer) throw ApiError.badRequest('A valid active customer in this company is required');
}

async function requireBooking(tx: Prisma.TransactionClient, companyId: string, bookingId: string) {
  const booking = await tx.booking.findFirst({ where: { id: bookingId, companyId }, select: { id: true, customerId: true } });
  if (!booking) throw ApiError.notFound('Booking not found');
  return booking;
}

async function validateOwner(
  tx: Prisma.TransactionClient,
  companyId: string,
  current: { customerId: string | null; bookingId: string | null },
  body: { customerId?: string | null; bookingId?: string | null },
): Promise<void> {
  const customerId = body.customerId !== undefined ? body.customerId : current.customerId;
  const bookingId = body.bookingId !== undefined ? body.bookingId : current.bookingId;
  if (!customerId) throw ApiError.badRequest('A customer or booking is required');
  await requireCustomer(tx, companyId, customerId);
  if (bookingId) {
    const booking = await requireBooking(tx, companyId, bookingId);
    if (booking.customerId !== customerId) throw ApiError.badRequest('The booking customer must match the shipment customer');
  }
}

async function requireVendor(tx: Prisma.TransactionClient, companyId: string, vendorId: string): Promise<void> {
  const vendor = await tx.businessPartner.findFirst({
    where: { id: vendorId, companyId, deletedAt: null, type: { in: ['VENDOR', 'BOTH'] } },
    select: { id: true },
  });
  if (!vendor) throw ApiError.badRequest('A valid active vendor in this company is required');
}

async function vendorCostIsReferenced(
  tx: Prisma.TransactionClient,
  companyId: string,
  shipmentId: string,
  vendorId: string,
): Promise<boolean> {
  return (await tx.bill.count({
    where: { companyId, shipmentId, vendorId, status: { not: 'VOID' } },
  })) > 0;
}

export async function listErpShipments(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const query = res.locals.query;
  const pagination = parsePagination(query, 25);
  const search = query.search?.toUpperCase();
  const where = {
    companyId,
    ...(query.status ? { status: query.status as never } : {}),
    ...(search
      ? {
          OR: [
            { trackingNumber: { contains: search, mode: 'insensitive' as const } },
            { reference: { contains: search, mode: 'insensitive' as const } },
            { originPort: { contains: search, mode: 'insensitive' as const } },
            { destinationPort: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const [total, shipments] = await Promise.all([
    prisma.shipment.count({ where }),
    prisma.shipment.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        customer: { select: { id: true, code: true, nameEn: true } },
        booking: { select: { id: true, number: true } },
        _count: { select: { events: true, customsFiles: true, documents: true } },
      },
    }),
  ]);
  noStore(res);
  res.json({ data: shipments, meta: paginationMeta(total, pagination) });
}

export async function createErpShipment(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as ShipmentCreateBody;
  const result = await writeOperation(req, companyId, 'shipment.create', 201, async (tx) => {
    let customerId = body.customerId;
    if (body.bookingId && !customerId) {
      customerId = (await requireBooking(tx, companyId, body.bookingId)).customerId;
    }
    await validateOwner(tx, companyId, { customerId: null, bookingId: null }, { customerId, bookingId: body.bookingId });
    const trackingNumber = body.trackingNumber ?? await nextNumber(tx, companyId, 'SHIPMENT', 'TRK');
    const duplicate = await tx.shipment.findUnique({ where: { trackingNumber }, select: { id: true } });
    if (duplicate) throw new ApiError(409, 'DUPLICATE_TRACKING_NUMBER', 'A shipment with this tracking number already exists');
    const created = await tx.shipment.create({
      data: {
        ...body,
        trackingNumber,
        companyId,
        customerId,
        publicTrackingToken: crypto.randomBytes(24).toString('hex'),
        deliveredAt: body.status === 'DELIVERED' ? new Date() : null,
        events: {
          create: {
            status: body.status,
            location: body.originPort,
            description: 'Shipment created in ERP',
            occurredAt: new Date(),
          },
        },
      },
    });
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'shipment.created',
      entity: 'Shipment',
      entityId: created.id,
      metadata: { trackingNumber, customerId, status: created.status },
      ip: req.ip,
    });
    return created;
  });
  noStore(res);
  res.status(result.status).json(result.body);
}

export async function getErpShipment(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const shipment = await prisma.shipment.findFirst({
    where: { id: req.params.id, companyId },
    include: {
      customer: true,
      booking: true,
      events: { orderBy: { occurredAt: 'desc' } },
      packages: { orderBy: { packageNumber: 'asc' } },
      containers: { orderBy: { containerNumber: 'asc' } },
      vendors: { include: { vendor: { select: { id: true, code: true, nameEn: true } } } },
      customsFiles: { include: { declarations: true, aciFilings: true } },
      documents: { include: { document: true } },
      invoices: { select: { id: true, number: true, status: true, total: true, balance: true } },
      bills: { select: { id: true, number: true, vendorId: true, vendorReference: true, status: true, total: true, balance: true } },
    },
  });
  if (!shipment) throw ApiError.notFound('Shipment not found');
  const tasks = await prisma.task.findMany({
    where: { companyId, relatedType: 'SHIPMENT', relatedId: shipment.id },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    include: { assignedTo: { select: { id: true, name: true } } },
  });
  const vendors = shipment.vendors.map((cost) => ({
    ...cost,
    isReferenced: shipment.bills.some((bill) => bill.vendorId === cost.vendorId && bill.status !== 'VOID'),
  }));
  noStore(res);
  res.json({ data: { ...shipment, vendors, tasks } });
}

export async function updateErpShipment(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as ShipmentUpdateBody;
  const result = await writeOperation(req, companyId, `shipment.update:${req.params.id}`, 200, async (tx) => {
    const shipment = await lockShipment(tx, companyId, req.params.id);
    assertVersion(shipment, body.version);
    assertExpectedStatus(shipment, body.expectedStatus);
    assertEditable(shipment);
    if (hasRegulatoryFinancialLinks(shipment)) {
      throw new ApiError(409, 'SHIPMENT_LINKED', 'Shipment header details cannot be edited after customs or financial records are linked');
    }
    if (body.customerId !== undefined || body.bookingId !== undefined) {
      await validateOwner(tx, companyId, shipment, body);
    }
    assertDateOrder({
      etd: body.etd !== undefined ? body.etd : shipment.etd,
      eta: body.eta !== undefined ? body.eta : shipment.eta,
    });
    const { version, expectedStatus, ...data } = body;
    if (data.trackingNumber && data.trackingNumber !== shipment.trackingNumber) {
      const duplicate = await tx.shipment.findUnique({ where: { trackingNumber: data.trackingNumber }, select: { id: true } });
      if (duplicate) throw new ApiError(409, 'DUPLICATE_TRACKING_NUMBER', 'A shipment with this tracking number already exists');
    }
    const updated = await tx.shipment.update({
      where: { id: shipment.id, version, status: shipment.status },
      data: { ...data, version: { increment: 1 } },
    });
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'shipment.updated',
      entity: 'Shipment',
      entityId: shipment.id,
      metadata: { fields: Object.keys(data), version: updated.version, status: updated.status },
      ip: req.ip,
    });
    return updated;
  });
  noStore(res);
  res.status(result.status).json(result.body);
}

export async function addErpShipmentEvent(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as ShipmentEventBody;
  const result = await writeOperation(req, companyId, `shipment.event.create:${req.params.id}`, 201, async (tx) => {
    const shipment = await lockShipment(tx, companyId, req.params.id);
    assertVersion(shipment, body.version);
    assertExpectedStatus(shipment, body.expectedStatus);
    if (body.updateShipmentStatus) assertTransition(shipment.status, body.status);
    const { version, expectedStatus, updateShipmentStatus, ...eventData } = body;
    const event = await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, ...eventData } });
    const location = eventData.location !== undefined ? eventData.location : shipment.lastLocation;
    const shipmentStatusUpdated = updateShipmentStatus && !isTerminal(shipment) && (body.status !== shipment.status || location !== shipment.lastLocation);
    if (shipmentStatusUpdated) {
      const updated = await tx.shipment.updateMany({
        where: { id: shipment.id, version: shipment.version, status: shipment.status },
        data: {
          status: body.status,
          lastLocation: location,
          deliveredAt: body.status === 'DELIVERED' ? shipment.deliveredAt ?? eventData.occurredAt ?? new Date() : null,
          version: { increment: 1 },
        },
      });
      assertConcurrentWrite(updated.count);
    }
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'shipment.event.created',
      entity: 'Shipment',
      entityId: shipment.id,
      metadata: {
        status: body.status,
        eventId: event.id,
        fromStatus: shipment.status,
        shipmentStatusUpdated,
      },
      ip: req.ip,
    });
    return event;
  });
  noStore(res);
  res.status(result.status).json(result.body);
}

export async function addPackage(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as PackageCreateBody;
  const result = await writeOperation(req, companyId, `shipment.package.create:${req.params.id}`, 201, async (tx) => {
    const shipment = await lockShipment(tx, companyId, req.params.id);
    assertVersion(shipment, body.version);
    assertCargoEditable(shipment);
    const duplicate = await tx.cargoPackage.findFirst({ where: { shipmentId: shipment.id, packageNumber: body.packageNumber }, select: { id: true } });
    if (duplicate) throw new ApiError(409, 'DUPLICATE_PACKAGE_NUMBER', 'This package number already exists on the shipment');
    const { version, ...data } = body;
    const created = await tx.cargoPackage.create({ data: { ...data, shipmentId: shipment.id } });
    await touchShipment(tx, shipment);
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'shipment.package_added',
      entity: 'Shipment',
      entityId: shipment.id,
      metadata: { packageId: created.id, packageNumber: created.packageNumber },
      ip: req.ip,
    });
    return created;
  });
  noStore(res);
  res.status(result.status).json(result.body);
}

export async function updatePackage(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as PackageUpdateBody;
  const result = await writeOperation(req, companyId, `shipment.package.update:${req.params.id}:${req.params.packageId}`, 200, async (tx) => {
    const shipment = await lockShipment(tx, companyId, req.params.id);
    assertVersion(shipment, body.version);
    assertCargoEditable(shipment);
    const existing = await tx.cargoPackage.findFirst({ where: { id: req.params.packageId, shipmentId: shipment.id } });
    if (!existing) throw ApiError.notFound('Cargo package not found');
    const packageNumber = body.packageNumber ?? existing.packageNumber;
    const duplicate = await tx.cargoPackage.findFirst({
      where: { shipmentId: shipment.id, packageNumber, id: { not: existing.id } },
      select: { id: true },
    });
    if (duplicate) throw new ApiError(409, 'DUPLICATE_PACKAGE_NUMBER', 'This package number already exists on the shipment');
    const { version, ...data } = body;
    const updated = await tx.cargoPackage.update({ where: { id: existing.id }, data });
    await touchShipment(tx, shipment);
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'shipment.package_updated',
      entity: 'Shipment',
      entityId: shipment.id,
      metadata: { packageId: existing.id, packageNumber: updated.packageNumber, fields: Object.keys(data) },
      ip: req.ip,
    });
    return updated;
  });
  noStore(res);
  res.status(result.status).json(result.body);
}

export async function deletePackage(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const result = await writeOperation(req, companyId, `shipment.package.delete:${req.params.id}:${req.params.packageId}`, 200, async (tx) => {
    const shipment = await lockShipment(tx, companyId, req.params.id);
    assertVersion(shipment, res.locals.query.version);
    assertCargoEditable(shipment);
    const existing = await tx.cargoPackage.findFirst({ where: { id: req.params.packageId, shipmentId: shipment.id } });
    if (!existing) throw ApiError.notFound('Cargo package not found');
    await tx.cargoPackage.delete({ where: { id: existing.id } });
    await touchShipment(tx, shipment);
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'shipment.package_deleted',
      entity: 'Shipment',
      entityId: shipment.id,
      metadata: { packageId: existing.id, packageNumber: existing.packageNumber },
      ip: req.ip,
    });
    return { id: existing.id, packageNumber: existing.packageNumber, deleted: true };
  });
  noStore(res);
  res.status(result.status).json(result.body);
}

export async function addContainer(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as ContainerCreateBody;
  const result = await writeOperation(req, companyId, `shipment.container.create:${req.params.id}`, 201, async (tx) => {
    const shipment = await lockShipment(tx, companyId, req.params.id);
    assertVersion(shipment, body.version);
    assertCargoEditable(shipment);
    const duplicate = await tx.container.findFirst({ where: { containerNumber: body.containerNumber }, select: { id: true } });
    if (duplicate) throw new ApiError(409, 'DUPLICATE_CONTAINER_NUMBER', 'This container number is already linked to a shipment');
    const { version, ...data } = body;
    const created = await tx.container.create({ data: { ...data, shipmentId: shipment.id } });
    await touchShipment(tx, shipment);
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'shipment.container_added',
      entity: 'Shipment',
      entityId: shipment.id,
      metadata: { containerId: created.id, containerNumber: created.containerNumber },
      ip: req.ip,
    });
    return created;
  });
  noStore(res);
  res.status(result.status).json(result.body);
}

export async function updateContainer(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as ContainerUpdateBody;
  const result = await writeOperation(req, companyId, `shipment.container.update:${req.params.id}:${req.params.containerId}`, 200, async (tx) => {
    const shipment = await lockShipment(tx, companyId, req.params.id);
    assertVersion(shipment, body.version);
    assertCargoEditable(shipment);
    const existing = await tx.container.findFirst({ where: { id: req.params.containerId, shipmentId: shipment.id } });
    if (!existing) throw ApiError.notFound('Container not found');
    const containerNumber = body.containerNumber ?? existing.containerNumber;
    const duplicate = await tx.container.findFirst({ where: { containerNumber, id: { not: existing.id } }, select: { id: true } });
    if (duplicate) throw new ApiError(409, 'DUPLICATE_CONTAINER_NUMBER', 'This container number is already linked to a shipment');
    const { version, ...data } = body;
    const updated = await tx.container.update({ where: { id: existing.id }, data });
    await touchShipment(tx, shipment);
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'shipment.container_updated',
      entity: 'Shipment',
      entityId: shipment.id,
      metadata: { containerId: existing.id, containerNumber: updated.containerNumber, fields: Object.keys(data) },
      ip: req.ip,
    });
    return updated;
  });
  noStore(res);
  res.status(result.status).json(result.body);
}

export async function deleteContainer(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const result = await writeOperation(req, companyId, `shipment.container.delete:${req.params.id}:${req.params.containerId}`, 200, async (tx) => {
    const shipment = await lockShipment(tx, companyId, req.params.id);
    assertVersion(shipment, res.locals.query.version);
    assertCargoEditable(shipment);
    const existing = await tx.container.findFirst({ where: { id: req.params.containerId, shipmentId: shipment.id } });
    if (!existing) throw ApiError.notFound('Container not found');
    await tx.container.delete({ where: { id: existing.id } });
    await touchShipment(tx, shipment);
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'shipment.container_deleted',
      entity: 'Shipment',
      entityId: shipment.id,
      metadata: { containerId: existing.id, containerNumber: existing.containerNumber },
      ip: req.ip,
    });
    return { id: existing.id, containerNumber: existing.containerNumber, deleted: true };
  });
  noStore(res);
  res.status(result.status).json(result.body);
}

export async function addVendor(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as VendorCreateBody;
  const result = await writeOperation(req, companyId, `shipment.vendor.create:${req.params.id}`, 201, async (tx) => {
    const shipment = await lockShipment(tx, companyId, req.params.id);
    assertVersion(shipment, body.version);
    assertEditable(shipment, 'have vendor costs added');
    await requireVendor(tx, companyId, body.vendorId);
    const { version, ...data } = body;
    const created = await tx.shipmentVendor.create({ data: { ...data, shipmentId: shipment.id } });
    await touchShipment(tx, shipment);
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'shipment.vendor_added',
      entity: 'Shipment',
      entityId: shipment.id,
      metadata: { shipmentVendorId: created.id, vendorId: created.vendorId, service: created.service, amount: created.amount.toFixed(2) },
      ip: req.ip,
    });
    return created;
  });
  noStore(res);
  res.status(result.status).json(result.body);
}

export async function updateVendor(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as VendorUpdateBody;
  const result = await writeOperation(req, companyId, `shipment.vendor.update:${req.params.id}:${req.params.costId}`, 200, async (tx) => {
    const shipment = await lockShipment(tx, companyId, req.params.id);
    assertVersion(shipment, body.version);
    assertEditable(shipment, 'have vendor costs edited');
    const existing = await tx.shipmentVendor.findFirst({ where: { id: req.params.costId, shipmentId: shipment.id } });
    if (!existing) throw ApiError.notFound('Vendor cost not found');
    if (existing.status === 'CANCELLED') throw new ApiError(409, 'VENDOR_COST_CANCELLED', 'A cancelled vendor cost cannot be edited');
    const vendorId = body.vendorId ?? existing.vendorId;
    if (body.vendorId !== undefined) await requireVendor(tx, companyId, vendorId);
    if (await vendorCostIsReferenced(tx, companyId, shipment.id, existing.vendorId) || (vendorId !== existing.vendorId && await vendorCostIsReferenced(tx, companyId, shipment.id, vendorId))) {
      throw new ApiError(409, 'VENDOR_COST_REFERENCED', 'This vendor cost is referenced by a bill and cannot be edited; cancel it instead');
    }
    const { version, ...data } = body;
    const updated = await tx.shipmentVendor.update({ where: { id: existing.id }, data });
    await touchShipment(tx, shipment);
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'shipment.vendor_updated',
      entity: 'Shipment',
      entityId: shipment.id,
      metadata: {
        shipmentVendorId: existing.id,
        fields: Object.keys(data),
        amount: updated.amount.toFixed(2),
        previousAmount: existing.amount.toFixed(2),
      },
      ip: req.ip,
    });
    return updated;
  });
  noStore(res);
  res.status(result.status).json(result.body);
}

export async function cancelVendor(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as VendorCancelBody;
  const result = await writeOperation(req, companyId, `shipment.vendor.cancel:${req.params.id}:${req.params.costId}`, 200, async (tx) => {
    const shipment = await lockShipment(tx, companyId, req.params.id);
    assertVersion(shipment, body.version);
    assertEditable(shipment, 'have vendor costs cancelled');
    const existing = await tx.shipmentVendor.findFirst({ where: { id: req.params.costId, shipmentId: shipment.id } });
    if (!existing) throw ApiError.notFound('Vendor cost not found');
    if (existing.status === 'CANCELLED') return existing;
    const updated = await tx.shipmentVendor.update({ where: { id: existing.id }, data: { status: 'CANCELLED' } });
    await touchShipment(tx, shipment);
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'shipment.vendor_cancelled',
      entity: 'Shipment',
      entityId: shipment.id,
      metadata: {
        shipmentVendorId: existing.id,
        from: existing.status,
        to: updated.status,
        amount: updated.amount.toFixed(2),
        reason: body.reason ?? null,
      },
      ip: req.ip,
    });
    return updated;
  });
  noStore(res);
  res.status(result.status).json(result.body);
}

export async function setPublication(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const result = await writeOperation(req, companyId, `shipment.publication.update:${req.params.id}`, 200, async (tx) => {
    const existing = await lockShipment(tx, companyId, req.params.id);
    assertVersion(existing, req.body.version);
    const updated = await tx.shipment.update({
      where: { id: existing.id, version: existing.version, status: existing.status },
      data: {
        isPublic: req.body.isPublic,
        publicTrackingToken: existing.publicTrackingToken ?? crypto.randomBytes(24).toString('hex'),
        version: { increment: 1 },
      },
    });
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'shipment.publication_changed',
      entity: 'Shipment',
      entityId: updated.id,
      metadata: { isPublic: updated.isPublic, version: updated.version },
      ip: req.ip,
    });
    return updated;
  });
  noStore(res);
  res.status(result.status).json(result.body);
}
