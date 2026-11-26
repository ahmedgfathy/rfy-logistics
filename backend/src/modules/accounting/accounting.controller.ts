import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { defaultCompanyId } from '../../lib/company';
import { currentUser } from '../../middleware/auth';
import { ApiError } from '../../middleware/error';
import { parsePagination, paginationMeta } from '../../utils/pagination';
import type {
  AccountQuery,
  BillQuery,
  InvoiceQuery,
  JournalEntryQuery,
  JournalQuery,
  PaymentQuery,
  PeriodQuery,
  ReconciliationQuery,
  ReportQuery,
} from './accounting.schemas';
import {
  idempotentWrite,
  today,
  type Actor,
  type WriteResult,
} from './accounting.shared';
import { updateFiscalPeriodStatus } from './accounting.configuration.service';
import {
  billInclude,
  invoiceInclude,
  createBill,
  createInvoice,
  deleteBillDraft,
  deleteInvoiceDraft,
  issueBill,
  issueInvoice,
  postBill,
  postInvoice,
  updateBillDraft,
  updateInvoiceDraft,
  voidBill,
  voidInvoice,
} from './accounting.documents.service';
import {
  createPayment,
  deletePaymentDraft,
  postPayment,
  updatePaymentDraft,
  voidPayment,
  paymentInclude,
} from './accounting.payments.service';
import {
  approveReconciliation,
  createReconciliation,
  deleteDraftReconciliation,
  matchReconciliationItem,
  reconciliationInclude,
  reopenReconciliation,
  reviewReconciliation,
  unmatchReconciliationItem,
  updateReconciliation,
  updateReconciliationItem,
} from './accounting.reconciliation.service';
import { createManualJournalEntry, getJournalEntry, journalEntryInclude, reverseManualJournalEntry } from './accounting.ledger.service';
import {
  payablesReport,
  profitAndLossReport,
  receivablesReport,
  trialBalanceReport,
} from './accounting.reports.service';

function queryOf<T>(res: Response): T {
  return res.locals.query as T;
}

function actor(req: Request): Actor {
  return { id: currentUser(req).id, ip: req.ip };
}

function sendWrite(res: Response, result: WriteResult): void {
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(result.status).json(result.body);
}

export async function listAccounts(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const query = queryOf<AccountQuery>(res);
  const pagination = parsePagination(query, 100);
  const search = query.search?.trim();
  const where: Prisma.AccountWhereInput = {
    companyId,
    ...(query.type ? { type: query.type } : {}),
    ...(query.systemCode ? { systemCode: query.systemCode } : {}),
    ...(query.parentId ? { parentId: query.parentId } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(search ? { OR: [{ code: { contains: search, mode: 'insensitive' } }, { nameEn: { contains: search, mode: 'insensitive' } }, { nameAr: { contains: search, mode: 'insensitive' } }] } : {}),
  };
  const [total, accounts] = await Promise.all([
    prisma.account.count({ where }),
    prisma.account.findMany({
      where,
      orderBy: [{ code: 'asc' }],
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        parent: { select: { id: true, code: true, nameEn: true } },
        _count: { select: { children: true, journalLines: true, bankAccounts: true, taxCodes: true } },
      },
    }),
  ]);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: accounts, meta: paginationMeta(total, pagination) });
}

export async function listJournals(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const query = queryOf<JournalQuery>(res);
  const pagination = parsePagination(query, 100);
  const search = query.search?.trim();
  const where: Prisma.JournalWhereInput = {
    companyId,
    ...(query.type ? { type: query.type } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(search ? { OR: [{ code: { contains: search, mode: 'insensitive' } }, { nameEn: { contains: search, mode: 'insensitive' } }, { nameAr: { contains: search, mode: 'insensitive' } }] } : {}),
  };
  const [total, journals] = await Promise.all([
    prisma.journal.count({ where }),
    prisma.journal.findMany({
      where,
      orderBy: [{ code: 'asc' }],
      skip: pagination.skip,
      take: pagination.limit,
      include: { _count: { select: { entries: true } } },
    }),
  ]);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: journals, meta: paginationMeta(total, pagination) });
}

export async function listJournalEntries(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const query = queryOf<JournalEntryQuery>(res);
  const pagination = parsePagination(query, 25);
  const search = query.search?.trim();
  const where: Prisma.JournalEntryWhereInput = {
    companyId,
    ...(query.journalId ? { journalId: query.journalId } : {}),
    ...(query.periodId ? { periodId: query.periodId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.sourceType ? { sourceType: query.sourceType } : {}),
    ...(query.sourceId ? { sourceId: query.sourceId } : {}),
    ...(query.from || query.to ? { entryDate: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
    ...(search ? { OR: [{ number: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }, { sourceType: { contains: search, mode: 'insensitive' } }] } : {}),
  };
  const [total, entries] = await Promise.all([
    prisma.journalEntry.count({ where }),
    prisma.journalEntry.findMany({ where, orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }], skip: pagination.skip, take: pagination.limit, include: journalEntryInclude }),
  ]);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: entries, meta: paginationMeta(total, pagination) });
}

export async function getEntry(req: Request, res: Response): Promise<void> {
  const entry = await getJournalEntry(await defaultCompanyId(), req.params.id);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: entry });
}

export async function createEntryHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const result = await idempotentWrite(req, companyId, 'journal.manual_create', (tx) => createManualJournalEntry(tx, companyId, req.body, actor(req)), 201);
  sendWrite(res, result);
}

export async function reverseEntryHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const id = req.params.id;
  sendWrite(res, await idempotentWrite(req, companyId, `journal.manual_reverse:${id}`, (tx) => reverseManualJournalEntry(tx, companyId, id, req.body, actor(req))));
}

export async function listPeriods(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const query = queryOf<PeriodQuery>(res);
  const pagination = parsePagination(query, 100);
  const where: Prisma.AccountingPeriodWhereInput = {
    fiscalYear: { companyId },
    ...(query.fiscalYearId ? { fiscalYearId: query.fiscalYearId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.from || query.to ? { startDate: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
  };
  const [total, periods] = await Promise.all([
    prisma.accountingPeriod.count({ where }),
    prisma.accountingPeriod.findMany({
      where,
      orderBy: [{ startDate: 'desc' }],
      skip: pagination.skip,
      take: pagination.limit,
      include: { fiscalYear: { select: { id: true, code: true, nameEn: true, startDate: true, endDate: true, isClosed: true } } },
    }),
  ]);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: periods, meta: paginationMeta(total, pagination) });
}

export async function updatePeriod(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const id = req.params.id;
  const result = await idempotentWrite(req, companyId, `period.status:${id}`, (tx) => updateFiscalPeriodStatus(tx, companyId, id, req.body.status, req.body.reason, actor(req)));
  sendWrite(res, result);
}

export async function listInvoices(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const query = queryOf<InvoiceQuery>(res);
  const pagination = parsePagination(query, 25);
  const search = query.search?.trim();
  const where: Prisma.InvoiceWhereInput = {
    companyId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.branchId ? { branchId: query.branchId } : {}),
    ...(query.shipmentId ? { shipmentId: query.shipmentId } : {}),
    ...(query.currency ? { currency: query.currency } : {}),
    ...(query.from || query.to ? { issueDate: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
    ...(query.overdue ? { AND: [{ status: { notIn: ['DRAFT', 'VOID', 'PAID'] } }, { balance: { gt: 0 } }, { dueDate: { lt: today() } }] } : {}),
    ...(search ? { OR: [{ number: { contains: search, mode: 'insensitive' } }, { customer: { nameEn: { contains: search, mode: 'insensitive' } } }] } : {}),
  };
  const [total, invoices] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
      skip: pagination.skip,
      take: pagination.limit,
      include: { customer: { select: { id: true, code: true, nameEn: true } }, _count: { select: { lines: true, allocations: true } } },
    }),
  ]);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: invoices, meta: paginationMeta(total, pagination) });
}

export async function getInvoice(req: Request, res: Response): Promise<void> {
  const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, companyId: await defaultCompanyId() }, include: invoiceInclude });
  if (!invoice) throw ApiError.notFound('Invoice not found');
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: invoice });
}

export async function createInvoiceHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const result = await idempotentWrite(req, companyId, 'invoice.create', (tx) => createInvoice(tx, companyId, req.body, actor(req)), 201);
  sendWrite(res, result);
}

export async function updateInvoiceHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const id = req.params.id;
  sendWrite(res, await idempotentWrite(req, companyId, `invoice.update_draft:${id}`, (tx) => updateInvoiceDraft(tx, companyId, id, req.body, actor(req))));
}

export async function deleteInvoiceHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const id = req.params.id;
  sendWrite(res, await idempotentWrite(req, companyId, `invoice.delete_draft:${id}`, (tx) => deleteInvoiceDraft(tx, companyId, id, actor(req))));
}

export async function issueInvoiceHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const id = req.params.id;
  sendWrite(res, await idempotentWrite(req, companyId, `invoice.issue:${id}`, (tx) => issueInvoice(tx, companyId, id, req.body, actor(req))));
}

export async function postInvoiceHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const id = req.params.id;
  sendWrite(res, await idempotentWrite(req, companyId, `invoice.post:${id}`, (tx) => postInvoice(tx, companyId, id, req.body, actor(req))));
}

export async function voidInvoiceHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const id = req.params.id;
  sendWrite(res, await idempotentWrite(req, companyId, `invoice.void:${id}`, (tx) => voidInvoice(tx, companyId, id, req.body, actor(req))));
}

export async function listBills(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const query = queryOf<BillQuery>(res);
  const pagination = parsePagination(query, 25);
  const search = query.search?.trim();
  const where: Prisma.BillWhereInput = {
    companyId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.vendorId ? { vendorId: query.vendorId } : {}),
    ...(query.branchId ? { branchId: query.branchId } : {}),
    ...(query.shipmentId ? { shipmentId: query.shipmentId } : {}),
    ...(query.currency ? { currency: query.currency } : {}),
    ...(query.from || query.to ? { issueDate: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
    ...(query.overdue ? { AND: [{ status: { notIn: ['DRAFT', 'VOID', 'PAID'] } }, { balance: { gt: 0 } }, { dueDate: { lt: today() } }] } : {}),
    ...(search ? { OR: [{ number: { contains: search, mode: 'insensitive' } }, { vendorReference: { contains: search, mode: 'insensitive' } }, { vendor: { nameEn: { contains: search, mode: 'insensitive' } } }] } : {}),
  };
  const [total, bills] = await Promise.all([
    prisma.bill.count({ where }),
    prisma.bill.findMany({
      where,
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
      skip: pagination.skip,
      take: pagination.limit,
      include: { vendor: { select: { id: true, code: true, nameEn: true } }, _count: { select: { lines: true, allocations: true } } },
    }),
  ]);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: bills, meta: paginationMeta(total, pagination) });
}

export async function getBill(req: Request, res: Response): Promise<void> {
  const bill = await prisma.bill.findFirst({ where: { id: req.params.id, companyId: await defaultCompanyId() }, include: billInclude });
  if (!bill) throw ApiError.notFound('Bill not found');
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: bill });
}

export async function createBillHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const result = await idempotentWrite(req, companyId, 'bill.create', (tx) => createBill(tx, companyId, req.body, actor(req)), 201);
  sendWrite(res, result);
}

export async function updateBillHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const id = req.params.id;
  sendWrite(res, await idempotentWrite(req, companyId, `bill.update_draft:${id}`, (tx) => updateBillDraft(tx, companyId, id, req.body, actor(req))));
}

export async function deleteBillHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const id = req.params.id;
  sendWrite(res, await idempotentWrite(req, companyId, `bill.delete_draft:${id}`, (tx) => deleteBillDraft(tx, companyId, id, actor(req))));
}

export async function issueBillHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const id = req.params.id;
  sendWrite(res, await idempotentWrite(req, companyId, `bill.issue:${id}`, (tx) => issueBill(tx, companyId, id, req.body, actor(req))));
}

export async function postBillHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const id = req.params.id;
  sendWrite(res, await idempotentWrite(req, companyId, `bill.post:${id}`, (tx) => postBill(tx, companyId, id, req.body, actor(req))));
}

export async function voidBillHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const id = req.params.id;
  sendWrite(res, await idempotentWrite(req, companyId, `bill.void:${id}`, (tx) => voidBill(tx, companyId, id, req.body, actor(req))));
}

export async function listPayments(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const query = queryOf<PaymentQuery>(res);
  const pagination = parsePagination(query, 25);
  const search = query.search?.trim();
  const where: Prisma.PaymentWhereInput = {
    companyId,
    ...(query.direction ? { direction: query.direction } : {}),
    ...(query.partnerId ? { partnerId: query.partnerId } : {}),
    ...(query.bankAccountId ? { bankAccountId: query.bankAccountId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.method ? { method: query.method } : {}),
    ...(query.from || query.to ? { paymentDate: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
    ...(search ? { OR: [{ number: { contains: search, mode: 'insensitive' } }, { reference: { contains: search, mode: 'insensitive' } }, { partner: { nameEn: { contains: search, mode: 'insensitive' } } }] } : {}),
  };
  const [total, payments] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
      skip: pagination.skip,
      take: pagination.limit,
      include: paymentInclude,
    }),
  ]);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: payments, meta: paginationMeta(total, pagination) });
}

export async function getPayment(req: Request, res: Response): Promise<void> {
  const payment = await prisma.payment.findFirst({ where: { id: req.params.id, companyId: await defaultCompanyId() }, include: paymentInclude });
  if (!payment) throw ApiError.notFound('Payment not found');
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: payment });
}

export async function createPaymentHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const result = await idempotentWrite(req, companyId, 'payment.create', (tx) => createPayment(tx, companyId, req.body, actor(req)), 201);
  sendWrite(res, result);
}

export async function updatePaymentHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const id = req.params.id;
  sendWrite(res, await idempotentWrite(req, companyId, `payment.update_draft:${id}`, (tx) => updatePaymentDraft(tx, companyId, id, req.body, actor(req))));
}

export async function deletePaymentHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const id = req.params.id;
  sendWrite(res, await idempotentWrite(req, companyId, `payment.delete_draft:${id}`, (tx) => deletePaymentDraft(tx, companyId, id, actor(req))));
}

export async function postPaymentHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const id = req.params.id;
  sendWrite(res, await idempotentWrite(req, companyId, `payment.post:${id}`, (tx) => postPayment(tx, companyId, id, req.body, actor(req))));
}

export async function voidPaymentHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const id = req.params.id;
  sendWrite(res, await idempotentWrite(req, companyId, `payment.void:${id}`, (tx) => voidPayment(tx, companyId, id, req.body, actor(req))));
}

export async function listReconciliations(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const query = queryOf<ReconciliationQuery>(res);
  const pagination = parsePagination(query, 25);
  const where: Prisma.ReconciliationWhereInput = {
    companyId,
    ...(query.bankAccountId ? { bankAccountId: query.bankAccountId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.from || query.to ? { statementEnd: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
  };
  const [total, reconciliations] = await Promise.all([
    prisma.reconciliation.count({ where }),
    prisma.reconciliation.findMany({
      where,
      orderBy: [{ statementEnd: 'desc' }, { createdAt: 'desc' }],
      skip: pagination.skip,
      take: pagination.limit,
      include: reconciliationInclude,
    }),
  ]);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: reconciliations, meta: paginationMeta(total, pagination) });
}

export async function getReconciliation(req: Request, res: Response): Promise<void> {
  const reconciliation = await prisma.reconciliation.findFirst({ where: { id: req.params.id, companyId: await defaultCompanyId() }, include: reconciliationInclude });
  if (!reconciliation) throw ApiError.notFound('Bank reconciliation not found');
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: reconciliation });
}

export async function createReconciliationHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const result = await idempotentWrite(req, companyId, 'reconciliation.create', (tx) => createReconciliation(tx, companyId, req.body, actor(req)), 201);
  sendWrite(res, result);
}

export async function updateReconciliationHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const id = req.params.id;
  sendWrite(res, await idempotentWrite(req, companyId, `reconciliation.update_header:${id}`, (tx) => updateReconciliation(tx, companyId, id, req.body, actor(req))));
}

export async function updateReconciliationItemHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const { id, itemId } = req.params;
  sendWrite(res, await idempotentWrite(req, companyId, `reconciliation.update_item:${itemId}`, (tx) => updateReconciliationItem(tx, companyId, id, itemId, req.body, actor(req))));
}

export async function deleteReconciliationHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const id = req.params.id;
  sendWrite(res, await idempotentWrite(req, companyId, `reconciliation.delete:${id}`, (tx) => deleteDraftReconciliation(tx, companyId, id, req.body, actor(req))));
}

export async function reopenReconciliationHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const id = req.params.id;
  sendWrite(res, await idempotentWrite(req, companyId, `reconciliation.reopen:${id}`, (tx) => reopenReconciliation(tx, companyId, id, req.body, actor(req))));
}

export async function matchReconciliationItemHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const { id, itemId } = req.params;
  sendWrite(res, await idempotentWrite(req, companyId, `reconciliation.match:${itemId}`, (tx) => matchReconciliationItem(tx, companyId, id, itemId, req.body, actor(req))));
}

export async function unmatchReconciliationItemHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const { id, itemId } = req.params;
  sendWrite(res, await idempotentWrite(req, companyId, `reconciliation.unmatch:${itemId}`, (tx) => unmatchReconciliationItem(tx, companyId, id, itemId, req.body, actor(req))));
}

export async function reviewReconciliationHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const id = req.params.id;
  sendWrite(res, await idempotentWrite(req, companyId, `reconciliation.review:${id}`, (tx) => reviewReconciliation(tx, companyId, id, actor(req))));
}

export async function approveReconciliationHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const id = req.params.id;
  sendWrite(res, await idempotentWrite(req, companyId, `reconciliation.approve:${id}`, (tx) => approveReconciliation(tx, companyId, id, actor(req))));
}

export async function trialBalance(req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(await trialBalanceReport(queryOf<ReportQuery>(res)));
}

export async function profitAndLoss(req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(await profitAndLossReport(queryOf<ReportQuery>(res)));
}

export async function receivables(req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(await receivablesReport(queryOf<ReportQuery>(res)));
}

export async function payables(req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(await payablesReport(queryOf<ReportQuery>(res)));
}
