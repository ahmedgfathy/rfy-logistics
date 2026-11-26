import type { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { defaultCompanyId } from '../../lib/company';
import { ApiError } from '../../middleware/error';
import { currentUser } from '../../middleware/auth';
import { recordAuditTx } from '../../services/audit.service';
import { parsePagination, paginationMeta } from '../../utils/pagination';
import type { TaskQuery } from './tasks.schemas';

async function requireTaskReferences(
  tx: Prisma.TransactionClient,
  companyId: string,
  relatedType: string,
  relatedId: string,
  assignedToId?: string | null,
): Promise<void> {
  const count = relatedType === 'SHIPMENT'
    ? await tx.shipment.count({ where: { id: relatedId, companyId } })
    : relatedType === 'CUSTOMS_FILE'
      ? await tx.customsFile.count({ where: { id: relatedId, companyId } })
      : relatedType === 'QUOTE'
        ? await tx.quote.count({ where: { id: relatedId, companyId } })
        : relatedType === 'BOOKING'
          ? await tx.booking.count({ where: { id: relatedId, companyId } })
          : relatedType === 'INVOICE'
            ? await tx.invoice.count({ where: { id: relatedId, companyId } })
            : await tx.bill.count({ where: { id: relatedId, companyId } });
  if (!count) throw ApiError.badRequest('The related record is invalid or outside this company');
  if (assignedToId) {
    const assignee = await tx.user.findFirst({ where: { id: assignedToId, isActive: true }, select: { id: true } });
    if (!assignee) throw ApiError.badRequest('The assigned user is invalid or inactive');
  }
}

export async function listAssignableUsers(_req: Request, res: Response): Promise<void> {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
    select: { id: true, name: true, email: true },
  });
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: users });
}

export async function listTasks(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const query = res.locals.query as TaskQuery;
  const pagination = parsePagination(query, 25);
  const where: Prisma.TaskWhereInput = {
    companyId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.relatedType ? { relatedType: query.relatedType } : {}),
    ...(query.relatedId ? { relatedId: query.relatedId } : {}),
    ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
  };
  const [total, tasks] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      skip: pagination.skip,
      take: pagination.limit,
      include: { assignedTo: { select: { id: true, name: true, email: true } } },
    }),
  ]);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: tasks, meta: paginationMeta(total, pagination) });
}

export async function createTask(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const task = await prisma.$transaction(async (tx) => {
    await requireTaskReferences(tx, companyId, req.body.relatedType, req.body.relatedId, req.body.assignedToId);
    const created = await tx.task.create({ data: { ...req.body, companyId, createdById: user.id } });
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'task.created',
      entity: 'Task',
      entityId: created.id,
      metadata: { relatedType: created.relatedType, relatedId: created.relatedId, assignedToId: created.assignedToId },
      ip: req.ip,
    });
    return created;
  });
  res.status(201).json({ data: task });
}

export async function updateTask(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const companyId = await defaultCompanyId();
  const task = await prisma.$transaction(async (tx) => {
    const existing = await tx.task.findFirst({ where: { id: req.params.id, companyId } });
    if (!existing) throw ApiError.notFound('Task not found');
    const relatedType = req.body.relatedType ?? existing.relatedType;
    const relatedId = req.body.relatedId ?? existing.relatedId;
    await requireTaskReferences(tx, companyId, relatedType, relatedId, req.body.assignedToId);
    const status = req.body.status ?? existing.status;
    const updated = await tx.task.update({
      where: { id: existing.id },
      data: {
        ...req.body,
        relatedType,
        relatedId,
        status,
        completedAt: status === 'COMPLETED' ? existing.completedAt ?? new Date() : null,
      },
    });
    await recordAuditTx(tx, {
      userId: user.id,
      action: 'task.updated',
      entity: 'Task',
      entityId: updated.id,
      metadata: {
        from: existing.status,
        to: updated.status,
        assignedFrom: existing.assignedToId,
        assignedTo: updated.assignedToId,
        fields: Object.keys(req.body),
      },
      ip: req.ip,
    });
    return updated;
  });
  res.json({ data: task });
}
