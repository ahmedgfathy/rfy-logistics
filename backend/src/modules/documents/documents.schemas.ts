import { z } from 'zod';

const categories = [
  'COMMERCIAL_INVOICE',
  'PACKING_LIST',
  'BILL_OF_LADING',
  'AIR_WAYBILL',
  'CERTIFICATE_OF_ORIGIN',
  'ACI_RECEIPT',
  'CUSTOMS_DECLARATION',
  'DUTY_PAYMENT',
  'INSPECTION_REPORT',
  'INSURANCE',
  'OTHER',
] as const;

const relatedTypeSchema = z.enum(['SHIPMENT', 'DECLARATION', 'QUOTE']);

export const documentUploadSchema = z.object({
  category: z.enum(categories),
  relatedType: relatedTypeSchema,
  relatedId: z.string().uuid(),
});

export const documentUpdateSchema = z.object({
  category: z.enum(categories).optional(),
  fileName: z.string().trim().min(1).max(255).refine(
    (value) => value !== '.' && value !== '..' && !/[\\/\u0000-\u001f\u007f]/.test(value),
    'File name must not contain a path or control characters',
  ).optional(),
  relatedType: relatedTypeSchema.optional(),
  relatedId: z.string().uuid().optional(),
}).refine((body) => Object.keys(body).length > 0, 'At least one field is required').refine(
  (body) => (body.relatedType === undefined) === (body.relatedId === undefined),
  'Related type and related record ID must be provided together',
);

export const documentQuerySchema = z.object({
  category: z.enum(categories).optional(),
  relatedType: relatedTypeSchema.optional(),
  relatedId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});

export const documentParamsSchema = z.object({ id: z.string().uuid() });

export type DocumentRelatedType = z.infer<typeof relatedTypeSchema>;
export type DocumentUpdateBody = z.infer<typeof documentUpdateSchema>;
export type DocumentQuery = z.infer<typeof documentQuerySchema>;
