import type { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { defaultCompanyId } from '../../lib/company';
import { nextNumber } from '../../lib/numbers';
import { ApiError } from '../../middleware/error';
import { currentUser } from '../../middleware/auth';
import { recordAuditTx } from '../../services/audit.service';
import { parsePagination, paginationMeta } from '../../utils/pagination';
import { bookingInclude, requireBranch, requireCustomer } from './sales.shared';
import type { BookingCreateBody, BookingQuery, BookingUpdateBody } from './sales.schemas';

export async function listBookings(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const query = res.locals.query as BookingQuery;
  const pagination = parsePagination(query);
  const search = query.search;
  const where: Prisma.BookingWhereInput = {
    companyId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(search
      ? {
          OR: [
            { number: { contains: search, mode: 'insensitive' } },
            { origin: { contains: search, mode: 'insensitive' } },
            { destination: { contains: search, mode: 'insensitive' } },
            { carrier: { contains: search, mode: 'insensitive' } },
            { vesselOrFlight: { contains: search, mode: 'insensitive' } },
            { customer: { nameEn: { contains: search, mode: 'insensitive' } } },
            { customer: { nameAr: { contains: search, mode: 'insensitive' } } },
            { customer: { legalName: { contains: search, mode: 'insensitive' } } },
            { customer: { email: { contains: search, mode: 'insensitive' } } },
            { quote: { number: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [total, bookings] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
      include: bookingInclude,
    }),
  ]);

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: bookings, meta: paginationMeta(total, pagination) });
}

export async function getBooking(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const booking = await prisma.booking.findFirst({
    where: { id: req.params.id, companyId },
    include: bookingInclude,
  });
  if (!booking) throw ApiError.notFound('Booking not found');

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: booking });
}

export async function createBooking(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as BookingCreateBody;

  const booking = await prisma.$transaction(async (tx) => {
    await requireCustomer(tx, companyId, body.customerId);
    await requireBranch(tx, companyId, body.branchId);

    const created = await tx.booking.create({
      data: {
        companyId,
        branchId: body.branchId ?? null,
        number: await nextNumber(tx, companyId, 'BOOKING', 'BK'),
        customerId: body.customerId,
        mode: body.mode,
        origin: body.origin,
        destination: body.destination,
        carrier: body.carrier ?? null,
        vesselOrFlight: body.vesselOrFlight ?? null,
        incoterms: body.incoterms ?? null,
        etd: body.etd ?? null,
        eta: body.eta ?? null,
        notes: body.notes ?? null,
        createdById: user.id,
      },
      include: bookingInclude,
    });
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'booking.created',
      entity: 'Booking',
      entityId: created.id,
      metadata: { number: created.number, customerId: created.customerId, mode: created.mode },
      ip: req.ip,
    });
    return created;
  });

  res.setHeader('Cache-Control', 'private, no-store');
  res.status(201).json({ data: booking });
}

export async function updateBooking(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const body = req.body as BookingUpdateBody;

  const booking = await prisma.$transaction(async (tx) => {
    const existing = await tx.booking.findFirst({ where: { id: req.params.id, companyId } });
    if (!existing) throw ApiError.notFound('Booking not found');
    if (!['CONFIRMED', 'OPERATIONAL'].includes(existing.status)) {
      throw new ApiError(409, 'CONFLICT', 'Only confirmed or operational bookings can be edited');
    }
    const updated = await tx.booking.update({
      where: { id: existing.id },
      data: { ...body, version: { increment: 1 } },
      include: bookingInclude,
    });
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'booking.updated',
      entity: 'Booking',
      entityId: updated.id,
      metadata: { number: updated.number, fields: Object.keys(body) },
      ip: req.ip,
    });
    return updated;
  });

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: booking });
}

const bookingTransitions: Record<string, string[]> = {
  CONFIRMED: ['OPERATIONAL', 'CANCELLED'],
  OPERATIONAL: ['COMPLETED', 'CANCELLED'],
};

export async function updateBookingStatus(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const status = req.body.status as 'CONFIRMED' | 'OPERATIONAL' | 'COMPLETED' | 'CANCELLED';

  const booking = await prisma.$transaction(async (tx) => {
    const existing = await tx.booking.findFirst({
      where: { id: req.params.id, companyId },
      select: { id: true, status: true },
    });
    if (!existing) throw ApiError.notFound('Booking not found');
    if (existing.status === status) return tx.booking.findUniqueOrThrow({ where: { id: existing.id }, include: bookingInclude });
    if (!bookingTransitions[existing.status]?.includes(status)) {
      throw new ApiError(409, 'INVALID_TRANSITION', `A ${existing.status} booking cannot move to ${status}`);
    }

    const updated = await tx.booking.update({
      where: { id: existing.id },
      data: { status, version: { increment: 1 } },
      include: bookingInclude,
    });
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'booking.status_changed',
      entity: 'Booking',
      entityId: updated.id,
      metadata: { from: existing.status, to: status },
      ip: req.ip,
    });
    return updated;
  });

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: booking });
}
