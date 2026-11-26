import { Prisma } from '@prisma/client';
import { money, roundMoney, sumMoney } from '../../lib/money';
import { ApiError } from '../../middleware/error';
import type { ReconciliationCreateBody, ReconciliationItemUpdateBody, ReconciliationReasonBody, ReconciliationUpdateBody } from './accounting.schemas';
import {
  assertDateOrder,
  audit,
  lockRows,
  requireBankAccount,
  requireCompany,
  type Actor,
  type Tx,
} from './accounting.shared';

export const reconciliationInclude = {
  bankAccount: {
    select: {
      id: true,
      code: true,
      name: true,
      currency: true,
      accountId: true,
      account: { select: { id: true, code: true, nameEn: true } },
    },
  },
  items: {
    orderBy: [{ statementDate: 'asc' }, { id: 'asc' }],
    include: {
      payment: { select: { id: true, number: true, direction: true, status: true, amount: true, paymentDate: true } },
      journalLine: {
        select: {
          id: true,
          debit: true,
          credit: true,
          description: true,
          paymentId: true,
          account: { select: { id: true, code: true, nameEn: true } },
          entry: { select: { id: true, number: true, status: true, entryDate: true, currency: true } },
        },
      },
    },
  },
} satisfies Prisma.ReconciliationInclude;

export async function getReconciliationTx(tx: Tx, companyId: string, id: string) {
  const reconciliation = await tx.reconciliation.findFirst({ where: { id, companyId }, include: reconciliationInclude });
  if (!reconciliation) throw ApiError.notFound('Bank reconciliation not found');
  return reconciliation;
}

function assertStatementBalances(reconciliation: { openingBalance: Prisma.Decimal; closingBalance: Prisma.Decimal; items: Array<{ amount: Prisma.Decimal }> }, currency: string) {
  const statementNet = roundMoney(sumMoney(reconciliation.items.map((item) => item.amount)), currency);
  const expectedClosing = roundMoney(reconciliation.openingBalance.plus(statementNet), currency);
  if (!expectedClosing.eq(reconciliation.closingBalance)) {
    throw ApiError.badRequest('Closing balance must equal opening balance plus statement items');
  }
}

export async function createReconciliation(tx: Tx, companyId: string, body: ReconciliationCreateBody, actor: Actor) {
  const company = await requireCompany(tx, companyId);
  const bankAccount = await requireBankAccount(tx, companyId, body.bankAccountId);
  if (bankAccount.currency.toUpperCase() !== company.baseCurrency.toUpperCase()) {
    throw ApiError.badRequest('Reconciliation currency must match the company base currency');
  }
  const openingBalance = money(body.openingBalance);
  const closingBalance = money(body.closingBalance);
  const items = body.items.map((item) => ({ ...item, amount: money(item.amount) }));
  assertStatementBalances({ openingBalance, closingBalance, items }, company.baseCurrency);
  const created = await tx.reconciliation.create({
    data: {
      companyId,
      bankAccountId: bankAccount.id,
      statementStart: body.statementStart,
      statementEnd: body.statementEnd,
      openingBalance,
      closingBalance,
      status: 'DRAFT',
      items: { create: items },
    },
  });
  await audit(tx, actor, 'reconciliation.created', 'Reconciliation', created.id, {
    bankAccountId: bankAccount.id,
    statementStart: body.statementStart,
    statementEnd: body.statementEnd,
    closingBalance: closingBalance.toFixed(),
  });
  return getReconciliationTx(tx, companyId, created.id);
}

async function requireEditableReconciliation(tx: Tx, companyId: string, id: string) {
  await lockRows(tx, 'Reconciliation', [id]);
  const reconciliation = await getReconciliationTx(tx, companyId, id);
  if (reconciliation.status !== 'DRAFT') {
    throw new ApiError(409, 'INVALID_STATE', 'Only a draft reconciliation can be changed');
  }
  return reconciliation;
}

export async function updateReconciliation(
  tx: Tx,
  companyId: string,
  id: string,
  body: ReconciliationUpdateBody,
  actor: Actor,
) {
  const existing = await requireEditableReconciliation(tx, companyId, id);
  const statementStart = body.statementStart ?? existing.statementStart;
  const statementEnd = body.statementEnd ?? existing.statementEnd;
  assertDateOrder(statementStart, statementEnd);
  if (existing.items.some((item) => item.statementDate < statementStart || item.statementDate > statementEnd)) {
    throw ApiError.badRequest('Every statement item must fall within the statement period');
  }
  let bankAccountId = existing.bankAccountId;
  if (body.bankAccountId && body.bankAccountId !== existing.bankAccountId) {
    if (existing.items.some((item) => item.matchStatus === 'MATCHED')) {
      throw new ApiError(409, 'RECONCILIATION_MATCHED', 'Unmatch all items before changing the bank account');
    }
    await requireBankAccount(tx, companyId, body.bankAccountId);
    bankAccountId = body.bankAccountId;
  }
  const openingBalance = money(body.openingBalance ?? existing.openingBalance);
  const closingBalance = money(body.closingBalance ?? existing.closingBalance);
  assertStatementBalances({ openingBalance, closingBalance, items: existing.items }, existing.bankAccount.currency);
  const updated = await tx.reconciliation.update({
    where: { id },
    data: {
      bankAccountId,
      statementStart,
      statementEnd,
      openingBalance,
      closingBalance,
    },
    include: reconciliationInclude,
  });
  await audit(tx, actor, 'reconciliation.header_updated', 'Reconciliation', id, {
    before: {
      bankAccountId: existing.bankAccountId,
      statementStart: existing.statementStart,
      statementEnd: existing.statementEnd,
      openingBalance: existing.openingBalance.toFixed(),
      closingBalance: existing.closingBalance.toFixed(),
    },
    after: {
      bankAccountId: updated.bankAccountId,
      statementStart: updated.statementStart,
      statementEnd: updated.statementEnd,
      openingBalance: updated.openingBalance.toFixed(),
      closingBalance: updated.closingBalance.toFixed(),
    },
    reason: body.reason,
  });
  return getReconciliationTx(tx, companyId, id);
}

export async function updateReconciliationItem(
  tx: Tx,
  companyId: string,
  reconciliationId: string,
  itemId: string,
  body: ReconciliationItemUpdateBody,
  actor: Actor,
) {
  const reconciliation = await requireEditableReconciliation(tx, companyId, reconciliationId);
  await lockRows(tx, 'ReconciliationItem', [itemId]);
  const item = await requireScoped(await tx.reconciliationItem.findFirst({ where: { id: itemId, reconciliationId } }), 'Reconciliation item');
  if (item.matchStatus === 'MATCHED') {
    throw new ApiError(409, 'RECONCILIATION_MATCHED', 'Unmatch this item before editing it');
  }
  const statementDate = body.statementDate ?? item.statementDate;
  if (statementDate < reconciliation.statementStart || statementDate > reconciliation.statementEnd) {
    throw ApiError.badRequest('Statement date must fall within the statement period');
  }
  const updatedItem = {
    statementDate,
    description: body.description ?? item.description,
    amount: money(body.amount ?? item.amount),
    reference: body.reference !== undefined ? body.reference : item.reference,
  };
  const candidateItems = reconciliation.items.map((entry) => entry.id === itemId ? updatedItem : entry);
  const statementNet = roundMoney(sumMoney(candidateItems.map((entry) => entry.amount)), reconciliation.bankAccount.currency);
  const closingBalance = roundMoney(reconciliation.openingBalance.plus(statementNet), reconciliation.bankAccount.currency);
  await tx.reconciliationItem.update({
    where: { id: itemId },
    data: { ...updatedItem, matchStatus: 'UNMATCHED', paymentId: null, journalLineId: null },
  });
  await tx.reconciliation.update({ where: { id: reconciliationId }, data: { closingBalance } });
  await audit(tx, actor, 'reconciliation.item_updated', 'ReconciliationItem', itemId, {
    reconciliationId,
    before: {
      statementDate: item.statementDate,
      description: item.description,
      amount: item.amount.toFixed(),
      reference: item.reference,
    },
    after: { ...updatedItem, amount: updatedItem.amount.toFixed() },
    closingBalance: closingBalance.toFixed(),
    reason: body.reason,
  });
  return getReconciliationTx(tx, companyId, reconciliationId);
}

export async function deleteDraftReconciliation(
  tx: Tx,
  companyId: string,
  id: string,
  body: ReconciliationReasonBody,
  actor: Actor,
) {
  const reconciliation = await requireEditableReconciliation(tx, companyId, id);
  if (reconciliation.items.some((item) => item.matchStatus === 'MATCHED')) {
    throw new ApiError(409, 'RECONCILIATION_MATCHED', 'Unmatch all statement items before deleting the reconciliation');
  }
  await audit(tx, actor, 'reconciliation.deleted', 'Reconciliation', id, {
    bankAccountId: reconciliation.bankAccountId,
    statementStart: reconciliation.statementStart,
    statementEnd: reconciliation.statementEnd,
    openingBalance: reconciliation.openingBalance.toFixed(),
    closingBalance: reconciliation.closingBalance.toFixed(),
    itemIds: reconciliation.items.map((item) => item.id),
    reason: body.reason,
  });
  await tx.reconciliation.delete({ where: { id } });
  return { id, deleted: true };
}

export async function reopenReconciliation(
  tx: Tx,
  companyId: string,
  id: string,
  body: ReconciliationReasonBody,
  actor: Actor,
) {
  await lockRows(tx, 'Reconciliation', [id]);
  const reconciliation = await getReconciliationTx(tx, companyId, id);
  if (reconciliation.status !== 'REVIEWED') {
    throw new ApiError(409, 'INVALID_STATE', 'Only a reviewed reconciliation can be reopened');
  }
  await tx.reconciliation.update({ where: { id }, data: { status: 'DRAFT', reviewedById: null } });
  await audit(tx, actor, 'reconciliation.reopened', 'Reconciliation', id, {
    from: reconciliation.status,
    to: 'DRAFT',
    reviewedById: reconciliation.reviewedById,
    reason: body.reason,
  });
  return getReconciliationTx(tx, companyId, id);
}

async function requireScoped<T>(record: T | null, label: string): Promise<T> {
  if (!record) throw ApiError.notFound(`${label} not found`);
  return record;
}

async function ensureTargetAvailable(
  tx: Tx,
  companyId: string,
  currentItemId: string,
  target: { paymentId?: string; journalLineId?: string; linkedPaymentId?: string | null },
) {
  const conditions: Prisma.ReconciliationItemWhereInput[] = [];
  if (target.paymentId) {
    conditions.push({ paymentId: target.paymentId });
    conditions.push({ journalLine: { paymentId: target.paymentId } });
  }
  if (target.linkedPaymentId) conditions.push({ paymentId: target.linkedPaymentId });
  if (target.journalLineId) conditions.push({ journalLineId: target.journalLineId });
  if (!conditions.length) return;
  const existing = await tx.reconciliationItem.findFirst({
    where: { id: { not: currentItemId }, reconciliation: { companyId }, OR: conditions },
    select: { id: true },
  });
  if (existing) throw new ApiError(409, 'ALREADY_MATCHED', 'This financial transaction is already matched to a reconciliation item');
}

export async function matchReconciliationItem(
  tx: Tx,
  companyId: string,
  reconciliationId: string,
  itemId: string,
  body: { paymentId?: string; journalLineId?: string },
  actor: Actor,
) {
  const reconciliation = await requireEditableReconciliation(tx, companyId, reconciliationId);
  await lockRows(tx, 'ReconciliationItem', [itemId]);
  const item = await tx.reconciliationItem.findFirst({ where: { id: itemId, reconciliationId } });
  if (!item) throw ApiError.notFound('Reconciliation item not found');
  if (item.matchStatus === 'MATCHED') throw new ApiError(409, 'INVALID_STATE', 'Unmatch this item before matching it again');

  if (body.paymentId) {
    const payment = await tx.payment.findFirst({
      where: { id: body.paymentId, companyId, status: 'POSTED' },
      select: { id: true, amount: true, direction: true, paymentDate: true, bankAccountId: true, currency: true },
    });
    if (!payment || payment.bankAccountId !== reconciliation.bankAccountId) {
      throw ApiError.badRequest('Payment must be posted to this reconciliation bank account');
    }
    if (payment.paymentDate < reconciliation.statementStart || payment.paymentDate > reconciliation.statementEnd) {
      throw ApiError.badRequest('Payment date is outside the statement period');
    }
    if (payment.currency.toUpperCase() !== reconciliation.bankAccount.currency.toUpperCase()) {
      throw ApiError.badRequest('Payment currency does not match the bank account');
    }
    const expected = roundMoney(payment.direction === 'RECEIPT' ? payment.amount : payment.amount.neg(), reconciliation.bankAccount.currency);
    if (!expected.eq(item.amount)) throw ApiError.badRequest('Statement amount does not match the payment amount and direction');
    await ensureTargetAvailable(tx, companyId, item.id, { paymentId: payment.id });
    await tx.reconciliationItem.update({
      where: { id: item.id },
      data: { matchStatus: 'MATCHED', paymentId: payment.id, journalLineId: null },
    });
  } else if (body.journalLineId) {
    const line = await tx.journalLine.findFirst({
      where: {
        id: body.journalLineId,
        accountId: reconciliation.bankAccount.accountId,
        entry: { companyId, status: 'POSTED' },
      },
      select: { id: true, debit: true, credit: true, paymentId: true, entry: { select: { entryDate: true, currency: true } } },
    });
    if (!line) throw ApiError.badRequest('Journal line must be a posted line for this bank account');
    if (line.entry.entryDate < reconciliation.statementStart || line.entry.entryDate > reconciliation.statementEnd) {
      throw ApiError.badRequest('Journal line date is outside the statement period');
    }
    if (line.entry.currency.toUpperCase() !== reconciliation.bankAccount.currency.toUpperCase()) {
      throw ApiError.badRequest('Journal line currency does not match the bank account');
    }
    const expected = roundMoney(line.debit.minus(line.credit), reconciliation.bankAccount.currency);
    if (expected.isZero() || !expected.eq(item.amount)) {
      throw ApiError.badRequest('Statement amount does not match the signed bank journal line');
    }
    await ensureTargetAvailable(tx, companyId, item.id, { journalLineId: line.id, linkedPaymentId: line.paymentId });
    await tx.reconciliationItem.update({
      where: { id: item.id },
      data: { matchStatus: 'MATCHED', journalLineId: line.id, paymentId: null },
    });
  } else {
    throw ApiError.badRequest('A payment or journal line is required');
  }

  await audit(tx, actor, 'reconciliation.item_matched', 'ReconciliationItem', item.id, {
    reconciliationId,
    paymentId: body.paymentId ?? null,
    journalLineId: body.journalLineId ?? null,
  });
  return getReconciliationTx(tx, companyId, reconciliationId);
}

export async function unmatchReconciliationItem(
  tx: Tx,
  companyId: string,
  reconciliationId: string,
  itemId: string,
  body: { reason?: string | null },
  actor: Actor,
) {
  await requireEditableReconciliation(tx, companyId, reconciliationId);
  await lockRows(tx, 'ReconciliationItem', [itemId]);
  const item = await tx.reconciliationItem.findFirst({ where: { id: itemId, reconciliationId } });
  if (!item) throw ApiError.notFound('Reconciliation item not found');
  if (item.matchStatus === 'UNMATCHED') return getReconciliationTx(tx, companyId, reconciliationId);
  await tx.reconciliationItem.update({
    where: { id: item.id },
    data: { matchStatus: 'UNMATCHED', paymentId: null, journalLineId: null },
  });
  await audit(tx, actor, 'reconciliation.item_unmatched', 'ReconciliationItem', item.id, { reconciliationId, reason: body.reason ?? null });
  return getReconciliationTx(tx, companyId, reconciliationId);
}

async function requireAllItemsMatched(reconciliation: Prisma.ReconciliationGetPayload<{ include: typeof reconciliationInclude }>) {
  const unmatched = reconciliation.items.filter((item) => item.matchStatus !== 'MATCHED');
  if (unmatched.length) throw ApiError.badRequest('All statement items must be matched before review or approval');
  assertStatementBalances(reconciliation, reconciliation.bankAccount.currency);
}

export async function reviewReconciliation(tx: Tx, companyId: string, id: string, actor: Actor) {
  const reconciliation = await requireEditableReconciliation(tx, companyId, id);
  requireAllItemsMatched(reconciliation);
  await tx.reconciliation.update({ where: { id }, data: { status: 'REVIEWED', reviewedById: actor.id } });
  await audit(tx, actor, 'reconciliation.reviewed', 'Reconciliation', id, { bankAccountId: reconciliation.bankAccountId });
  return getReconciliationTx(tx, companyId, id);
}

export async function approveReconciliation(tx: Tx, companyId: string, id: string, actor: Actor) {
  await lockRows(tx, 'Reconciliation', [id]);
  const reconciliation = await getReconciliationTx(tx, companyId, id);
  if (!['DRAFT', 'REVIEWED'].includes(reconciliation.status)) {
    throw new ApiError(409, 'INVALID_STATE', 'Only a draft or reviewed reconciliation can be approved');
  }
  requireAllItemsMatched(reconciliation);
  const approvedAt = new Date();
  await tx.reconciliation.update({
    where: { id },
    data: { status: 'APPROVED', reviewedById: reconciliation.reviewedById ?? actor.id, approvedById: actor.id, approvedAt },
  });
  await audit(tx, actor, 'reconciliation.approved', 'Reconciliation', id, { bankAccountId: reconciliation.bankAccountId, approvedAt });
  return getReconciliationTx(tx, companyId, id);
}
