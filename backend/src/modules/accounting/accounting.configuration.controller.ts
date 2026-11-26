import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { defaultCompanyId } from '../../lib/company';
import { prisma } from '../../lib/prisma';
import { currentUser } from '../../middleware/auth';
import { parsePagination, paginationMeta } from '../../utils/pagination';
import type {
  BankAccountQuery,
  ChargeItemQuery,
  FiscalYearQuery,
  TaxCodeQuery,
} from './accounting.schemas';
import {
  createAccount,
  createBankAccount,
  createChargeItem,
  createFiscalPeriod,
  createFiscalYear,
  createJournal,
  createTaxCode,
  updateAccount,
  updateBankAccount,
  updateChargeItem,
  updateJournal,
  updateTaxCode,
} from './accounting.configuration.service';
import { idempotentWrite, type Actor, type WriteResult } from './accounting.shared';

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

function textSearch(search: string | undefined) {
  if (!search) return undefined;
  return [
    { code: { contains: search, mode: 'insensitive' as const } },
    { nameEn: { contains: search, mode: 'insensitive' as const } },
    { nameAr: { contains: search, mode: 'insensitive' as const } },
  ];
}

export async function listFiscalYears(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const query = queryOf<FiscalYearQuery>(res);
  const pagination = parsePagination(query, 100);
  const where: Prisma.FiscalYearWhereInput = {
    companyId,
    ...(query.isClosed !== undefined ? { isClosed: query.isClosed } : {}),
    ...(query.search ? { OR: textSearch(query.search) } : {}),
  };
  const [total, data] = await Promise.all([
    prisma.fiscalYear.count({ where }),
    prisma.fiscalYear.findMany({ where, orderBy: [{ startDate: 'desc' }], skip: pagination.skip, take: pagination.limit, include: { _count: { select: { periods: true } } } }),
  ]);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data, meta: paginationMeta(total, pagination) });
}


export async function listBankAccounts(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const query = queryOf<BankAccountQuery>(res);
  const pagination = parsePagination(query, 100);
  const search = query.search;
  const where: Prisma.BankAccountWhereInput = {
    companyId,
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(search ? { OR: [{ code: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }, { bankName: { contains: search, mode: 'insensitive' } }, { iban: { contains: search, mode: 'insensitive' } }] } : {}),
  };
  const [total, data] = await Promise.all([
    prisma.bankAccount.count({ where }),
    prisma.bankAccount.findMany({
      where,
      orderBy: [{ code: 'asc' }],
      skip: pagination.skip,
      take: pagination.limit,
      include: { account: { select: { id: true, code: true, nameEn: true, type: true, isActive: true, isPostable: true } }, _count: { select: { payments: true, reconciliations: true } } },
    }),
  ]);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data, meta: paginationMeta(total, pagination) });
}

export async function listTaxCodes(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const query = queryOf<TaxCodeQuery>(res);
  const pagination = parsePagination(query, 100);
  const search = query.search;
  const where: Prisma.TaxCodeWhereInput = {
    companyId,
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(search ? { OR: textSearch(search) } : {}),
  };
  const [total, data] = await Promise.all([
    prisma.taxCode.count({ where }),
    prisma.taxCode.findMany({
      where,
      orderBy: [{ code: 'asc' }],
      skip: pagination.skip,
      take: pagination.limit,
      include: { account: { select: { id: true, code: true, nameEn: true, type: true } }, _count: { select: { chargeItems: true, invoiceLines: true, billLines: true } } },
    }),
  ]);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data, meta: paginationMeta(total, pagination) });
}

export async function listChargeItems(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  const query = queryOf<ChargeItemQuery>(res);
  const pagination = parsePagination(query, 100);
  const search = query.search;
  const where: Prisma.ChargeItemWhereInput = {
    companyId,
    ...(query.type ? { type: query.type } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(search ? { OR: textSearch(search) } : {}),
  };
  const [total, data] = await Promise.all([
    prisma.chargeItem.count({ where }),
    prisma.chargeItem.findMany({
      where,
      orderBy: [{ code: 'asc' }],
      skip: pagination.skip,
      take: pagination.limit,
      include: { taxCode: { select: { id: true, code: true, nameEn: true, ratePercent: true, isActive: true } }, _count: { select: { quoteLines: true, invoiceLines: true, billLines: true } } },
    }),
  ]);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data, meta: paginationMeta(total, pagination) });
}

export async function createAccountHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  sendWrite(res, await idempotentWrite(req, companyId, 'account.create', (tx) => createAccount(tx, companyId, req.body, actor(req)), 201));
}

export async function updateAccountHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  sendWrite(res, await idempotentWrite(req, companyId, `account.update:${req.params.id}`, (tx) => updateAccount(tx, companyId, req.params.id, req.body, actor(req))));
}

export async function createJournalHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  sendWrite(res, await idempotentWrite(req, companyId, 'journal.create', (tx) => createJournal(tx, companyId, req.body, actor(req)), 201));
}

export async function updateJournalHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  sendWrite(res, await idempotentWrite(req, companyId, `journal.update:${req.params.id}`, (tx) => updateJournal(tx, companyId, req.params.id, req.body, actor(req))));
}

export async function createFiscalYearHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  sendWrite(res, await idempotentWrite(req, companyId, 'fiscal_year.create', (tx) => createFiscalYear(tx, companyId, req.body, actor(req)), 201));
}

export async function createFiscalPeriodHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  sendWrite(res, await idempotentWrite(req, companyId, 'fiscal_period.create', (tx) => createFiscalPeriod(tx, companyId, req.body, actor(req)), 201));
}

export async function createBankAccountHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  sendWrite(res, await idempotentWrite(req, companyId, 'bank_account.create', (tx) => createBankAccount(tx, companyId, req.body, actor(req)), 201));
}

export async function updateBankAccountHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  sendWrite(res, await idempotentWrite(req, companyId, `bank_account.update:${req.params.id}`, (tx) => updateBankAccount(tx, companyId, req.params.id, req.body, actor(req))));
}

export async function createTaxCodeHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  sendWrite(res, await idempotentWrite(req, companyId, 'tax_code.create', (tx) => createTaxCode(tx, companyId, req.body, actor(req)), 201));
}

export async function updateTaxCodeHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  sendWrite(res, await idempotentWrite(req, companyId, `tax_code.update:${req.params.id}`, (tx) => updateTaxCode(tx, companyId, req.params.id, req.body, actor(req))));
}

export async function createChargeItemHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  sendWrite(res, await idempotentWrite(req, companyId, 'charge_item.create', (tx) => createChargeItem(tx, companyId, req.body, actor(req)), 201));
}

export async function updateChargeItemHandler(req: Request, res: Response): Promise<void> {
  const companyId = await defaultCompanyId();
  sendWrite(res, await idempotentWrite(req, companyId, `charge_item.update:${req.params.id}`, (tx) => updateChargeItem(tx, companyId, req.params.id, req.body, actor(req))));
}
