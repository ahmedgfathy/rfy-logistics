import fs from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response } from 'express';
import { Prisma, type QuoteStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { ApiError } from '../middleware/error';
import { currentUser } from '../middleware/auth';
import { quoteReference } from '../utils/reference';
import { paginationMeta, parsePagination } from '../utils/pagination';
import { recordAudit } from '../services/audit.service';
import { notifyAdmin } from '../services/notification.service';

type QuotePayload = {
  fullName: string;
  companyName?: string;
  email: string;
  phone: string;
  originCountry: string;
  originCity: string;
  destinationCountry: string;
  destinationCity: string;
  shipmentType: string;
  freightMode: 'SEA' | 'AIR' | 'ROAD' | 'RAIL' | 'MULTIMODAL';
  cargoDescription: string;
  cargoWeightKg?: number;
  cargoVolumeCbm?: number;
  packageCount?: number;
  containerType?: string;
  incoterms?: string;
  expectedShipDate?: Date;
  additionalNotes?: string;
  locale: 'en' | 'ar';
};

async function cleanupUploads(files: Express.Multer.File[] | undefined): Promise<void> {
  if (!files?.length) return;
  await Promise.all(
    files.map((file) => fs.unlink(file.path).catch(() => undefined)),
  );
}

export async function createQuote(req: Request, res: Response): Promise<void> {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const payload = req.body as QuotePayload;

  try {
    let reference = quoteReference();
    let created;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        created = await prisma.quoteRequest.create({
          data: {
            reference,
            fullName: payload.fullName,
            companyName: payload.companyName ?? null,
            email: payload.email.toLowerCase(),
            phone: payload.phone,
            originCountry: payload.originCountry,
            originCity: payload.originCity,
            destinationCountry: payload.destinationCountry,
            destinationCity: payload.destinationCity,
            shipmentType: payload.shipmentType,
            freightMode: payload.freightMode,
            cargoDescription: payload.cargoDescription,
            cargoWeightKg: payload.cargoWeightKg ?? null,
            cargoVolumeCbm: payload.cargoVolumeCbm ?? null,
            packageCount: payload.packageCount ?? null,
            containerType: payload.containerType ?? null,
            incoterms: payload.incoterms ?? null,
            expectedShipDate: payload.expectedShipDate ?? null,
            additionalNotes: payload.additionalNotes ?? null,
            locale: payload.locale,
            sourceIp: req.ip,
            attachments: files.length
              ? {
                  create: files.map((file) => ({
                    fileName: file.originalname.slice(0, 200),
                    storedName: path.basename(file.path),
                    mimeType: file.mimetype,
                    sizeBytes: file.size,
                  })),
                }
              : undefined,
          },
        });
        break;
      } catch (error) {
        const isReferenceCollision =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          String(error.meta?.target ?? '').includes('reference');
        if (isReferenceCollision && attempt < 2) {
          reference = quoteReference();
          continue;
        }
        throw error;
      }
    }

    if (!created) throw new ApiError(500, 'QUOTE_NOT_CREATED', 'Could not create the quote request');

    await recordAudit({
      action: 'quote.created',
      entity: 'QuoteRequest',
      entityId: created.id,
      metadata: { reference: created.reference, mode: created.freightMode },
      ip: req.ip,
    });

    await notifyAdmin({
      type: 'QUOTE',
      reference: created.reference,
      subject: 'New quote request',
      summary: `${created.originCountry} / ${created.originCity} -> ${created.destinationCountry} / ${created.destinationCity} (${created.freightMode})`,
      contactEmail: created.email,
    });

    res.status(201).json({
      data: {
        reference: created.reference,
        status: created.status,
        createdAt: created.createdAt,
        attachments: created ? files.length : 0,
      },
    });
  } catch (error) {
    // Never leave orphaned customer documents on disk.
    await cleanupUploads(files);
    throw error;
  }
}

export async function listQuotes(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.query as Record<string, unknown>);
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  const where: Prisma.QuoteRequestWhereInput = {
    ...(status && status !== 'ALL' ? { status: status as QuoteStatus } : {}),
    ...(search
      ? {
          OR: [
            { reference: { contains: search, mode: 'insensitive' } },
            { fullName: { contains: search, mode: 'insensitive' } },
            { companyName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, quotes] = await Promise.all([
    prisma.quoteRequest.count({ where }),
    prisma.quoteRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
      select: {
        id: true,
        reference: true,
        fullName: true,
        companyName: true,
        email: true,
        phone: true,
        originCountry: true,
        originCity: true,
        destinationCountry: true,
        destinationCity: true,
        freightMode: true,
        status: true,
        createdAt: true,
        _count: { select: { attachments: true } },
      },
    }),
  ]);

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: quotes, meta: paginationMeta(total, pagination) });
}

export async function getQuote(req: Request, res: Response): Promise<void> {
  const quote = await prisma.quoteRequest.findUnique({
    where: { id: req.params.id },
    include: {
      attachments: {
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
      },
    },
  });
  if (!quote) throw ApiError.notFound('Quote request not found');

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: quote });
}

export async function updateQuoteStatus(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const { status, adminNotes } = req.body as { status: QuoteStatus; adminNotes?: string };

  const existing = await prisma.quoteRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Quote request not found');

  const updated = await prisma.quoteRequest.update({
    where: { id: existing.id },
    data: { status, ...(adminNotes !== undefined ? { adminNotes } : {}) },
    select: { id: true, reference: true, status: true, updatedAt: true },
  });

  await recordAudit({
    userId: user.id,
    action: 'quote.status.updated',
    entity: 'QuoteRequest',
    entityId: updated.id,
    metadata: { from: existing.status, to: status },
    ip: req.ip,
  });

  res.json({ data: updated });
}

export async function downloadAttachment(req: Request, res: Response): Promise<void> {
  const attachment = await prisma.quoteAttachment.findFirst({
    where: { id: req.params.attachmentId, quoteId: req.params.id },
  });
  if (!attachment) throw ApiError.notFound('Attachment not found');

  const absolute = path.join(env.UPLOAD_DIR, 'quotes', path.basename(attachment.storedName));
  try {
    await fs.access(absolute);
  } catch {
    throw ApiError.notFound('The stored file is no longer available');
  }

  res.download(absolute, attachment.fileName);
}
