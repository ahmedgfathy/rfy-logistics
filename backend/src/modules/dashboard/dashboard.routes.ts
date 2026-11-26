import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { erpDashboard } from './dashboard.controller';

export const dashboardRoutes = Router();
dashboardRoutes.get('/', requireAuth, asyncHandler(erpDashboard));
