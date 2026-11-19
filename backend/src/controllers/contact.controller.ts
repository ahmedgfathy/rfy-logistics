import type { Request, Response } from 'express';
import { Prisma, type ContactStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../middleware/error';
import { currentUser } from '../middleware/auth';
import { parsePagination, paginationMeta } from '../utils/pagination';
import { recordAudit } from '../services/audit.service';
import { notifyAdmin } from '../services/notification.service';

export async function createContact(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    fullName: string;
    email: string;
    phone?: string;
    company?: string;
    subject: string;
    message: string;
    locale: 'en' | 'ar';
  };

  const created = await prisma.contactMessage.create({
    data: {
      fullName: body.fullName,
      email: body.email.toLowerCase(),
      phone: body.phone ?? null,
      company: body.company ?? null,
      subject: body.subject,
      message: body.message,
      locale: body.locale,
      sourceIp: req.ip,
    },
  });

  await recordAudit({
    action: 'contact.created',
    entity: 'ContactMessage',
    entityId: created.id,
    ip: req.ip,
  });

  await notifyAdmin({
    type: 'CONTACT',
    reference: created.id.slice(0, 8).toUpperCase(),
    subject: `New contact message: ${created.subject}`,
    summary: created.message.slice(0, 240),
    contactEmail: created.email,
  });

  res.status(201).json({ data: { id: created.id, createdAt: created.createdAt } });
}

export async function listContacts(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.query as Record<string, unknown>);
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;

  const where: Prisma.ContactMessageWhereInput =
    status && status !== 'ALL' ? { status: status as ContactStatus } : {};

  const [total, messages] = await Promise.all([
    prisma.contactMessage.count({ where }),
    prisma.contactMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
    }),
  ]);

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: messages, meta: paginationMeta(total, pagination) });
}

export async function updateContactStatus(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const { status } = req.body as { status: ContactStatus };

  const existing = await prisma.contactMessage.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Message not found');

  const updated = await prisma.contactMessage.update({
    where: { id: existing.id },
    data: { status },
    select: { id: true, status: true, updatedAt: true },
  });

  await recordAudit({
    userId: user.id,
    action: 'contact.status.updated',
    entity: 'ContactMessage',
    entityId: updated.id,
    metadata: { from: existing.status, to: status },
    ip: req.ip,
  });

  res.json({ data: updated });
}
