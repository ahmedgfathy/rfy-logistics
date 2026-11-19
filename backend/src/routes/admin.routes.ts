import { Router } from 'express';
import {
  addShipmentEvent,
  createShipment,
  createUser,
  dashboardStats,
  getShipment,
  listAuditLogs,
  listShipments,
  listUsers,
} from '../controllers/admin.controller';
import { createNews, listAllNews, updateNews } from '../controllers/news.admin.controller';
import { listAllServices, updateService } from '../controllers/service.admin.controller';
import { requireAuth, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { newsSchema, serviceUpdateSchema, shipmentEventSchema, shipmentSchema, userCreateSchema } from '../validators/schemas';
import { asyncHandler } from '../utils/asyncHandler';

export const adminRoutes = Router();

adminRoutes.use(requireAuth);

adminRoutes.get('/stats', asyncHandler(dashboardStats));

adminRoutes.get('/shipments', asyncHandler(listShipments));
adminRoutes.post('/shipments', validate({ body: shipmentSchema }), asyncHandler(createShipment));
adminRoutes.get('/shipments/:id', asyncHandler(getShipment));
adminRoutes.post('/shipments/:id/events', validate({ body: shipmentEventSchema }), asyncHandler(addShipmentEvent));

adminRoutes.get('/services', asyncHandler(listAllServices));
adminRoutes.patch('/services/:id', validate({ body: serviceUpdateSchema }), asyncHandler(updateService));

adminRoutes.get('/news', asyncHandler(listAllNews));
adminRoutes.post('/news', validate({ body: newsSchema }), asyncHandler(createNews));
adminRoutes.patch('/news/:id', asyncHandler(updateNews));

adminRoutes.get('/users', requireRole('ADMIN'), asyncHandler(listUsers));
adminRoutes.post('/users', requireRole('ADMIN'), validate({ body: userCreateSchema }), asyncHandler(createUser));

adminRoutes.get('/audit-logs', requireRole('ADMIN'), asyncHandler(listAuditLogs));
