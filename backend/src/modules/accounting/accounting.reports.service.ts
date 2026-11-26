import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { defaultCompanyId } from '../../lib/company';
import { money, roundMoney, sumMoney } from '../../lib/money';
import { ApiError } from '../../middleware/error';
import type { ReportQuery } from './accounting.schemas';
import { requireCompany, today } from './accounting.shared';

interface ReportEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

interface ReceivableItem {
  id: string;
  number: string;
  issueDate: Date | null;
  dueDate: Date | null;
  currency: string;
  total: Prisma.Decimal;
  customer: { id: string; code: string; nameEn: string };
  paidAmount: Prisma.Decimal;
  outstanding: Prisma.Decimal;
  daysOverdue: number;
  agingBucket: string;
}

interface PayableItem {
  id: string;
  number: string;
  issueDate: Date | null;
  dueDate: Date | null;
  currency: string;
  total: Prisma.Decimal;
  vendor: { id: string; code: string; nameEn: string };
  paidAmount: Prisma.Decimal;
  outstanding: Prisma.Decimal;
  daysOverdue: number;
  agingBucket: string;
}

function dateWhere(query: ReportQuery): { gte?: Date; lte?: Date } {
  return {
    ...(query.from ? { gte: query.from } : {}),
    ...(query.to ? { lte: query.to } : {}),
  };
}

async function reportCompany(query: ReportQuery) {
  const companyId = await defaultCompanyId();
  const company = await requireCompany(prisma, companyId);
  if (query.currency && query.currency.toUpperCase() !== company.baseCurrency.toUpperCase()) {
    throw ApiError.badRequest('Reports are only available in the company base currency');
  }
  return { companyId, currency: company.baseCurrency.toUpperCase() };
}

export async function trialBalanceReport(query: ReportQuery): Promise<ReportEnvelope<unknown>> {
  const { companyId, currency } = await reportCompany(query);
  const grouped = await prisma.journalLine.groupBy({
    by: ['accountId'],
    where: { entry: { companyId, status: 'POSTED', entryDate: dateWhere(query) } },
    _sum: { debit: true, credit: true },
  });
  const accounts = grouped.length
    ? await prisma.account.findMany({
        where: { id: { in: grouped.map((row) => row.accountId) }, companyId },
        select: { id: true, code: true, nameEn: true, nameAr: true, type: true, normalBalance: true, currency: true },
      })
    : [];
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const rows = grouped.flatMap((row) => {
    const account = accountMap.get(row.accountId);
    if (!account) return [];
    const debit = roundMoney(row._sum?.debit ?? 0, currency);
    const credit = roundMoney(row._sum?.credit ?? 0, currency);
    const net = roundMoney(debit.minus(credit), currency);
    return [{
      ...account,
      debit: net.gt(0) ? net : money(0),
      credit: net.lt(0) ? net.neg() : money(0),
      net,
    }];
  }).sort((a, b) => a.code.localeCompare(b.code));
  const totalDebit = roundMoney(sumMoney(rows.map((row) => row.debit)), currency);
  const totalCredit = roundMoney(sumMoney(rows.map((row) => row.credit)), currency);
  const difference = roundMoney(totalDebit.minus(totalCredit), currency);
  return {
    data: {
      currency,
      period: { from: query.from ?? null, to: query.to ?? null },
      rows,
      totals: { debit: totalDebit, credit: totalCredit, difference },
    },
    meta: { balanced: difference.isZero(), entryStatus: 'POSTED' },
  };
}

export async function profitAndLossReport(query: ReportQuery): Promise<ReportEnvelope<unknown>> {
  const { companyId, currency } = await reportCompany(query);
  const now = today();
  const from = query.from ?? new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const to = query.to ?? now;
  if (from > to) throw ApiError.badRequest('Report start must not be after report end');
  const grouped = await prisma.journalLine.groupBy({
    by: ['accountId'],
    where: {
      account: { companyId, type: { in: ['REVENUE', 'EXPENSE'] } },
      entry: { companyId, status: 'POSTED', entryDate: { gte: from, lte: to } },
    },
    _sum: { debit: true, credit: true },
  });
  const accounts = grouped.length
    ? await prisma.account.findMany({
        where: { id: { in: grouped.map((row) => row.accountId) }, companyId, type: { in: ['REVENUE', 'EXPENSE'] } },
        select: { id: true, code: true, nameEn: true, nameAr: true, type: true },
      })
    : [];
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const rows = grouped.flatMap((row) => {
    const account = accountMap.get(row.accountId);
    if (!account) return [];
    const debit = roundMoney(row._sum?.debit ?? 0, currency);
    const credit = roundMoney(row._sum?.credit ?? 0, currency);
    const amount = account.type === 'REVENUE' ? credit.minus(debit) : debit.minus(credit);
    return [{ ...account, debit, credit, amount: roundMoney(amount, currency) }];
  }).sort((a, b) => a.code.localeCompare(b.code));
  const revenue = roundMoney(sumMoney(rows.filter((row) => row.type === 'REVENUE').map((row) => row.amount)), currency);
  const expenses = roundMoney(sumMoney(rows.filter((row) => row.type === 'EXPENSE').map((row) => row.amount)), currency);
  const netProfit = roundMoney(revenue.minus(expenses), currency);
  return {
    data: {
      currency,
      period: { from, to },
      rows,
      totals: { revenue, expenses, netProfit },
    },
    meta: { entryStatus: 'POSTED' },
  };
}

function agingBucket(daysOverdue: number): string {
  if (daysOverdue <= 0) return 'CURRENT';
  if (daysOverdue <= 30) return '1_30';
  if (daysOverdue <= 60) return '31_60';
  if (daysOverdue <= 90) return '61_90';
  return 'OVER_90';
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / (24 * 60 * 60 * 1000));
}

export async function receivablesReport(query: ReportQuery): Promise<ReportEnvelope<unknown>> {
  const { companyId, currency } = await reportCompany(query);
  const asOf = today();
  const invoices = await prisma.invoice.findMany({
    where: {
      companyId,
      status: { notIn: ['DRAFT', 'VOID'] },
      postedEntryId: { not: null },
      ...(query.from || query.to ? { issueDate: dateWhere(query) } : {}),
    },
    orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }, { number: 'asc' }],
    select: {
      id: true,
      number: true,
      issueDate: true,
      dueDate: true,
      currency: true,
      total: true,
      customer: { select: { id: true, code: true, nameEn: true } },
    },
  });
  const allocated = invoices.length
    ? await prisma.paymentAllocation.groupBy({
        by: ['invoiceId'],
        where: { invoiceId: { in: invoices.map((invoice) => invoice.id) }, payment: { companyId, status: 'POSTED' } },
        _sum: { amount: true },
      })
    : [];
  const paidMap = new Map(allocated.map((row) => [row.invoiceId, roundMoney(row._sum.amount ?? 0, currency)]));
  const items = invoices.flatMap((invoice): ReceivableItem[] => {
    const paid = paidMap.get(invoice.id) ?? money(0);
    const outstanding = roundMoney(invoice.total.minus(paid), currency);
    if (outstanding.lte(0)) return [];
    const daysOverdue = invoice.dueDate ? Math.max(0, daysBetween(asOf, invoice.dueDate)) : 0;
    return [{ ...invoice, paidAmount: paid, outstanding, daysOverdue, agingBucket: agingBucket(daysOverdue) }];
  });
  const totalOutstanding = roundMoney(sumMoney(items.map((item) => item.outstanding)), currency);
  const overdue = roundMoney(sumMoney(items.filter((item) => item.daysOverdue > 0).map((item) => item.outstanding)), currency);
  const byAging = Object.fromEntries(['CURRENT', '1_30', '31_60', '61_90', 'OVER_90'].map((bucket) => [
    bucket,
    roundMoney(sumMoney(items.filter((item) => item.agingBucket === bucket).map((item) => item.outstanding)), currency),
  ]));
  const partnerMap = new Map<string, { id: string; code: string; nameEn: string; outstanding: Prisma.Decimal; overdue: Prisma.Decimal }>();
  for (const item of items) {
    const current = partnerMap.get(item.customer.id) ?? { ...item.customer, outstanding: money(0), overdue: money(0) };
    current.outstanding = current.outstanding.plus(item.outstanding);
    if (item.daysOverdue > 0) current.overdue = current.overdue.plus(item.outstanding);
    partnerMap.set(item.customer.id, current);
  }
  return {
    data: {
      currency,
      asOf,
      totalOutstanding,
      overdue,
      byAging,
      byPartner: [...partnerMap.values()].map((partner) => ({
        ...partner,
        outstanding: roundMoney(partner.outstanding, currency),
        overdue: roundMoney(partner.overdue, currency),
      })).sort((a, b) => a.code.localeCompare(b.code)),
      items,
    },
  };
}

export async function payablesReport(query: ReportQuery): Promise<ReportEnvelope<unknown>> {
  const { companyId, currency } = await reportCompany(query);
  const asOf = today();
  const bills = await prisma.bill.findMany({
    where: {
      companyId,
      status: { notIn: ['DRAFT', 'VOID'] },
      postedEntryId: { not: null },
      ...(query.from || query.to ? { issueDate: dateWhere(query) } : {}),
    },
    orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }, { number: 'asc' }],
    select: {
      id: true,
      number: true,
      issueDate: true,
      dueDate: true,
      currency: true,
      total: true,
      vendor: { select: { id: true, code: true, nameEn: true } },
    },
  });
  const allocated = bills.length
    ? await prisma.paymentAllocation.groupBy({
        by: ['billId'],
        where: { billId: { in: bills.map((bill) => bill.id) }, payment: { companyId, status: 'POSTED' } },
        _sum: { amount: true },
      })
    : [];
  const paidMap = new Map(allocated.map((row) => [row.billId, roundMoney(row._sum.amount ?? 0, currency)]));
  const items = bills.flatMap((bill): PayableItem[] => {
    const paid = paidMap.get(bill.id) ?? money(0);
    const outstanding = roundMoney(bill.total.minus(paid), currency);
    if (outstanding.lte(0)) return [];
    const daysOverdue = bill.dueDate ? Math.max(0, daysBetween(asOf, bill.dueDate)) : 0;
    return [{ ...bill, paidAmount: paid, outstanding, daysOverdue, agingBucket: agingBucket(daysOverdue) }];
  });
  const totalOutstanding = roundMoney(sumMoney(items.map((item) => item.outstanding)), currency);
  const overdue = roundMoney(sumMoney(items.filter((item) => item.daysOverdue > 0).map((item) => item.outstanding)), currency);
  const byAging = Object.fromEntries(['CURRENT', '1_30', '31_60', '61_90', 'OVER_90'].map((bucket) => [
    bucket,
    roundMoney(sumMoney(items.filter((item) => item.agingBucket === bucket).map((item) => item.outstanding)), currency),
  ]));
  const partnerMap = new Map<string, { id: string; code: string; nameEn: string; outstanding: Prisma.Decimal; overdue: Prisma.Decimal }>();
  for (const item of items) {
    const current = partnerMap.get(item.vendor.id) ?? { ...item.vendor, outstanding: money(0), overdue: money(0) };
    current.outstanding = current.outstanding.plus(item.outstanding);
    if (item.daysOverdue > 0) current.overdue = current.overdue.plus(item.outstanding);
    partnerMap.set(item.vendor.id, current);
  }
  return {
    data: {
      currency,
      asOf,
      totalOutstanding,
      overdue,
      byAging,
      byPartner: [...partnerMap.values()].map((partner) => ({
        ...partner,
        outstanding: roundMoney(partner.outstanding, currency),
        overdue: roundMoney(partner.overdue, currency),
      })).sort((a, b) => a.code.localeCompare(b.code)),
      items,
    },
  };
}
