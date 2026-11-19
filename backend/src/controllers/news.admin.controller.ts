import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { ApiError } from '../middleware/error';
import { currentUser } from '../middleware/auth';
import { recordAudit } from '../services/audit.service';

type NewsBody = {
  slug: string;
  titleEn: string;
  titleAr: string;
  excerptEn: string;
  excerptAr: string;
  bodyEn: string;
  bodyAr: string;
  category: string;
  coverImage?: string;
  isPublished?: boolean;
};

export async function listAllNews(_req: Request, res: Response): Promise<void> {
  const articles = await prisma.newsArticle.findMany({ orderBy: { createdAt: 'desc' } });
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: articles });
}

export async function createNews(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const body = req.body as NewsBody;

  const existing = await prisma.newsArticle.findUnique({ where: { slug: body.slug } });
  if (existing) throw ApiError.badRequest('An article with this slug already exists');

  const created = await prisma.newsArticle.create({
    data: {
      slug: body.slug,
      titleEn: body.titleEn,
      titleAr: body.titleAr,
      excerptEn: body.excerptEn,
      excerptAr: body.excerptAr,
      bodyEn: body.bodyEn,
      bodyAr: body.bodyAr,
      category: body.category,
      coverImage: body.coverImage ?? null,
      isPublished: body.isPublished ?? false,
      publishedAt: body.isPublished ? new Date() : null,
      author: user.name,
    },
  });

  await recordAudit({ userId: user.id, action: 'news.created', entity: 'NewsArticle', entityId: created.id, ip: req.ip });
  res.status(201).json({ data: created });
}

export async function updateNews(req: Request, res: Response): Promise<void> {
  const user = currentUser(req);
  const body = req.body as Partial<NewsBody>;

  const existing = await prisma.newsArticle.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Article not found');

  const updated = await prisma.newsArticle.update({
    where: { id: existing.id },
    data: {
      ...body,
      publishedAt:
        body.isPublished && !existing.publishedAt
          ? new Date()
          : body.isPublished === false
            ? null
            : existing.publishedAt,
    },
  });

  await recordAudit({ userId: user.id, action: 'news.updated', entity: 'NewsArticle', entityId: updated.id, ip: req.ip });
  res.json({ data: updated });
}
