import { Prisma, type AccountType, type NormalBalance } from '@prisma/client';
import { money } from '../../lib/money';
import { ApiError } from '../../middleware/error';
import type {
  AccountCreateBody,
  AccountUpdateBody,
  BankAccountCreateBody,
  BankAccountUpdateBody,
  ChargeItemCreateBody,
  ChargeItemUpdateBody,
  FiscalPeriodCreateBody,
  FiscalYearCreateBody,
  JournalCreateBody,
  JournalUpdateBody,
  TaxCodeCreateBody,
  TaxCodeUpdateBody,
} from './accounting.schemas';
import { assertDateOrder, audit, lockAccountingPeriod, requireCompany, type Actor, type Tx } from './accounting.shared';

const normalBalances: Record<AccountType, NormalBalance> = {
  ASSET: 'DEBIT',
  LIABILITY: 'CREDIT',
  EQUITY: 'CREDIT',
  REVENUE: 'CREDIT',
  EXPENSE: 'DEBIT',
};

const systemAccountTypes: Record<string, AccountType> = {
  CASH: 'ASSET',
  BANK: 'ASSET',
  AR: 'ASSET',
  INPUT_VAT: 'ASSET',
  AP: 'LIABILITY',
  OUTPUT_VAT: 'LIABILITY',
  OPENING_BALANCE: 'EQUITY',
  RETAINED_EARNINGS: 'EQUITY',
  SALES_REVENUE: 'REVENUE',
  FREIGHT_REVENUE: 'REVENUE',
  CUSTOMS_REVENUE: 'REVENUE',
  PURCHASE_FREIGHT: 'EXPENSE',
  CUSTOMS_EXPENSE: 'EXPENSE',
};

async function assertUniqueCode(tx: Tx, companyId: string, table: 'account' | 'journal' | 'bankAccount' | 'taxCode' | 'chargeItem' | 'fiscalYear', code: string, currentId?: string): Promise<void> {
  const where = { companyId, code: { equals: code, mode: 'insensitive' as const }, ...(currentId ? { id: { not: currentId } } : {}) };
  const existing = table === 'account' ? await tx.account.findFirst({ where, select: { id: true } })
    : table === 'journal' ? await tx.journal.findFirst({ where, select: { id: true } })
    : table === 'bankAccount' ? await tx.bankAccount.findFirst({ where, select: { id: true } })
    : table === 'taxCode' ? await tx.taxCode.findFirst({ where, select: { id: true } })
    : table === 'chargeItem' ? await tx.chargeItem.findFirst({ where, select: { id: true } })
    : await tx.fiscalYear.findFirst({ where, select: { id: true } });
  if (existing) throw new ApiError(409, 'DUPLICATE_CODE', 'This code is already used in the company');
}

async function requireScoped<T>(record: T | null, label: string): Promise<T> {
  if (!record) throw ApiError.notFound(`${label} not found`);
  return record;
}

async function requirePostableLedgerAccount(tx: Tx, companyId: string, accountId: string, allowedTypes: AccountType[], label: string) {
  const company = await requireCompany(tx, companyId);
  const account = await tx.account.findFirst({ where: { id: accountId, companyId } });
  if (!account || !account.isActive || !account.isPostable || !allowedTypes.includes(account.type)) {
    throw ApiError.badRequest(`${label} must reference an active postable ${allowedTypes.join(' or ')} account`);
  }
  if (account.currency && account.currency.toUpperCase() !== company.baseCurrency.toUpperCase()) {
    throw ApiError.badRequest(`${label} ledger account currency must match the company base currency`);
  }
  return account;
}

function changes(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'reason'));
}

function auditPayload(body: Record<string, unknown>): Prisma.InputJsonObject {
  return { changes: changes(body) as Prisma.InputJsonValue, reason: (body.reason as string | null | undefined) ?? null };
}

export async function createAccount(tx: Tx, companyId: string, body: AccountCreateBody, actor: Actor) {
  const company = await requireCompany(tx, companyId);
  await assertUniqueCode(tx, companyId, 'account', body.code);
  if (normalBalances[body.type] !== body.normalBalance) {
    throw ApiError.badRequest('Normal balance must be consistent with the account type');
  }
  if (body.currency && body.currency.toUpperCase() !== company.baseCurrency.toUpperCase()) {
    throw ApiError.badRequest('Account currency must match the company base currency');
  }
  if (body.parentId) {
    const parent = await tx.account.findFirst({ where: { id: body.parentId, companyId, isActive: true } });
    if (!parent) throw ApiError.badRequest('Parent account must be active and belong to the company');
    if (parent.type !== body.type || parent.normalBalance !== body.normalBalance) {
      throw ApiError.badRequest('Parent account must have the same type and normal balance');
    }
    if ((parent.currency ?? company.baseCurrency).toUpperCase() !== (body.currency ?? company.baseCurrency).toUpperCase()) {
      throw ApiError.badRequest('Child and parent account currencies must match');
    }
  }
  const account = await tx.account.create({
    data: { companyId, ...body },
    include: { parent: { select: { id: true, code: true, nameEn: true } } },
  });
  await audit(tx, actor, 'accounting.account.created', 'Account', account.id, changes(body) as Prisma.InputJsonValue);
  return account;
}

export async function updateAccount(tx: Tx, companyId: string, id: string, body: AccountUpdateBody, actor: Actor) {
  const existing = await requireScoped(await tx.account.findFirst({
    where: { id, companyId },
    include: { _count: { select: { children: true, journalLines: true, bankAccounts: true, taxCodes: true } } },
  }), 'Account');
  const desiredType = body.type ?? existing.type;
  const desiredBalance = body.normalBalance ?? existing.normalBalance;
  if (normalBalances[desiredType] !== desiredBalance) {
    throw ApiError.badRequest('Normal balance must be consistent with the account type');
  }
  if (existing.systemCode && (systemAccountTypes[existing.systemCode] !== desiredType || body.isActive === false || body.isPostable === false)) {
    throw new ApiError(409, 'SYSTEM_ACCOUNT_REQUIRED', 'System accounts must retain their type and remain active and postable');
  }
  if (existing.systemCode && !systemAccountTypes[existing.systemCode]) {
    throw new ApiError(409, 'SYSTEM_ACCOUNT_REQUIRED', 'This account has an unsupported system mapping');
  }
  if (existing._count.journalLines && (body.type || body.normalBalance)) {
    throw new ApiError(409, 'ACCOUNT_IN_USE', 'Account type and normal balance cannot change after journal lines exist');
  }
  if (body.code) await assertUniqueCode(tx, companyId, 'account', body.code, id);
  if (body.isPostable && existing._count.children) {
    throw ApiError.badRequest('An account with child accounts cannot be postable');
  }
  if (body.isActive === false) {
    const dependencies = await Promise.all([
      tx.account.count({ where: { parentId: id, companyId, isActive: true } }),
      tx.bankAccount.count({ where: { accountId: id, companyId, isActive: true } }),
      tx.taxCode.count({ where: { accountId: id, companyId, isActive: true } }),
    ]);
    if (dependencies.some((count) => count > 0)) {
      throw new ApiError(409, 'ACCOUNT_IN_USE', 'Deactivate child accounts, bank accounts, and tax codes before deactivating this account');
    }
  }
  const company = await requireCompany(tx, companyId);
  const desiredCurrency = body.currency !== undefined ? body.currency : existing.currency;
  if (desiredCurrency && desiredCurrency.toUpperCase() !== company.baseCurrency.toUpperCase()) {
    throw ApiError.badRequest('Account currency must match the company base currency');
  }
  const parentId = body.parentId !== undefined ? body.parentId : existing.parentId;
  if (parentId) {
    if (parentId === id) throw ApiError.badRequest('An account cannot be its own parent');
    const parent = await tx.account.findFirst({ where: { id: parentId, companyId, isActive: true } });
    if (!parent) throw ApiError.badRequest('Parent account must be active and belong to the company');
    if (parent.type !== desiredType || parent.normalBalance !== desiredBalance) {
      throw ApiError.badRequest('Parent account must have the same type and normal balance');
    }
    if ((parent.currency ?? company.baseCurrency).toUpperCase() !== (desiredCurrency ?? company.baseCurrency).toUpperCase()) {
      throw ApiError.badRequest('Child and parent account currencies must match');
    }
    let cursor: string | null = parentId;
    const visited = new Set<string>([id]);
    while (cursor) {
      if (visited.has(cursor)) throw ApiError.badRequest('Account hierarchy cannot contain a cycle');
      visited.add(cursor);
      cursor = await tx.account.findUnique({ where: { id: cursor }, select: { parentId: true } }).then((value) => value?.parentId ?? null);
    }
  }
  const updated = await tx.account.update({
    where: { id },
    data: changes(body),
    include: { parent: { select: { id: true, code: true, nameEn: true } } },
  });
  await audit(tx, actor, body.isActive !== undefined && body.isActive !== existing.isActive
    ? `accounting.account.${body.isActive ? 'activated' : 'deactivated'}`
    : 'accounting.account.updated', 'Account', id, auditPayload(body));
  return updated;
}

export async function createJournal(tx: Tx, companyId: string, body: JournalCreateBody, actor: Actor) {
  await assertUniqueCode(tx, companyId, 'journal', body.code);
  const journal = await tx.journal.create({ data: { companyId, ...body, isSystem: false, isActive: true } });
  await audit(tx, actor, 'accounting.journal.created', 'Journal', journal.id, changes(body) as Prisma.InputJsonValue);
  return journal;
}

export async function updateJournal(tx: Tx, companyId: string, id: string, body: JournalUpdateBody, actor: Actor) {
  const existing = await requireScoped(await tx.journal.findFirst({ where: { id, companyId }, include: { _count: { select: { entries: true } } } }), 'Journal');
  if (existing.isSystem && (body.isActive === false || body.type)) {
    throw new ApiError(409, 'SYSTEM_JOURNAL_REQUIRED', 'System journals cannot be deactivated or retyped');
  }
  if (existing._count.entries && body.type) {
    throw new ApiError(409, 'JOURNAL_IN_USE', 'Journal type cannot change after entries exist');
  }
  if (body.code) await assertUniqueCode(tx, companyId, 'journal', body.code, id);
  const removesLastType = (body.isActive === false || (body.type && body.type !== existing.type))
    && !(await tx.journal.count({ where: { companyId, type: existing.type, isActive: true, id: { not: id } } }));
  if (removesLastType) throw new ApiError(409, 'JOURNAL_REQUIRED', 'At least one active journal of every type is required');
  const updated = await tx.journal.update({ where: { id }, data: changes(body) });
  await audit(tx, actor, body.isActive !== undefined && body.isActive !== existing.isActive
    ? `accounting.journal.${body.isActive ? 'activated' : 'deactivated'}`
    : 'accounting.journal.updated', 'Journal', id, auditPayload(body));
  return updated;
}

export async function createFiscalYear(tx: Tx, companyId: string, body: FiscalYearCreateBody, actor: Actor) {
  assertDateOrder(body.startDate, body.endDate);
  await assertUniqueCode(tx, companyId, 'fiscalYear', body.code);
  const overlap = await tx.fiscalYear.findFirst({ where: { companyId, startDate: { lte: body.endDate }, endDate: { gte: body.startDate } }, select: { id: true } });
  if (overlap) throw new ApiError(409, 'FISCAL_YEAR_OVERLAP', 'Fiscal years cannot overlap');
  const fiscalYear = await tx.fiscalYear.create({ data: { companyId, ...body } });
  await audit(tx, actor, 'accounting.fiscal_year.created', 'FiscalYear', fiscalYear.id, changes(body) as Prisma.InputJsonValue);
  return fiscalYear;
}

export async function createFiscalPeriod(tx: Tx, companyId: string, body: FiscalPeriodCreateBody, actor: Actor) {
  assertDateOrder(body.startDate, body.endDate);
  const fiscalYear = await requireScoped(await tx.fiscalYear.findFirst({ where: { id: body.fiscalYearId, companyId } }), 'Fiscal year');
  if (fiscalYear.isClosed) throw new ApiError(409, 'FISCAL_YEAR_CLOSED', 'Periods cannot be added to a closed fiscal year');
  if (body.startDate < fiscalYear.startDate || body.endDate > fiscalYear.endDate) {
    throw ApiError.badRequest('Accounting period must stay within its fiscal year');
  }
  const numberExists = await tx.accountingPeriod.findFirst({ where: { fiscalYearId: fiscalYear.id, number: body.number }, select: { id: true } });
  if (numberExists) throw new ApiError(409, 'DUPLICATE_PERIOD', 'This period number already exists in the fiscal year');
  const overlap = await tx.accountingPeriod.findFirst({
    where: { fiscalYear: { companyId }, startDate: { lte: body.endDate }, endDate: { gte: body.startDate } },
    select: { id: true },
  });
  if (overlap) throw new ApiError(409, 'PERIOD_OVERLAP', 'Accounting periods cannot overlap');
  const period = await tx.accountingPeriod.create({
    data: {
      fiscalYearId: fiscalYear.id,
      number: body.number,
      name: body.name,
      startDate: body.startDate,
      endDate: body.endDate,
      status: body.status,
      lockedAt: body.status === 'LOCKED' ? new Date() : null,
      lockedById: body.status === 'LOCKED' ? actor.id : null,
    },
    include: { fiscalYear: { select: { id: true, code: true, nameEn: true, startDate: true, endDate: true, isClosed: true } } },
  });
  await audit(tx, actor, 'accounting.period.created', 'AccountingPeriod', period.id, { ...changes(body), fiscalYearId: fiscalYear.id });
  return period;
}

export async function updateFiscalPeriodStatus(tx: Tx, companyId: string, id: string, status: 'OPEN' | 'SOFT_CLOSED' | 'LOCKED', reason: string | null | undefined, actor: Actor) {
  const locked = await lockAccountingPeriod(tx, companyId, id);
  const period = await requireScoped(await tx.accountingPeriod.findFirst({ where: { id, fiscalYear: { companyId } }, include: { fiscalYear: true } }), 'Fiscal period');
  if (period.fiscalYear.isClosed && status !== 'LOCKED') {
    throw new ApiError(409, 'FISCAL_YEAR_CLOSED', 'A closed fiscal year cannot be reopened');
  }
  if (period.status === status) return period;
  if (status !== 'LOCKED') {
    const overlap = await tx.accountingPeriod.findFirst({
      where: {
        id: { not: id },
        fiscalYear: { companyId },
        status: { not: 'LOCKED' },
        startDate: { lte: period.endDate },
        endDate: { gte: period.startDate },
      },
      select: { id: true },
    });
    if (overlap) throw new ApiError(409, 'PERIOD_OVERLAP', 'Another open or soft-closed period overlaps these dates');
  }
  const updated = await tx.accountingPeriod.update({
    where: { id },
    data: { status, lockedAt: status === 'LOCKED' ? new Date() : null, lockedById: status === 'LOCKED' ? actor.id : null },
    include: { fiscalYear: true },
  });
  await audit(tx, actor, 'accounting.period.status_changed', 'AccountingPeriod', id, {
    from: period.status,
    to: status,
    reason: reason ?? null,
    fiscalYearClosed: locked.isClosed,
  });
  return updated;
}

export async function createBankAccount(tx: Tx, companyId: string, body: BankAccountCreateBody, actor: Actor) {
  const company = await requireCompany(tx, companyId);
  await assertUniqueCode(tx, companyId, 'bankAccount', body.code);
  await requirePostableLedgerAccount(tx, companyId, body.accountId, ['ASSET'], 'Bank account');
  if (body.currency.toUpperCase() !== company.baseCurrency.toUpperCase()) {
    throw ApiError.badRequest('Bank account currency must match the company base currency');
  }
  const duplicateLedger = await tx.bankAccount.findFirst({ where: { companyId, accountId: body.accountId }, select: { id: true } });
  if (duplicateLedger) throw new ApiError(409, 'BANK_LEDGER_IN_USE', 'This ledger account is already assigned to another bank account');
  const bankAccount = await tx.bankAccount.create({ data: { companyId, ...body, isActive: true }, include: { account: { select: { id: true, code: true, nameEn: true } } } });
  await audit(tx, actor, 'accounting.bank_account.created', 'BankAccount', bankAccount.id, changes(body) as Prisma.InputJsonValue);
  return bankAccount;
}

export async function updateBankAccount(tx: Tx, companyId: string, id: string, body: BankAccountUpdateBody, actor: Actor) {
  const existing = await requireScoped(await tx.bankAccount.findFirst({
    where: { id, companyId },
    include: { account: true, _count: { select: { payments: true, reconciliations: true } } },
  }), 'Bank account');
  if (body.code) await assertUniqueCode(tx, companyId, 'bankAccount', body.code, id);
  const accountId = body.accountId ?? existing.accountId;
  const currency = body.currency ?? existing.currency;
  const company = await requireCompany(tx, companyId);
  await requirePostableLedgerAccount(tx, companyId, accountId, ['ASSET'], 'Bank account');
  if (currency.toUpperCase() !== company.baseCurrency.toUpperCase()) throw ApiError.badRequest('Bank account currency must match the company base currency');
  const duplicateLedger = await tx.bankAccount.findFirst({ where: { companyId, accountId, id: { not: id } }, select: { id: true } });
  if (duplicateLedger) throw new ApiError(409, 'BANK_LEDGER_IN_USE', 'This ledger account is already assigned to another bank account');
  if (((body.accountId && body.accountId !== existing.accountId) || (body.currency && body.currency !== existing.currency))
    && existing._count.payments + existing._count.reconciliations > 0) {
    throw new ApiError(409, 'BANK_ACCOUNT_IN_USE', 'Ledger account and currency cannot change after payments or reconciliations exist');
  }
  if (body.isActive === false) {
    const [openReconciliations, draftPayments] = await Promise.all([
      tx.reconciliation.count({ where: { bankAccountId: id, companyId, status: { not: 'APPROVED' } } }),
      tx.payment.count({ where: { bankAccountId: id, companyId, status: 'DRAFT' } }),
    ]);
    if (openReconciliations || draftPayments) {
      throw new ApiError(409, 'BANK_ACCOUNT_IN_USE', 'Approve reconciliations and finalize draft payments before deactivating the bank account');
    }
  }
  const updated = await tx.bankAccount.update({ where: { id }, data: changes(body), include: { account: { select: { id: true, code: true, nameEn: true } } } });
  await audit(tx, actor, body.isActive !== undefined && body.isActive !== existing.isActive
    ? `accounting.bank_account.${body.isActive ? 'activated' : 'deactivated'}`
    : 'accounting.bank_account.updated', 'BankAccount', id, auditPayload(body));
  return updated;
}

async function requireActiveTaxCode(tx: Tx, companyId: string, id: string) {
  const taxCode = await tx.taxCode.findFirst({ where: { id, companyId, isActive: true } });
  if (!taxCode) throw ApiError.badRequest('Default tax code must be active and belong to the company');
  return taxCode;
}

export async function createTaxCode(tx: Tx, companyId: string, body: TaxCodeCreateBody, actor: Actor) {
  await assertUniqueCode(tx, companyId, 'taxCode', body.code);
  if (body.accountId) await requirePostableLedgerAccount(tx, companyId, body.accountId, ['ASSET', 'LIABILITY'], 'Tax code');
  const taxCode = await tx.taxCode.create({ data: { companyId, ...body, isActive: true }, include: { account: { select: { id: true, code: true, nameEn: true } } } });
  await audit(tx, actor, 'accounting.tax_code.created', 'TaxCode', taxCode.id, changes(body) as Prisma.InputJsonValue);
  return taxCode;
}

export async function updateTaxCode(tx: Tx, companyId: string, id: string, body: TaxCodeUpdateBody, actor: Actor) {
  const existing = await requireScoped(await tx.taxCode.findFirst({ where: { id, companyId } }), 'Tax code');
  if (body.code) await assertUniqueCode(tx, companyId, 'taxCode', body.code, id);
  if (body.accountId) await requirePostableLedgerAccount(tx, companyId, body.accountId, ['ASSET', 'LIABILITY'], 'Tax code');
  if (body.accountId && body.accountId !== existing.accountId) {
    const [issuedInvoices, issuedBills] = await Promise.all([
      tx.invoice.count({ where: { companyId, status: 'ISSUED', lines: { some: { taxCodeId: id } } } }),
      tx.bill.count({ where: { companyId, status: 'ISSUED', lines: { some: { taxCodeId: id } } } }),
    ]);
    if (issuedInvoices + issuedBills) throw new ApiError(409, 'TAX_ACCOUNT_IN_USE', 'Tax account cannot change while issued, unposted documents use this tax code');
  }
  const updated = await tx.taxCode.update({ where: { id }, data: changes(body), include: { account: { select: { id: true, code: true, nameEn: true } } } });
  await audit(tx, actor, body.isActive !== undefined && body.isActive !== existing.isActive
    ? `accounting.tax_code.${body.isActive ? 'activated' : 'deactivated'}`
    : 'accounting.tax_code.updated', 'TaxCode', id, auditPayload(body));
  return updated;
}

export async function createChargeItem(tx: Tx, companyId: string, body: ChargeItemCreateBody, actor: Actor) {
  const company = await requireCompany(tx, companyId);
  await assertUniqueCode(tx, companyId, 'chargeItem', body.code);
  const currency = body.currency?.toUpperCase() ?? company.baseCurrency.toUpperCase();
  if (currency !== company.baseCurrency.toUpperCase()) throw ApiError.badRequest('Charge item currency must match the company base currency');
  if (body.taxCodeId) await requireActiveTaxCode(tx, companyId, body.taxCodeId);
  const chargeItem = await tx.chargeItem.create({
    data: { companyId, ...body, currency, defaultPrice: body.defaultPrice === undefined || body.defaultPrice === null ? null : money(body.defaultPrice), isActive: true },
    include: { taxCode: { select: { id: true, code: true, nameEn: true, ratePercent: true, isActive: true } } },
  });
  await audit(tx, actor, 'accounting.charge_item.created', 'ChargeItem', chargeItem.id, changes(body) as Prisma.InputJsonValue);
  return chargeItem;
}

export async function updateChargeItem(tx: Tx, companyId: string, id: string, body: ChargeItemUpdateBody, actor: Actor) {
  const existing = await requireScoped(await tx.chargeItem.findFirst({
    where: { id, companyId },
    include: { _count: { select: { invoiceLines: true, billLines: true } } },
  }), 'Charge item');
  if (body.code) await assertUniqueCode(tx, companyId, 'chargeItem', body.code, id);
  const company = await requireCompany(tx, companyId);
  const currency = body.currency?.toUpperCase() ?? existing.currency.toUpperCase();
  if (currency !== company.baseCurrency.toUpperCase()) throw ApiError.badRequest('Charge item currency must match the company base currency');
  if (body.taxCodeId) await requireActiveTaxCode(tx, companyId, body.taxCodeId);
  if (body.type && body.type !== existing.type && existing._count.invoiceLines + existing._count.billLines > 0) {
    throw new ApiError(409, 'CHARGE_TYPE_IN_USE', 'Charge type cannot change after invoice or bill lines reference the item');
  }
  const updated = await tx.chargeItem.update({
    where: { id },
    data: { ...changes(body), ...(body.defaultPrice !== undefined ? { defaultPrice: body.defaultPrice === null ? null : money(body.defaultPrice) } : {}) },
    include: { taxCode: { select: { id: true, code: true, nameEn: true, ratePercent: true, isActive: true } } },
  });
  await audit(tx, actor, body.isActive !== undefined && body.isActive !== existing.isActive
    ? `accounting.charge_item.${body.isActive ? 'activated' : 'deactivated'}`
    : 'accounting.charge_item.updated', 'ChargeItem', id, auditPayload(body));
  return updated;
}
