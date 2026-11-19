import { z } from 'zod';

const trimmed = (max: number) => z.string().trim().min(1, 'This field is required').max(max);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

const optionalNumber = (min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === '') return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : NaN;
    })
    .refine((value) => value === undefined || (!Number.isNaN(value) && value >= min && value <= max), {
      message: `Must be a number between ${min} and ${max}`,
    });

const optionalDate = z
  .string()
  .optional()
  .transform((value) => {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  })
  .refine((value) => value !== null, { message: 'Invalid date' });

export const clientMeta = z.object({
  locale: z.enum(['en', 'ar']).default('en'),
  sourceIp: z.string().max(64).optional(),
});

export const quoteSchema = z.object({
  fullName: trimmed(120),
  companyName: optionalText(160),
  email: z.string().trim().email('A valid email is required').max(180),
  phone: z
    .string()
    .trim()
    .min(6, 'A valid phone number is required')
    .max(32)
    .regex(/^[+()\d\s-]+$/, 'Phone may only contain digits, spaces, +, - and ()'),
  originCountry: trimmed(80),
  originCity: trimmed(80),
  destinationCountry: trimmed(80),
  destinationCity: trimmed(80),
  shipmentType: trimmed(60),
  freightMode: z.enum(['SEA', 'AIR', 'ROAD', 'RAIL', 'MULTIMODAL']),
  cargoDescription: z.string().trim().min(5, 'Please describe the cargo').max(4000),
  cargoWeightKg: optionalNumber(0, 5_000_000),
  cargoVolumeCbm: optionalNumber(0, 500_000),
  packageCount: optionalNumber(0, 1_000_000),
  containerType: optionalText(60),
  incoterms: optionalText(20),
  expectedShipDate: optionalDate,
  additionalNotes: optionalText(4000),
  locale: z.enum(['en', 'ar']).default('en'),
  consent: z
    .union([z.boolean(), z.string()])
    .transform((value) => value === true || value === 'true' || value === 'on')
    .refine((value) => value === true, { message: 'Please accept the privacy policy' }),
});

export const contactSchema = z.object({
  fullName: trimmed(120),
  email: z.string().trim().email('A valid email is required').max(180),
  phone: optionalText(32),
  company: optionalText(160),
  subject: trimmed(160),
  message: z.string().trim().min(10, 'Please provide a little more detail').max(4000),
  locale: z.enum(['en', 'ar']).default('en'),
});

export const careerSchema = z.object({
  fullName: trimmed(120),
  email: z.string().trim().email('A valid email is required').max(180),
  phone: trimmed(32),
  position: trimmed(120),
  experience: optionalText(120),
  coverLetter: z.string().trim().min(20, 'Please tell us about your experience').max(4000),
  locale: z.enum(['en', 'ar']).default('en'),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(180),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

export const quoteStatusSchema = z.object({
  status: z.enum(['NEW', 'UNDER_REVIEW', 'QUOTATION_SENT', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  adminNotes: z.string().max(4000).optional(),
});

export const contactStatusSchema = z.object({
  status: z.enum(['NEW', 'IN_PROGRESS', 'RESOLVED']),
});

export const shipmentSchema = z.object({
  trackingNumber: z
    .string()
    .trim()
    .min(4)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, 'Only letters, numbers and hyphens are allowed'),
  reference: optionalText(60),
  status: z.enum([
    'BOOKED',
    'ORIGIN_PICKUP',
    'DEPARTED_ORIGIN',
    'IN_TRANSIT',
    'CUSTOMS_CLEARANCE',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'DELAYED',
    'CANCELLED',
  ]),
  mode: z.enum(['SEA', 'AIR', 'ROAD', 'RAIL', 'MULTIMODAL']),
  carrier: optionalText(120),
  vesselOrFlight: optionalText(120),
  containerType: optionalText(60),
  originPort: trimmed(120),
  destinationPort: trimmed(120),
  pieces: optionalNumber(0, 1_000_000),
  weightKg: optionalNumber(0, 5_000_000),
  etd: optionalDate,
  eta: optionalDate,
  lastLocation: optionalText(120),
  isDemo: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === 'true'),
});

export const shipmentEventSchema = z.object({
  status: z.enum([
    'BOOKED',
    'ORIGIN_PICKUP',
    'DEPARTED_ORIGIN',
    'IN_TRANSIT',
    'CUSTOMS_CLEARANCE',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'DELAYED',
    'CANCELLED',
  ]),
  location: optionalText(120),
  description: trimmed(500),
  occurredAt: optionalDate,
  updateShipmentStatus: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === 'true' || value === undefined),
});

export const newsSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(3)
    .max(120)
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only'),
  titleEn: trimmed(200),
  titleAr: trimmed(200),
  excerptEn: z.string().trim().min(10).max(400),
  excerptAr: z.string().trim().min(10).max(400),
  bodyEn: z.string().trim().min(20).max(20000),
  bodyAr: z.string().trim().min(20).max(20000),
  category: z.string().trim().max(60).default('Insights'),
  coverImage: optionalText(500),
  isPublished: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === 'true'),
});

export const serviceUpdateSchema = z.object({
  titleEn: trimmed(160).optional(),
  titleAr: trimmed(160).optional(),
  excerptEn: z.string().trim().max(400).optional(),
  excerptAr: z.string().trim().max(400).optional(),
  bodyEn: z.string().trim().max(20000).optional(),
  bodyAr: z.string().trim().max(20000).optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  position: z.number().int().min(0).max(999).optional(),
});

export const userCreateSchema = z.object({
  name: trimmed(120),
  email: z.string().trim().email().max(180),
  password: z
    .string()
    .min(10, 'Password must be at least 10 characters')
    .max(200)
    .regex(/[A-Za-z]/, 'Must contain a letter')
    .regex(/\d/, 'Must contain a number'),
  role: z.enum(['ADMIN', 'EDITOR']),
});

export const trackingParamsSchema = z.object({
  trackingNumber: z
    .string()
    .trim()
    .min(4)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, 'Invalid tracking number'),
});
