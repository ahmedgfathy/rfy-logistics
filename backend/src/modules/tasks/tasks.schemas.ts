import { z } from 'zod';

const taskStatusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED']);
const taskRelatedTypeSchema = z.enum(['SHIPMENT', 'CUSTOMS_FILE', 'QUOTE', 'BOOKING', 'INVOICE', 'BILL']);

const taskFields = {
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(4000).nullable().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  relatedType: taskRelatedTypeSchema.optional(),
  relatedId: z.string().uuid().optional(),
  status: taskStatusSchema.optional(),
};

export const taskCreateSchema = z.object({
  ...taskFields,
  priority: taskFields.priority.default('MEDIUM'),
  relatedType: taskRelatedTypeSchema,
  relatedId: z.string().uuid(),
});

export const taskUpdateSchema = z.object(taskFields).partial().refine(
  (body) => Object.keys(body).length > 0,
  'At least one field is required',
);

export const taskQuerySchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED']).optional(),
  relatedType: z.string().optional(),
  relatedId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});

export const taskParamsSchema = z.object({ id: z.string().uuid() });

export type TaskQuery = z.infer<typeof taskQuerySchema>;
