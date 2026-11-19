import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { ApiError } from '../middleware/error';
import { currentUser } from '../middleware/auth';
import { recordAudit } from '../services/audit.service';

export async function listAllServices(_req: Request, res: Response): Promise<void> {
  const services = await prisma.service.findMany({ orderBy: [{ position: 'asc' }] });
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: services });
}

export async function updateService(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const existing = await prisma.service.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Service not found');

  const updated = await prisma.service.update({
    where: { id: existing.id },
    data: req.body as Record<string, string | number | boolean>,
  });

  await recordAudit({
    userId: user.id,
    action: 'service.updated',
    entity: 'Service',
    entityId: updated.id,
    metadata: { slug: updated.slug },
    ip: req.ip,
  });

  res.json({ data: updated });
}
