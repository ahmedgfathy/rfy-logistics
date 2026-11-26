import { Prisma } from '@prisma/client';
import { money, roundMoney, sumMoney } from '../../lib/money';
import { ApiError } from '../../middleware/error';
import type { PaymentCreateBody } from './accounting.schemas';
import {
  audit,
  documentCurrency,
  lockRows,
  nextAccountingNumber,
  requiredSystemAccount,
  requireBankAccount,
  requireCompany,
  systemAccountMap,
  today,
  type Actor,
  type Tx,
} from './accounting.shared';
import { postJournalEntry, reversePostedEntryForDocument } from './accounting.ledger.service';
import {
  refreshBillPaymentState,
  refreshInvoicePaymentState,
} from './accounting.documents.service';

const partnerSelect = { id: true, code: true, nameEn: true, nameAr: true };
const documentSelect = { id: true, number: true, status: true, total: true, paidAmount: true, balance: true, currency: true };

export const paymentInclude = {
  partner: { select: partnerSelect },
  bankAccount: { select: { id: true, code: true, name: true, currency: true, accountId: true } },
  allocations: {
    orderBy: [{ createdAt: 'asc' }],
    include: {
      invoice: { select: documentSelect },
      bill: { select: documentSelect },
    },
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
  reconciliationItems: { select: { id: true, reconciliationId: true, reconciliation: { select: { status: true } } } },
} satisfies Prisma.PaymentInclude;

export async function getPaymentTx(tx: Tx, companyId: string, id: string) {
  const payment = await tx.payment.findFirst({ where: { id, companyId }, include: paymentInclude });
  if (!payment) throw ApiError.notFound('Payment not found');
  return payment;
}

function allocationTotal(payment: { amount: Prisma.Decimal; allocations: Array<{ amount: Prisma.Decimal }> }, currency: string) {
  const total = roundMoney(sumMoney(payment.allocations.map((allocation) => allocation.amount)), currency);
  if (total.gt(payment.amount)) throw ApiError.badRequest('Payment allocations cannot exceed the payment amount');
  return total;
}

async function paymentBankAccount(
  tx: Tx,
  companyId: string,
  method: PaymentCreateBody['method'],
  bankAccountId?: string | null,
) {
  if (method === 'CASH') {
    if (bankAccountId) throw ApiError.badRequest('Cash payments cannot be assigned to a bank account');
    const accounts = await systemAccountMap(tx, companyId, ['CASH']);
    return { accountId: requiredSystemAccount(accounts, 'CASH', 'ASSET').id, bankAccountId: null as string | null };
  }
  if (!bankAccountId) throw ApiError.badRequest('A bank account is required for non-cash payments');
  const bankAccount = await requireBankAccount(tx, companyId, bankAccountId);
  return { accountId: bankAccount.accountId, bankAccountId: bankAccount.id };
}

async function validateAllocationDocuments(
  tx: Tx,
  companyId: string,
  direction: PaymentCreateBody['direction'],
  partnerId: string,
  currency: string,
  allocations: Array<{ invoiceId?: string | null; billId?: string | null; amount: Prisma.Decimal }>,
) {
  const invoiceIds = [...new Set(allocations.flatMap((item) => (item.invoiceId ? [item.invoiceId] : [])))];
  const billIds = [...new Set(allocations.flatMap((item) => (item.billId ? [item.billId] : [])))];
  if (direction === 'RECEIPT' && billIds.length) throw ApiError.badRequest('Receipts can only be allocated to invoices');
  if (direction === 'PAYMENT' && invoiceIds.length) throw ApiError.badRequest('Vendor payments can only be allocated to bills');
  await lockRows(tx, 'Invoice', invoiceIds);
  await lockRows(tx, 'Bill', billIds);

  const [invoices, bills] = await Promise.all([
    invoiceIds.length
      ? tx.invoice.findMany({
          where: { id: { in: invoiceIds }, companyId },
          select: { id: true, customerId: true, currency: true, status: true, postedEntryId: true, total: true },
        })
      : [],
    billIds.length
      ? tx.bill.findMany({
          where: { id: { in: billIds }, companyId },
          select: { id: true, vendorId: true, currency: true, status: true, postedEntryId: true, total: true },
        })
      : [],
  ]);
  if (invoices.length !== invoiceIds.length || bills.length !== billIds.length) {
    throw ApiError.badRequest('One or more allocation documents are invalid or outside this company');
  }

  for (const allocation of allocations) {
    const invoice = allocation.invoiceId ? invoices.find((item) => item.id === allocation.invoiceId) : undefined;
    const bill = allocation.billId ? bills.find((item) => item.id === allocation.billId) : undefined;
    const document = invoice ?? bill;
    if (!document || !document.postedEntryId || !['ISSUED', 'PARTIALLY_PAID', 'PAID'].includes(document.status)) {
      throw ApiError.badRequest('Allocations require an issued, posted invoice or bill');
    }
    const documentPartnerId = invoice ? invoice.customerId : bill?.vendorId;
    if (documentPartnerId !== partnerId) throw ApiError.badRequest('Allocation document must belong to the payment partner');
    if (document.currency.toUpperCase() !== currency.toUpperCase()) {
      throw ApiError.badRequest('Allocation document currency must match the payment currency');
    }
    const paidAggregate = invoice
      ? await tx.paymentAllocation.aggregate({ where: { invoiceId: invoice.id, payment: { companyId, status: 'POSTED' } }, _sum: { amount: true } })
      : await tx.paymentAllocation.aggregate({ where: { billId: bill!.id, payment: { companyId, status: 'POSTED' } }, _sum: { amount: true } });
    const paid = roundMoney(paidAggregate._sum.amount ?? 0, currency);
    const available = roundMoney(document.total.minus(paid), currency);
    if (allocation.amount.gt(available)) {
      throw new ApiError(409, 'ALLOCATION_EXCEEDS_BALANCE', `Allocation exceeds the balance of ${document.id}`);
    }
  }
}

export async function createPayment(tx: Tx, companyId: string, body: PaymentCreateBody, actor: Actor) {
  const company = await requireCompany(tx, companyId);
  const currency = documentCurrency(company, body.currency, body.exchangeRate);
  const partner = await tx.businessPartner.findFirst({
    where: {
      id: body.partnerId,
      companyId,
      deletedAt: null,
      status: 'ACTIVE',
      type: body.direction === 'RECEIPT' ? { in: ['CUSTOMER', 'BOTH'] } : { in: ['VENDOR', 'BOTH'] },
    },
    select: { id: true },
  });
  if (!partner) throw ApiError.badRequest(`A valid active ${body.direction === 'RECEIPT' ? 'customer' : 'vendor'} is required`);
  const bank = await paymentBankAccount(tx, companyId, body.method, body.bankAccountId);
  const amount = money(body.amount);
  const allocations = body.allocations.map((allocation) => ({ ...allocation, amount: money(allocation.amount) }));
  const allocated = roundMoney(sumMoney(allocations.map((allocation) => allocation.amount)), currency.currency);
  if (allocated.gt(amount)) throw ApiError.badRequest('Payment allocations cannot exceed the payment amount');
  await validateAllocationDocuments(tx, companyId, body.direction, partner.id, currency.currency, allocations);

  const number = await nextAccountingNumber(tx, companyId, 'PAYMENT', 'PAY');
  const created = await tx.payment.create({
    data: {
      companyId,
      number,
      direction: body.direction,
      partnerId: partner.id,
      method: body.method,
      bankAccountId: bank.bankAccountId,
      paymentDate: body.paymentDate,
      ...currency,
      amount,
      reference: body.reference ?? null,
      notes: body.notes ?? null,
      status: 'DRAFT',
      createdById: actor.id,
      allocations: {
        create: allocations.map((allocation) => ({
          invoiceId: allocation.invoiceId ?? null,
          billId: allocation.billId ?? null,
          amount: allocation.amount,
        })),
      },
    },
  });
  await audit(tx, actor, 'payment.created', 'Payment', created.id, {
    number,
    direction: body.direction,
    partnerId: partner.id,
    amount: amount.toFixed(),
    allocated: allocated.toFixed(),
  });
  return getPaymentTx(tx, companyId, created.id);
}

async function requireEditablePaymentDraft(tx: Tx, companyId: string, id: string) {
  await lockRows(tx, 'Payment', [id]);
  const payment = await tx.payment.findFirst({ where: { id, companyId }, select: { status: true, postedEntryId: true } });
  if (!payment) throw ApiError.notFound('Payment not found');
  if (payment.status !== 'DRAFT' || payment.postedEntryId) {
    throw new ApiError(409, 'INVALID_STATE', 'Only an unposted draft payment can be edited or deleted');
  }
  const matched = await tx.reconciliationItem.count({ where: { paymentId: id } });
  if (matched) throw new ApiError(409, 'PAYMENT_RECONCILED', 'Unmatch reconciled statement items before editing or deleting this payment');
}

export async function updatePaymentDraft(tx: Tx, companyId: string, id: string, body: PaymentCreateBody, actor: Actor) {
  await requireEditablePaymentDraft(tx, companyId, id);
  const company = await requireCompany(tx, companyId);
  const currency = documentCurrency(company, body.currency, body.exchangeRate);
  const partner = await tx.businessPartner.findFirst({
    where: {
      id: body.partnerId,
      companyId,
      deletedAt: null,
      status: 'ACTIVE',
      type: body.direction === 'RECEIPT' ? { in: ['CUSTOMER', 'BOTH'] } : { in: ['VENDOR', 'BOTH'] },
    },
    select: { id: true },
  });
  if (!partner) throw ApiError.badRequest(`A valid active ${body.direction === 'RECEIPT' ? 'customer' : 'vendor'} is required`);
  const bank = await paymentBankAccount(tx, companyId, body.method, body.bankAccountId);
  const amount = money(body.amount);
  const allocations = body.allocations.map((allocation) => ({ ...allocation, amount: money(allocation.amount) }));
  const allocated = roundMoney(sumMoney(allocations.map((allocation) => allocation.amount)), currency.currency);
  if (allocated.gt(amount)) throw ApiError.badRequest('Payment allocations cannot exceed the payment amount');
  await validateAllocationDocuments(tx, companyId, body.direction, partner.id, currency.currency, allocations);
  const updatedRecord = await tx.payment.update({
    where: { id },
    data: {
      direction: body.direction,
      partnerId: partner.id,
      method: body.method,
      bankAccountId: bank.bankAccountId,
      paymentDate: body.paymentDate,
      reference: body.reference ?? null,
      notes: body.notes ?? null,
      ...currency,
      amount,
      version: { increment: 1 },
    },
  });
  await tx.paymentAllocation.deleteMany({ where: { paymentId: id } });
  if (allocations.length) {
    await tx.paymentAllocation.createMany({
      data: allocations.map((allocation) => ({
        paymentId: id,
        invoiceId: allocation.invoiceId ?? null,
        billId: allocation.billId ?? null,
        amount: allocation.amount,
      })),
    });
  }
  const updated = await getPaymentTx(tx, companyId, updatedRecord.id);
  await audit(tx, actor, 'payment.updated', 'Payment', id, { number: updated.number, amount: amount.toFixed(), allocated: allocated.toFixed() });
  return updated;
}

export async function deletePaymentDraft(tx: Tx, companyId: string, id: string, actor: Actor) {
  await requireEditablePaymentDraft(tx, companyId, id);
  const existing = await getPaymentTx(tx, companyId, id);
  await audit(tx, actor, 'payment.deleted', 'Payment', id, { number: existing.number, amount: existing.amount.toFixed() });
  await tx.payment.delete({ where: { id } });
  return { id, number: existing.number, deleted: true };
}

export async function postPayment(
  tx: Tx,
  companyId: string,
  id: string,
  body: { entryDate?: Date; journalId?: string; periodId?: string; description?: string | null },
  actor: Actor,
) {
  await lockRows(tx, 'Payment', [id]);
  const payment = await getPaymentTx(tx, companyId, id);
  if (payment.status !== 'DRAFT' || payment.postedEntryId) {
    throw new ApiError(409, 'INVALID_STATE', 'Only an unposted draft payment can be posted');
  }
  allocationTotal(payment, payment.currency);
  await validateAllocationDocuments(tx, companyId, payment.direction, payment.partnerId, payment.currency, payment.allocations);
  const bank = await paymentBankAccount(tx, companyId, payment.method, payment.bankAccountId);
  const accounts = await systemAccountMap(tx, companyId, [payment.direction === 'RECEIPT' ? 'AR' : 'AP']);
  const control = requiredSystemAccount(accounts, payment.direction === 'RECEIPT' ? 'AR' : 'AP', payment.direction === 'RECEIPT' ? 'ASSET' : 'LIABILITY');
  const lines = payment.direction === 'RECEIPT'
    ? [
        { accountId: bank.accountId, debit: payment.amount, credit: money(0), description: `Receipt ${payment.number}`, paymentId: payment.id },
        { accountId: control.id, debit: money(0), credit: payment.amount, description: `Accounts receivable — ${payment.number}`, partnerId: payment.partnerId, paymentId: payment.id },
      ]
    : [
        { accountId: control.id, debit: payment.amount, credit: money(0), description: `Accounts payable — ${payment.number}`, partnerId: payment.partnerId, paymentId: payment.id },
        { accountId: bank.accountId, debit: money(0), credit: payment.amount, description: `Vendor payment ${payment.number}`, paymentId: payment.id },
      ];
  const entry = await postJournalEntry(tx, {
    companyId,
    journalId: body.journalId,
    journalType: payment.method === 'CASH' ? 'CASH' : 'BANK',
    periodId: body.periodId,
    entryDate: body.entryDate ?? payment.paymentDate,
    description: body.description ?? `${payment.direction === 'RECEIPT' ? 'Receipt' : 'Payment'} ${payment.number}`,
    sourceType: 'Payment',
    sourceId: payment.id,
    currency: payment.currency,
    exchangeRate: payment.exchangeRate,
    lines,
    actor,
  });
  const postedAt = new Date();
  await tx.payment.update({
    where: { id },
    data: { status: 'POSTED', postedEntryId: entry.id, postedById: actor.id, postedAt, version: { increment: 1 } },
  });
  for (const allocation of payment.allocations) {
    if (allocation.invoiceId) await refreshInvoicePaymentState(tx, companyId, allocation.invoiceId);
    if (allocation.billId) await refreshBillPaymentState(tx, companyId, allocation.billId);
  }
  await audit(tx, actor, 'payment.posted', 'Payment', id, { number: payment.number, entryId: entry.id, amount: payment.amount.toFixed() });
  return getPaymentTx(tx, companyId, id);
}

export async function voidPayment(
  tx: Tx,
  companyId: string,
  id: string,
  body: { entryDate?: Date; reason: string },
  actor: Actor,
) {
  await lockRows(tx, 'Payment', [id]);
  const payment = await getPaymentTx(tx, companyId, id);
  if (payment.status !== 'POSTED' || !payment.postedEntryId) {
    throw new ApiError(409, 'INVALID_STATE', 'Only a posted payment can be voided');
  }
  const matched = await tx.reconciliationItem.count({ where: { OR: [{ paymentId: id }, { journalLine: { entryId: payment.postedEntryId } }] } });
  if (matched > 0) throw new ApiError(409, 'PAYMENT_RECONCILED', 'Unmatch reconciled statement items before voiding this payment');
  const reversal = await reversePostedEntryForDocument(tx, companyId, payment.postedEntryId, body.entryDate ?? today(), body.reason, actor);
  await tx.payment.update({ where: { id }, data: { status: 'VOID', version: { increment: 1 } } });
  for (const allocation of payment.allocations) {
    if (allocation.invoiceId) await refreshInvoicePaymentState(tx, companyId, allocation.invoiceId);
    if (allocation.billId) await refreshBillPaymentState(tx, companyId, allocation.billId);
  }
  await audit(tx, actor, 'payment.voided', 'Payment', id, { number: payment.number, reason: body.reason, reversalEntryId: reversal.id });
  return getPaymentTx(tx, companyId, id);
}
