import { Router } from 'express';
import {
  getNewsArticle,
  getPublicSettings,
  getService,
  listNews,
  listServices,
  trackShipment,
} from '../controllers/catalog.controller';
import { validate } from '../middleware/validate';
import { trackingParamsSchema } from '../validators/schemas';
import { trackingLimiter } from '../middleware/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

export const catalogRoutes = Router();

catalogRoutes.get('/services', asyncHandler(listServices));
catalogRoutes.get('/services/:slug', asyncHandler(getService));
catalogRoutes.get('/news', asyncHandler(listNews));
catalogRoutes.get('/news/:slug', asyncHandler(getNewsArticle));
catalogRoutes.get('/settings', asyncHandler(getPublicSettings));
catalogRoutes.get(
  '/tracking/:trackingNumber',
  trackingLimiter,
  validate({ params: trackingParamsSchema }),
  asyncHandler(trackShipment),
);
