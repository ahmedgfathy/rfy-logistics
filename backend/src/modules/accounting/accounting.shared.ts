import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { Prisma, type Account, type AccountType, type PeriodStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { money, roundMoney, sumMoney } from '../../lib/money';
import { nextNumber } from '../../lib/numbers';
import { readIdempotentResponse, requireIdempotencyKey, saveIdempotentResponse } from '../../lib/idempotency';
import { ApiError } from '../../middleware/error';
import { recordAuditTx } from '../../services/audit.service';

export type Tx = Prisma.TransactionClient;
export interface Actor {
  id: string;
  ip?: string | null;
}

export interface WriteResult {
  status: number;
  body: unknown;
}

type LockableTable =
  | 'Company'
  | 'Invoice'
  | 'Bill'
  | 'Payment'
  | 'Reconciliation'
  | 'ReconciliationItem'
  | 'JournalEntry'
  | 'BankAccount';

const transactionOptions = { maxWait: 10000, timeout: 20000 };

export function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function nextAccountingNumber(tx: Tx, companyId: string, key: string, prefix: string): Promise<string> {
  return nextNumber(tx, companyId, key, prefix);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function assertDateOrder(from?: Date | null, to?: Date | null): void {
  if (from && to && from > to) throw ApiError.badRequest('Start date must not be after end date');
}

async function lockTable(tx: Tx, table: LockableTable, id: string): Promise<void> {
  const identifier = Prisma.raw(`"${table}"`);
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM ${identifier} WHERE id = ${id}::uuid FOR UPDATE`,
  );
  if (!rows[0]) throw ApiError.notFound(`${table} not found`);
}

export async function lockCompany(tx: Tx, companyId: string): Promise<void> {
  await lockTable(tx, 'Company', companyId);
}

export async function lockRows(tx: Tx, table: LockableTable, ids: string[]): Promise<void> {
  const uniqueIds = [...new Set(ids)].sort();
  if (!uniqueIds.length) return;
  const identifier = Prisma.raw(`"${table}"`);
  const values = Prisma.join(uniqueIds.map((id) => Prisma.sql`${id}::uuid`));
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM ${identifier} WHERE id IN (${values}) ORDER BY id FOR UPDATE`,
  );
  if (rows.length !== uniqueIds.length) throw ApiError.notFound('One or more financial records not found');
}

export async function lockAccountingPeriod(
  tx: Tx,
  companyId: string,
  periodId: string,
): Promise<{ status: PeriodStatus; isClosed: boolean }> {
  const rows = await tx.$queryRaw<Array<{ status: PeriodStatus; isClosed: boolean }>>(Prisma.sql`
    SELECT period.status, year."isClosed"
    FROM "AccountingPeriod" period
    JOIN "FiscalYear" year ON year.id = period."fiscalYearId"
    WHERE period.id = ${periodId}::uuid AND year."companyId" = ${companyId}::uuid
    FOR UPDATE OF period
  `);
  if (!rows[0]) throw ApiError.notFound('Fiscal period not found');
  return rows[0];
}

export async function idempotentWrite<T>(
  req: Request,
  companyId: string,
  operation: string,
  work: (tx: Tx) => Promise<T>,
  status = 200,
): Promise<WriteResult> {
  const key = requireIdempotencyKey(req);
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ body: req.body ?? null, params: req.params ?? null }))
    .digest('hex');
  const scopedKey = `${operation}:${key}`;

  return prisma.$transaction(async (tx) => {
    // Serialising company financial writes also makes same-key requests deterministic.
    await lockCompany(tx, companyId);
    const cached = await readIdempotentResponse(tx, companyId, scopedKey);
    if (cached !== null) {
      const record = cached as { fingerprint?: unknown; status?: unknown; body?: unknown };
      if (record.fingerprint !== fingerprint) {
        throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'This Idempotency-Key was already used for a different request');
      }
      return { status: typeof record.status === 'number' ? record.status : status, body: record.body };
    }

    const data = await work(tx);
    const body = { data };
    await saveIdempotentResponse(tx, companyId, scopedKey, {
      fingerprint,
      status,
      body: JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue,
    });
    return { status, body };
  }, transactionOptions);
}

export async function requireCompany(tx: Pick<Tx, 'company'>, companyId: string) {
  const company = await tx.company.findUnique({ where: { id: companyId }, select: { id: true, baseCurrency: true } });
  if (!company) throw ApiError.notFound('Company not found');
  return company;
}

export function documentCurrency(
  company: { baseCurrency: string },
  currency?: string,
  exchangeRate?: string,
): { currency: string; exchangeRate: Prisma.Decimal } {
  const selected = currency ?? company.baseCurrency;
  if (selected.toUpperCase() !== company.baseCurrency.toUpperCase()) {
    throw ApiError.badRequest('Only the company base currency is supported for financial documents');
  }
  const rate = money(exchangeRate ?? 1);
  if (!rate.eq(1)) throw ApiError.badRequest('Exchange rates other than 1 require multi-currency accounting');
  return { currency: company.baseCurrency.toUpperCase(), exchangeRate: money(1) };
}

export async function systemAccountMap(
  tx: Tx,
  companyId: string,
  codes: string[],
): Promise<Map<string, Account>> {
  const uniqueCodes = [...new Set(codes)];
  const accounts = await tx.account.findMany({
    where: { companyId, systemCode: { in: uniqueCodes }, isActive: true, isPostable: true },
    orderBy: [{ createdAt: 'asc' }, { code: 'asc' }],
  });
  const result = new Map<string, Account>();
  for (const account of accounts) {
    if (account.systemCode && !result.has(account.systemCode)) result.set(account.systemCode, account);
  }
  return result;
}

export function requiredSystemAccount(
  accounts: Map<string, Account>,
  code: string,
  type?: AccountType,
): Account {
  const account = accounts.get(code);
  if (!account) throw ApiError.badRequest(`Accounting reference data is missing postable system account ${code}`);
  if (type && account.type !== type) {
    throw ApiError.badRequest(`System account ${code} must be of type ${type}`);
  }
  return account;
}

export interface BalancedLine {
  debit: Prisma.Decimal.Value;
  credit: Prisma.Decimal.Value;
}

export function assertBalanced(lines: BalancedLine[], currency: string): { debit: Prisma.Decimal; credit: Prisma.Decimal } {
  if (lines.length < 2) throw ApiError.badRequest('A journal entry requires at least two lines');
  let debit = money(0);
  let credit = money(0);
  for (const line of lines) {
    const lineDebit = roundMoney(line.debit, currency);
    const lineCredit = roundMoney(line.credit, currency);
    if (lineDebit.lt(0) || lineCredit.lt(0) || (lineDebit.isZero() && lineCredit.isZero()) || (!lineDebit.isZero() && !lineCredit.isZero())) {
      throw ApiError.badRequest('Each journal line must have exactly one positive debit or credit');
    }
    debit = debit.plus(lineDebit);
    credit = credit.plus(lineCredit);
  }
  if (!debit.eq(credit) || debit.isZero()) {
    throw ApiError.badRequest('Journal entry debits and credits must balance to currency precision');
  }
  return { debit, credit };
}

export async function postingPeriod(
  tx: Tx,
  companyId: string,
  entryDate: Date,
  periodId?: string,
) {
  let selectedId = periodId;
  if (!selectedId) {
    const period = await tx.accountingPeriod.findFirst({
      where: {
        fiscalYear: { companyId },
        startDate: { lte: entryDate },
        endDate: { gte: entryDate },
      },
      orderBy: [{ startDate: 'desc' }, { number: 'desc' }],
      select: { id: true },
    });
    selectedId = period?.id;
  }
  if (!selectedId) throw ApiError.badRequest('No fiscal period covers the posting date');
  const locked = await lockAccountingPeriod(tx, companyId, selectedId);
  const period = await tx.accountingPeriod.findUnique({
    where: { id: selectedId },
    include: { fiscalYear: true },
  });
  if (!period || period.fiscalYear.companyId !== companyId) throw ApiError.notFound('Fiscal period not found');
  if (entryDate < period.startDate || entryDate > period.endDate) {
    throw ApiError.badRequest('Posting date is outside the selected fiscal period');
  }
  if (locked.isClosed || locked.status === 'LOCKED') {
    throw new ApiError(409, 'PERIOD_LOCKED', 'Posting into a locked fiscal period is not allowed');
  }
  return period;
}

export async function requireBankAccount(tx: Tx, companyId: string, bankAccountId: string) {
  const bankAccount = await tx.bankAccount.findFirst({
    where: { id: bankAccountId, companyId, isActive: true },
    include: { account: true },
  });
  if (!bankAccount || !bankAccount.account.isActive || !bankAccount.account.isPostable || bankAccount.account.type !== 'ASSET') {
    throw ApiError.badRequest('A valid active bank account with a postable asset ledger account is required');
  }
  const company = await requireCompany(tx, companyId);
  if (bankAccount.currency.toUpperCase() !== company.baseCurrency.toUpperCase()) {
    throw ApiError.badRequest('Bank account currency must match the company base currency');
  }
  if (bankAccount.account.currency && bankAccount.account.currency.toUpperCase() !== company.baseCurrency.toUpperCase()) {
    throw ApiError.badRequest('Bank ledger account currency must match the company base currency');
  }
  return bankAccount;
}

export async function audit(
  tx: Tx,
  actor: Actor,
  action: string,
  entity: string,
  entityId: string,
  metadata: Prisma.InputJsonValue = {},
): Promise<void> {
  await recordAuditTx(tx, {
    userId: actor.id,
    action,
    entity,
    entityId,
    metadata,
    ip: actor.ip ?? null,
  });
}

export function sumAmounts(values: Prisma.Decimal.Value[], currency: string): Prisma.Decimal {
  return roundMoney(sumMoney(values), currency);
}
