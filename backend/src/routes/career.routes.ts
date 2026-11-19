import { Router } from 'express';
import { createApplication, listApplications, updateApplicationStatus } from '../controllers/career.controller';
import { validate } from '../middleware/validate';
import { careerSchema } from '../validators/schemas';
import { cvUpload } from '../middleware/upload';
import { requireAuth, requireRole } from '../middleware/auth';
import { submissionLimiter } from '../middleware/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

export const careerRoutes = Router();

careerRoutes.post(
  '/apply',
  submissionLimiter,
  cvUpload.single('cv'),
  validate({ body: careerSchema }),
  asyncHandler(createApplication),
);

careerRoutes.get('/', requireAuth, asyncHandler(listApplications));
careerRoutes.patch('/:id/status', requireAuth, requireRole('ADMIN', 'EDITOR'), asyncHandler(updateApplicationStatus));
