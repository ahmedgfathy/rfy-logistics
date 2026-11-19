import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { persistUpload, removeUpload } from '../lib/storage';
import { parsePagination, paginationMeta } from '../utils/pagination';
import { notifyAdmin } from '../services/notification.service';
import { recordAudit } from '../services/audit.service';
import { applicationReference } from '../utils/reference';

export async function createApplication(req: Request, res: Response): Promise<void> {
  const file = (req.file as Express.Multer.File | undefined) ?? null;
  const body = req.body as {
    fullName: string;
    email: string;
    phone: string;
    position: string;
    experience?: string;
    coverLetter: string;
    locale: 'en' | 'ar';
  };
  const storedName = file ? await persistUpload(file, 'cvs') : null;

  try {
    const created = await prisma.jobApplication.create({
      data: {
        fullName: body.fullName,
        email: body.email.toLowerCase(),
        phone: body.phone,
        position: body.position,
        experience: body.experience ?? null,
        coverLetter: body.coverLetter,
        locale: body.locale,
        cvFileName: file?.originalname.slice(0, 200) ?? null,
        cvStoredName: storedName,
      },
    });

    await notifyAdmin({
      type: 'APPLICATION',
      reference: applicationReference(),
      subject: `New application: ${created.position}`,
      summary: `${created.fullName} - ${created.email}`,
      contactEmail: created.email,
    });

    res.status(201).json({ data: { id: created.id, createdAt: created.createdAt } });
  } catch (error) {
    await removeUpload(storedName, 'cvs');
    throw error;
  }
}

export async function listApplications(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.query as Record<string, unknown>);
  const [total, applications] = await Promise.all([
    prisma.jobApplication.count(),
    prisma.jobApplication.findMany({ orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.limit }),
  ]);

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: applications, meta: paginationMeta(total, pagination) });
}

export async function updateApplicationStatus(req: Request, res: Response): Promise<void> {
  const { status } = req.body as { status: 'NEW' | 'REVIEWED' | 'SHORTLISTED' | 'REJECTED' };
  const updated = await prisma.jobApplication.update({
    where: { id: req.params.id },
    data: { status },
    select: { id: true, status: true },
  });
  await recordAudit({ action: 'application.status.updated', entity: 'JobApplication', entityId: updated.id, metadata: { status }, ip: req.ip });
  res.json({ data: updated });
}
