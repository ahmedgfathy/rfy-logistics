import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { ApiError } from '../middleware/error';
import { currentUser } from '../middleware/auth';
import { env } from '../config/env';
import { recordAudit } from '../services/audit.service';
import { parsePagination, paginationMeta } from '../utils/pagination';

export async function dashboardStats(_req: Request, res: Response): Promise<void> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [totalQuotes, newQuotes, openContacts, shipmentsInTransit, last30, recentQuotes, recentContacts, quotesByStatus] =
    await Promise.all([
      prisma.quoteRequest.count(),
      prisma.quoteRequest.count({ where: { status: 'NEW' } }),
      prisma.contactMessage.count({ where: { status: { not: 'RESOLVED' } } }),
      prisma.shipment.count({
        where: { status: { notIn: ['DELIVERED', 'CANCELLED'] } },
      }),
      prisma.quoteRequest.count({ where: { createdAt: { gte: since } } }),
      prisma.quoteRequest.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          reference: true,
          fullName: true,
          companyName: true,
          destinationCountry: true,
          freightMode: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.contactMessage.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, fullName: true, subject: true, status: true, createdAt: true },
      }),
      prisma.quoteRequest.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({
    data: {
      totals: { totalQuotes, newQuotes, openContacts, shipmentsInTransit, last30 },
      quotesByStatus: quotesByStatus.map((row) => ({ status: row.status, count: row._count._all })),
      recentQuotes,
      recentContacts,
    },
  });
}

export async function listShipments(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.query as Record<string, unknown>, 25);
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const where = search
    ? {
        OR: [
          { trackingNumber: { contains: search, mode: 'insensitive' as const } },
          { originPort: { contains: search, mode: 'insensitive' as const } },
          { destinationPort: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [total, shipments] = await Promise.all([
    prisma.shipment.count({ where }),
    prisma.shipment.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
      include: { _count: { select: { events: true } } },
    }),
  ]);

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: shipments, meta: paginationMeta(total, pagination) });
}

export async function createShipment(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const body = req.body as Record<string, unknown>;

  const data = {
    trackingNumber: String(body.trackingNumber).toUpperCase(),
    reference: (body.reference as string) ?? null,
    status: body.status as never,
    mode: body.mode as never,
    carrier: (body.carrier as string) ?? null,
    vesselOrFlight: (body.vesselOrFlight as string) ?? null,
    containerType: (body.containerType as string) ?? null,
    originPort: body.originPort as string,
    destinationPort: body.destinationPort as string,
    pieces: (body.pieces as number) ?? null,
    weightKg: (body.weightKg as number) ?? null,
    etd: (body.etd as Date) ?? null,
    eta: (body.eta as Date) ?? null,
    lastLocation: (body.lastLocation as string) ?? null,
    isDemo: env.NODE_ENV === 'development' && body.isDemo === true,
  };

  const existing = await prisma.shipment.findUnique({ where: { trackingNumber: data.trackingNumber } });
  if (existing) throw ApiError.badRequest('A shipment with this tracking number already exists');

  const created = await prisma.shipment.create({
    data: {
      ...data,
      events: {
        create: [
          {
            status: data.status,
            location: data.originPort,
            description: 'Shipment record created by operations',
            occurredAt: new Date(),
          },
        ],
      },
    },
  });

  await recordAudit({
    userId: user.id,
    action: 'shipment.created',
    entity: 'Shipment',
    entityId: created.id,
    metadata: { trackingNumber: created.trackingNumber },
    ip: req.ip,
  });

  res.status(201).json({ data: created });
}

export async function getShipment(req: Request, res: Response): Promise<void> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: req.params.id },
    include: { events: { orderBy: { occurredAt: 'desc' } } },
  });
  if (!shipment) throw ApiError.notFound('Shipment not found');
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: shipment });
}

export async function addShipmentEvent(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const body = req.body as {
    status: never;
    location?: string;
    description: string;
    occurredAt?: Date;
    updateShipmentStatus: boolean;
  };

  const shipment = await prisma.shipment.findUnique({ where: { id: req.params.id } });
  if (!shipment) throw ApiError.notFound('Shipment not found');

  const event = await prisma.shipmentEvent.create({
    data: {
      shipmentId: shipment.id,
      status: body.status,
      location: body.location ?? null,
      description: body.description,
      occurredAt: body.occurredAt ?? new Date(),
    },
  });

  if (body.updateShipmentStatus) {
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        status: body.status,
        lastLocation: body.location ?? shipment.lastLocation,
        ...(body.status === 'DELIVERED' ? { deliveredAt: body.occurredAt ?? new Date() } : {}),
      },
    });
  }

  await recordAudit({
    userId: user.id,
    action: 'shipment.event.created',
    entity: 'ShipmentEvent',
    entityId: event.id,
    metadata: { shipmentId: shipment.id, status: body.status },
    ip: req.ip,
  });

  res.status(201).json({ data: event });
}

export async function listUsers(_req: Request, res: Response): Promise<void> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
  });
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: users });
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const actor = currentUser(req);
  const { name, email, password, role } = req.body as {
    name: string;
    email: string;
    password: string;
    role: 'ADMIN' | 'EDITOR';
  };

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) throw ApiError.badRequest('A user with this email already exists');

  const created = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      passwordHash: await bcrypt.hash(password, 12),
      role,
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  await recordAudit({
    userId: actor.id,
    action: 'user.created',
    entity: 'User',
    entityId: created.id,
    metadata: { role },
    ip: req.ip,
  });

  res.status(201).json({ data: created });
}

export async function listAuditLogs(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.query as Record<string, unknown>, 50);
  const [total, logs] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: logs, meta: paginationMeta(total, pagination) });
}
