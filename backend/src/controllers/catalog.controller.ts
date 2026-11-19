import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { ApiError } from '../middleware/error';
import { trackingProvider } from '../services/tracking/tracking.provider';

export async function listServices(_req: Request, res: Response): Promise<void> {
  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: [{ position: 'asc' }, { titleEn: 'asc' }],
    select: {
      slug: true,
      icon: true,
      titleEn: true,
      titleAr: true,
      excerptEn: true,
      excerptAr: true,
      featuresEn: true,
      featuresAr: true,
      isFeatured: true,
      position: true,
    },
  });
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.json({ data: services });
}

export async function getService(req: Request, res: Response): Promise<void> {
  const service = await prisma.service.findFirst({
    where: { slug: req.params.slug, isActive: true },
  });
  if (!service) throw ApiError.notFound('Service not found');
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.json({ data: service });
}

export async function listNews(req: Request, res: Response): Promise<void> {
  const articles = await prisma.newsArticle.findMany({
    where: { isPublished: true },
    orderBy: { publishedAt: 'desc' },
    select: {
      slug: true,
      titleEn: true,
      titleAr: true,
      excerptEn: true,
      excerptAr: true,
      category: true,
      coverImage: true,
      publishedAt: true,
      author: true,
    },
  });
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.json({ data: articles });
}

export async function getNewsArticle(req: Request, res: Response): Promise<void> {
  const article = await prisma.newsArticle.findFirst({
    where: { slug: req.params.slug, isPublished: true },
  });
  if (!article) throw ApiError.notFound('Article not found');
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.json({ data: article });
}

export async function trackShipment(req: Request, res: Response): Promise<void> {
  const trackingNumber = String(req.params.trackingNumber).toUpperCase();
  const result = await trackingProvider.lookup(trackingNumber);

  if (!result) {
    throw ApiError.notFound(
      'No shipment matches this tracking number. Please check the number or contact our operations team.',
    );
  }

  // Tracking data is per-customer and must never be cached by intermediaries.
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: result });
}

export async function getPublicSettings(_req: Request, res: Response): Promise<void> {
  const rows = await prisma.companySetting.findMany();
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ data: settings });
}
