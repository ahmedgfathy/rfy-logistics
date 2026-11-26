import { createHash } from 'node:crypto';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { defaultCompanyId } from '../../lib/company';
import { loadUpload, persistUpload, removeUpload } from '../../lib/storage';
import { ApiError } from '../../middleware/error';
import { currentUser } from '../../middleware/auth';
import { recordAuditTx } from '../../services/audit.service';
import { parsePagination, paginationMeta } from '../../utils/pagination';
import type { DocumentQuery, DocumentRelatedType, DocumentUpdateBody } from './documents.schemas';

const documentInclude = {
  shipments: { select: { shipmentId: true } },
  declarations: { select: { declarationId: true } },
  quotes: { select: { quoteId: true } },
} satisfies Prisma.DocumentInclude;

async function requireDocumentRelation(
  tx: Prisma.TransactionClient,
  companyId: string,
  relatedType: DocumentRelatedType,
  relatedId: string,
): Promise<void> {
  if (relatedType === 'SHIPMENT') {
    const related = await tx.shipment.findFirst({ where: { id: relatedId, companyId }, select: { id: true } });
    if (!related) throw ApiError.notFound('Shipment not found');
    return;
  }
  if (relatedType === 'DECLARATION') {
    const related = await tx.customsDeclaration.findFirst({
      where: { id: relatedId, customsFile: { companyId } },
      select: { id: true },
    });
    if (!related) throw ApiError.notFound('Customs declaration not found');
    return;
  }
  const related = await tx.quote.findFirst({ where: { id: relatedId, companyId }, select: { id: true } });
  if (!related) throw ApiError.notFound('Quote not found');
}

export async function listDocuments(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const query = res.locals.query as DocumentQuery;
  const pagination = parsePagination(query, 25);
  const relatedFilter = query.relatedType
    ? query.relatedType === 'SHIPMENT'
      ? { shipments: { some: query.relatedId ? { shipmentId: query.relatedId } : {} } }
      : query.relatedType === 'DECLARATION'
        ? { declarations: { some: query.relatedId ? { declarationId: query.relatedId } : {} } }
        : { quotes: { some: query.relatedId ? { quoteId: query.relatedId } : {} } }
    : query.relatedId
      ? {
          OR: [
            { shipments: { some: { shipmentId: query.relatedId } } },
            { declarations: { some: { declarationId: query.relatedId } } },
            { quotes: { some: { quoteId: query.relatedId } } },
          ],
        }
      : {};

  const where: Prisma.DocumentWhereInput = {
    companyId,
    ...(query.category ? { category: query.category } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...relatedFilter,
  };

  const [total, documents] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
      include: documentInclude,
    }),
  ]);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: documents, meta: paginationMeta(total, pagination) });
}

export async function uploadDocument(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) throw ApiError.badRequest('A document file is required');
  const body = req.body;

  const storedName = await persistUpload(file, 'documents');
  try {
    const document = await prisma.$transaction(async (tx) => {
      await requireDocumentRelation(tx, companyId, body.relatedType, body.relatedId);

      const created = await tx.document.create({
        data: {
          companyId,
          category: body.category,
          fileName: path.basename(file.originalname),
          storedName,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          storageDriver: /^https?:\/\//.test(storedName) ? 'BLOB' : 'LOCAL',
          uploadedById: user.id,
          ...(body.relatedType === 'SHIPMENT'
            ? { shipments: { create: { shipmentId: body.relatedId } } }
            : body.relatedType === 'DECLARATION'
              ? { declarations: { create: { declarationId: body.relatedId } } }
              : { quotes: { create: { quoteId: body.relatedId } } }),
        },
      });
      await recordAuditTx(tx, {
        userId: user.id,
        action: 'document.uploaded',
        entity: 'Document',
        entityId: created.id,
        metadata: { category: created.category, relatedType: body.relatedType, relatedId: body.relatedId },
        ip: req.ip,
      });
      return created;
    });
    res.status(201).json({ data: document });
  } catch (error) {
    await removeUpload(storedName, 'documents');
    throw error;
  }
}

export async function downloadDocument(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const document = await prisma.document.findFirst({
    where: { id: req.params.id, companyId, status: 'ACTIVE' },
  });
  if (!document) throw ApiError.notFound('Document not found');

  const stored = await loadUpload(document.storedName, 'documents');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', stored.contentType ?? document.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}`);
  await pipeline(stored.stream, res);
}

export async function correctDocument(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as DocumentUpdateBody;
  const document = await prisma.$transaction(async (tx) => {
    const existing = await tx.document.findFirst({ where: { id: req.params.id, companyId }, include: documentInclude });
    if (!existing) throw ApiError.notFound('Document not found');
    if (body.relatedType && body.relatedId) {
      await requireDocumentRelation(tx, companyId, body.relatedType, body.relatedId);
    }

    const data: { version: { increment: number }; category?: DocumentUpdateBody['category']; fileName?: string } = { version: { increment: 1 } };
    if (body.category !== undefined) data.category = body.category;
    if (body.fileName !== undefined) data.fileName = body.fileName;
    const updated = await tx.document.updateMany({ where: { id: existing.id, companyId }, data });
    if (!updated.count) throw ApiError.notFound('Document not found');

    if (body.relatedType && body.relatedId) {
      await Promise.all([
        tx.shipmentDocument.deleteMany({ where: { documentId: existing.id } }),
        tx.declarationDocument.deleteMany({ where: { documentId: existing.id } }),
        tx.quoteDocument.deleteMany({ where: { documentId: existing.id } }),
      ]);
      if (body.relatedType === 'SHIPMENT') {
        await tx.shipmentDocument.create({ data: { documentId: existing.id, shipmentId: body.relatedId } });
      } else if (body.relatedType === 'DECLARATION') {
        await tx.declarationDocument.create({ data: { documentId: existing.id, declarationId: body.relatedId } });
      } else {
        await tx.quoteDocument.create({ data: { documentId: existing.id, quoteId: body.relatedId } });
      }
    }

    const corrected = await tx.document.findUniqueOrThrow({ where: { id: existing.id }, include: documentInclude });
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'document.corrected',
      entity: 'Document',
      entityId: corrected.id,
      metadata: {
        fields: Object.keys(body),
        ...(body.category !== undefined ? { categoryFrom: existing.category, categoryTo: body.category } : {}),
        ...(body.fileName !== undefined ? { fileNameFrom: existing.fileName, fileNameTo: body.fileName } : {}),
        ...(body.relatedType && body.relatedId ? { relatedType: body.relatedType, relatedId: body.relatedId } : {}),
      },
      ip: req.ip,
    });
    return corrected;
  });
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: document });
}

export async function archiveDocument(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const document = await prisma.$transaction(async (tx) => {
    const updated = await tx.document.updateMany({
      where: { id: req.params.id, companyId, status: 'ACTIVE' },
      data: { status: 'ARCHIVED', archivedAt: new Date(), version: { increment: 1 } },
    });
    if (!updated.count) throw ApiError.notFound('Document not found');
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'document.archived',
      entity: 'Document',
      entityId: req.params.id,
      metadata: { from: 'ACTIVE', to: 'ARCHIVED' },
      ip: req.ip,
    });
    return tx.document.findUniqueOrThrow({ where: { id: req.params.id }, include: documentInclude });
  });
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: document });
}

export async function restoreDocument(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const document = await prisma.$transaction(async (tx) => {
    const updated = await tx.document.updateMany({
      where: { id: req.params.id, companyId, status: 'ARCHIVED' },
      data: { status: 'ACTIVE', archivedAt: null, version: { increment: 1 } },
    });
    if (!updated.count) throw ApiError.notFound('Document not found');
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'document.restored',
      entity: 'Document',
      entityId: req.params.id,
      metadata: { from: 'ARCHIVED', to: 'ACTIVE' },
      ip: req.ip,
    });
    return tx.document.findUniqueOrThrow({ where: { id: req.params.id }, include: documentInclude });
  });
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: document });
}
