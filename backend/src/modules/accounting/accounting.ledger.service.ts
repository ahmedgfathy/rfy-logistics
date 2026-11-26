import { Prisma, type JournalType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { money, roundMoney } from '../../lib/money';
import { ApiError } from '../../middleware/error';
import type { ManualJournalCreateBody, ManualJournalReverseBody } from './accounting.schemas';
import {
  assertBalanced,
  audit,
  documentCurrency,
  lockRows,
  nextAccountingNumber,
  postingPeriod,
  requireCompany,
  today,
  type Actor,
  type Tx,
} from './accounting.shared';

export interface PostJournalLine {
  accountId: string;
  debit: Prisma.Decimal.Value;
  credit: Prisma.Decimal.Value;
  description?: string | null;
  partnerId?: string | null;
  invoiceId?: string | null;
  billId?: string | null;
  paymentId?: string | null;
}

export interface PostJournalEntryInput {
  companyId: string;
  journalId?: string;
  journalType: JournalType;
  periodId?: string;
  entryDate: Date;
  description: string;
  sourceType: string | null;
  sourceId: string | null;
  currency: string;
  exchangeRate?: Prisma.Decimal.Value;
  lines: PostJournalLine[];
  reversedEntryId?: string;
  actor: Actor;
}

export const journalEntryInclude = {
  journal: { select: { id: true, code: true, nameEn: true, type: true } },
  period: { select: { id: true, number: true, name: true, status: true } },
  lines: {
    orderBy: [{ id: 'asc' }],
    include: {
      account: { select: { id: true, code: true, nameEn: true, type: true, normalBalance: true } },
      partner: { select: { id: true, code: true, nameEn: true } },
    },
  },
  reversedEntry: { select: { id: true, number: true, status: true } },
  reversals: { select: { id: true, number: true, status: true, entryDate: true } },
} satisfies Prisma.JournalEntryInclude;

export async function postJournalEntry(tx: Tx, input: PostJournalEntryInput) {
  const period = await postingPeriod(tx, input.companyId, input.entryDate, input.periodId);
  const exchangeRate = money(input.exchangeRate ?? 1);
  if (exchangeRate.lte(0)) throw ApiError.badRequest('Exchange rate must be positive');

  const lines = input.lines.map((line) => ({
    ...line,
    debit: roundMoney(line.debit, input.currency),
    credit: roundMoney(line.credit, input.currency),
  }));
  const totals = assertBalanced(lines, input.currency);

  let journalId = input.journalId;
  if (journalId) {
    const journal = await tx.journal.findFirst({ where: { id: journalId, companyId: input.companyId, isActive: true } });
    if (!journal) throw ApiError.badRequest('A valid active journal in this company is required');
    if (journal.type !== input.journalType) {
      throw ApiError.badRequest(`Selected journal must be of type ${input.journalType}`);
    }
    journalId = journal.id;
  } else {
    const journal = await tx.journal.findFirst({
      where: { companyId: input.companyId, type: input.journalType, isActive: true },
      orderBy: [{ isSystem: 'desc' }, { code: 'asc' }],
      select: { id: true },
    });
    if (!journal) throw ApiError.badRequest(`No active ${input.journalType} journal is configured`);
    journalId = journal.id;
  }

  const accountIds = [...new Set(lines.map((line) => line.accountId))];
  const accounts = await tx.account.findMany({ where: { id: { in: accountIds }, companyId: input.companyId } });
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  for (const accountId of accountIds) {
    const account = accountMap.get(accountId);
    if (!account || !account.isActive || !account.isPostable) {
      throw ApiError.badRequest('One or more journal accounts are invalid, inactive, or not postable');
    }
  }

  const partnerIds = [...new Set(lines.flatMap((line) => (line.partnerId ? [line.partnerId] : [])))];
  const invoiceIds = [...new Set(lines.flatMap((line) => (line.invoiceId ? [line.invoiceId] : [])))];
  const billIds = [...new Set(lines.flatMap((line) => (line.billId ? [line.billId] : [])))];
  const paymentIds = [...new Set(lines.flatMap((line) => (line.paymentId ? [line.paymentId] : [])))];
  const [partners, invoices, bills, payments] = await Promise.all([
    partnerIds.length ? tx.businessPartner.findMany({ where: { id: { in: partnerIds }, companyId: input.companyId }, select: { id: true } }) : [],
    invoiceIds.length ? tx.invoice.findMany({ where: { id: { in: invoiceIds }, companyId: input.companyId }, select: { id: true } }) : [],
    billIds.length ? tx.bill.findMany({ where: { id: { in: billIds }, companyId: input.companyId }, select: { id: true } }) : [],
    paymentIds.length ? tx.payment.findMany({ where: { id: { in: paymentIds }, companyId: input.companyId }, select: { id: true } }) : [],
  ]);
  if (partners.length !== partnerIds.length || invoices.length !== invoiceIds.length || bills.length !== billIds.length || payments.length !== paymentIds.length) {
    throw ApiError.badRequest('One or more journal line references are invalid or outside this company');
  }

  if (input.reversedEntryId) {
    const original = await tx.journalEntry.findFirst({
      where: { id: input.reversedEntryId, companyId: input.companyId, status: 'POSTED' },
      select: { id: true },
    });
    if (!original) throw ApiError.badRequest('Only a posted journal entry can be reversed');
    const existingReversal = await tx.journalEntry.findFirst({ where: { reversedEntryId: original.id }, select: { id: true } });
    if (existingReversal) throw new ApiError(409, 'ALREADY_REVERSED', 'This journal entry has already been reversed');
  }

  const number = await nextAccountingNumber(tx, input.companyId, 'JOURNAL', 'JV');
  const postedAt = new Date();
  const entry = await tx.journalEntry.create({
    data: {
      companyId: input.companyId,
      number,
      journalId,
      periodId: period.id,
      entryDate: input.entryDate,
      status: 'POSTED',
      description: input.description,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      currency: input.currency,
      exchangeRate,
      totalDebit: totals.debit,
      totalCredit: totals.credit,
      postedAt,
      postedById: input.actor.id,
      createdById: input.actor.id,
      reversedEntryId: input.reversedEntryId ?? null,
      lines: {
        create: lines.map((line) => ({
          accountId: line.accountId,
          debit: line.debit,
          credit: line.credit,
          description: line.description,
          partnerId: line.partnerId,
          invoiceId: line.invoiceId,
          billId: line.billId,
          paymentId: line.paymentId,
        })),
      },
    },
    include: journalEntryInclude,
  });

  await audit(tx, input.actor, input.reversedEntryId ? 'journal.reversed' : 'journal.posted', 'JournalEntry', entry.id, {
    number: entry.number,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    totalDebit: entry.totalDebit.toFixed(),
    totalCredit: entry.totalCredit.toFixed(),
    reversedEntryId: input.reversedEntryId ?? null,
  });
  return entry;
}

export async function createManualJournalEntry(
  tx: Tx,
  companyId: string,
  body: ManualJournalCreateBody,
  actor: Actor,
) {
  const company = await requireCompany(tx, companyId);
  const journal = await tx.journal.findFirst({
    where: { id: body.journalId, companyId, isActive: true },
    select: { id: true, type: true },
  });
  if (!journal || !['GENERAL', 'OPENING'].includes(journal.type)) {
    throw ApiError.badRequest('Manual entries require an active GENERAL or OPENING journal');
  }
  const currency = documentCurrency(company, body.currency, body.exchangeRate);
  return postJournalEntry(tx, {
    companyId,
    journalId: journal.id,
    journalType: journal.type,
    periodId: body.periodId ?? undefined,
    entryDate: body.entryDate ?? today(),
    description: body.description,
    sourceType: 'MANUAL',
    sourceId: null,
    currency: currency.currency,
    exchangeRate: currency.exchangeRate,
    lines: body.lines,
    actor,
  });
}

export async function reverseManualJournalEntry(
  tx: Tx,
  companyId: string,
  id: string,
  body: ManualJournalReverseBody,
  actor: Actor,
) {
  await lockRows(tx, 'JournalEntry', [id]);
  const original = await tx.journalEntry.findFirst({
    where: { id, companyId },
    include: { lines: { select: { invoiceId: true, billId: true, paymentId: true } } },
  });
  if (!original) throw ApiError.notFound('Journal entry not found');
  if (original.sourceType !== 'MANUAL') {
    throw ApiError.badRequest('Only manual journal entries can be reversed here; void their source documents instead');
  }
  if (original.reversedEntryId) {
    throw new ApiError(409, 'INVALID_STATE', 'A reversal entry cannot itself be reversed');
  }
  if (original.lines.some((line) => line.invoiceId || line.billId || line.paymentId)) {
    throw ApiError.badRequest('Manual entries linked to financial documents must be reversed through those documents');
  }
  const matched = await tx.reconciliationItem.count({ where: { journalLine: { entryId: id } } });
  if (matched > 0) {
    throw new ApiError(409, 'ENTRY_RECONCILED', 'Unmatch reconciled journal lines before reversing this entry');
  }
  return reverseJournalEntry(tx, companyId, id, body.entryDate ?? today(), body.reason, actor);
}

export async function reverseJournalEntry(
  tx: Tx,
  companyId: string,
  originalEntryId: string,
  entryDate: Date,
  reason: string,
  actor: Actor,
) {
  await lockRows(tx, 'JournalEntry', [originalEntryId]);
  const original = await tx.journalEntry.findFirst({
    where: { id: originalEntryId, companyId },
    include: { lines: true, journal: { select: { type: true } } },
  });
  if (!original) throw ApiError.notFound('Posted journal entry not found');
  if (original.status !== 'POSTED') throw new ApiError(409, 'INVALID_STATE', 'Only a posted journal entry can be voided');
  const existing = await tx.journalEntry.findFirst({ where: { reversedEntryId: original.id }, select: { id: true } });
  if (existing) throw new ApiError(409, 'ALREADY_REVERSED', 'This journal entry has already been reversed');

  return postJournalEntry(tx, {
    companyId,
    journalId: original.journalId,
    journalType: original.journal.type,
    periodId: undefined,
    entryDate,
    description: `Reversal of ${original.number}: ${reason}`,
    sourceType: original.sourceType,
    sourceId: original.sourceId,
    currency: original.currency,
    exchangeRate: original.exchangeRate,
    reversedEntryId: original.id,
    actor,
    lines: original.lines.map((line) => ({
      accountId: line.accountId,
      debit: line.credit,
      credit: line.debit,
      description: line.description ? `Reversal: ${line.description}` : 'Reversal',
      partnerId: line.partnerId,
      invoiceId: line.invoiceId,
      billId: line.billId,
      paymentId: line.paymentId,
    })),
  });
}

export async function getJournalEntry(companyId: string, id: string) {
  const entry = await prisma.journalEntry.findFirst({ where: { id, companyId }, include: journalEntryInclude });
  if (!entry) throw ApiError.notFound('Journal entry not found');
  return entry;
}

export async function reversePostedEntryForDocument(
  tx: Tx,
  companyId: string,
  entryId: string,
  entryDate: Date,
  reason: string,
  actor: Actor,
) {
  return reverseJournalEntry(tx, companyId, entryId, entryDate, reason, actor);
}
