import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  addContainer,
  addErpShipmentEvent,
  addPackage,
  addVendor,
  cancelVendor,
  createErpShipment,
  deleteContainer,
  deletePackage,
  getErpShipment,
  listErpShipments,
  setPublication,
  updateContainer,
  updateErpShipment,
  updatePackage,
  updateVendor,
} from './operations.controller';
import {
  containerCreateSchema,
  containerParamsSchema,
  containerUpdateSchema,
  idParamsSchema,
  packageCreateSchema,
  packageParamsSchema,
  packageUpdateSchema,
  publicationSchema,
  shipmentCreateSchema,
  shipmentEventSchema,
  shipmentQuerySchema,
  shipmentUpdateSchema,
  shipmentVersionQuerySchema,
  vendorCancelSchema,
  vendorCreateSchema,
  vendorParamsSchema,
  vendorUpdateSchema,
} from './operations.schemas';

export const operationsRoutes = Router();
operationsRoutes.use(requireAuth);
operationsRoutes.get('/shipments', requirePermission('shipments.read'), validate({ query: shipmentQuerySchema }), asyncHandler(listErpShipments));
operationsRoutes.post('/shipments', requirePermission('shipments.write'), validate({ body: shipmentCreateSchema }), asyncHandler(createErpShipment));
operationsRoutes.get('/shipments/:id', requirePermission('shipments.read'), validate({ params: idParamsSchema }), asyncHandler(getErpShipment));
operationsRoutes.patch('/shipments/:id', requirePermission('shipments.write'), validate({ params: idParamsSchema, body: shipmentUpdateSchema }), asyncHandler(updateErpShipment));
operationsRoutes.post('/shipments/:id/events', requirePermission('shipments.write'), validate({ params: idParamsSchema, body: shipmentEventSchema }), asyncHandler(addErpShipmentEvent));
operationsRoutes.post('/shipments/:id/packages', requirePermission('shipments.write'), validate({ params: idParamsSchema, body: packageCreateSchema }), asyncHandler(addPackage));
operationsRoutes.patch('/shipments/:id/packages/:packageId', requirePermission('shipments.write'), validate({ params: packageParamsSchema, body: packageUpdateSchema }), asyncHandler(updatePackage));
operationsRoutes.delete('/shipments/:id/packages/:packageId', requirePermission('shipments.write'), validate({ params: packageParamsSchema, query: shipmentVersionQuerySchema }), asyncHandler(deletePackage));
operationsRoutes.post('/shipments/:id/containers', requirePermission('shipments.write'), validate({ params: idParamsSchema, body: containerCreateSchema }), asyncHandler(addContainer));
operationsRoutes.patch('/shipments/:id/containers/:containerId', requirePermission('shipments.write'), validate({ params: containerParamsSchema, body: containerUpdateSchema }), asyncHandler(updateContainer));
operationsRoutes.delete('/shipments/:id/containers/:containerId', requirePermission('shipments.write'), validate({ params: containerParamsSchema, query: shipmentVersionQuerySchema }), asyncHandler(deleteContainer));
operationsRoutes.post('/shipments/:id/vendors', requirePermission('shipments.write'), validate({ params: idParamsSchema, body: vendorCreateSchema }), asyncHandler(addVendor));
operationsRoutes.patch('/shipments/:id/vendors/:costId', requirePermission('shipments.write'), validate({ params: vendorParamsSchema, body: vendorUpdateSchema }), asyncHandler(updateVendor));
operationsRoutes.post('/shipments/:id/vendors/:costId/cancel', requirePermission('shipments.write'), validate({ params: vendorParamsSchema, body: vendorCancelSchema }), asyncHandler(cancelVendor));
operationsRoutes.patch('/shipments/:id/publication', requirePermission('shipments.publish'), validate({ params: idParamsSchema, body: publicationSchema }), asyncHandler(setPublication));
