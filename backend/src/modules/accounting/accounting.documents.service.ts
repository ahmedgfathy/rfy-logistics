import { Prisma, type ChargeType, type InvoiceLine } from '@prisma/client';
import { calculateLineTotals, money, roundMoney } from '../../lib/money';
import { ApiError } from '../../middleware/error';
import type { BillCreateBody, InvoiceCreateBody } from './accounting.schemas';
import {
  addDays,
  assertDateOrder,
  audit,
  documentCurrency,
  lockRows,
  nextAccountingNumber,
  requiredSystemAccount,
  requireCompany,
  sumAmounts,
  systemAccountMap,
  today,
  type Actor,
  type Tx,
} from './accounting.shared';
import { postJournalEntry, reversePostedEntryForDocument } from './accounting.ledger.service';

const partnerSelect = { id: true, code: true, nameEn: true, nameAr: true, email: true, phone: true, currency: true, paymentTermDays: true };
const branchSelect = { id: true, code: true, nameEn: true };

export const invoiceInclude = {
  customer: { select: partnerSelect },
  branch: { select: branchSelect },
  quote: { select: { id: true, number: true } },
  booking: { select: { id: true, number: true } },
  shipment: { select: { id: true, trackingNumber: true } },
  lines: { orderBy: [{ position: 'asc' }] },
  allocations: {
    orderBy: [{ createdAt: 'asc' }],
    include: { payment: { select: { id: true, number: true, direction: true, status: true, paymentDate: true } } },
  },
  postedEntry: {
    select: {
      id: true,
      number: true,
      status: true,
      entryDate: true,
      totalDebit: true,
      totalCredit: true,
      reversals: { select: { id: true, number: true, status: true, entryDate: true, totalDebit: true, totalCredit: true } },
      lines: { include: { account: { select: { id: true, code: true, nameEn: true } } } },
    },
  },
} satisfies Prisma.InvoiceInclude;

export const billInclude = {
  vendor: { select: partnerSelect },
  branch: { select: branchSelect },
  booking: { select: { id: true, number: true } },
  shipment: { select: { id: true, trackingNumber: true } },
  customsFile: { select: { id: true, number: true } },
  declaration: { select: { id: true, number: true, declarationNumber: true } },
  lines: { orderBy: [{ position: 'asc' }] },
  allocations: {
    orderBy: [{ createdAt: 'asc' }],
    include: { payment: { select: { id: true, number: true, direction: true, status: true, paymentDate: true } } },
  },
  postedEntry: {
    select: {
      id: true,
      number: true,
      status: true,
      entryDate: true,
      totalDebit: true,
      totalCredit: true,
      reversals: { select: { id: true, number: true, status: true, entryDate: true, totalDebit: true, totalCredit: true } },
      lines: { include: { account: { select: { id: true, code: true, nameEn: true } } } },
    },
  },
} satisfies Prisma.BillInclude;

interface LineReference {
  chargeItemId?: string | null;
  taxCodeId?: string | null;
}

async function lineReferences(tx: Tx, companyId: string, lines: LineReference[], taxDirection: 'OUTPUT' | 'INPUT', requireActive = true) {
  const chargeItemIds = [...new Set(lines.flatMap((line) => (line.chargeItemId ? [line.chargeItemId] : [])))];
  const taxCodeIds = [...new Set(lines.flatMap((line) => (line.taxCodeId ? [line.taxCodeId] : [])))];
  const [chargeItems, taxCodes] = await Promise.all([
    chargeItemIds.length
      ? tx.chargeItem.findMany({ where: { id: { in: chargeItemIds }, companyId, ...(requireActive ? { isActive: true } : {}) } })
      : [],
    taxCodeIds.length
      ? tx.taxCode.findMany({
          where: { id: { in: taxCodeIds }, companyId, ...(requireActive ? { isActive: true } : {}) },
          include: { account: true },
        })
      : [],
  ]);
  if (chargeItems.length !== chargeItemIds.length || taxCodes.length !== taxCodeIds.length) {
    throw ApiError.badRequest('One or more charge items or tax codes are invalid or inactive');
  }
  const expectedAccountType = taxDirection === 'OUTPUT' ? 'LIABILITY' : 'ASSET';
  if (taxCodes.some((taxCode) => taxCode.account && (taxCode.account.type !== expectedAccountType || !taxCode.account.isActive || !taxCode.account.isPostable))) {
    throw ApiError.badRequest(taxDirection === 'OUTPUT'
      ? 'Invoice tax accounts must be active postable liability accounts'
      : 'Bill tax accounts must be active postable asset accounts');
  }
  return {
    chargeItems: new Map(chargeItems.map((item) => [item.id, item])),
    taxCodes: new Map(taxCodes.map((item) => [item.id, item])),
  };
}

async function calculatedLines(tx: Tx, companyId: string, currency: string, lines: InvoiceCreateBody['lines'], taxDirection: 'OUTPUT' | 'INPUT') {
  const references = await lineReferences(tx, companyId, lines, taxDirection);
  return lines.map((line, position) => {
    const taxCode = line.taxCodeId ? references.taxCodes.get(line.taxCodeId) : undefined;
    const { tax, ...lineTotals } = calculateLineTotals({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      taxPercent: line.taxPercent ?? taxCode?.ratePercent ?? 0,
      currency,
    });
    return {
      position,
      chargeItemId: line.chargeItemId ?? null,
      description: line.description,
      quantity: money(line.quantity),
      unitPrice: money(line.unitPrice),
      discountPercent: money(line.discountPercent),
      taxCodeId: line.taxCodeId ?? null,
      taxPercent: money(line.taxPercent ?? taxCode?.ratePercent ?? 0),
      ...lineTotals,
      taxAmount: tax,
    };
  });
}

function totalsFor(lines: Array<Pick<InvoiceLine, 'subtotal' | 'discount' | 'taxAmount' | 'total'>>, currency: string) {
  return {
    subtotal: sumAmounts(lines.map((line) => line.subtotal), currency),
    discount: sumAmounts(lines.map((line) => line.discount), currency),
    taxAmount: sumAmounts(lines.map((line) => line.taxAmount), currency),
    total: sumAmounts(lines.map((line) => line.total), currency),
  };
}

async function requirePartner(tx: Tx, companyId: string, partnerId: string, type: 'CUSTOMER' | 'VENDOR') {
  const partner = await tx.businessPartner.findFirst({
    where: {
      id: partnerId,
      companyId,
      deletedAt: null,
      status: 'ACTIVE',
      type: type === 'CUSTOMER' ? { in: ['CUSTOMER', 'BOTH'] } : { in: ['VENDOR', 'BOTH'] },
    },
  });
  if (!partner) throw ApiError.badRequest(`A valid active ${type.toLowerCase()} in this company is required`);
  return partner;
}

async function requireBranch(tx: Tx, companyId: string, branchId?: string | null) {
  if (!branchId) return;
  const branch = await tx.branch.findFirst({ where: { id: branchId, companyId, isActive: true }, select: { id: true } });
  if (!branch) throw ApiError.badRequest('A valid active branch in this company is required');
}

async function requireInvoiceRelations(
  tx: Tx,
  companyId: string,
  body: InvoiceCreateBody,
) {
  await requireBranch(tx, companyId, body.branchId);
  const [quote, booking, shipment] = await Promise.all([
    body.quoteId ? tx.quote.findFirst({ where: { id: body.quoteId, companyId }, select: { id: true, customerId: true } }) : null,
    body.bookingId ? tx.booking.findFirst({ where: { id: body.bookingId, companyId }, select: { id: true, customerId: true } }) : null,
    body.shipmentId ? tx.shipment.findFirst({ where: { id: body.shipmentId, companyId }, select: { id: true, customerId: true } }) : null,
  ]);
  if ((body.quoteId && !quote) || (body.bookingId && !booking) || (body.shipmentId && !shipment)) {
    throw ApiError.badRequest('One or more invoice references are invalid or outside this company');
  }
  if ([quote, booking, shipment].some((record) => record?.customerId && record.customerId !== body.customerId)) {
    throw ApiError.badRequest('Invoice references must belong to the selected customer');
  }
}

async function requireBillRelations(tx: Tx, companyId: string, body: BillCreateBody) {
  await requireBranch(tx, companyId, body.branchId);
  const [booking, shipment, customsFile, declaration] = await Promise.all([
    body.bookingId ? tx.booking.findFirst({ where: { id: body.bookingId, companyId }, select: { id: true } }) : null,
    body.shipmentId ? tx.shipment.findFirst({ where: { id: body.shipmentId, companyId }, select: { id: true } }) : null,
    body.customsFileId ? tx.customsFile.findFirst({ where: { id: body.customsFileId, companyId }, select: { id: true } }) : null,
    body.declarationId
      ? tx.customsDeclaration.findFirst({
          where: { id: body.declarationId, customsFile: { companyId } },
          select: { id: true, customsFileId: true },
        })
      : null,
  ]);
  if ((body.bookingId && !booking) || (body.shipmentId && !shipment) || (body.customsFileId && !customsFile) || (body.declarationId && !declaration)) {
    throw ApiError.badRequest('One or more bill references are invalid or outside this company');
  }
  if (body.customsFileId && declaration && declaration.customsFileId !== body.customsFileId) {
    throw ApiError.badRequest('Declaration must belong to the selected customs file');
  }
}

export async function getInvoiceTx(tx: Tx, companyId: string, id: string) {
  const invoice = await tx.invoice.findFirst({ where: { id, companyId }, include: invoiceInclude });
  if (!invoice) throw ApiError.notFound('Invoice not found');
  return invoice;
}

export async function getBillTx(tx: Tx, companyId: string, id: string) {
  const bill = await tx.bill.findFirst({ where: { id, companyId }, include: billInclude });
  if (!bill) throw ApiError.notFound('Bill not found');
  return bill;
}

export async function createInvoice(tx: Tx, companyId: string, body: InvoiceCreateBody, actor: Actor) {
  const company = await requireCompany(tx, companyId);
  const currency = documentCurrency(company, body.currency, body.exchangeRate);
  assertDateOrder(body.issueDate, body.dueDate);
  const customer = await requirePartner(tx, companyId, body.customerId, 'CUSTOMER');
  await requireInvoiceRelations(tx, companyId, body);
  const lines = await calculatedLines(tx, companyId, currency.currency, body.lines, 'OUTPUT');
  const totals = totalsFor(lines, currency.currency);
  const number = await nextAccountingNumber(tx, companyId, 'INVOICE', 'INV');
  const createdRecord = await tx.invoice.create({
    data: {
      companyId,
      number,
      customerId: customer.id,
      branchId: body.branchId ?? null,
      quoteId: body.quoteId ?? null,
      bookingId: body.bookingId ?? null,
      shipmentId: body.shipmentId ?? null,
      status: 'DRAFT',
      issueDate: body.issueDate ?? null,
      dueDate: body.dueDate ?? null,
      ...currency,
      ...totals,
      paidAmount: money(0),
      balance: totals.total,
      notes: body.notes ?? null,
      terms: body.terms ?? null,
      createdById: actor.id,
      lines: { create: lines },
    },
  });
  const created = await getInvoiceTx(tx, companyId, createdRecord.id);
  await audit(tx, actor, 'invoice.created', 'Invoice', created.id, { number, customerId: customer.id, total: created.total.toFixed() });
  return created;
}

export async function createBill(tx: Tx, companyId: string, body: BillCreateBody, actor: Actor) {
  const company = await requireCompany(tx, companyId);
  const currency = documentCurrency(company, body.currency, body.exchangeRate);
  assertDateOrder(body.issueDate, body.dueDate);
  const vendor = await requirePartner(tx, companyId, body.vendorId, 'VENDOR');
  await requireBillRelations(tx, companyId, body);
  const lines = await calculatedLines(tx, companyId, currency.currency, body.lines, 'INPUT');
  const totals = totalsFor(lines, currency.currency);
  const number = await nextAccountingNumber(tx, companyId, 'BILL', 'BILL');
  const createdRecord = await tx.bill.create({
    data: {
      companyId,
      number,
      vendorId: vendor.id,
      branchId: body.branchId ?? null,
      bookingId: body.bookingId ?? null,
      shipmentId: body.shipmentId ?? null,
      customsFileId: body.customsFileId ?? null,
      declarationId: body.declarationId ?? null,
      status: 'DRAFT',
      issueDate: body.issueDate ?? null,
      dueDate: body.dueDate ?? null,
      vendorReference: body.vendorReference ?? null,
      ...currency,
      ...totals,
      paidAmount: money(0),
      balance: totals.total,
      notes: body.notes ?? null,
      createdById: actor.id,
      lines: { create: lines },
    },
  });
  const created = await getBillTx(tx, companyId, createdRecord.id);
  await audit(tx, actor, 'bill.created', 'Bill', created.id, { number, vendorId: vendor.id, total: created.total.toFixed() });
  return created;
}

async function requireEditableDraft(
  tx: Tx,
  document: 'invoice' | 'bill',
  companyId: string,
  id: string,
) {
  await lockRows(tx, document === 'invoice' ? 'Invoice' : 'Bill', [id]);
  const existing = document === 'invoice'
    ? await tx.invoice.findFirst({ where: { id, companyId }, select: { status: true, postedEntryId: true } })
    : await tx.bill.findFirst({ where: { id, companyId }, select: { status: true, postedEntryId: true } });
  if (!existing) throw ApiError.notFound(document === 'invoice' ? 'Invoice not found' : 'Bill not found');
  if (existing.status !== 'DRAFT' || existing.postedEntryId) {
    throw new ApiError(409, 'INVALID_STATE', `Only an unposted draft ${document} can be edited or deleted`);
  }
  const allocations = document === 'invoice'
    ? await tx.paymentAllocation.count({ where: { invoiceId: id } })
    : await tx.paymentAllocation.count({ where: { billId: id } });
  if (allocations) throw new ApiError(409, 'DOCUMENT_ALLOCATED', `Remove payment allocations before editing or deleting this ${document}`);
}

export async function updateInvoiceDraft(tx: Tx, companyId: string, id: string, body: InvoiceCreateBody, actor: Actor) {
  await requireEditableDraft(tx, 'invoice', companyId, id);
  const existing = await getInvoiceTx(tx, companyId, id);
  const company = await requireCompany(tx, companyId);
  const currency = documentCurrency(company, body.currency, body.exchangeRate);
  assertDateOrder(body.issueDate, body.dueDate);
  await requirePartner(tx, companyId, body.customerId, 'CUSTOMER');
  await requireInvoiceRelations(tx, companyId, body);
  const lines = await calculatedLines(tx, companyId, currency.currency, body.lines, 'OUTPUT');
  const totals = totalsFor(lines, currency.currency);
  const updatedRecord = await tx.invoice.update({
    where: { id },
    data: {
      customerId: body.customerId,
      branchId: body.branchId ?? null,
      quoteId: body.quoteId ?? null,
      bookingId: body.bookingId ?? null,
      shipmentId: body.shipmentId ?? null,
      issueDate: body.issueDate ?? null,
      dueDate: body.dueDate ?? null,
      notes: body.notes ?? null,
      terms: body.terms ?? null,
      ...currency,
      ...totals,
      paidAmount: money(0),
      balance: totals.total,
      version: { increment: 1 },
    },
  });
  await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
  await tx.invoiceLine.createMany({ data: lines.map((line) => ({ ...line, invoiceId: id })) });
  const updated = await getInvoiceTx(tx, companyId, updatedRecord.id);
  await audit(tx, actor, 'invoice.updated', 'Invoice', id, { number: existing.number, total: updated.total.toFixed() });
  return updated;
}

export async function deleteInvoiceDraft(tx: Tx, companyId: string, id: string, actor: Actor) {
  await requireEditableDraft(tx, 'invoice', companyId, id);
  const existing = await getInvoiceTx(tx, companyId, id);
  await audit(tx, actor, 'invoice.deleted', 'Invoice', id, { number: existing.number, total: existing.total.toFixed() });
  await tx.invoice.delete({ where: { id } });
  return { id, number: existing.number, deleted: true };
}

export async function updateBillDraft(tx: Tx, companyId: string, id: string, body: BillCreateBody, actor: Actor) {
  await requireEditableDraft(tx, 'bill', companyId, id);
  const existing = await getBillTx(tx, companyId, id);
  const company = await requireCompany(tx, companyId);
  const currency = documentCurrency(company, body.currency, body.exchangeRate);
  assertDateOrder(body.issueDate, body.dueDate);
  await requirePartner(tx, companyId, body.vendorId, 'VENDOR');
  await requireBillRelations(tx, companyId, body);
  const lines = await calculatedLines(tx, companyId, currency.currency, body.lines, 'INPUT');
  const totals = totalsFor(lines, currency.currency);
  const updatedRecord = await tx.bill.update({
    where: { id },
    data: {
      vendorId: body.vendorId,
      branchId: body.branchId ?? null,
      bookingId: body.bookingId ?? null,
      shipmentId: body.shipmentId ?? null,
      customsFileId: body.customsFileId ?? null,
      declarationId: body.declarationId ?? null,
      vendorReference: body.vendorReference ?? null,
      issueDate: body.issueDate ?? null,
      dueDate: body.dueDate ?? null,
      notes: body.notes ?? null,
      ...currency,
      ...totals,
      paidAmount: money(0),
      balance: totals.total,
      version: { increment: 1 },
    },
  });
  await tx.billLine.deleteMany({ where: { billId: id } });
  await tx.billLine.createMany({ data: lines.map((line) => ({ ...line, billId: id })) });
  const updated = await getBillTx(tx, companyId, updatedRecord.id);
  await audit(tx, actor, 'bill.updated', 'Bill', id, { number: existing.number, total: updated.total.toFixed() });
  return updated;
}

export async function deleteBillDraft(tx: Tx, companyId: string, id: string, actor: Actor) {
  await requireEditableDraft(tx, 'bill', companyId, id);
  const existing = await getBillTx(tx, companyId, id);
  await audit(tx, actor, 'bill.deleted', 'Bill', id, { number: existing.number, total: existing.total.toFixed() });
  await tx.bill.delete({ where: { id } });
  return { id, number: existing.number, deleted: true };
}

export async function issueInvoice(
  tx: Tx,
  companyId: string,
  id: string,
  body: { issueDate?: Date; dueDate?: Date | null },
  actor: Actor,
) {
  await lockRows(tx, 'Invoice', [id]);
  const invoice = await getInvoiceTx(tx, companyId, id);
  if (invoice.status !== 'DRAFT' || invoice.postedEntryId) {
    throw new ApiError(409, 'INVALID_STATE', 'Only an unposted draft invoice can be issued');
  }
  const issueDate = body.issueDate ?? invoice.issueDate ?? today();
  const dueDate = body.dueDate === undefined ? invoice.dueDate ?? addDays(issueDate, invoice.customer.paymentTermDays) : body.dueDate;
  assertDateOrder(issueDate, dueDate);
  if (invoice.total.lte(0)) throw ApiError.badRequest('A zero-value invoice cannot be issued');
  const updated = await tx.invoice.update({
    where: { id },
    data: { status: 'ISSUED', issueDate, dueDate, version: { increment: 1 } },
  });
  await audit(tx, actor, 'invoice.issued', 'Invoice', id, { number: invoice.number, issueDate, dueDate });
  return getInvoiceTx(tx, companyId, updated.id);
}

export async function issueBill(
  tx: Tx,
  companyId: string,
  id: string,
  body: { issueDate?: Date; dueDate?: Date | null },
  actor: Actor,
) {
  await lockRows(tx, 'Bill', [id]);
  const bill = await getBillTx(tx, companyId, id);
  if (bill.status !== 'DRAFT' || bill.postedEntryId) {
    throw new ApiError(409, 'INVALID_STATE', 'Only an unposted draft bill can be issued');
  }
  const issueDate = body.issueDate ?? bill.issueDate ?? today();
  const dueDate = body.dueDate === undefined ? bill.dueDate ?? addDays(issueDate, bill.vendor.paymentTermDays) : body.dueDate;
  assertDateOrder(issueDate, dueDate);
  if (bill.total.lte(0)) throw ApiError.badRequest('A zero-value bill cannot be issued');
  const updated = await tx.bill.update({
    where: { id },
    data: { status: 'ISSUED', issueDate, dueDate, version: { increment: 1 } },
  });
  await audit(tx, actor, 'bill.issued', 'Bill', id, { number: bill.number, issueDate, dueDate });
  return getBillTx(tx, companyId, updated.id);
}

function assertStoredTotals(
  document: { subtotal: Prisma.Decimal; discount: Prisma.Decimal; taxAmount: Prisma.Decimal; total: Prisma.Decimal },
  lines: Array<Pick<InvoiceLine, 'subtotal' | 'discount' | 'taxAmount' | 'total'>>,
  currency: string,
): void {
  const totals = totalsFor(lines, currency);
  if (!totals.subtotal.eq(document.subtotal) || !totals.discount.eq(document.discount) || !totals.taxAmount.eq(document.taxAmount) || !totals.total.eq(document.total)) {
    throw ApiError.badRequest('Stored document totals do not match its lines');
  }
  if (!document.total.eq(document.subtotal.plus(document.taxAmount)) || document.total.lte(0)) {
    throw ApiError.badRequest('Document total is invalid');
  }
}

const salesRevenueByCharge: Partial<Record<ChargeType, string>> = {
  FREIGHT: 'FREIGHT_REVENUE',
  CUSTOMS: 'CUSTOMS_REVENUE',
};
const purchaseExpenseByCharge: Partial<Record<ChargeType, string>> = {
  FREIGHT: 'PURCHASE_FREIGHT',
  CUSTOMS: 'CUSTOMS_EXPENSE',
  DUTY: 'CUSTOMS_EXPENSE',
  TAX: 'CUSTOMS_EXPENSE',
};

async function invoiceJournalLines(tx: Tx, companyId: string, invoice: Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>) {
  assertStoredTotals(invoice, invoice.lines, invoice.currency);
  const references = await lineReferences(tx, companyId, invoice.lines, 'OUTPUT', false);
  const accounts = await systemAccountMap(tx, companyId, ['AR', 'OUTPUT_VAT', 'SALES_REVENUE', 'FREIGHT_REVENUE', 'CUSTOMS_REVENUE']);
  const ar = requiredSystemAccount(accounts, 'AR', 'ASSET');
  const outputVat = requiredSystemAccount(accounts, 'OUTPUT_VAT', 'LIABILITY');
  const revenue = new Map<string, Prisma.Decimal>();
  const taxes = new Map<string, Prisma.Decimal>();

  for (const line of invoice.lines) {
    const charge = line.chargeItemId ? references.chargeItems.get(line.chargeItemId) : undefined;
    const systemCode = (charge?.type ? salesRevenueByCharge[charge.type] : undefined) ?? 'SALES_REVENUE';
    const account = requiredSystemAccount(accounts, systemCode, 'REVENUE');
    revenue.set(account.id, (revenue.get(account.id) ?? money(0)).plus(line.subtotal));

    if (line.taxAmount.gt(0)) {
      const taxCode = line.taxCodeId ? references.taxCodes.get(line.taxCodeId) : undefined;
      let taxAccount = outputVat;
      if (taxCode?.accountId) {
        const configuredAccount = taxCode.account;
        if (!configuredAccount || configuredAccount.companyId !== companyId || !configuredAccount.isActive || !configuredAccount.isPostable || configuredAccount.type !== 'LIABILITY') {
          throw ApiError.badRequest('The configured output tax account is invalid or not postable');
        }
        taxAccount = configuredAccount;
      }
      taxes.set(taxAccount.id, (taxes.get(taxAccount.id) ?? money(0)).plus(line.taxAmount));
    }
  }

  const lines = [
    { accountId: ar.id, debit: invoice.total, credit: money(0), description: `Accounts receivable — ${invoice.number}`, partnerId: invoice.customerId, invoiceId: invoice.id },
    ...[...revenue.entries()].map(([accountId, amount]) => ({ accountId, debit: money(0), credit: amount, description: `Revenue — ${invoice.number}`, invoiceId: invoice.id })),
    ...[...taxes.entries()].map(([accountId, amount]) => ({ accountId, debit: money(0), credit: amount, description: `Output VAT — ${invoice.number}`, invoiceId: invoice.id })),
  ];
  return lines.filter((line) => line.debit.gt(0) || line.credit.gt(0));
}

async function billJournalLines(tx: Tx, companyId: string, bill: Prisma.BillGetPayload<{ include: typeof billInclude }>) {
  assertStoredTotals(bill, bill.lines, bill.currency);
  const references = await lineReferences(tx, companyId, bill.lines, 'INPUT', false);
  const accounts = await systemAccountMap(tx, companyId, ['AP', 'INPUT_VAT', 'PURCHASE_FREIGHT', 'CUSTOMS_EXPENSE']);
  const ap = requiredSystemAccount(accounts, 'AP', 'LIABILITY');
  const inputVat = requiredSystemAccount(accounts, 'INPUT_VAT', 'ASSET');
  const expenses = new Map<string, Prisma.Decimal>();
  const taxes = new Map<string, Prisma.Decimal>();

  for (const line of bill.lines) {
    const charge = line.chargeItemId ? references.chargeItems.get(line.chargeItemId) : undefined;
    const systemCode = (charge?.type ? purchaseExpenseByCharge[charge.type] : undefined) ?? 'PURCHASE_FREIGHT';
    const account = requiredSystemAccount(accounts, systemCode, 'EXPENSE');
    expenses.set(account.id, (expenses.get(account.id) ?? money(0)).plus(line.subtotal));

    if (line.taxAmount.gt(0)) {
      const taxCode = line.taxCodeId ? references.taxCodes.get(line.taxCodeId) : undefined;
      let taxAccount = inputVat;
      if (taxCode?.accountId) {
        const configuredAccount = taxCode.account;
        if (!configuredAccount || configuredAccount.companyId !== companyId || !configuredAccount.isActive || !configuredAccount.isPostable || configuredAccount.type !== 'ASSET') {
          throw ApiError.badRequest('The configured input tax account is invalid or not postable');
        }
        taxAccount = configuredAccount;
      }
      taxes.set(taxAccount.id, (taxes.get(taxAccount.id) ?? money(0)).plus(line.taxAmount));
    }
  }

  const lines = [
    ...[...expenses.entries()].map(([accountId, amount]) => ({ accountId, debit: amount, credit: money(0), description: `Expense — ${bill.number}`, billId: bill.id })),
    ...[...taxes.entries()].map(([accountId, amount]) => ({ accountId, debit: amount, credit: money(0), description: `Input VAT — ${bill.number}`, billId: bill.id })),
    { accountId: ap.id, debit: money(0), credit: bill.total, description: `Accounts payable — ${bill.number}`, partnerId: bill.vendorId, billId: bill.id },
  ];
  return lines.filter((line) => line.debit.gt(0) || line.credit.gt(0));
}

export async function postInvoice(
  tx: Tx,
  companyId: string,
  id: string,
  body: { entryDate?: Date; journalId?: string; periodId?: string; description?: string | null },
  actor: Actor,
) {
  await lockRows(tx, 'Invoice', [id]);
  const invoice = await getInvoiceTx(tx, companyId, id);
  if (invoice.status !== 'ISSUED' || invoice.postedEntryId) {
    throw new ApiError(409, 'INVALID_STATE', 'Only an issued, unposted invoice can be posted');
  }
  if (!invoice.issueDate) throw ApiError.badRequest('Invoice must have an issue date');
  const lines = await invoiceJournalLines(tx, companyId, invoice);
  const entry = await postJournalEntry(tx, {
    companyId,
    journalId: body.journalId,
    journalType: 'SALES',
    periodId: body.periodId,
    entryDate: body.entryDate ?? invoice.issueDate,
    description: body.description ?? `Invoice ${invoice.number}`,
    sourceType: 'Invoice',
    sourceId: invoice.id,
    currency: invoice.currency,
    exchangeRate: invoice.exchangeRate,
    lines,
    actor,
  });
  await tx.invoice.update({ where: { id }, data: { postedEntryId: entry.id, version: { increment: 1 } } });
  await audit(tx, actor, 'invoice.posted', 'Invoice', id, { number: invoice.number, entryId: entry.id, total: invoice.total.toFixed() });
  return getInvoiceTx(tx, companyId, id);
}

export async function postBill(
  tx: Tx,
  companyId: string,
  id: string,
  body: { entryDate?: Date; journalId?: string; periodId?: string; description?: string | null },
  actor: Actor,
) {
  await lockRows(tx, 'Bill', [id]);
  const bill = await getBillTx(tx, companyId, id);
  if (bill.status !== 'ISSUED' || bill.postedEntryId) {
    throw new ApiError(409, 'INVALID_STATE', 'Only an issued, unposted bill can be posted');
  }
  if (!bill.issueDate) throw ApiError.badRequest('Bill must have an issue date');
  const lines = await billJournalLines(tx, companyId, bill);
  const entry = await postJournalEntry(tx, {
    companyId,
    journalId: body.journalId,
    journalType: 'PURCHASE',
    periodId: body.periodId,
    entryDate: body.entryDate ?? bill.issueDate,
    description: body.description ?? `Bill ${bill.number}`,
    sourceType: 'Bill',
    sourceId: bill.id,
    currency: bill.currency,
    exchangeRate: bill.exchangeRate,
    lines,
    actor,
  });
  await tx.bill.update({ where: { id }, data: { postedEntryId: entry.id, version: { increment: 1 } } });
  await audit(tx, actor, 'bill.posted', 'Bill', id, { number: bill.number, entryId: entry.id, total: bill.total.toFixed() });
  return getBillTx(tx, companyId, id);
}

async function ensureNoLiveAllocations(
  tx: Tx,
  document: 'invoice' | 'bill',
  id: string,
  paidAmount: Prisma.Decimal,
): Promise<void> {
  const where = document === 'invoice'
    ? { invoiceId: id, payment: { status: { not: 'VOID' as const } } }
    : { billId: id, payment: { status: { not: 'VOID' as const } } };
  const count = await tx.paymentAllocation.count({ where });
  if (count > 0 || paidAmount.gt(0)) {
    throw new ApiError(409, 'DOCUMENT_ALLOCATED', 'Void or reverse all allocated payments before voiding this document');
  }
}

export async function voidInvoice(
  tx: Tx,
  companyId: string,
  id: string,
  body: { entryDate?: Date; reason: string },
  actor: Actor,
) {
  await lockRows(tx, 'Invoice', [id]);
  const invoice = await getInvoiceTx(tx, companyId, id);
  if (invoice.status === 'VOID') throw new ApiError(409, 'INVALID_STATE', 'Invoice is already void');
  await ensureNoLiveAllocations(tx, 'invoice', id, invoice.paidAmount);
  let reversalId: string | null = null;
  if (invoice.postedEntryId) {
    const reversal = await reversePostedEntryForDocument(tx, companyId, invoice.postedEntryId, body.entryDate ?? today(), body.reason, actor);
    reversalId = reversal.id;
  }
  await tx.invoice.update({
    where: { id },
    data: { status: 'VOID', paidAmount: money(0), balance: money(0), version: { increment: 1 } },
  });
  await audit(tx, actor, 'invoice.voided', 'Invoice', id, { number: invoice.number, reason: body.reason, reversalEntryId: reversalId });
  return getInvoiceTx(tx, companyId, id);
}

export async function voidBill(
  tx: Tx,
  companyId: string,
  id: string,
  body: { entryDate?: Date; reason: string },
  actor: Actor,
) {
  await lockRows(tx, 'Bill', [id]);
  const bill = await getBillTx(tx, companyId, id);
  if (bill.status === 'VOID') throw new ApiError(409, 'INVALID_STATE', 'Bill is already void');
  await ensureNoLiveAllocations(tx, 'bill', id, bill.paidAmount);
  let reversalId: string | null = null;
  if (bill.postedEntryId) {
    const reversal = await reversePostedEntryForDocument(tx, companyId, bill.postedEntryId, body.entryDate ?? today(), body.reason, actor);
    reversalId = reversal.id;
  }
  await tx.bill.update({
    where: { id },
    data: { status: 'VOID', paidAmount: money(0), balance: money(0), version: { increment: 1 } },
  });
  await audit(tx, actor, 'bill.voided', 'Bill', id, { number: bill.number, reason: body.reason, reversalEntryId: reversalId });
  return getBillTx(tx, companyId, id);
}

export async function refreshInvoicePaymentState(tx: Tx, companyId: string, invoiceId: string) {
  const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, companyId }, select: { id: true, status: true, total: true, currency: true } });
  if (!invoice) throw ApiError.notFound('Invoice not found');
  const aggregate = await tx.paymentAllocation.aggregate({
    where: { invoiceId, payment: { companyId, status: 'POSTED' } },
    _sum: { amount: true },
  });
  const paid = roundMoney(aggregate._sum.amount ?? 0, invoice.currency);
  if (paid.gt(invoice.total)) throw ApiError.badRequest('Posted allocations exceed the invoice total');
  const balance = roundMoney(invoice.total.minus(paid), invoice.currency);
  const status = invoice.status === 'VOID' || invoice.status === 'DRAFT'
    ? invoice.status
    : paid.eq(invoice.total) ? 'PAID' : paid.gt(0) ? 'PARTIALLY_PAID' : 'ISSUED';
  return tx.invoice.update({ where: { id: invoiceId }, data: { paidAmount: paid, balance, status } });
}

export async function refreshBillPaymentState(tx: Tx, companyId: string, billId: string) {
  const bill = await tx.bill.findFirst({ where: { id: billId, companyId }, select: { id: true, status: true, total: true, currency: true } });
  if (!bill) throw ApiError.notFound('Bill not found');
  const aggregate = await tx.paymentAllocation.aggregate({
    where: { billId, payment: { companyId, status: 'POSTED' } },
    _sum: { amount: true },
  });
  const paid = roundMoney(aggregate._sum.amount ?? 0, bill.currency);
  if (paid.gt(bill.total)) throw ApiError.badRequest('Posted allocations exceed the bill total');
  const balance = roundMoney(bill.total.minus(paid), bill.currency);
  const status = bill.status === 'VOID' || bill.status === 'DRAFT'
    ? bill.status
    : paid.eq(bill.total) ? 'PAID' : paid.gt(0) ? 'PARTIALLY_PAID' : 'ISSUED';
  return tx.bill.update({ where: { id: billId }, data: { paidAmount: paid, balance, status } });
}
