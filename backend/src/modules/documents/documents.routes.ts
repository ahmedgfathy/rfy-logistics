import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { documentUpload } from '../../middleware/upload';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { archiveDocument, correctDocument, downloadDocument, listDocuments, restoreDocument, uploadDocument } from './documents.controller';
import { documentParamsSchema, documentQuerySchema, documentUpdateSchema, documentUploadSchema } from './documents.schemas';

export const documentRoutes = Router();
documentRoutes.use(requireAuth);
documentRoutes.get('/', requirePermission('documents.read'), validate({ query: documentQuerySchema }), asyncHandler(listDocuments));
documentRoutes.post(
  '/',
  requirePermission('documents.write'),
  documentUpload.single('file'),
  validate({ body: documentUploadSchema }),
  asyncHandler(uploadDocument),
);
documentRoutes.get('/:id/download', requirePermission('documents.read'), validate({ params: documentParamsSchema }), asyncHandler(downloadDocument));
documentRoutes.patch('/:id', requirePermission('documents.write'), validate({ params: documentParamsSchema, body: documentUpdateSchema }), asyncHandler(correctDocument));
documentRoutes.patch('/:id/archive', requirePermission('documents.write'), validate({ params: documentParamsSchema }), asyncHandler(archiveDocument));
documentRoutes.patch('/:id/restore', requirePermission('documents.write'), validate({ params: documentParamsSchema }), asyncHandler(restoreDocument));
