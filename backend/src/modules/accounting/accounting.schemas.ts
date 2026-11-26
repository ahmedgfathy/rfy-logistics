import { Prisma } from '@prisma/client';
import { z } from 'zod';

const requiredText = (max: number) => z.string().trim().min(1, 'This field is required').max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const uuid = z.string().uuid('A valid UUID is required');
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code');
const pageFields = {
  page: z.coerce.number().int().positive().max(100000).default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
};
const optionalBoolean = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
]).optional();

function decimalField(min: string, max: string, scale: number, label: string) {
  return z
    .union([z.string().trim().min(1), z.number().finite()])
    .transform((value) => String(value))
    .superRefine((value, ctx) => {
      if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a plain decimal` });
        return;
      }
      let decimal: Prisma.Decimal;
      try {
        decimal = new Prisma.Decimal(value);
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a valid decimal` });
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

const amount = decimalField('0', '9999999999999999.99', 2, 'Amount');
const positiveAmount = decimalField('0.01', '9999999999999999.99', 2, 'Amount');
const signedAmount = decimalField('-9999999999999999.99', '9999999999999999.99', 2, 'Amount');
const percentage = decimalField('0', '100', 4, 'Percentage');
const exchangeRate = decimalField('0.00000001', '9999999999.99999999', 8, 'Exchange rate');

const dateOnlyString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use an ISO date')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Use a real calendar date');

export const accountingDateSchema = z
  .union([dateOnlyString, z.string().datetime({ offset: true })])
  .transform((value) => {
    const parsed = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  });

const optionalDate = accountingDateSchema.nullable().optional();
const dateFilters = {
  from: accountingDateSchema.optional(),
  to: accountingDateSchema.optional(),
};

export const idParamsSchema = z.object({ id: uuid });
export const reconciliationItemParamsSchema = z.object({ id: uuid, itemId: uuid });

export const accountQuerySchema = z.object({
  ...pageFields,
  search: z.string().trim().max(200).optional(),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']).optional(),
  systemCode: z.string().trim().max(80).optional(),
  parentId: uuid.optional(),
  isActive: optionalBoolean,
});

export const journalQuerySchema = z.object({
  ...pageFields,
  search: z.string().trim().max(200).optional(),
  type: z.enum(['SALES', 'PURCHASE', 'CASH', 'BANK', 'GENERAL', 'CUSTOMS', 'OPENING']).optional(),
  isActive: optionalBoolean,
});

const configurationQueryFields = {
  ...pageFields,
  search: z.string().trim().max(200).optional(),
  isActive: optionalBoolean,
};

const configurationCode = z.string().trim().toUpperCase().min(1, 'This field is required').max(40).regex(/^[A-Z0-9._/-]+$/, 'Use letters, numbers, dots, dashes, slashes, or underscores');
const activeStatePatch = {
  isActive: z.boolean().optional(),
  reason: optionalText(500),
};

export const fiscalYearQuerySchema = z.object({
  ...pageFields,
  search: z.string().trim().max(200).optional(),
  isClosed: optionalBoolean,
});

export const bankAccountQuerySchema = z.object({ ...configurationQueryFields });
export const taxCodeQuerySchema = z.object({ ...configurationQueryFields });
export const chargeItemQuerySchema = z.object({
  ...configurationQueryFields,
  type: z.enum(['FREIGHT', 'ORIGIN', 'DESTINATION', 'CUSTOMS', 'DUTY', 'TAX', 'INSURANCE', 'HANDLING', 'STORAGE', 'OTHER']).optional(),
});

export const accountCreateSchema = z.object({
  code: configurationCode,
  nameEn: requiredText(200),
  nameAr: optionalText(200),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  normalBalance: z.enum(['DEBIT', 'CREDIT']),
  parentId: uuid.nullable().optional(),
  currency: currency.nullable().optional(),
  isPostable: z.boolean().default(true),
}).strict();

export const accountUpdateSchema = z.object({
  code: configurationCode.optional(),
  nameEn: requiredText(200).optional(),
  nameAr: optionalText(200),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']).optional(),
  normalBalance: z.enum(['DEBIT', 'CREDIT']).optional(),
  parentId: uuid.nullable().optional(),
  currency: currency.nullable().optional(),
  isPostable: z.boolean().optional(),
  ...activeStatePatch,
}).strict().superRefine((value, ctx) => {
  if (Object.keys(value).every((key) => key === 'reason')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one account field is required', path: ['reason'] });
  }
  if (value.isActive !== undefined && !value.reason?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A reason is required when changing account status', path: ['reason'] });
  }
});

export const journalCreateSchema = z.object({
  code: configurationCode,
  nameEn: requiredText(200),
  nameAr: optionalText(200),
  type: z.enum(['SALES', 'PURCHASE', 'CASH', 'BANK', 'GENERAL', 'CUSTOMS', 'OPENING']),
}).strict();

export const journalUpdateSchema = z.object({
  code: configurationCode.optional(),
  nameEn: requiredText(200).optional(),
  nameAr: optionalText(200),
  type: z.enum(['SALES', 'PURCHASE', 'CASH', 'BANK', 'GENERAL', 'CUSTOMS', 'OPENING']).optional(),
  ...activeStatePatch,
}).strict().superRefine((value, ctx) => {
  if (Object.keys(value).every((key) => key === 'reason')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one journal field is required', path: ['reason'] });
  }
  if (value.isActive !== undefined && !value.reason?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A reason is required when changing journal status', path: ['reason'] });
  }
});

export const fiscalYearCreateSchema = z.object({
  code: configurationCode,
  nameEn: requiredText(200),
  startDate: accountingDateSchema,
  endDate: accountingDateSchema,
}).strict().refine((value) => value.startDate <= value.endDate, {
  message: 'Fiscal year start must not be after its end',
  path: ['startDate'],
});

export const fiscalPeriodCreateSchema = z.object({
  fiscalYearId: uuid,
  number: z.number().int().min(1).max(1000),
  name: requiredText(120),
  startDate: accountingDateSchema,
  endDate: accountingDateSchema,
  status: z.enum(['OPEN', 'SOFT_CLOSED', 'LOCKED']).default('OPEN'),
}).strict().refine((value) => value.startDate <= value.endDate, {
  message: 'Period start must not be after its end',
  path: ['startDate'],
});

export const bankAccountCreateSchema = z.object({
  code: configurationCode,
  name: requiredText(200),
  accountId: uuid,
  currency: currency,
  iban: optionalText(80),
  bankName: optionalText(200),
}).strict();

export const bankAccountUpdateSchema = z.object({
  code: configurationCode.optional(),
  name: requiredText(200).optional(),
  accountId: uuid.optional(),
  currency: currency.optional(),
  iban: optionalText(80),
  bankName: optionalText(200),
  ...activeStatePatch,
}).strict().superRefine((value, ctx) => {
  if (Object.keys(value).every((key) => key === 'reason')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one bank account field is required', path: ['reason'] });
  }
  if (value.isActive !== undefined && !value.reason?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A reason is required when changing bank account status', path: ['reason'] });
  }
});

export const taxCodeCreateSchema = z.object({
  code: configurationCode,
  nameEn: requiredText(200),
  nameAr: optionalText(200),
  ratePercent: percentage,
  accountId: uuid.nullable().optional(),
}).strict();

export const taxCodeUpdateSchema = z.object({
  code: configurationCode.optional(),
  nameEn: requiredText(200).optional(),
  nameAr: optionalText(200),
  ratePercent: percentage.optional(),
  accountId: uuid.nullable().optional(),
  ...activeStatePatch,
}).strict().superRefine((value, ctx) => {
  if (Object.keys(value).every((key) => key === 'reason')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one tax code field is required', path: ['reason'] });
  }
  if (value.isActive !== undefined && !value.reason?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A reason is required when changing tax code status', path: ['reason'] });
  }
});

export const chargeItemCreateSchema = z.object({
  code: configurationCode,
  nameEn: requiredText(200),
  nameAr: optionalText(200),
  type: z.enum(['FREIGHT', 'ORIGIN', 'DESTINATION', 'CUSTOMS', 'DUTY', 'TAX', 'INSURANCE', 'HANDLING', 'STORAGE', 'OTHER']),
  defaultPrice: amount.nullable().optional(),
  currency: currency.optional(),
  taxCodeId: uuid.nullable().optional(),
}).strict();

export const chargeItemUpdateSchema = z.object({
  code: configurationCode.optional(),
  nameEn: requiredText(200).optional(),
  nameAr: optionalText(200),
  type: z.enum(['FREIGHT', 'ORIGIN', 'DESTINATION', 'CUSTOMS', 'DUTY', 'TAX', 'INSURANCE', 'HANDLING', 'STORAGE', 'OTHER']).optional(),
  defaultPrice: amount.nullable().optional(),
  currency: currency.optional(),
  taxCodeId: uuid.nullable().optional(),
  ...activeStatePatch,
}).strict().superRefine((value, ctx) => {
  if (Object.keys(value).every((key) => key === 'reason')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one charge item field is required', path: ['reason'] });
  }
  if (value.isActive !== undefined && !value.reason?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A reason is required when changing charge item status', path: ['reason'] });
  }
});

export const journalEntryQuerySchema = z.object({
  ...pageFields,
  ...dateFilters,
  search: z.string().trim().max(200).optional(),
  journalId: uuid.optional(),
  periodId: uuid.optional(),
  status: z.enum(['DRAFT', 'POSTED', 'VOID']).optional(),
  sourceType: z.string().trim().max(80).optional(),
  sourceId: uuid.optional(),
});

export const manualJournalLineSchema = z.object({
  accountId: uuid,
  debit: amount.default('0'),
  credit: amount.default('0'),
  description: optionalText(500),
  partnerId: uuid.nullable().optional(),
}).strict().superRefine((line, ctx) => {
  const debit = new Prisma.Decimal(line.debit);
  const credit = new Prisma.Decimal(line.credit);
  if ((debit.isZero() && credit.isZero()) || (!debit.isZero() && !credit.isZero())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter exactly one positive debit or credit', path: ['debit'] });
  }
});

export const manualJournalCreateSchema = z.object({
  journalId: uuid,
  periodId: uuid.nullable().optional(),
  entryDate: accountingDateSchema.optional(),
  description: requiredText(500),
  currency: currency.optional(),
  exchangeRate: exchangeRate.optional(),
  lines: z.array(manualJournalLineSchema).min(2, 'At least two journal lines are required').max(200),
}).strict();

export const manualJournalReverseSchema = z.object({
  entryDate: accountingDateSchema.optional(),
  reason: requiredText(500),
}).strict();

export const periodQuerySchema = z.object({
  ...pageFields,
  fiscalYearId: uuid.optional(),
  status: z.enum(['OPEN', 'SOFT_CLOSED', 'LOCKED']).optional(),
  ...dateFilters,
});

export const periodStatusSchema = z.object({
  status: z.enum(['OPEN', 'SOFT_CLOSED', 'LOCKED']),
  reason: optionalText(500),
});

export const accountingLineSchema = z.object({
  chargeItemId: uuid.nullable().optional(),
  description: requiredText(500),
  quantity: decimalField('0.001', '999999999999999.999', 3, 'Quantity'),
  unitPrice: amount,
  discountPercent: percentage.default(0),
  taxCodeId: uuid.nullable().optional(),
  taxPercent: percentage.optional(),
}).strict();

const documentFields = {
  branchId: uuid.nullable().optional(),
  currency: currency.optional(),
  exchangeRate: exchangeRate.optional(),
  issueDate: optionalDate,
  dueDate: optionalDate,
  notes: optionalText(4000),
  terms: optionalText(8000),
  lines: z.array(accountingLineSchema).min(1, 'At least one line is required').max(200),
};

export const invoiceCreateSchema = z.object({
  ...documentFields,
  customerId: uuid,
  quoteId: uuid.nullable().optional(),
  bookingId: uuid.nullable().optional(),
  shipmentId: uuid.nullable().optional(),
}).strict();

export const billCreateSchema = z.object({
  ...documentFields,
  vendorId: uuid,
  bookingId: uuid.nullable().optional(),
  shipmentId: uuid.nullable().optional(),
  customsFileId: uuid.nullable().optional(),
  declarationId: uuid.nullable().optional(),
  vendorReference: optionalText(120),
}).strict();

const documentQueryFields = {
  ...pageFields,
  ...dateFilters,
  search: z.string().trim().max(200).optional(),
  branchId: uuid.optional(),
  currency: currency.optional(),
};

export const invoiceQuerySchema = z.object({
  ...documentQueryFields,
  status: z.enum(['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID']).optional(),
  customerId: uuid.optional(),
  shipmentId: uuid.optional(),
  overdue: optionalBoolean,
});

export const billQuerySchema = z.object({
  ...documentQueryFields,
  status: z.enum(['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID']).optional(),
  vendorId: uuid.optional(),
  shipmentId: uuid.optional(),
  overdue: optionalBoolean,
});

export const documentIssueSchema = z.object({
  issueDate: accountingDateSchema.optional(),
  dueDate: accountingDateSchema.nullable().optional(),
}).strict().default({});

export const postingSchema = z.object({
  entryDate: accountingDateSchema.optional(),
  journalId: uuid.optional(),
  periodId: uuid.optional(),
  description: optionalText(500),
}).strict().default({});

export const voidSchema = z.object({
  entryDate: accountingDateSchema.optional(),
  reason: requiredText(500),
}).strict();

export const paymentAllocationSchema = z.object({
  invoiceId: uuid.optional(),
  billId: uuid.optional(),
  amount: positiveAmount,
}).strict().refine((value) => Boolean(value.invoiceId) !== Boolean(value.billId), {
  message: 'Exactly one invoice or bill is required',
  path: ['invoiceId', 'billId'],
});

export const paymentCreateSchema = z.object({
  direction: z.enum(['RECEIPT', 'PAYMENT']),
  partnerId: uuid,
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER']),
  bankAccountId: uuid.nullable().optional(),
  paymentDate: accountingDateSchema,
  currency: currency.optional(),
  exchangeRate: exchangeRate.optional(),
  amount: positiveAmount,
  reference: optionalText(120),
  notes: optionalText(4000),
  allocations: z.array(paymentAllocationSchema).max(200).default([]),
}).strict().refine((value) => {
  const targets = value.allocations.map((item) => item.invoiceId ?? item.billId);
  return new Set(targets).size === targets.length;
}, { message: 'A document can only be allocated once per payment', path: ['allocations'] });

export const paymentQuerySchema = z.object({
  ...pageFields,
  ...dateFilters,
  search: z.string().trim().max(200).optional(),
  direction: z.enum(['RECEIPT', 'PAYMENT']).optional(),
  partnerId: uuid.optional(),
  bankAccountId: uuid.optional(),
  status: z.enum(['DRAFT', 'POSTED', 'VOID']).optional(),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER']).optional(),
});

export const reconciliationItemCreateSchema = z.object({
  statementDate: accountingDateSchema,
  description: requiredText(500),
  amount: signedAmount.refine((value) => new Prisma.Decimal(value).isZero() === false, 'Amount cannot be zero'),
  reference: optionalText(120),
}).strict();

export const reconciliationCreateSchema = z.object({
  bankAccountId: uuid,
  statementStart: accountingDateSchema,
  statementEnd: accountingDateSchema,
  openingBalance: signedAmount,
  closingBalance: signedAmount,
  items: z.array(reconciliationItemCreateSchema).min(1, 'At least one statement item is required').max(500),
}).strict().refine((value) => value.statementStart <= value.statementEnd, {
  message: 'Statement start must not be after statement end',
  path: ['statementStart'],
}).refine((value) => value.items.every((item) => item.statementDate >= value.statementStart && item.statementDate <= value.statementEnd), {
  message: 'Every statement item must fall within the statement period',
  path: ['items'],
});

export const reconciliationUpdateSchema = z.object({
  bankAccountId: uuid.optional(),
  statementStart: accountingDateSchema.optional(),
  statementEnd: accountingDateSchema.optional(),
  openingBalance: signedAmount.optional(),
  closingBalance: signedAmount.optional(),
  reason: requiredText(500),
}).strict().superRefine((value, ctx) => {
  if (Object.keys(value).every((key) => key === 'reason')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one reconciliation field is required', path: ['reason'] });
  }
}).refine((value) => !value.statementStart || !value.statementEnd || value.statementStart <= value.statementEnd, {
  message: 'Statement start must not be after statement end',
  path: ['statementStart'],
});

export const reconciliationItemUpdateSchema = z.object({
  statementDate: accountingDateSchema.optional(),
  description: requiredText(500).optional(),
  amount: signedAmount.refine((value) => new Prisma.Decimal(value).isZero() === false, 'Amount cannot be zero').optional(),
  reference: optionalText(120),
  reason: requiredText(500),
}).strict().superRefine((value, ctx) => {
  if (Object.keys(value).every((key) => key === 'reason')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one statement item field is required', path: ['reason'] });
  }
});

export const reconciliationReasonSchema = z.object({ reason: requiredText(500) }).strict();

export const reconciliationQuerySchema = z.object({
  ...pageFields,
  bankAccountId: uuid.optional(),
  status: z.enum(['DRAFT', 'REVIEWED', 'APPROVED']).optional(),
  ...dateFilters,
});

export const reconciliationMatchSchema = z.object({
  paymentId: uuid.optional(),
  journalLineId: uuid.optional(),
}).strict().refine((value) => Boolean(value.paymentId) !== Boolean(value.journalLineId), {
  message: 'Exactly one payment or journal line is required',
  path: ['paymentId', 'journalLineId'],
});

export const reconciliationUnmatchSchema = z.object({
  reason: optionalText(500),
}).strict().default({});

export const reportQuerySchema = z.object({
  ...dateFilters,
  currency: currency.optional(),
}).refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: 'Report start must not be after report end',
  path: ['from', 'to'],
});

export type AccountQuery = z.infer<typeof accountQuerySchema>;
export type AccountCreateBody = z.infer<typeof accountCreateSchema>;
export type AccountUpdateBody = z.infer<typeof accountUpdateSchema>;
export type JournalQuery = z.infer<typeof journalQuerySchema>;
export type JournalCreateBody = z.infer<typeof journalCreateSchema>;
export type JournalUpdateBody = z.infer<typeof journalUpdateSchema>;
export type FiscalYearQuery = z.infer<typeof fiscalYearQuerySchema>;
export type FiscalYearCreateBody = z.infer<typeof fiscalYearCreateSchema>;
export type FiscalPeriodCreateBody = z.infer<typeof fiscalPeriodCreateSchema>;
export type BankAccountQuery = z.infer<typeof bankAccountQuerySchema>;
export type BankAccountCreateBody = z.infer<typeof bankAccountCreateSchema>;
export type BankAccountUpdateBody = z.infer<typeof bankAccountUpdateSchema>;
export type TaxCodeQuery = z.infer<typeof taxCodeQuerySchema>;
export type TaxCodeCreateBody = z.infer<typeof taxCodeCreateSchema>;
export type TaxCodeUpdateBody = z.infer<typeof taxCodeUpdateSchema>;
export type ChargeItemQuery = z.infer<typeof chargeItemQuerySchema>;
export type ChargeItemCreateBody = z.infer<typeof chargeItemCreateSchema>;
export type ChargeItemUpdateBody = z.infer<typeof chargeItemUpdateSchema>;
export type JournalEntryQuery = z.infer<typeof journalEntryQuerySchema>;
export type ManualJournalCreateBody = z.infer<typeof manualJournalCreateSchema>;
export type ManualJournalReverseBody = z.infer<typeof manualJournalReverseSchema>;
export type PeriodQuery = z.infer<typeof periodQuerySchema>;
export type InvoiceCreateBody = z.infer<typeof invoiceCreateSchema>;
export type BillCreateBody = z.infer<typeof billCreateSchema>;
export type InvoiceQuery = z.infer<typeof invoiceQuerySchema>;
export type BillQuery = z.infer<typeof billQuerySchema>;
export type PaymentCreateBody = z.infer<typeof paymentCreateSchema>;
export type PaymentQuery = z.infer<typeof paymentQuerySchema>;
export type ReconciliationCreateBody = z.infer<typeof reconciliationCreateSchema>;
export type ReconciliationUpdateBody = z.infer<typeof reconciliationUpdateSchema>;
export type ReconciliationItemUpdateBody = z.infer<typeof reconciliationItemUpdateSchema>;
export type ReconciliationReasonBody = z.infer<typeof reconciliationReasonSchema>;
export type ReconciliationQuery = z.infer<typeof reconciliationQuerySchema>;
export type ReportQuery = z.infer<typeof reportQuerySchema>;
