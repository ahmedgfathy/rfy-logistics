import { Prisma } from '@prisma/client';
import { z } from 'zod';

const requiredText = (max: number) => z.string().trim().min(1, 'This field is required').max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const email = z.string().trim().toLowerCase().email('A valid email is required').max(180);
const optionalEmail = email.nullable().optional();
const countryCode = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Use a two-letter country code');
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

const contactSchema = z.object({
  name: requiredText(120),
  title: optionalText(120),
  email: optionalEmail,
  phone: optionalText(32),
  isPrimary: z.boolean().default(false),
});

const addressSchema = z.object({
  label: requiredText(80),
  address: requiredText(500),
  city: optionalText(120),
  countryCode: countryCode.default('EG'),
  isDefault: z.boolean().default(false),
});

const contacts = z
  .array(contactSchema)
  .max(50)
  .refine((items) => items.filter((item) => item.isPrimary).length <= 1, 'Only one primary contact is allowed');
const addresses = z
  .array(addressSchema)
  .max(50)
  .refine((items) => items.filter((item) => item.isDefault).length <= 1, 'Only one default address is allowed');

const partnerFields = {
  type: z.enum(['CUSTOMER', 'VENDOR', 'BOTH']),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  nameEn: requiredText(200),
  nameAr: optionalText(200),
  legalName: optionalText(200),
  taxNumber: optionalText(80),
  registrationNumber: optionalText(80),
  email: optionalEmail,
  phone: optionalText(32),
  website: z.string().trim().url('A valid website URL is required').max(500).nullable().optional(),
  billingAddress: optionalText(1000),
  shippingAddress: optionalText(1000),
  countryCode,
  currency,
  creditLimit: decimalField('0', '9999999999999999.99', 2, 'Credit limit').nullable().optional(),
  paymentTermDays: z.number().int().min(0).max(3650),
  notes: optionalText(4000),
};

export const partnerCreateSchema = z.object({
  ...partnerFields,
  status: partnerFields.status.default('ACTIVE'),
  countryCode: partnerFields.countryCode.default('EG'),
  currency: partnerFields.currency.default('EGP'),
  paymentTermDays: partnerFields.paymentTermDays.default(0),
  contacts: contacts.default([]),
  addresses: addresses.default([]),
});

export const partnerUpdateSchema = z
  .object({
    ...partnerFields,
    contacts: contacts.optional(),
    addresses: addresses.optional(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'At least one field is required');

export const partnerQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  type: z.enum(['CUSTOMER', 'VENDOR', 'BOTH']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const partnerParamsSchema = z.object({ id: z.string().uuid() });

export type PartnerCreateBody = z.infer<typeof partnerCreateSchema>;
export type PartnerUpdateBody = z.infer<typeof partnerUpdateSchema>;
export type PartnerQuery = z.infer<typeof partnerQuerySchema>;
