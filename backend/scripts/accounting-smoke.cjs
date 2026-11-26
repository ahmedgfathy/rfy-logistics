const { Prisma, PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const base = 'http://127.0.0.1:3000/api/v1';
const marker = `accounting-smoke-${Date.now()}`;
const date = new Date().toISOString().slice(0, 10);
const ids = { invoiceIds: [], billIds: [], paymentIds: [], entryIds: [], reconciliationIds: [], accountIds: [], journalIds: [], bankAccountIds: [], taxCodeIds: [], chargeItemIds: [], fiscalYearIds: [] };
const none = '00000000-0000-0000-0000-000000000000';
let cookie;
let keySequence = 0;
let periodLockedByTest = false;

function nextKey(label) {
  keySequence += 1;
  return `${marker}:${label}:${keySequence}`;
}

async function request(step, url, options = {}, expected = 200) {
  const response = await fetch(`${base}${url}`, {
    ...options,
    headers: { ...(cookie ? { cookie } : {}), ...(options.headers ?? {}) },
  });
  const payload = await response.json().catch(() => null);
  if (response.status !== expected) {
    throw new Error(`${step}: expected ${expected}, received ${response.status}: ${JSON.stringify(payload)}`);
  }
  console.log(`${step}: ${response.status}`);
  return payload;
}

function mutate(step, method, url, body, expected = 200, key = nextKey(step)) {
  return request(step, url, {
    method,
    headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body ?? {}),
  }, expected);
}

function decimal(value) {
  return new Prisma.Decimal(value);
}

function assertEqual(actual, expected, label) {
  if (!decimal(actual).eq(expected)) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

async function createPartner(type) {
  const response = await request(`create ${type.toLowerCase()}`, '/erp/partners', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type,
      nameEn: `${marker} ${type.toLowerCase()}`,
      email: `${marker}-${type.toLowerCase()}@example.test`,
      countryCode: 'EG',
      currency: 'EGP',
      paymentTermDays: 15,
    }),
  }, 201);
  return response.data;
}

async function createInvoice(customerId, amount = '100', label = 'invoice') {
  const key = nextKey(`${label}-create`);
  const body = {
    customerId,
    currency: 'EGP',
    exchangeRate: '1',
    issueDate: date,
    lines: [{ description: `${marker} ${label}`, quantity: '1', unitPrice: amount, taxPercent: '14' }],
  };
  const response = await mutate(`${label} create`, 'POST', '/erp/accounting/invoices', body, 201, key);
  ids.invoiceIds.push(response.data.id);
  return { ...response.data, requestBody: body, idempotencyKey: key };
}

async function createBill(vendorId, amount = '100', label = 'bill') {
  const response = await mutate(`${label} create`, 'POST', '/erp/accounting/bills', {
    vendorId,
    currency: 'EGP',
    exchangeRate: '1',
    issueDate: date,
    lines: [{ description: `${marker} ${label}`, quantity: '1', unitPrice: amount, taxPercent: '14' }],
  }, 201);
  ids.billIds.push(response.data.id);
  return response.data;
}

async function issueAndPostInvoice(invoice, label) {
  await mutate(`${label} issue`, 'POST', `/erp/accounting/invoices/${invoice.id}/issue`, {});
  const posted = await mutate(`${label} post`, 'POST', `/erp/accounting/invoices/${invoice.id}/post`, { entryDate: date });
  ids.entryIds.push(posted.data.postedEntry.id);
  return posted.data;
}

async function issueAndPostBill(bill, label) {
  await mutate(`${label} issue`, 'POST', `/erp/accounting/bills/${bill.id}/issue`, {});
  const posted = await mutate(`${label} post`, 'POST', `/erp/accounting/bills/${bill.id}/post`, { entryDate: date });
  ids.entryIds.push(posted.data.postedEntry.id);
  return posted.data;
}

async function createAndPostPayment(body, label) {
  const created = await mutate(`${label} create`, 'POST', '/erp/accounting/payments', body, 201);
  ids.paymentIds.push(created.data.id);
  const posted = await mutate(`${label} post`, 'POST', `/erp/accounting/payments/${created.data.id}/post`, { entryDate: date });
  ids.entryIds.push(posted.data.postedEntry.id);
  return posted.data;
}

async function cleanup() {
  if (periodLockedByTest && ids.periodId) {
    await prisma.accountingPeriod.update({
      where: { id: ids.periodId },
      data: {
        status: ids.periodOriginal.status,
        lockedAt: ids.periodOriginal.lockedAt,
        lockedById: ids.periodOriginal.lockedById,
      },
    });
  }

  const invoiceIds = ids.invoiceIds.length ? ids.invoiceIds : [none];
  const billIds = ids.billIds.length ? ids.billIds : [none];
  const paymentIds = ids.paymentIds.length ? ids.paymentIds : [none];
  const reconciliationIds = ids.reconciliationIds.length ? ids.reconciliationIds : [none];
  const sourceIds = [...invoiceIds, ...billIds, ...paymentIds];
  const partnerIds = [ids.customerId, ids.vendorId].filter(Boolean);
  const configurationIds = [
    ...ids.accountIds, ...ids.journalIds, ...ids.bankAccountIds, ...ids.taxCodeIds,
    ...ids.chargeItemIds, ...ids.fiscalYearIds,
  ];
  const entityIds = [
    ...invoiceIds,
    ...billIds,
    ...paymentIds,
    ...reconciliationIds,
    ...ids.entryIds,
    ...(ids.reconciliationItemId ? [ids.reconciliationItemId] : []),
    ...partnerIds,
    ...configurationIds,
  ].filter((id) => id !== none);

  await prisma.$transaction([
    prisma.chargeItem.deleteMany({ where: { id: { in: ids.chargeItemIds.length ? ids.chargeItemIds : [none] } } }),
    prisma.taxCode.deleteMany({ where: { id: { in: ids.taxCodeIds.length ? ids.taxCodeIds : [none] } } }),
    prisma.bankAccount.deleteMany({ where: { id: { in: ids.bankAccountIds.length ? ids.bankAccountIds : [none] } } }),
    prisma.journal.deleteMany({ where: { id: { in: ids.journalIds.length ? ids.journalIds : [none] } } }),
    prisma.fiscalYear.deleteMany({ where: { id: { in: ids.fiscalYearIds.length ? ids.fiscalYearIds : [none] } } }),
    prisma.account.deleteMany({ where: { id: { in: ids.accountIds.length ? ids.accountIds : [none] } } }),
    prisma.reconciliation.deleteMany({ where: { id: { in: reconciliationIds } } }),
    prisma.invoice.updateMany({ where: { id: { in: invoiceIds } }, data: { postedEntryId: null } }),
    prisma.bill.updateMany({ where: { id: { in: billIds } }, data: { postedEntryId: null } }),
    prisma.payment.updateMany({ where: { id: { in: paymentIds } }, data: { postedEntryId: null } }),
    prisma.journalEntry.deleteMany({ where: { companyId: ids.companyId ?? none, sourceId: { in: sourceIds } } }),
    prisma.payment.deleteMany({ where: { id: { in: paymentIds } } }),
    prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } }),
    prisma.bill.deleteMany({ where: { id: { in: billIds } } }),
    prisma.businessPartner.deleteMany({ where: { id: { in: partnerIds.length ? partnerIds : [none] } } }),
    prisma.idempotencyRecord.deleteMany({ where: { companyId: ids.companyId ?? none, key: { startsWith: `${marker}:` } } }),
    ...(entityIds.length ? [prisma.auditLog.deleteMany({ where: { entityId: { in: entityIds } } })] : []),
  ]);
  console.log('cleanup: complete');
}

(async () => {
  try {
    const company = await prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!company) throw new Error('ERP reference data is not seeded');
    ids.companyId = company.id;
    const period = await prisma.accountingPeriod.findFirst({
      where: { fiscalYear: { companyId: company.id }, startDate: { lte: new Date(`${date}T00:00:00.000Z`) }, endDate: { gte: new Date(`${date}T00:00:00.000Z`) } },
      orderBy: [{ startDate: 'desc' }, { number: 'desc' }],
    });
    if (!period) throw new Error('No fiscal period covers today');
    ids.periodId = period.id;
    ids.periodOriginal = { status: period.status, lockedAt: period.lockedAt, lockedById: period.lockedById };
    const bankAccount = await prisma.bankAccount.findFirst({ where: { companyId: company.id, isActive: true } });
    if (!bankAccount) throw new Error('No active bank account is seeded');
    ids.bankAccountId = bankAccount.id;

    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
    });
    cookie = login.headers.get('set-cookie')?.split(';')[0];
    if (!login.ok || !cookie) throw new Error(`login failed: ${login.status}`);
    console.log('login: 200');

    const accounts = await request('list accounts', '/erp/accounting/accounts?limit=100');
    const journals = await request('list journals', '/erp/accounting/journals?limit=100');
    const periods = await request('list periods', '/erp/accounting/fiscal-periods?limit=100');
    if (!accounts.data.length || !journals.data.length || !periods.data.length) throw new Error('Accounting reference reads returned no data');

    const configCode = marker.toUpperCase();
    const account = await mutate('create account', 'POST', '/erp/accounting/accounts', {
      code: configCode, nameEn: marker, type: 'ASSET', normalBalance: 'DEBIT', currency: company.baseCurrency,
    }, 201);
    ids.accountIds.push(account.data.id);
    await mutate('edit account', 'PATCH', `/erp/accounting/accounts/${account.data.id}`, { nameEn: `${marker} updated` });
    await mutate('deactivate account', 'PATCH', `/erp/accounting/accounts/${account.data.id}`, { isActive: false, reason: 'Smoke test deactivation' });
    await mutate('reactivate account', 'PATCH', `/erp/accounting/accounts/${account.data.id}`, { isActive: true, reason: 'Smoke test reactivation' });

    const journal = await mutate('create journal', 'POST', '/erp/accounting/journals', {
      code: configCode, nameEn: marker, type: 'GENERAL',
    }, 201);
    ids.journalIds.push(journal.data.id);
    await mutate('edit journal', 'PATCH', `/erp/accounting/journals/${journal.data.id}`, { nameEn: `${marker} updated` });
    await mutate('deactivate journal', 'PATCH', `/erp/accounting/journals/${journal.data.id}`, { isActive: false, reason: 'Smoke test deactivation' });

    const fiscalYear = await mutate('create fiscal year', 'POST', '/erp/accounting/fiscal-years', {
      code: configCode, nameEn: marker, startDate: '2099-01-01', endDate: '2099-12-31',
    }, 201);
    ids.fiscalYearIds.push(fiscalYear.data.id);
    await mutate('reject overlapping fiscal year', 'POST', '/erp/accounting/fiscal-years', {
      code: `${configCode}-OVERLAP`, nameEn: `${marker} overlap`, startDate: '2099-06-01', endDate: '2100-05-31',
    }, 409);
    await mutate('create fiscal period', 'POST', '/erp/accounting/fiscal-periods', {
      fiscalYearId: fiscalYear.data.id, number: 1, name: 'January', startDate: '2099-01-01', endDate: '2099-01-31',
    }, 201);
    await mutate('reject overlapping fiscal period', 'POST', '/erp/accounting/fiscal-periods', {
      fiscalYearId: fiscalYear.data.id, number: 2, name: 'Overlap', startDate: '2099-01-15', endDate: '2099-02-15',
    }, 409);

    const configuredBank = await mutate('create bank account', 'POST', '/erp/accounting/bank-accounts', {
      code: configCode, name: marker, accountId: account.data.id, currency: company.baseCurrency, bankName: 'Smoke Bank',
    }, 201);
    ids.bankAccountIds.push(configuredBank.data.id);
    await mutate('edit bank account', 'PATCH', `/erp/accounting/bank-accounts/${configuredBank.data.id}`, { bankName: 'Updated Smoke Bank' });
    await mutate('deactivate bank account', 'PATCH', `/erp/accounting/bank-accounts/${configuredBank.data.id}`, { isActive: false, reason: 'Smoke test deactivation' });
    await mutate('reactivate bank account', 'PATCH', `/erp/accounting/bank-accounts/${configuredBank.data.id}`, { isActive: true, reason: 'Smoke test reactivation' });

    const taxCode = await mutate('create tax code', 'POST', '/erp/accounting/tax-codes', {
      code: configCode, nameEn: marker, ratePercent: '0',
    }, 201);
    ids.taxCodeIds.push(taxCode.data.id);
    await mutate('edit tax code', 'PATCH', `/erp/accounting/tax-codes/${taxCode.data.id}`, { nameEn: `${marker} updated` });
    await mutate('deactivate tax code', 'PATCH', `/erp/accounting/tax-codes/${taxCode.data.id}`, { isActive: false, reason: 'Smoke test deactivation' });
    await mutate('reactivate tax code', 'PATCH', `/erp/accounting/tax-codes/${taxCode.data.id}`, { isActive: true, reason: 'Smoke test reactivation' });

    const chargeItem = await mutate('create charge item', 'POST', '/erp/accounting/charge-items', {
      code: configCode, nameEn: marker, type: 'FREIGHT', defaultPrice: '125.50', currency: company.baseCurrency, taxCodeId: taxCode.data.id,
    }, 201);
    ids.chargeItemIds.push(chargeItem.data.id);
    await mutate('edit charge item', 'PATCH', `/erp/accounting/charge-items/${chargeItem.data.id}`, { defaultPrice: '150.00' });
    await mutate('deactivate charge item', 'PATCH', `/erp/accounting/charge-items/${chargeItem.data.id}`, { isActive: false, reason: 'Smoke test deactivation' });

    ids.customerId = (await createPartner('CUSTOMER')).id;
    ids.vendorId = (await createPartner('VENDOR')).id;

    const cashAccount = accounts.data.find((account) => account.systemCode === 'CASH' && account.isPostable && account.isActive);
    const revenueAccount = accounts.data.find((account) => account.systemCode === 'SALES_REVENUE' && account.isPostable && account.isActive);
    const generalJournal = journals.data.find((journal) => journal.type === 'GENERAL' && journal.isActive);
    if (!cashAccount || !revenueAccount || !generalJournal) throw new Error('Manual journal reference data is missing');
    const manualBody = {
      journalId: generalJournal.id,
      entryDate: date,
      description: `${marker} opening adjustment`,
      currency: company.baseCurrency,
      exchangeRate: '1',
      lines: [
        { accountId: cashAccount.id, debit: '75', credit: '0', description: 'Cash adjustment' },
        { accountId: revenueAccount.id, debit: '0', credit: '75', description: 'Revenue adjustment' },
      ],
    };
    await mutate('reject unbalanced manual journal', 'POST', '/erp/accounting/journal-entries', {
      ...manualBody,
      lines: [manualBody.lines[0], { ...manualBody.lines[1], credit: '74' }],
    }, 400);
    const manualKey = nextKey('manual-journal-create');
    const manual = await mutate('create manual journal', 'POST', '/erp/accounting/journal-entries', manualBody, 201, manualKey);
    ids.entryIds.push(manual.data.id);
    if (manual.data.status !== 'POSTED' || manual.data.sourceType !== 'MANUAL') throw new Error('Manual journal was not posted correctly');
    const manualReplay = await mutate('manual journal create replay', 'POST', '/erp/accounting/journal-entries', manualBody, 201, manualKey);
    if (manualReplay.data.id !== manual.data.id) throw new Error('Idempotent manual journal replay returned a different entry');
    await mutate('manual journal idempotency conflict', 'POST', '/erp/accounting/journal-entries', { ...manualBody, description: 'different request' }, 409, manualKey);

    const invoice = await createInvoice(ids.customerId, '100', 'customer invoice');
    assertEqual(invoice.total, '114', 'invoice total');
    const updatedInvoiceDraft = await mutate('update invoice draft', 'PATCH', `/erp/accounting/invoices/${invoice.id}`, { ...invoice.requestBody, notes: 'Updated before issue' });
    if (updatedInvoiceDraft.data.notes !== 'Updated before issue') throw new Error('Invoice draft update was not persisted');
    const disposableInvoice = await createInvoice(ids.customerId, '5', 'disposable invoice');
    await mutate('delete invoice draft', 'DELETE', `/erp/accounting/invoices/${disposableInvoice.id}`);
    await request('read deleted invoice draft', `/erp/accounting/invoices/${disposableInvoice.id}`, {}, 404);
    const invoiceReplay = await mutate('invoice create replay', 'POST', '/erp/accounting/invoices', invoice.requestBody, 201, invoice.idempotencyKey);
    if (invoiceReplay.data.id !== invoice.id) throw new Error('Idempotent invoice replay returned a different record');
    await mutate('invoice idempotency conflict', 'POST', '/erp/accounting/invoices', { ...invoice.requestBody, notes: 'different request' }, 409, invoice.idempotencyKey);
    const postedInvoice = await issueAndPostInvoice(invoice, 'customer invoice');
    if (postedInvoice.status !== 'ISSUED') throw new Error(`Unexpected invoice status ${postedInvoice.status}`);
    await mutate('duplicate invoice post', 'POST', `/erp/accounting/invoices/${invoice.id}/post`, { entryDate: date }, 409);
    await mutate('reject posted invoice edit', 'PATCH', `/erp/accounting/invoices/${invoice.id}`, invoice.requestBody, 409);
    await mutate('reject posted invoice delete', 'DELETE', `/erp/accounting/invoices/${invoice.id}`, {}, 409);
    await mutate('reject direct reversal of invoice entry', 'POST', `/erp/accounting/journal-entries/${postedInvoice.postedEntry.id}/reverse`, { reason: 'Must void the invoice instead' }, 400);

    const bill = await createBill(ids.vendorId, '100', 'vendor bill');
    assertEqual(bill.total, '114', 'bill total');
    const billBody = {
      vendorId: ids.vendorId, currency: 'EGP', exchangeRate: '1', issueDate: date, notes: 'Updated before issue',
      lines: [{ description: `${marker} vendor bill`, quantity: '1', unitPrice: '100', taxPercent: '14' }],
    };
    const updatedBillDraft = await mutate('update bill draft', 'PATCH', `/erp/accounting/bills/${bill.id}`, billBody);
    if (updatedBillDraft.data.notes !== 'Updated before issue') throw new Error('Bill draft update was not persisted');
    const disposableBill = await createBill(ids.vendorId, '5', 'disposable bill');
    await mutate('delete bill draft', 'DELETE', `/erp/accounting/bills/${disposableBill.id}`);
    await request('read deleted bill draft', `/erp/accounting/bills/${disposableBill.id}`, {}, 404);
    const postedBill = await issueAndPostBill(bill, 'vendor bill');
    if (postedBill.status !== 'ISSUED') throw new Error(`Unexpected bill status ${postedBill.status}`);
    await mutate('duplicate bill post', 'POST', `/erp/accounting/bills/${bill.id}/post`, { entryDate: date }, 409);
    await mutate('reject posted bill edit', 'PATCH', `/erp/accounting/bills/${bill.id}`, billBody, 409);
    await mutate('reject posted bill delete', 'DELETE', `/erp/accounting/bills/${bill.id}`, {}, 409);

    const draftReceiptBody = {
      direction: 'RECEIPT', partnerId: ids.customerId, method: 'BANK_TRANSFER', bankAccountId: bankAccount.id,
      paymentDate: date, amount: '20', allocations: [{ invoiceId: invoice.id, amount: '20' }],
    };
    const draftReceipt = await mutate('create draft receipt', 'POST', '/erp/accounting/payments', draftReceiptBody, 201);
    ids.paymentIds.push(draftReceipt.data.id);
    const updatedDraftReceipt = await mutate('update draft receipt', 'PATCH', `/erp/accounting/payments/${draftReceipt.data.id}`, { ...draftReceiptBody, amount: '25', allocations: [{ invoiceId: invoice.id, amount: '25' }] });
    assertEqual(updatedDraftReceipt.data.amount, '25', 'updated draft receipt amount');
    assertEqual(updatedDraftReceipt.data.allocations[0].amount, '25', 'updated draft receipt allocation');
    await mutate('delete draft receipt', 'DELETE', `/erp/accounting/payments/${draftReceipt.data.id}`);
    await request('read deleted draft receipt', `/erp/accounting/payments/${draftReceipt.data.id}`, {}, 404);

    const partialReceipt = await createAndPostPayment({
      direction: 'RECEIPT', partnerId: ids.customerId, method: 'BANK_TRANSFER', bankAccountId: bankAccount.id,
      paymentDate: date, amount: '50', allocations: [{ invoiceId: invoice.id, amount: '50' }],
    }, 'partial receipt');
    ids.partialReceiptId = partialReceipt.id;
    const partialInvoice = await request('read partially paid invoice', `/erp/accounting/invoices/${invoice.id}`);
    if (partialInvoice.data.status !== 'PARTIALLY_PAID') throw new Error('Invoice did not become partially paid');
    assertEqual(partialInvoice.data.balance, '64', 'partial invoice balance');
    await mutate('reject posted payment edit', 'PATCH', `/erp/accounting/payments/${partialReceipt.id}`, {
      direction: 'RECEIPT', partnerId: ids.customerId, method: 'BANK_TRANSFER', bankAccountId: bankAccount.id,
      paymentDate: date, amount: '50', allocations: [{ invoiceId: invoice.id, amount: '50' }],
    }, 409);
    await mutate('reject posted payment delete', 'DELETE', `/erp/accounting/payments/${partialReceipt.id}`, {}, 409);

    const reconciliation = await mutate('create reconciliation', 'POST', '/erp/accounting/reconciliations', {
      bankAccountId: bankAccount.id,
      statementStart: date,
      statementEnd: date,
      openingBalance: '0',
      closingBalance: '50',
      items: [{ statementDate: date, description: `${marker} bank receipt`, amount: '50' }],
    }, 201);
    ids.reconciliationIds.push(reconciliation.data.id);
    ids.reconciliationItemId = reconciliation.data.items[0].id;
    await mutate('correct reconciliation header', 'PATCH', `/erp/accounting/reconciliations/${reconciliation.data.id}`, { openingBalance: '0', reason: 'Smoke test header correction' });
    await mutate('correct reconciliation item', 'PATCH', `/erp/accounting/reconciliations/${reconciliation.data.id}/items/${ids.reconciliationItemId}`, { reference: marker, reason: 'Smoke test item correction' });
    await mutate('match reconciliation item', 'POST', `/erp/accounting/reconciliations/${reconciliation.data.id}/items/${ids.reconciliationItemId}/match`, { paymentId: partialReceipt.id });
    await mutate('unmatch reconciliation item', 'POST', `/erp/accounting/reconciliations/${reconciliation.data.id}/items/${ids.reconciliationItemId}/unmatch`, { reason: 'Smoke test rematch' });
    await mutate('rematch reconciliation item', 'POST', `/erp/accounting/reconciliations/${reconciliation.data.id}/items/${ids.reconciliationItemId}/match`, { paymentId: partialReceipt.id });
    await mutate('review reconciliation', 'POST', `/erp/accounting/reconciliations/${reconciliation.data.id}/review`, {});
    const reopened = await mutate('reopen reviewed reconciliation', 'POST', `/erp/accounting/reconciliations/${reconciliation.data.id}/reopen`, { reason: 'Smoke test reopen' });
    if (reopened.data.status !== 'DRAFT') throw new Error('Reviewed reconciliation was not reopened');
    await mutate('review reopened reconciliation', 'POST', `/erp/accounting/reconciliations/${reconciliation.data.id}/review`, {});
    const approved = await mutate('approve reconciliation', 'POST', `/erp/accounting/reconciliations/${reconciliation.data.id}/approve`, {});
    if (approved.data.status !== 'APPROVED') throw new Error('Reconciliation was not approved');
    await mutate('reject approved reconciliation edit', 'PATCH', `/erp/accounting/reconciliations/${reconciliation.data.id}`, { openingBalance: '0', reason: 'Must be rejected' }, 409);
    await mutate('reject approved reconciliation delete', 'POST', `/erp/accounting/reconciliations/${reconciliation.data.id}/delete`, { reason: 'Must be rejected' }, 409);

    const disposableReconciliation = await mutate('create disposable reconciliation', 'POST', '/erp/accounting/reconciliations', {
      bankAccountId: bankAccount.id,
      statementStart: date,
      statementEnd: date,
      openingBalance: '0',
      closingBalance: '1',
      items: [{ statementDate: date, description: `${marker} disposable statement item`, amount: '1' }],
    }, 201);
    ids.reconciliationIds.push(disposableReconciliation.data.id);
    await mutate('delete draft reconciliation', 'POST', `/erp/accounting/reconciliations/${disposableReconciliation.data.id}/delete`, { reason: 'Smoke test cleanup' });
    await request('read deleted reconciliation', `/erp/accounting/reconciliations/${disposableReconciliation.data.id}`, {}, 404);

    await createAndPostPayment({
      direction: 'RECEIPT', partnerId: ids.customerId, method: 'BANK_TRANSFER', bankAccountId: bankAccount.id,
      paymentDate: date, amount: '64', allocations: [{ invoiceId: invoice.id, amount: '64' }],
    }, 'final receipt');
    const paidInvoice = await request('read paid invoice', `/erp/accounting/invoices/${invoice.id}`);
    if (paidInvoice.data.status !== 'PAID') throw new Error('Invoice did not become paid');
    assertEqual(paidInvoice.data.balance, '0', 'paid invoice balance');
    await mutate('reject over-allocation', 'POST', '/erp/accounting/payments', {
      direction: 'RECEIPT', partnerId: ids.customerId, method: 'BANK_TRANSFER', bankAccountId: bankAccount.id,
      paymentDate: date, amount: '1', allocations: [{ invoiceId: invoice.id, amount: '1' }],
    }, 409);

    await createAndPostPayment({
      direction: 'PAYMENT', partnerId: ids.vendorId, method: 'BANK_TRANSFER', bankAccountId: bankAccount.id,
      paymentDate: date, amount: '40', allocations: [{ billId: bill.id, amount: '40' }],
    }, 'partial vendor payment');
    await createAndPostPayment({
      direction: 'PAYMENT', partnerId: ids.vendorId, method: 'BANK_TRANSFER', bankAccountId: bankAccount.id,
      paymentDate: date, amount: '74', allocations: [{ billId: bill.id, amount: '74' }],
    }, 'final vendor payment');
    const paidBill = await request('read paid bill', `/erp/accounting/bills/${bill.id}`);
    if (paidBill.data.status !== 'PAID') throw new Error('Bill did not become paid');
    assertEqual(paidBill.data.balance, '0', 'paid bill balance');

    const reversiblePayment = await createAndPostPayment({
      direction: 'RECEIPT', partnerId: ids.customerId, method: 'BANK_TRANSFER', bankAccountId: bankAccount.id,
      paymentDate: date, amount: '10', allocations: [],
    }, 'reversible receipt');
    const voidPayment = await mutate('void payment', 'POST', `/erp/accounting/payments/${reversiblePayment.id}/void`, { reason: 'Smoke test reversal' });
    if (voidPayment.data.status !== 'VOID' || !voidPayment.data.postedEntry.reversals.length) throw new Error('Payment reversal invariants failed');

    const reversibleInvoice = await createInvoice(ids.customerId, '20', 'reversible invoice');
    await issueAndPostInvoice(reversibleInvoice, 'reversible invoice');
    const voidInvoice = await mutate('void invoice', 'POST', `/erp/accounting/invoices/${reversibleInvoice.id}/void`, { reason: 'Smoke test reversal' });
    if (voidInvoice.data.status !== 'VOID' || !voidInvoice.data.postedEntry.reversals.length) throw new Error('Invoice reversal invariants failed');

    const reversibleBill = await createBill(ids.vendorId, '20', 'reversible bill');
    await issueAndPostBill(reversibleBill, 'reversible bill');
    const voidBill = await mutate('void bill', 'POST', `/erp/accounting/bills/${reversibleBill.id}/void`, { reason: 'Smoke test reversal' });
    if (voidBill.data.status !== 'VOID' || !voidBill.data.postedEntry.reversals.length) throw new Error('Bill reversal invariants failed');

    const manualReversal = await mutate('reverse manual journal', 'POST', `/erp/accounting/journal-entries/${manual.data.id}/reverse`, { entryDate: date, reason: 'Smoke test reversal' });
    ids.entryIds.push(manualReversal.data.id);
    if (!manualReversal.data.reversedEntryId) throw new Error('Manual journal reversal was not linked to its original entry');
    assertEqual(manualReversal.data.totalDebit, manualReversal.data.totalCredit, 'manual journal reversal balance');
    await mutate('reject duplicate manual journal reversal', 'POST', `/erp/accounting/journal-entries/${manual.data.id}/reverse`, { entryDate: date, reason: 'Duplicate reversal' }, 409);

    const lockedInvoice = await createInvoice(ids.customerId, '30', 'locked period invoice');
    await mutate('locked period invoice issue', 'POST', `/erp/accounting/invoices/${lockedInvoice.id}/issue`, {});
    await mutate('lock fiscal period', 'PATCH', `/erp/accounting/fiscal-periods/${period.id}`, { status: 'LOCKED', reason: 'Smoke test' });
    periodLockedByTest = true;
    await mutate('reject locked period posting', 'POST', `/erp/accounting/invoices/${lockedInvoice.id}/post`, { entryDate: date }, 409);
    await mutate('reject locked period manual journal', 'POST', '/erp/accounting/journal-entries', manualBody, 409);
    await mutate('unlock fiscal period', 'PATCH', `/erp/accounting/fiscal-periods/${period.id}`, { status: ids.periodOriginal.status });
    periodLockedByTest = false;

    const trialBalance = await request('trial balance', `/erp/accounting/reports/trial-balance?from=${date}&to=${date}`);
    if (!trialBalance.meta.balanced) throw new Error('Trial balance is not balanced');
    assertEqual(trialBalance.data.totals.difference, '0', 'trial balance difference');
    await request('profit and loss', `/erp/accounting/reports/profit-and-loss?from=${date}&to=${date}`);
    await request('receivables', `/erp/accounting/reports/receivables?from=${date}&to=${date}`);
    await request('payables', `/erp/accounting/reports/payables?from=${date}&to=${date}`);

    console.log('Accounting workflow smoke test: passed');
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
