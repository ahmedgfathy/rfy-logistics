import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { createBooking, getBooking, listBookings, updateBooking, updateBookingStatus } from './bookings.controller';
import {
  bookingCreateSchema,
  bookingParamsSchema,
  bookingQuerySchema,
  bookingStatusSchema,
  bookingUpdateSchema,
} from './sales.schemas';

export const salesBookingRoutes = Router();

salesBookingRoutes.use(requireAuth);
salesBookingRoutes.get(
  '/',
  requirePermission('sales.read'),
  validate({ query: bookingQuerySchema }),
  asyncHandler(listBookings),
);
salesBookingRoutes.post(
  '/',
  requirePermission('sales.write'),
  validate({ body: bookingCreateSchema }),
  asyncHandler(createBooking),
);
salesBookingRoutes.get(
  '/:id',
  requirePermission('sales.read'),
  validate({ params: bookingParamsSchema }),
  asyncHandler(getBooking),
);
salesBookingRoutes.patch(
  '/:id',
  requirePermission('sales.write'),
  validate({ params: bookingParamsSchema, body: bookingUpdateSchema }),
  asyncHandler(updateBooking),
);
salesBookingRoutes.patch(
  '/:id/status',
  requirePermission('sales.write'),
  validate({ params: bookingParamsSchema, body: bookingStatusSchema }),
  asyncHandler(updateBookingStatus),
);
