import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  assessCustomsDeclaration,
  cancelCustomsDeclaration,
  createAciFiling,
  createCustomsDeclaration,
  createCustomsFile,
  createHsCode,
  getCustomsDeclaration,
  getCustomsFile,
  listCustomsDeclarations,
  listCustomsFiles,
  listHsCodes,
  releaseCustomsDeclaration,
  updateAciFiling,
  updateCustomsDeclaration,
  updateCustomsFile,
  updateCustomsFileStatus,
  updateHsCode,
} from './customs.controller';
import {
  aciCreateSchema,
  aciUpdateSchema,
  customsFileCreateSchema,
  customsFileQuerySchema,
  customsFileStatusSchemaBody,
  customsFileUpdateSchema,
  declarationAssessSchema,
  declarationCancelSchema,
  declarationCreateSchema,
  declarationQuerySchema,
  declarationReleaseSchema,
  declarationUpdateSchema,
  hsCodeCreateSchema,
  hsCodeQuerySchema,
  hsCodeUpdateSchema,
  idParamsSchema,
} from './customs.schemas';

export const customsRoutes = Router();

customsRoutes.use(requireAuth);

customsRoutes.get(
  '/files',
  requirePermission('customs.read'),
  validate({ query: customsFileQuerySchema }),
  asyncHandler(listCustomsFiles),
);
customsRoutes.post(
  '/files',
  requirePermission('customs.write'),
  validate({ body: customsFileCreateSchema }),
  asyncHandler(createCustomsFile),
);
customsRoutes.get(
  '/files/:id',
  requirePermission('customs.read'),
  validate({ params: idParamsSchema }),
  asyncHandler(getCustomsFile),
);
customsRoutes.patch(
  '/files/:id',
  requirePermission('customs.write'),
  validate({ params: idParamsSchema, body: customsFileUpdateSchema }),
  asyncHandler(updateCustomsFile),
);
customsRoutes.patch(
  '/files/:id/status',
  requirePermission('customs.write'),
  validate({ params: idParamsSchema, body: customsFileStatusSchemaBody }),
  asyncHandler(updateCustomsFileStatus),
);
customsRoutes.post(
  '/files/:id/aci',
  requirePermission('customs.write'),
  validate({ params: idParamsSchema, body: aciCreateSchema }),
  asyncHandler(createAciFiling),
);
customsRoutes.patch(
  '/aci/:id',
  requirePermission('customs.write'),
  validate({ params: idParamsSchema, body: aciUpdateSchema }),
  asyncHandler(updateAciFiling),
);

customsRoutes.get(
  '/declarations',
  requirePermission('customs.read'),
  validate({ query: declarationQuerySchema }),
  asyncHandler(listCustomsDeclarations),
);
customsRoutes.post(
  '/declarations',
  requirePermission('customs.write'),
  validate({ body: declarationCreateSchema }),
  asyncHandler(createCustomsDeclaration),
);
customsRoutes.get(
  '/declarations/:id',
  requirePermission('customs.read'),
  validate({ params: idParamsSchema }),
  asyncHandler(getCustomsDeclaration),
);
customsRoutes.patch(
  '/declarations/:id',
  requirePermission('customs.write'),
  validate({ params: idParamsSchema, body: declarationUpdateSchema }),
  asyncHandler(updateCustomsDeclaration),
);
customsRoutes.post(
  '/declarations/:id/cancel',
  requirePermission('customs.write'),
  validate({ params: idParamsSchema, body: declarationCancelSchema }),
  asyncHandler(cancelCustomsDeclaration),
);
customsRoutes.post(
  '/declarations/:id/assess',
  requirePermission('customs.write'),
  validate({ params: idParamsSchema, body: declarationAssessSchema }),
  asyncHandler(assessCustomsDeclaration),
);
customsRoutes.post(
  '/declarations/:id/release',
  requirePermission('customs.release'),
  validate({ params: idParamsSchema, body: declarationReleaseSchema }),
  asyncHandler(releaseCustomsDeclaration),
);

customsRoutes.get(
  '/hs-codes',
  requirePermission('customs.read'),
  validate({ query: hsCodeQuerySchema }),
  asyncHandler(listHsCodes),
);
customsRoutes.post(
  '/hs-codes',
  requirePermission('customs.write'),
  validate({ body: hsCodeCreateSchema }),
  asyncHandler(createHsCode),
);
customsRoutes.patch(
  '/hs-codes/:id',
  requirePermission('customs.write'),
  validate({ params: idParamsSchema, body: hsCodeUpdateSchema }),
  asyncHandler(updateHsCode),
);
