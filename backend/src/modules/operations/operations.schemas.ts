import { Prisma } from '@prisma/client';
import { z } from 'zod';

const uuid = z.string().uuid();
const version = z.coerce.number().int().positive().optional();
const requiredText = (max: number) => z.string().trim().min(1, 'This field is required').max(max);
const optionalText = (max: number) => z
  .string()
  .trim()
  .max(max)
  .nullable()
  .optional()
  .transform((value) => (value === '' ? null : value));
const optionalDate = z.union([z.null(), z.coerce.date()]).optional();

function decimalString(maxIntegerDigits: number, scale: number) {
  return z
    .union([z.string().trim().min(1), z.number().finite()])
    .transform((value) => String(value))
    .pipe(z.string().regex(/^\d+(?:\.\d+)?$/, 'Must be a plain decimal number'))
    .superRefine((value, ctx) => {
      const [integerPart, fractionPart = ''] = value.split('.');
      const integerDigits = integerPart.replace(/^0+(?=\d)/, '').length;
      if (integerDigits > maxIntegerDigits || fractionPart.length > scale) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Must have at most ${maxIntegerDigits} integer digits and ${scale} decimal places`,
        });
      }
      try {
        const decimal = new Prisma.Decimal(value);
        if (!decimal.isFinite() || decimal.isNegative()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must be a finite non-negative decimal' });
        }
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must be a valid decimal' });
      }
    });
}

const shipmentStatusSchema = z.enum(['BOOKED', 'ORIGIN_PICKUP', 'DEPARTED_ORIGIN', 'IN_TRANSIT', 'CUSTOMS_CLEARANCE', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELAYED', 'CANCELLED']);
const freightModeSchema = z.enum(['SEA', 'AIR', 'ROAD', 'RAIL', 'MULTIMODAL']);
const currencySchema = z.string().trim().regex(/^[A-Za-z]{3}$/, 'Use a three-letter currency code').transform((value) => value.toUpperCase());

function validateDateOrder(
  value: { etd?: Date | null; eta?: Date | null },
  ctx: z.RefinementCtx,
): void {
  if (value.etd && value.eta && value.eta.getTime() < value.etd.getTime()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['eta'], message: 'ETA cannot be earlier than ETD' });
  }
}

const shipmentFields = {
  customerId: uuid.nullable().optional(),
  bookingId: uuid.nullable().optional(),
  trackingNumber: z.string().trim().min(3).max(80).transform((value) => value.toUpperCase()).optional(),
  reference: optionalText(120),
  status: shipmentStatusSchema.default('BOOKED'),
  mode: freightModeSchema,
  carrier: optionalText(160),
  vesselOrFlight: optionalText(160),
  containerType: optionalText(80),
  originPort: requiredText(180),
  destinationPort: requiredText(180),
  pieces: z.coerce.number().int().positive().max(1_000_000_000).nullable().optional(),
  weightKg: decimalString(10, 2).nullable().optional(),
  etd: optionalDate,
  eta: optionalDate,
  lastLocation: optionalText(180),
};

const { status: _status, ...shipmentHeaderFields } = shipmentFields;

export const shipmentCreateSchema = z.object(shipmentFields).superRefine(validateDateOrder);

export const shipmentUpdateSchema = z.object({
  ...shipmentHeaderFields,
  mode: freightModeSchema.optional(),
  originPort: requiredText(180).optional(),
  destinationPort: requiredText(180).optional(),
  version: z.coerce.number().int().positive(),
  expectedStatus: shipmentStatusSchema.optional(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== 'version' && key !== 'expectedStatus'), {
  message: 'At least one shipment field is required',
});

export const shipmentEventSchema = z.object({
  status: shipmentStatusSchema,
  location: optionalText(180),
  description: requiredText(1000),
  occurredAt: z.coerce.date().optional(),
  updateShipmentStatus: z.boolean().default(true),
  version,
  expectedStatus: shipmentStatusSchema.optional(),
}).strict();

const packageFields = {
  packageNumber: requiredText(80),
  description: requiredText(500),
  packageType: optionalText(80),
  quantity: z.coerce.number().int().positive().max(1_000_000_000),
  lengthCm: decimalString(10, 2).nullable().optional(),
  widthCm: decimalString(10, 2).nullable().optional(),
  heightCm: decimalString(10, 2).nullable().optional(),
  weightKg: decimalString(9, 3).nullable().optional(),
};

export const packageCreateSchema = z.object({
  ...packageFields,
  quantity: packageFields.quantity.default(1),
  version,
}).strict();

export const packageUpdateSchema = z.object({ ...packageFields, version }).partial().strict().refine(
  (value) => Object.keys(value).some((key) => key !== 'version'),
  { message: 'At least one package field is required' },
);

const containerFields = {
  containerNumber: z.string().trim().min(3).max(40).transform((value) => value.toUpperCase()),
  equipmentType: optionalText(80),
  sealNumber: optionalText(80),
  volumeCbm: decimalString(9, 3).nullable().optional(),
  weightKg: decimalString(9, 3).nullable().optional(),
};

export const containerCreateSchema = z.object({ ...containerFields, version }).strict();

export const containerUpdateSchema = z.object({ ...containerFields, version }).partial().strict().refine(
  (value) => Object.keys(value).some((key) => key !== 'version'),
  { message: 'At least one container field is required' },
);

const vendorFields = {
  vendorId: uuid,
  service: requiredText(180),
  amount: decimalString(16, 2),
  currency: currencySchema.default('EGP'),
  reference: optionalText(120),
  notes: optionalText(1000),
};

export const vendorCreateSchema = z.object({ ...vendorFields, version }).strict();

export const vendorUpdateSchema = z.object({ ...vendorFields, version }).partial().strict().refine(
  (value) => Object.keys(value).some((key) => key !== 'version'),
  { message: 'At least one vendor cost field is required' },
);

export const vendorCancelSchema = z.object({ reason: optionalText(500), version }).strict();

export const publicationSchema = z.object({ isPublic: z.boolean(), version }).strict();
export const idParamsSchema = z.object({ id: uuid });
export const packageParamsSchema = z.object({ id: uuid, packageId: uuid });
export const containerParamsSchema = z.object({ id: uuid, containerId: uuid });
export const vendorParamsSchema = z.object({ id: uuid, costId: uuid });
export const shipmentVersionQuerySchema = z.object({ version });
export const shipmentQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: shipmentStatusSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});

export type ShipmentCreateBody = z.infer<typeof shipmentCreateSchema>;
export type ShipmentUpdateBody = z.infer<typeof shipmentUpdateSchema>;
export type ShipmentEventBody = z.infer<typeof shipmentEventSchema>;
export type PackageCreateBody = z.infer<typeof packageCreateSchema>;
export type PackageUpdateBody = z.infer<typeof packageUpdateSchema>;
export type ContainerCreateBody = z.infer<typeof containerCreateSchema>;
export type ContainerUpdateBody = z.infer<typeof containerUpdateSchema>;
export type VendorCreateBody = z.infer<typeof vendorCreateSchema>;
export type VendorUpdateBody = z.infer<typeof vendorUpdateSchema>;
export type VendorCancelBody = z.infer<typeof vendorCancelSchema>;
