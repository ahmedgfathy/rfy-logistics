import { Router } from 'express';
import {
  createQuote,
  downloadAttachment,
  getQuote,
  listQuotes,
  updateQuoteStatus,
} from '../controllers/quote.controller';
import { validate } from '../middleware/validate';
import { quoteSchema, quoteStatusSchema } from '../validators/schemas';
import { requireAuth, requireRole } from '../middleware/auth';
import { quoteUpload } from '../middleware/upload';
import { submissionLimiter } from '../middleware/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

export const quoteRoutes = Router();

quoteRoutes.post(
  '/',
  submissionLimiter,
  quoteUpload.array('attachments', 3),
  validate({ body: quoteSchema }),
  asyncHandler(createQuote),
);

quoteRoutes.get('/', requireAuth, asyncHandler(listQuotes));
quoteRoutes.get('/:id', requireAuth, asyncHandler(getQuote));
quoteRoutes.patch('/:id/status', requireAuth, requireRole('ADMIN', 'EDITOR'), validate({ body: quoteStatusSchema }), asyncHandler(updateQuoteStatus));
quoteRoutes.get('/:id/attachments/:attachmentId', requireAuth, asyncHandler(downloadAttachment));
