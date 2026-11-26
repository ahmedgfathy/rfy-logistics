import { Prisma } from '@prisma/client';
import { z } from 'zod';

const requiredText = (max: number) => z.string().trim().min(1, 'This field is required').max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalDate = z.coerce.date().nullable().optional();
const uuid = z.string().uuid();
const freightMode = z.enum(['SEA', 'AIR', 'ROAD', 'RAIL', 'MULTIMODAL']);
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code');

function decimalField(min: string, max: string, scale: number, label: string) {
  return z
    .union([z.string().trim().min(1), z.number().finite()])
    .superRefine((value, ctx) => {
      let decimal: Prisma.Decimal;
      try {
        decimal = new Prisma.Decimal(value);
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a valid decimal` });
        return;
      }
      if (!decimal.isFinite()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a finite decimal` });
        return;
      }
      if (decimal.lt(min) || decimal.gt(max)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is outside the allowed range` });
      }
      if (decimal.decimalPlaces() > scale) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} may have at most ${scale} decimal places` });
      }
    });
}

export const quoteLineSchema = z.object({
  chargeItemId: uuid.nullable().optional(),
  descriptionEn: requiredText(500),
  descriptionAr: optionalText(500),
  quantity: decimalField('0.001', '999999999999999.999', 3, 'Quantity'),
  unitPrice: decimalField('0', '9999999999999999.99', 2, 'Unit price'),
  discountPercent: decimalField('0', '100', 4, 'Discount percentage').default(0),
  taxCodeId: uuid.nullable().optional(),
  taxPercent: decimalField('0', '100', 4, 'Tax percentage').default(0),
});

const quoteFields = {
  customerId: uuid,
  branchId: uuid.nullable().optional(),
  currency: currency.default('EGP'),
  exchangeRate: decimalField('0.00000001', '9999999999.99999999', 8, 'Exchange rate').default(1),
  validUntil: optionalDate,
  notes: optionalText(4000),
  terms: optionalText(8000),
};

export const quoteCreateSchema = z.object({
  ...quoteFields,
  lines: z.array(quoteLineSchema).min(1, 'At least one quote line is required').max(200),
});

export const quoteUpdateSchema = z
  .object({
    ...quoteFields,
    lines: z.array(quoteLineSchema).min(1, 'At least one quote line is required').max(200).optional(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'At least one field is required');

export const quoteQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED']).optional(),
  customerId: uuid.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const quoteParamsSchema = z.object({ id: uuid });
export const leadQuoteParamsSchema = z.object({ quoteRequestId: uuid });

export const quoteConversionSchema = z
  .object({
    mode: freightMode.optional(),
    origin: requiredText(300).optional(),
    destination: requiredText(300).optional(),
    carrier: optionalText(120),
    vesselOrFlight: optionalText(120),
    incoterms: optionalText(20),
    etd: optionalDate,
    eta: optionalDate,
    notes: optionalText(4000),
  })
  .default({});

export const bookingCreateSchema = z.object({
  customerId: uuid,
  branchId: uuid.nullable().optional(),
  mode: freightMode,
  origin: requiredText(300),
  destination: requiredText(300),
  carrier: optionalText(120),
  vesselOrFlight: optionalText(120),
  incoterms: optionalText(20),
  etd: optionalDate,
  eta: optionalDate,
  notes: optionalText(4000),
});

export const bookingUpdateSchema = bookingCreateSchema
  .omit({ customerId: true, branchId: true })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'At least one field is required');

export const bookingQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(['CONFIRMED', 'OPERATIONAL', 'COMPLETED', 'CANCELLED']).optional(),
  customerId: uuid.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const bookingParamsSchema = z.object({ id: uuid });
export const bookingStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'OPERATIONAL', 'COMPLETED', 'CANCELLED']),
});

export type QuoteLineBody = z.infer<typeof quoteLineSchema>;
export type QuoteCreateBody = z.infer<typeof quoteCreateSchema>;
export type QuoteUpdateBody = z.infer<typeof quoteUpdateSchema>;
export type QuoteQuery = z.infer<typeof quoteQuerySchema>;
export type QuoteConversionBody = z.infer<typeof quoteConversionSchema>;
export type BookingCreateBody = z.infer<typeof bookingCreateSchema>;
export type BookingUpdateBody = z.infer<typeof bookingUpdateSchema>;
export type BookingQuery = z.infer<typeof bookingQuerySchema>;
