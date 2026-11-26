import type { BusinessPartner, Branch, Prisma, QuoteLine } from '@prisma/client';
import { ApiError } from '../../middleware/error';
import { sumMoney } from '../../lib/money';

export const salesCustomerSelect = {
  id: true,
  nameEn: true,
  nameAr: true,
  email: true,
  phone: true,
  currency: true,
} satisfies Prisma.BusinessPartnerSelect;

export const salesBranchSelect = { id: true, code: true, nameEn: true } satisfies Prisma.BranchSelect;

export const quoteInclude = {
  lines: { orderBy: [{ position: 'asc' }] },
  customer: { select: salesCustomerSelect },
  branch: { select: salesBranchSelect },
  sourceQuoteRequest: {
    select: {
      id: true,
      freightMode: true,
      originCity: true,
      originCountry: true,
      destinationCity: true,
      destinationCountry: true,
      incoterms: true,
      expectedShipDate: true,
      additionalNotes: true,
    },
  },
} satisfies Prisma.QuoteInclude;

export const bookingInclude = {
  customer: { select: salesCustomerSelect },
  quote: { select: { id: true, number: true, status: true } },
} satisfies Prisma.BookingInclude;

export async function requireCustomer(
  tx: Prisma.TransactionClient,
  companyId: string,
  customerId: string,
): Promise<BusinessPartner> {
  const customer = await tx.businessPartner.findFirst({
    where: {
      id: customerId,
      companyId,
      deletedAt: null,
      type: { in: ['CUSTOMER', 'BOTH'] },
    },
  });
  if (!customer) throw ApiError.badRequest('A valid customer in this company is required');
  return customer;
}

export async function requireBranch(
  tx: Prisma.TransactionClient,
  companyId: string,
  branchId?: string | null,
): Promise<Branch | null> {
  if (!branchId) return null;
  const branch = await tx.branch.findFirst({ where: { id: branchId, companyId, isActive: true } });
  if (!branch) throw ApiError.badRequest('A valid active branch in this company is required');
  return branch;
}

export async function requireLineReferences(
  tx: Prisma.TransactionClient,
  companyId: string,
  lines: Array<{ chargeItemId?: string | null; taxCodeId?: string | null }>,
): Promise<void> {
  const chargeItemIds = [...new Set(lines.flatMap((line) => (line.chargeItemId ? [line.chargeItemId] : [])))];
  const taxCodeIds = [...new Set(lines.flatMap((line) => (line.taxCodeId ? [line.taxCodeId] : [])))];

  const [chargeItems, taxCodes] = await Promise.all([
    chargeItemIds.length
      ? tx.chargeItem.findMany({ where: { id: { in: chargeItemIds }, companyId, isActive: true }, select: { id: true } })
      : [],
    taxCodeIds.length
      ? tx.taxCode.findMany({ where: { id: { in: taxCodeIds }, companyId, isActive: true }, select: { id: true } })
      : [],
  ]);

  if (chargeItems.length !== chargeItemIds.length || taxCodes.length !== taxCodeIds.length) {
    throw ApiError.badRequest('One or more charge items or tax codes are invalid or inactive');
  }
}

type QuoteTotalLine = Pick<QuoteLine, 'subtotal' | 'discount' | 'taxAmount' | 'total'>;

export function withQuoteTotals<T extends { currency: string; lines: QuoteTotalLine[] }>(quote: T) {
  return {
    ...quote,
    totals: {
      subtotal: sumMoney(quote.lines.map((line) => line.subtotal)),
      discount: sumMoney(quote.lines.map((line) => line.discount)),
      taxAmount: sumMoney(quote.lines.map((line) => line.taxAmount)),
      total: sumMoney(quote.lines.map((line) => line.total)),
    },
  };
}
