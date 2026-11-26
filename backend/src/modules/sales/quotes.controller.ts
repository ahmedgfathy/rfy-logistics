import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { defaultCompanyId } from '../../lib/company';
import { calculateLineTotals } from '../../lib/money';
import { nextNumber } from '../../lib/numbers';
import { readIdempotentResponse, requireIdempotencyKey, saveIdempotentResponse } from '../../lib/idempotency';
import { ApiError } from '../../middleware/error';
import { currentUser } from '../../middleware/auth';
import { recordAuditTx } from '../../services/audit.service';
import { parsePagination, paginationMeta } from '../../utils/pagination';
import { findOrCreateLeadCustomer } from '../partners/partners.service';
import {
  bookingInclude,
  quoteInclude,
  requireBranch,
  requireCustomer,
  requireLineReferences,
  withQuoteTotals,
} from './sales.shared';
import type {
  QuoteConversionBody,
  QuoteCreateBody,
  QuoteLineBody,
  QuoteQuery,
  QuoteUpdateBody,
} from './sales.schemas';

type QuoteRecord = Prisma.QuoteGetPayload<{ include: typeof quoteInclude }>;
type CalculableLine = {
  chargeItemId?: string | null;
  descriptionEn: string;
  descriptionAr?: string | null;
  quantity: Prisma.Decimal.Value;
  unitPrice: Prisma.Decimal.Value;
  discountPercent?: Prisma.Decimal.Value;
  taxCodeId?: string | null;
  taxPercent?: Prisma.Decimal.Value;
};

interface StoredConversion {
  operation: 'quote.convert';
  quoteId: string;
  fingerprint: string;
  status: number;
  body: {
    data: {
      booking: { id: string };
      quote: { id: string };
    };
  };
}

function recalculateLines(lines: CalculableLine[], currency: string): Prisma.QuoteLineUncheckedCreateWithoutQuoteInput[] {
  return lines.map((line, index) => {
    const totals = calculateLineTotals({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent ?? 0,
      taxPercent: line.taxPercent ?? 0,
      currency,
    });
    return {
      position: index,
      chargeItemId: line.chargeItemId ?? null,
      descriptionEn: line.descriptionEn,
      descriptionAr: line.descriptionAr ?? null,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent ?? 0,
      taxCodeId: line.taxCodeId ?? null,
      taxPercent: line.taxPercent ?? 0,
      subtotal: totals.subtotal,
      discount: totals.discount,
      taxAmount: totals.tax,
      total: totals.total,
    };
  });
}

function isStoredConversion(value: unknown): value is StoredConversion {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.operation !== 'quote.convert' || typeof record.quoteId !== 'string' || typeof record.fingerprint !== 'string') return false;
  if (typeof record.status !== 'number' || record.status < 200 || record.status >= 300) return false;
  const body = record.body as { data?: { booking?: { id?: unknown }; quote?: { id?: unknown } } } | undefined;
  return typeof body?.data?.booking?.id === 'string' && typeof body?.data?.quote?.id === 'string';
}

async function readConversion(
  tx: Prisma.TransactionClient,
  companyId: string,
  key: string,
  quoteId: string,
  fingerprint: string,
): Promise<StoredConversion | null> {
  const response = await readIdempotentResponse(tx, companyId, key);
  if (response === null) return null;
  if (!isStoredConversion(response) || response.quoteId !== quoteId || response.fingerprint !== fingerprint) {
    throw new ApiError(409, 'CONFLICT', 'This Idempotency-Key was already used for a different operation');
  }
  return response;
}

function routeLabel(city: string, country: string): string {
  return [city, country].filter(Boolean).join(', ');
}

export async function listQuotes(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const query = res.locals.query as QuoteQuery;
  const pagination = parsePagination(query);
  const search = query.search;
  const where: Prisma.QuoteWhereInput = {
    companyId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(search
      ? {
          OR: [
            { number: { contains: search, mode: 'insensitive' } },
            { customer: { nameEn: { contains: search, mode: 'insensitive' } } },
            { customer: { nameAr: { contains: search, mode: 'insensitive' } } },
            { customer: { legalName: { contains: search, mode: 'insensitive' } } },
            { customer: { email: { contains: search, mode: 'insensitive' } } },
            {
              lines: {
                some: {
                  OR: [
                    { descriptionEn: { contains: search, mode: 'insensitive' } },
                    { descriptionAr: { contains: search, mode: 'insensitive' } },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  };

  const [total, quotes] = await Promise.all([
    prisma.quote.count({ where }),
    prisma.quote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
      include: quoteInclude,
    }),
  ]);

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: quotes.map(withQuoteTotals), meta: paginationMeta(total, pagination) });
}

export async function getQuote(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const quote = await prisma.quote.findFirst({ where: { id: req.params.id, companyId }, include: quoteInclude });
  if (!quote) throw ApiError.notFound('Quote not found');

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: withQuoteTotals(quote) });
}

export async function createQuote(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as QuoteCreateBody;

  const quote = await prisma.$transaction(async (tx) => {
    await requireCustomer(tx, companyId, body.customerId);
    await requireBranch(tx, companyId, body.branchId);
    await requireLineReferences(tx, companyId, body.lines);

    const created = await tx.quote.create({
      data: {
        companyId,
        branchId: body.branchId ?? null,
        number: await nextNumber(tx, companyId, 'QUOTE', 'QT'),
        customerId: body.customerId,
        currency: body.currency,
        exchangeRate: body.exchangeRate,
        validUntil: body.validUntil ?? null,
        notes: body.notes ?? null,
        terms: body.terms ?? null,
        createdById: user.id,
        lines: { create: recalculateLines(body.lines, body.currency) },
      },
      include: quoteInclude,
    });
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'quote.created',
      entity: 'Quote',
      entityId: created.id,
      metadata: { number: created.number, customerId: created.customerId },
      ip: req.ip,
    });
    return created;
  });

  res.setHeader('Cache-Control', 'private, no-store');
  res.status(201).json({ data: withQuoteTotals(quote) });
}

export async function updateQuote(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as QuoteUpdateBody;

  const quote = await prisma.$transaction(async (tx) => {
    const existing = await tx.quote.findFirst({ where: { id: req.params.id, companyId }, include: quoteInclude });
    if (!existing) throw ApiError.notFound('Quote not found');
    if (existing.status !== 'DRAFT') {
      throw new ApiError(409, 'CONFLICT', 'Only draft quotes can be edited');
    }

    const customerId = body.customerId ?? existing.customerId;
    const branchId = body.branchId !== undefined ? body.branchId : existing.branchId;
    const currency = body.currency ?? existing.currency;
    await requireCustomer(tx, companyId, customerId);
    await requireBranch(tx, companyId, branchId);
    if (body.lines) await requireLineReferences(tx, companyId, body.lines);

    const lines = recalculateLines(body.lines ?? existing.lines, currency);
    const updatedHeader = await tx.quote.updateMany({
      where: { id: existing.id, companyId, status: 'DRAFT' },
      data: {
        customerId,
        branchId,
        currency,
        exchangeRate: body.exchangeRate ?? existing.exchangeRate,
        validUntil: body.validUntil !== undefined ? body.validUntil : existing.validUntil,
        notes: body.notes !== undefined ? body.notes : existing.notes,
        terms: body.terms !== undefined ? body.terms : existing.terms,
        version: { increment: 1 },
      },
    });
    if (!updatedHeader.count) {
      throw new ApiError(409, 'CONFLICT', 'Only draft quotes can be edited');
    }

    await tx.quoteLine.deleteMany({ where: { quoteId: existing.id } });
    await tx.quoteLine.createMany({ data: lines.map((line) => ({ ...line, quoteId: existing.id })) });

    const updated = await tx.quote.findUniqueOrThrow({ where: { id: existing.id }, include: quoteInclude });
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'quote.updated',
      entity: 'Quote',
      entityId: updated.id,
      metadata: { number: updated.number, fields: Object.keys(body), lineCount: updated.lines.length },
      ip: req.ip,
    });
    return updated;
  });

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: withQuoteTotals(quote) });
}

export async function deleteQuote(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const quote = await prisma.$transaction(async (tx) => {
    const existing = await tx.quote.findFirst({ where: { id: req.params.id, companyId }, select: { id: true, number: true, status: true } });
    if (!existing) throw ApiError.notFound('Quote not found');
    if (existing.status !== 'DRAFT') {
      throw new ApiError(409, 'CONFLICT', 'Only draft quotes can be deleted; reject or expire issued quotes instead');
    }
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'quote.deleted',
      entity: 'Quote',
      entityId: existing.id,
      metadata: { number: existing.number },
      ip: req.ip,
    });
    await tx.quote.delete({ where: { id: existing.id } });
    return existing;
  });
  res.json({ data: { id: quote.id, number: quote.number, deleted: true } });
}

type IssuedQuoteTarget = 'SENT' | 'REJECTED' | 'EXPIRED';

function isPastValidUntil(validUntil: Date | null, now = new Date()): boolean {
  return validUntil !== null && validUntil.getTime() < now.getTime();
}

async function transitionIssuedQuote(
  req: Request,
  target: IssuedQuoteTarget,
  action: 'quote.sent' | 'quote.rejected' | 'quote.expired',
): Promise<QuoteRecord> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.quote.findFirst({
      where: { id: req.params.id, companyId },
      select: { id: true, number: true, status: true, validUntil: true, sentAt: true },
    });
    if (!existing) throw ApiError.notFound('Quote not found');
    if (existing.status === target) {
      return tx.quote.findUniqueOrThrow({ where: { id: existing.id }, include: quoteInclude });
    }
    if (existing.status !== 'DRAFT' && existing.status !== 'SENT') {
      throw new ApiError(409, 'INVALID_TRANSITION', `Only draft or sent quotes can be marked as ${target.toLowerCase()}`);
    }
    if (target === 'SENT' && isPastValidUntil(existing.validUntil)) {
      throw new ApiError(409, 'CONFLICT', 'Expired quotes cannot be sent; extend the validity date while the quote is a draft');
    }

    const now = new Date();
    const result = await tx.quote.updateMany({
      where: { id: existing.id, companyId, status: { in: ['DRAFT', 'SENT'] } },
      data: {
        status: target,
        ...(target === 'SENT' ? { sentAt: existing.sentAt ?? now } : {}),
        version: { increment: 1 },
      },
    });
    if (!result.count) {
      throw new ApiError(409, 'CONFLICT', 'The quote status changed; refresh and try again');
    }

    const updated = await tx.quote.findUniqueOrThrow({ where: { id: existing.id }, include: quoteInclude });
    await recordAuditTx(tx, {
      userId: user.id,
      action,
      entity: 'Quote',
      entityId: updated.id,
      metadata: { number: updated.number, from: existing.status, to: target },
      ip: req.ip,
    });
    return updated;
  });
}

export async function sendQuote(req: Request, res: Response): Promise<void> {
  const quote = await transitionIssuedQuote(req, 'SENT', 'quote.sent');
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: withQuoteTotals(quote) });
}

export async function rejectQuote(req: Request, res: Response): Promise<void> {
  const quote = await transitionIssuedQuote(req, 'REJECTED', 'quote.rejected');
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: withQuoteTotals(quote) });
}

export async function expireQuote(req: Request, res: Response): Promise<void> {
  const quote = await transitionIssuedQuote(req, 'EXPIRED', 'quote.expired');
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: withQuoteTotals(quote) });
}

export async function acceptQuote(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();

  const quote = await prisma.$transaction(async (tx) => {
    const existing = await tx.quote.findFirst({ where: { id: req.params.id, companyId }, include: quoteInclude });
    if (!existing) throw ApiError.notFound('Quote not found');
    if (existing.status === 'ACCEPTED') return existing;
    if (existing.status !== 'DRAFT' && existing.status !== 'SENT') {
      throw new ApiError(409, 'CONFLICT', 'Only draft or sent quotes can be accepted');
    }
    if (isPastValidUntil(existing.validUntil)) {
      throw new ApiError(409, 'CONFLICT', 'This quote has expired and can no longer be accepted');
    }

    const acceptedAt = new Date();
    const result = await tx.quote.updateMany({
      where: { id: existing.id, companyId, status: { in: ['DRAFT', 'SENT'] } },
      data: { status: 'ACCEPTED', acceptedAt, version: { increment: 1 } },
    });
    if (!result.count) {
      throw new ApiError(409, 'CONFLICT', 'The quote status changed; refresh and try again');
    }

    const updated = await tx.quote.findUniqueOrThrow({ where: { id: existing.id }, include: quoteInclude });
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'quote.accepted',
      entity: 'Quote',
      entityId: updated.id,
      metadata: { from: existing.status, to: 'ACCEPTED' },
      ip: req.ip,
    });
    return updated;
  });

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: withQuoteTotals(quote) });
}

export async function createQuoteFromLead(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const quoteRequestId = req.params.quoteRequestId;

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "QuoteRequest" WHERE "id" = CAST(${quoteRequestId} AS uuid) FOR UPDATE`);
    const lead = await tx.quoteRequest.findUnique({
      where: { id: quoteRequestId },
      select: {
        id: true,
        reference: true,
        fullName: true,
        companyName: true,
        email: true,
        phone: true,
        originCity: true,
        originCountry: true,
        destinationCity: true,
        destinationCountry: true,
        shipmentType: true,
        freightMode: true,
        cargoDescription: true,
        incoterms: true,
        expectedShipDate: true,
        additionalNotes: true,
      },
    });
    if (!lead) throw ApiError.notFound('Quote request not found');

    const existing = await tx.quote.findUnique({
      where: { sourceQuoteRequestId: lead.id },
      include: quoteInclude,
    });
    if (existing) {
      if (existing.companyId !== companyId) throw ApiError.notFound('Quote request not found');
      return { quote: existing, created: false, customerCreated: false, customerUpgraded: false };
    }

    const customer = await findOrCreateLeadCustomer(tx, companyId, lead);
    const origin = routeLabel(lead.originCity, lead.originCountry);
    const destination = routeLabel(lead.destinationCity, lead.destinationCountry);
    const notes = [lead.cargoDescription, lead.additionalNotes].filter(Boolean).join('\n\n') || null;
    const quote = await tx.quote.create({
      data: {
        companyId,
        number: await nextNumber(tx, companyId, 'QUOTE', 'QT'),
        customerId: customer.partner.id,
        sourceQuoteRequestId: lead.id,
        status: 'DRAFT',
        currency: customer.partner.currency,
        exchangeRate: 1,
        notes,
        createdById: user.id,
        lines: {
          create: recalculateLines(
            [
              {
                descriptionEn: `${lead.shipmentType} freight (${lead.freightMode}): ${origin} to ${destination}`,
                quantity: 1,
                unitPrice: 0,
                discountPercent: 0,
                taxPercent: 0,
              },
            ],
            customer.partner.currency,
          ),
        },
      },
      include: quoteInclude,
    });

    if (customer.created || customer.upgraded) {
      await recordAuditTx(tx, {
        userId: user.id,
        action: customer.created ? 'partner.created' : 'partner.updated',
        entity: 'BusinessPartner',
        entityId: customer.partner.id,
        metadata: { sourceQuoteRequestId: lead.id, createdFromLead: true, upgradedToBoth: customer.upgraded },
        ip: req.ip,
      });
    }
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'quote.created_from_lead',
      entity: 'Quote',
      entityId: quote.id,
      metadata: { number: quote.number, sourceQuoteRequestId: lead.id, customerId: customer.partner.id },
      ip: req.ip,
    });
    return { quote, created: true, customerCreated: customer.created, customerUpgraded: customer.upgraded };
  });

  res.setHeader('Cache-Control', 'private, no-store');
  res.status(result.created ? 201 : 200).json({ data: withQuoteTotals(result.quote) });
}

export async function convertQuote(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const quoteId = req.params.id;
  const body = req.body as QuoteConversionBody;
  const idempotencyKey = requireIdempotencyKey(req);
  const fingerprint = createHash('sha256').update(JSON.stringify({ body, params: req.params })).digest('hex');

  const result = await prisma.$transaction(async (tx) => {
    const replay = await readConversion(tx, companyId, idempotencyKey, quoteId, fingerprint);
    if (replay) return replay;

    // Serialize conversions of the same quote; Booking.quoteId is intentionally nullable and not unique.
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Quote" WHERE "id" = CAST(${quoteId} AS uuid) AND "companyId" = CAST(${companyId} AS uuid) FOR UPDATE`);
    const replayAfterLock = await readConversion(tx, companyId, idempotencyKey, quoteId, fingerprint);
    if (replayAfterLock) return replayAfterLock;

    const quote = await tx.quote.findFirst({ where: { id: quoteId, companyId }, include: quoteInclude });
    if (!quote) throw ApiError.notFound('Quote not found');
    if (quote.status === 'CONVERTED') {
      throw new ApiError(409, 'CONFLICT', 'This quote has already been converted');
    }
    if (quote.status !== 'ACCEPTED') {
      throw new ApiError(409, 'CONFLICT', 'Only accepted quotes can be converted');
    }

    const existingBooking = await tx.booking.findFirst({ where: { quoteId: quote.id, companyId }, select: { id: true } });
    if (existingBooking) {
      throw new ApiError(409, 'CONFLICT', 'A booking already exists for this quote');
    }

    const source = quote.sourceQuoteRequest;
    const mode = body.mode ?? source?.freightMode;
    const origin = body.origin ?? (source ? routeLabel(source.originCity, source.originCountry) : undefined);
    const destination =
      body.destination ?? (source ? routeLabel(source.destinationCity, source.destinationCountry) : undefined);
    if (!mode || !origin || !destination) {
      throw ApiError.badRequest('Mode, origin and destination are required to convert this quote');
    }

    const convertedAt = new Date();
    const booking = await tx.booking.create({
      data: {
        companyId,
        branchId: quote.branchId,
        number: await nextNumber(tx, companyId, 'BOOKING', 'B'),
        quoteId: quote.id,
        customerId: quote.customerId,
        mode,
        origin,
        destination,
        carrier: body.carrier ?? null,
        vesselOrFlight: body.vesselOrFlight ?? null,
        incoterms: body.incoterms !== undefined ? body.incoterms : source?.incoterms ?? null,
        etd: body.etd !== undefined ? body.etd : source?.expectedShipDate ?? null,
        eta: body.eta ?? null,
        notes: body.notes !== undefined ? body.notes : quote.notes ?? source?.additionalNotes ?? null,
        createdById: user.id,
      },
    });

    const converted = await tx.quote.updateMany({
      where: { id: quote.id, companyId, status: 'ACCEPTED' },
      data: { status: 'CONVERTED', convertedAt, version: { increment: 1 } },
    });
    if (!converted.count) {
      throw new ApiError(409, 'CONFLICT', 'The quote is no longer available for conversion');
    }

    const [updatedQuote, bookingWithRelations] = await Promise.all([
      tx.quote.findUniqueOrThrow({ where: { id: quote.id }, include: quoteInclude }),
      tx.booking.findUniqueOrThrow({ where: { id: booking.id }, include: bookingInclude }),
    ]);
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'quote.converted',
      entity: 'Quote',
      entityId: quote.id,
      metadata: { bookingId: booking.id, bookingNumber: booking.number, idempotencyKey },
      ip: req.ip,
    });

    const response = {
      operation: 'quote.convert' as const,
      quoteId: quote.id,
      fingerprint,
      status: 201,
      body: { data: { booking: bookingWithRelations, quote: withQuoteTotals(updatedQuote) } },
    };
    await saveIdempotentResponse(
      tx,
      companyId,
      idempotencyKey,
      JSON.parse(JSON.stringify(response)) as Prisma.InputJsonValue,
    );
    return response;
  });

  res.setHeader('Cache-Control', 'private, no-store');
  res.status(result.status).json(result.body);
}
