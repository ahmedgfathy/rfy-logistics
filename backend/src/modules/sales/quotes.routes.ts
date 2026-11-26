import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  acceptQuote,
  convertQuote,
  createQuote,
  createQuoteFromLead,
  deleteQuote,
  expireQuote,
  getQuote,
  listQuotes,
  rejectQuote,
  sendQuote,
  updateQuote,
} from './quotes.controller';
import {
  leadQuoteParamsSchema,
  quoteConversionSchema,
  quoteCreateSchema,
  quoteParamsSchema,
  quoteQuerySchema,
  quoteUpdateSchema,
} from './sales.schemas';

export const salesQuoteRoutes = Router();

salesQuoteRoutes.use(requireAuth);
salesQuoteRoutes.get('/', requirePermission('sales.read'), validate({ query: quoteQuerySchema }), asyncHandler(listQuotes));
salesQuoteRoutes.post('/', requirePermission('sales.write'), validate({ body: quoteCreateSchema }), asyncHandler(createQuote));
salesQuoteRoutes.post(
  '/from-lead/:quoteRequestId',
  requirePermission('sales.write'),
  validate({ params: leadQuoteParamsSchema }),
  asyncHandler(createQuoteFromLead),
);
salesQuoteRoutes.get('/:id', requirePermission('sales.read'), validate({ params: quoteParamsSchema }), asyncHandler(getQuote));
salesQuoteRoutes.patch(
  '/:id',
  requirePermission('sales.write'),
  validate({ params: quoteParamsSchema, body: quoteUpdateSchema }),
  asyncHandler(updateQuote),
);
salesQuoteRoutes.delete(
  '/:id',
  requirePermission('sales.write'),
  validate({ params: quoteParamsSchema }),
  asyncHandler(deleteQuote),
);
salesQuoteRoutes.post(
  '/:id/send',
  requirePermission('sales.approve'),
  validate({ params: quoteParamsSchema }),
  asyncHandler(sendQuote),
);
salesQuoteRoutes.post(
  '/:id/reject',
  requirePermission('sales.approve'),
  validate({ params: quoteParamsSchema }),
  asyncHandler(rejectQuote),
);
salesQuoteRoutes.post(
  '/:id/expire',
  requirePermission('sales.approve'),
  validate({ params: quoteParamsSchema }),
  asyncHandler(expireQuote),
);
salesQuoteRoutes.post(
  '/:id/accept',
  requirePermission('sales.approve'),
  validate({ params: quoteParamsSchema }),
  asyncHandler(acceptQuote),
);
salesQuoteRoutes.post(
  '/:id/convert',
  requirePermission('sales.approve'),
  validate({ params: quoteParamsSchema, body: quoteConversionSchema }),
  asyncHandler(convertQuote),
);
