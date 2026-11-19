import { z } from 'zod';
import type { TFunction } from 'i18next';

export type FreightModeValue = 'SEA' | 'AIR' | 'ROAD' | 'RAIL' | 'MULTIMODAL';

export interface QuoteFormValues {
  fullName: string;
  companyName: string;
  email: string;
  phone: string;
  originCountry: string;
  originCity: string;
  destinationCountry: string;
  destinationCity: string;
  shipmentType: string;
  freightMode: FreightModeValue;
  cargoDescription: string;
  cargoWeightKg: string;
  cargoVolumeCbm: string;
  packageCount: string;
  containerType: string;
  incoterms: string;
  expectedShipDate: string;
  additionalNotes: string;
  consent: boolean;
}

export interface ContactFormValues {
  fullName: string;
  email: string;
  phone: string;
  company: string;
  subject: string;
  message: string;
}

export interface CareerFormValues {
  fullName: string;
  email: string;
  phone: string;
  position: string;
  experience: string;
  coverLetter: string;
}

const optionalNumber = (t: TFunction, max: number) => (value: string) => {
  if (!value) return true;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= max;
};

export function createQuoteSchema(t: TFunction): z.ZodType<QuoteFormValues> {
  const required = t('quotePage.form.errors.required');
  return z.object({
    fullName: z.string().trim().min(2, required).max(120),
    companyName: z.string().trim().max(160),
    email: z.string().trim().min(1, required).email(t('quotePage.form.errors.email')).max(180),
    phone: z
      .string()
      .trim()
      .min(6, t('quotePage.form.errors.phone'))
      .max(32)
      .regex(/^[+()\d\s-]+$/, t('quotePage.form.errors.phone')),
    originCountry: z.string().trim().min(1, required).max(80),
    originCity: z.string().trim().min(1, required).max(80),
    destinationCountry: z.string().trim().min(1, required).max(80),
    destinationCity: z.string().trim().min(1, required).max(80),
    shipmentType: z.string().trim().min(1, required),
    freightMode: z.enum(['SEA', 'AIR', 'ROAD', 'RAIL', 'MULTIMODAL']),
    cargoDescription: z.string().trim().min(5, t('quotePage.form.errors.short')).max(4000),
    cargoWeightKg: z.string().trim().refine(optionalNumber(t, 5_000_000), { message: t('quotePage.form.errors.number') }),
    cargoVolumeCbm: z.string().trim().refine(optionalNumber(t, 500_000), { message: t('quotePage.form.errors.number') }),
    packageCount: z.string().trim().refine(optionalNumber(t, 1_000_000), { message: t('quotePage.form.errors.number') }),
    containerType: z.string().trim().max(60),
    incoterms: z.string().trim().max(20),
    expectedShipDate: z.string().trim(),
    additionalNotes: z.string().trim().max(4000),
    consent: z.boolean().refine((value) => value === true, { message: t('quotePage.form.errors.consent') }),
  });
}

export function createContactSchema(t: TFunction): z.ZodType<ContactFormValues> {
  const required = t('quotePage.form.errors.required');
  return z.object({
    fullName: z.string().trim().min(2, required).max(120),
    email: z.string().trim().min(1, required).email(t('quotePage.form.errors.email')).max(180),
    phone: z.string().trim().max(32),
    company: z.string().trim().max(160),
    subject: z.string().trim().min(3, required).max(160),
    message: z.string().trim().min(10, t('quotePage.form.errors.short')).max(4000),
  });
}

export function createCareerSchema(t: TFunction): z.ZodType<CareerFormValues> {
  const required = t('quotePage.form.errors.required');
  return z.object({
    fullName: z.string().trim().min(2, required).max(120),
    email: z.string().trim().min(1, required).email(t('quotePage.form.errors.email')).max(180),
    phone: z.string().trim().min(6, t('quotePage.form.errors.phone')).max(32),
    position: z.string().trim().min(2, required).max(120),
    experience: z.string().trim().max(120),
    coverLetter: z.string().trim().min(20, t('quotePage.form.errors.short')).max(4000),
  });
}
