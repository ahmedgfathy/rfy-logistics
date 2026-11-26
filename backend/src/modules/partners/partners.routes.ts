import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { createPartner, getPartner, listPartners, updatePartner } from './partners.controller';
import { partnerCreateSchema, partnerParamsSchema, partnerQuerySchema, partnerUpdateSchema } from './partners.schemas';

export const partnerRoutes = Router();

partnerRoutes.use(requireAuth);
partnerRoutes.get('/', requirePermission('partners.read'), validate({ query: partnerQuerySchema }), asyncHandler(listPartners));
partnerRoutes.post('/', requirePermission('partners.write'), validate({ body: partnerCreateSchema }), asyncHandler(createPartner));
partnerRoutes.get('/:id', requirePermission('partners.read'), validate({ params: partnerParamsSchema }), asyncHandler(getPartner));
partnerRoutes.patch(
  '/:id',
  requirePermission('partners.write'),
  validate({ params: partnerParamsSchema, body: partnerUpdateSchema }),
  asyncHandler(updatePartner),
);
