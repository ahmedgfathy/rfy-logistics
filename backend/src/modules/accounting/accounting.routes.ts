import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  accountCreateSchema,
  accountQuerySchema,
  accountUpdateSchema,
  bankAccountCreateSchema,
  bankAccountQuerySchema,
  bankAccountUpdateSchema,
  billCreateSchema,
  billQuerySchema,
  chargeItemCreateSchema,
  chargeItemQuerySchema,
  chargeItemUpdateSchema,
  documentIssueSchema,
  fiscalPeriodCreateSchema,
  fiscalYearCreateSchema,
  fiscalYearQuerySchema,
  idParamsSchema,
  invoiceCreateSchema,
  invoiceQuerySchema,
  journalCreateSchema,
  journalEntryQuerySchema,
  journalQuerySchema,
  journalUpdateSchema,
  manualJournalCreateSchema,
  manualJournalReverseSchema,
  paymentCreateSchema,
  paymentQuerySchema,
  periodQuerySchema,
  periodStatusSchema,
  postingSchema,
  reconciliationCreateSchema,
  reconciliationItemParamsSchema,
  reconciliationItemUpdateSchema,
  reconciliationMatchSchema,
  reconciliationQuerySchema,
  reconciliationReasonSchema,
  reconciliationUnmatchSchema,
  reconciliationUpdateSchema,
  reportQuerySchema,
  taxCodeCreateSchema,
  taxCodeQuerySchema,
  taxCodeUpdateSchema,
  voidSchema,
} from './accounting.schemas';
import {
  approveReconciliationHandler,
  createBillHandler,
  createEntryHandler,
  createInvoiceHandler,
  createPaymentHandler,
  createReconciliationHandler,
  deleteBillHandler,
  deleteInvoiceHandler,
  deletePaymentHandler,
  deleteReconciliationHandler,
  getBill,
  getEntry,
  getInvoice,
  getPayment,
  getReconciliation,
  issueBillHandler,
  issueInvoiceHandler,
  listAccounts,
  listBills,
  listInvoices,
  listJournalEntries,
  listJournals,
  listPayments,
  listPeriods,
  listReconciliations,
  matchReconciliationItemHandler,
  payables,
  postBillHandler,
  postInvoiceHandler,
  postPaymentHandler,
  profitAndLoss,
  receivables,
  reopenReconciliationHandler,
  reverseEntryHandler,
  reviewReconciliationHandler,
  trialBalance,
  unmatchReconciliationItemHandler,
  updateReconciliationHandler,
  updateReconciliationItemHandler,
  updateBillHandler,
  updateInvoiceHandler,
  updatePaymentHandler,
  updatePeriod,
  voidBillHandler,
  voidInvoiceHandler,
  voidPaymentHandler,
} from './accounting.controller';
import {
  createAccountHandler,
  createBankAccountHandler,
  createChargeItemHandler,
  createFiscalPeriodHandler,
  createFiscalYearHandler,
  createJournalHandler,
  createTaxCodeHandler,
  listBankAccounts,
  listChargeItems,
  listFiscalYears,
  listTaxCodes,
  updateAccountHandler,
  updateBankAccountHandler,
  updateChargeItemHandler,
  updateJournalHandler,
  updateTaxCodeHandler,
} from './accounting.configuration.controller';

export const accountingRoutes = Router();
accountingRoutes.use(requireAuth);

accountingRoutes.get('/accounts', requirePermission('accounting.read'), validate({ query: accountQuerySchema }), asyncHandler(listAccounts));
accountingRoutes.get('/chart-of-accounts', requirePermission('accounting.read'), validate({ query: accountQuerySchema }), asyncHandler(listAccounts));
accountingRoutes.post('/accounts', requirePermission('accounting.write'), validate({ body: accountCreateSchema }), asyncHandler(createAccountHandler));
accountingRoutes.patch('/accounts/:id', requirePermission('accounting.write'), validate({ params: idParamsSchema, body: accountUpdateSchema }), asyncHandler(updateAccountHandler));
accountingRoutes.get('/journals', requirePermission('accounting.read'), validate({ query: journalQuerySchema }), asyncHandler(listJournals));
accountingRoutes.post('/journals', requirePermission('accounting.write'), validate({ body: journalCreateSchema }), asyncHandler(createJournalHandler));
accountingRoutes.patch('/journals/:id', requirePermission('accounting.write'), validate({ params: idParamsSchema, body: journalUpdateSchema }), asyncHandler(updateJournalHandler));
accountingRoutes.get('/journal-entries', requirePermission('accounting.read'), validate({ query: journalEntryQuerySchema }), asyncHandler(listJournalEntries));
accountingRoutes.post('/journal-entries', requirePermission('accounting.post'), validate({ body: manualJournalCreateSchema }), asyncHandler(createEntryHandler));
accountingRoutes.get('/journal-entries/:id', requirePermission('accounting.read'), validate({ params: idParamsSchema }), asyncHandler(getEntry));
accountingRoutes.post('/journal-entries/:id/reverse', requirePermission('accounting.post'), validate({ params: idParamsSchema, body: manualJournalReverseSchema }), asyncHandler(reverseEntryHandler));
accountingRoutes.get('/fiscal-years', requirePermission('accounting.read'), validate({ query: fiscalYearQuerySchema }), asyncHandler(listFiscalYears));
accountingRoutes.post('/fiscal-years', requirePermission('accounting.write'), requirePermission('accounting.period.lock'), validate({ body: fiscalYearCreateSchema }), asyncHandler(createFiscalYearHandler));
accountingRoutes.get('/fiscal-periods', requirePermission('accounting.read'), validate({ query: periodQuerySchema }), asyncHandler(listPeriods));
accountingRoutes.get('/periods', requirePermission('accounting.read'), validate({ query: periodQuerySchema }), asyncHandler(listPeriods));
accountingRoutes.post('/fiscal-periods', requirePermission('accounting.write'), requirePermission('accounting.period.lock'), validate({ body: fiscalPeriodCreateSchema }), asyncHandler(createFiscalPeriodHandler));
accountingRoutes.patch('/fiscal-periods/:id', requirePermission('accounting.period.lock'), validate({ params: idParamsSchema, body: periodStatusSchema }), asyncHandler(updatePeriod));
accountingRoutes.patch('/periods/:id', requirePermission('accounting.period.lock'), validate({ params: idParamsSchema, body: periodStatusSchema }), asyncHandler(updatePeriod));

accountingRoutes.get('/bank-accounts', requirePermission('accounting.read'), validate({ query: bankAccountQuerySchema }), asyncHandler(listBankAccounts));
accountingRoutes.post('/bank-accounts', requirePermission('accounting.write'), validate({ body: bankAccountCreateSchema }), asyncHandler(createBankAccountHandler));
accountingRoutes.patch('/bank-accounts/:id', requirePermission('accounting.write'), validate({ params: idParamsSchema, body: bankAccountUpdateSchema }), asyncHandler(updateBankAccountHandler));
accountingRoutes.get('/tax-codes', requirePermission('accounting.read'), validate({ query: taxCodeQuerySchema }), asyncHandler(listTaxCodes));
accountingRoutes.post('/tax-codes', requirePermission('accounting.write'), validate({ body: taxCodeCreateSchema }), asyncHandler(createTaxCodeHandler));
accountingRoutes.patch('/tax-codes/:id', requirePermission('accounting.write'), validate({ params: idParamsSchema, body: taxCodeUpdateSchema }), asyncHandler(updateTaxCodeHandler));
accountingRoutes.get('/charge-items', requirePermission('accounting.read'), validate({ query: chargeItemQuerySchema }), asyncHandler(listChargeItems));
accountingRoutes.post('/charge-items', requirePermission('accounting.write'), validate({ body: chargeItemCreateSchema }), asyncHandler(createChargeItemHandler));
accountingRoutes.patch('/charge-items/:id', requirePermission('accounting.write'), validate({ params: idParamsSchema, body: chargeItemUpdateSchema }), asyncHandler(updateChargeItemHandler));

accountingRoutes.get('/invoices', requirePermission('accounting.read'), validate({ query: invoiceQuerySchema }), asyncHandler(listInvoices));
accountingRoutes.post('/invoices', requirePermission('accounting.write'), validate({ body: invoiceCreateSchema }), asyncHandler(createInvoiceHandler));
accountingRoutes.get('/invoices/:id', requirePermission('accounting.read'), validate({ params: idParamsSchema }), asyncHandler(getInvoice));
accountingRoutes.patch('/invoices/:id', requirePermission('accounting.write'), validate({ params: idParamsSchema, body: invoiceCreateSchema }), asyncHandler(updateInvoiceHandler));
accountingRoutes.delete('/invoices/:id', requirePermission('accounting.write'), validate({ params: idParamsSchema }), asyncHandler(deleteInvoiceHandler));
accountingRoutes.post('/invoices/:id/issue', requirePermission('accounting.write'), validate({ params: idParamsSchema, body: documentIssueSchema }), asyncHandler(issueInvoiceHandler));
accountingRoutes.post('/invoices/:id/post', requirePermission('accounting.post'), validate({ params: idParamsSchema, body: postingSchema }), asyncHandler(postInvoiceHandler));
accountingRoutes.post('/invoices/:id/void', requirePermission('accounting.post'), validate({ params: idParamsSchema, body: voidSchema }), asyncHandler(voidInvoiceHandler));

accountingRoutes.get('/bills', requirePermission('accounting.read'), validate({ query: billQuerySchema }), asyncHandler(listBills));
accountingRoutes.post('/bills', requirePermission('accounting.write'), validate({ body: billCreateSchema }), asyncHandler(createBillHandler));
accountingRoutes.get('/bills/:id', requirePermission('accounting.read'), validate({ params: idParamsSchema }), asyncHandler(getBill));
accountingRoutes.patch('/bills/:id', requirePermission('accounting.write'), validate({ params: idParamsSchema, body: billCreateSchema }), asyncHandler(updateBillHandler));
accountingRoutes.delete('/bills/:id', requirePermission('accounting.write'), validate({ params: idParamsSchema }), asyncHandler(deleteBillHandler));
accountingRoutes.post('/bills/:id/issue', requirePermission('accounting.write'), validate({ params: idParamsSchema, body: documentIssueSchema }), asyncHandler(issueBillHandler));
accountingRoutes.post('/bills/:id/post', requirePermission('accounting.post'), validate({ params: idParamsSchema, body: postingSchema }), asyncHandler(postBillHandler));
accountingRoutes.post('/bills/:id/void', requirePermission('accounting.post'), validate({ params: idParamsSchema, body: voidSchema }), asyncHandler(voidBillHandler));

accountingRoutes.get('/payments', requirePermission('accounting.read'), validate({ query: paymentQuerySchema }), asyncHandler(listPayments));
accountingRoutes.post('/payments', requirePermission('accounting.write'), validate({ body: paymentCreateSchema }), asyncHandler(createPaymentHandler));
accountingRoutes.get('/payments/:id', requirePermission('accounting.read'), validate({ params: idParamsSchema }), asyncHandler(getPayment));
accountingRoutes.patch('/payments/:id', requirePermission('accounting.write'), validate({ params: idParamsSchema, body: paymentCreateSchema }), asyncHandler(updatePaymentHandler));
accountingRoutes.delete('/payments/:id', requirePermission('accounting.write'), validate({ params: idParamsSchema }), asyncHandler(deletePaymentHandler));
accountingRoutes.post('/payments/:id/post', requirePermission('accounting.post'), validate({ params: idParamsSchema, body: postingSchema }), asyncHandler(postPaymentHandler));
accountingRoutes.post('/payments/:id/void', requirePermission('accounting.post'), validate({ params: idParamsSchema, body: voidSchema }), asyncHandler(voidPaymentHandler));

function reconciliationRoutes(prefix: string): void {
  accountingRoutes.get(prefix, requirePermission('accounting.read'), validate({ query: reconciliationQuerySchema }), asyncHandler(listReconciliations));
  accountingRoutes.post(prefix, requirePermission('accounting.write'), validate({ body: reconciliationCreateSchema }), asyncHandler(createReconciliationHandler));
  accountingRoutes.get(`${prefix}/:id`, requirePermission('accounting.read'), validate({ params: idParamsSchema }), asyncHandler(getReconciliation));
  accountingRoutes.patch(`${prefix}/:id`, requirePermission('accounting.write'), validate({ params: idParamsSchema, body: reconciliationUpdateSchema }), asyncHandler(updateReconciliationHandler));
  accountingRoutes.patch(`${prefix}/:id/items/:itemId`, requirePermission('accounting.write'), validate({ params: reconciliationItemParamsSchema, body: reconciliationItemUpdateSchema }), asyncHandler(updateReconciliationItemHandler));
  accountingRoutes.post(`${prefix}/:id/delete`, requirePermission('accounting.write'), validate({ params: idParamsSchema, body: reconciliationReasonSchema }), asyncHandler(deleteReconciliationHandler));
  accountingRoutes.post(`${prefix}/:id/reopen`, requirePermission('accounting.write'), validate({ params: idParamsSchema, body: reconciliationReasonSchema }), asyncHandler(reopenReconciliationHandler));
  accountingRoutes.post(`${prefix}/:id/items/:itemId/match`, requirePermission('accounting.write'), validate({ params: reconciliationItemParamsSchema, body: reconciliationMatchSchema }), asyncHandler(matchReconciliationItemHandler));
  accountingRoutes.post(`${prefix}/:id/items/:itemId/unmatch`, requirePermission('accounting.write'), validate({ params: reconciliationItemParamsSchema, body: reconciliationUnmatchSchema }), asyncHandler(unmatchReconciliationItemHandler));
  accountingRoutes.post(`${prefix}/:id/review`, requirePermission('accounting.write'), validate({ params: idParamsSchema }), asyncHandler(reviewReconciliationHandler));
  accountingRoutes.post(`${prefix}/:id/approve`, requirePermission('accounting.approve'), validate({ params: idParamsSchema }), asyncHandler(approveReconciliationHandler));
}
reconciliationRoutes('/reconciliations');
reconciliationRoutes('/bank-reconciliations');

accountingRoutes.get('/reports/trial-balance', requirePermission('accounting.read'), validate({ query: reportQuerySchema }), asyncHandler(trialBalance));
accountingRoutes.get('/reports/profit-and-loss', requirePermission('accounting.read'), validate({ query: reportQuerySchema }), asyncHandler(profitAndLoss));
accountingRoutes.get('/reports/receivables', requirePermission('accounting.read'), validate({ query: reportQuerySchema }), asyncHandler(receivables));
accountingRoutes.get('/reports/payables', requirePermission('accounting.read'), validate({ query: reportQuerySchema }), asyncHandler(payables));

export default accountingRoutes;
