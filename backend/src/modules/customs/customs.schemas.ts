import { z } from 'zod';
import { money } from '../../lib/money';

const plainDecimal = /^\d+(?:\.\d+)?$/;

function decimalValue(maxScale: number, maxIntegerDigits: number) {
  return z
    .union([z.string().trim(), z.number().finite()])
    .transform((value) => String(value))
    .pipe(
      z.string().regex(plainDecimal, 'Must be a plain decimal number'),
    )
    .superRefine((value, ctx) => {
      const [integerPart, fractionPart = ''] = value.split('.');
      const integerDigits = integerPart.replace(/^0+(?=\d)/, '').length;
      if (integerDigits > maxIntegerDigits || fractionPart.length > maxScale) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Must have at most ${maxIntegerDigits} integer digits and ${maxScale} decimal places`,
        });
      }
    });
}

const amountDecimal = decimalValue(2, 16);
const quantityDecimal = decimalValue(3, 15);
const exchangeRateDecimal = decimalValue(8, 10).refine(
  (value) => money(value).gt(0),
  'Exchange rate must be greater than zero',
);
const rateDecimal = decimalValue(4, 5).refine(
  (value) => money(value).lte(100),
  'Rate must be between 0 and 100',
);

const requiredText = (max: number) => z.string().trim().min(1, 'This field is required').max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value));
const optionalDate = z.union([z.coerce.date(), z.null()]).optional();
const uuid = z.string().uuid();

const customsDirectionSchema = z.enum(['IMPORT', 'EXPORT', 'TRANSIT']);
const customsFileStatusSchema = z.enum([
  'DRAFT',
  'ACI_PENDING',
  'ACI_ACCEPTED',
  'DECLARATION_DRAFT',
  'UNDER_REVIEW',
  'INSPECTION',
  'PAYMENT_PENDING',
  'RELEASED',
  'CLOSED',
  'CANCELLED',
]);
const aciStatusSchema = z.enum(['DRAFT', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'CANCELLED']);
const declarationStatusSchema = z.enum(['DRAFT', 'SUBMITTED', 'ASSESSED', 'PAID', 'RELEASED', 'CANCELLED']);
const currencySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, 'Use a three-letter currency code')
  .transform((value) => value.toUpperCase());
const countryCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/, 'Use a two-letter country code')
  .transform((value) => value.toUpperCase());

export const customsFileCreateSchema = z.object({
  shipmentId: uuid,
  importerId: uuid,
  brokerId: uuid.nullish(),
  direction: customsDirectionSchema,
  portCode: requiredText(40),
  customsOffice: optionalText(160),
  openedAt: optionalDate,
  notes: optionalText(4000),
  assignedToId: uuid.nullish(),
});

export const customsFileUpdateSchema = z
  .object({
    shipmentId: uuid.optional(),
    importerId: uuid.optional(),
    brokerId: uuid.nullish(),
    direction: customsDirectionSchema.optional(),
    portCode: requiredText(40).optional(),
    customsOffice: optionalText(160),
    openedAt: z.coerce.date().optional(),
    notes: optionalText(4000),
    assignedToId: uuid.nullish(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });

export const customsFileStatusSchemaBody = z.object({
  status: customsFileStatusSchema,
  description: optionalText(1000),
});

export const customsFileQuerySchema = z.object({
  search: z.string().trim().max(160).optional(),
  status: customsFileStatusSchema.optional(),
  direction: customsDirectionSchema.optional(),
  shipmentId: uuid.optional(),
  importerId: uuid.optional(),
  brokerId: uuid.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});

export const aciCreateSchema = z.object({
  acidNumber: optionalText(120),
  nafezaRequestNumber: optionalText(120),
  nafezaItemNumber: optionalText(120),
  status: aciStatusSchema.default('DRAFT'),
  submittedAt: optionalDate,
  respondedAt: optionalDate,
  responseReference: optionalText(160),
  payloadHash: optionalText(128),
  notes: optionalText(4000),
});

export const aciUpdateSchema = z
  .object({
    acidNumber: optionalText(120),
    nafezaRequestNumber: optionalText(120),
    nafezaItemNumber: optionalText(120),
    status: aciStatusSchema.optional(),
    submittedAt: optionalDate,
    respondedAt: optionalDate,
    responseReference: optionalText(160),
    payloadHash: optionalText(128),
    notes: optionalText(4000),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });

export const declarationLineSchema = z
  .object({
    lineNumber: z.coerce.number().int().positive().optional(),
    hsCodeId: uuid.nullish(),
    hsCodeSnapshot: optionalText(30),
    description: requiredText(500),
    originCountry: countryCodeSchema.default('EG'),
    quantity: quantityDecimal.refine((value) => money(value).gt(0), 'Quantity must be greater than zero'),
    quantityUnit: z.string().trim().min(1).max(20).default('PCS'),
    weightKg: quantityDecimal.nullish(),
    customsValue: amountDecimal,
    currency: currencySchema.default('USD'),
    exchangeRate: exchangeRateDecimal.default('1'),
    dutyRatePercent: rateDecimal.optional(),
    taxRatePercent: rateDecimal.optional(),
    otherAmount: amountDecimal.default('0'),
  })
  .superRefine((value, ctx) => {
    if (!value.hsCodeId && !value.hsCodeSnapshot) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hsCodeSnapshot'],
        message: 'An HS code or HS code snapshot is required',
      });
    }
  });

export const declarationCreateSchema = z.object({
  customsFileId: uuid,
  declarationNumber: optionalText(120),
  declarationDate: optionalDate,
  direction: customsDirectionSchema.optional(),
  paidAmount: amountDecimal.default('0'),
  lines: z.array(declarationLineSchema).min(1, 'At least one declaration line is required').max(500),
});

export const declarationUpdateSchema = z
  .object({
    declarationNumber: optionalText(120),
    declarationDate: optionalDate,
    direction: customsDirectionSchema.optional(),
    paidAmount: amountDecimal.optional(),
    lines: z.array(declarationLineSchema).min(1, 'At least one declaration line is required').max(500).optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });

export const declarationCancelSchema = z
  .object({ reason: optionalText(1000) })
  .strict()
  .default({});

export const declarationAssessSchema = z.object({
  declarationNumber: optionalText(120),
  declarationDate: optionalDate,
  assessedDate: optionalDate,
});

export const declarationReleaseSchema = z.object({
  paidAmount: amountDecimal,
  paymentReference: optionalText(160),
  releasedDate: optionalDate,
});

export const declarationQuerySchema = z.object({
  search: z.string().trim().max(160).optional(),
  status: declarationStatusSchema.optional(),
  direction: customsDirectionSchema.optional(),
  customsFileId: uuid.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});

const hsCodeValue = z
  .string()
  .trim()
  .min(2)
  .max(20)
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z0-9][A-Z0-9.-]{1,19}$/.test(value), 'Use a valid HS code of 2-20 characters');

const hsCodeDateFields = {
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: optionalDate,
};

function validateHsCodeDates(
  value: { effectiveFrom?: Date; effectiveTo?: Date | null },
  ctx: z.RefinementCtx,
): void {
  if (value.effectiveTo && value.effectiveFrom && value.effectiveTo.getTime() <= value.effectiveFrom.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['effectiveTo'],
      message: 'Effective end must be after effective start',
    });
  }
}

export const hsCodeCreateSchema = z
  .object({
    ...hsCodeDateFields,
    code: hsCodeValue,
    descriptionEn: requiredText(500),
    descriptionAr: optionalText(500),
    defaultDutyRate: rateDecimal.default('0'),
    defaultTaxRate: rateDecimal.default('0'),
    isActive: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    validateHsCodeDates(value, ctx);
    if (value.effectiveTo && !value.effectiveFrom && value.effectiveTo.getTime() <= Date.now()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['effectiveTo'],
        message: 'Effective end must be after the default effective start',
      });
    }
  });

export const hsCodeUpdateSchema = z
  .object({
    ...hsCodeDateFields,
    code: hsCodeValue.optional(),
    descriptionEn: requiredText(500).optional(),
    descriptionAr: optionalText(500),
    defaultDutyRate: rateDecimal.optional(),
    defaultTaxRate: rateDecimal.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  })
  .superRefine(validateHsCodeDates);

export const hsCodeQuerySchema = z.object({
  search: z.string().trim().max(160).optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});

export const idParamsSchema = z.object({ id: uuid });

export type CustomsFileCreateInput = z.infer<typeof customsFileCreateSchema>;
export type CustomsFileUpdateInput = z.infer<typeof customsFileUpdateSchema>;
export type CustomsFileStatusInput = z.infer<typeof customsFileStatusSchemaBody>;
export type CustomsFileQuery = z.infer<typeof customsFileQuerySchema>;
export type AciCreateInput = z.infer<typeof aciCreateSchema>;
export type AciUpdateInput = z.infer<typeof aciUpdateSchema>;
export type DeclarationLineInput = z.infer<typeof declarationLineSchema>;
export type DeclarationCreateInput = z.infer<typeof declarationCreateSchema>;
export type DeclarationUpdateInput = z.infer<typeof declarationUpdateSchema>;
export type DeclarationCancelInput = z.infer<typeof declarationCancelSchema>;
export type DeclarationAssessInput = z.infer<typeof declarationAssessSchema>;
export type DeclarationReleaseInput = z.infer<typeof declarationReleaseSchema>;
export type DeclarationQuery = z.infer<typeof declarationQuerySchema>;
export type HsCodeCreateInput = z.infer<typeof hsCodeCreateSchema>;
export type HsCodeUpdateInput = z.infer<typeof hsCodeUpdateSchema>;
export type HsCodeQuery = z.infer<typeof hsCodeQuerySchema>;
