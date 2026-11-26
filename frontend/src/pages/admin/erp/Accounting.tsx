import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Ban, Check, Eye, Link2, Lock, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, Unlink, X } from 'lucide-react';
import { api, ApiError, type Envelope } from '../../../lib/api';
import { AdminField as UiAdminField, AdminPage, EmptyRow, Panel, Table, Td, Th } from '../../../components/admin/ui';
import { Button } from '../../../components/ui/Button';
import { Input, Select, Textarea } from '../../../components/ui/Field';
import { Spinner } from '../../../components/ui/Spinner';
import { StatusPill } from '../../../components/ui/StatusPill';
import { formatDate, formatDateTime } from '../../../lib/utils';

type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
type JournalType = 'SALES' | 'PURCHASE' | 'CASH' | 'BANK' | 'GENERAL' | 'CUSTOMS' | 'OPENING';
type PeriodStatus = 'OPEN' | 'SOFT_CLOSED' | 'LOCKED';
type EntryStatus = 'DRAFT' | 'POSTED' | 'VOID';
type ReconciliationStatus = 'DRAFT' | 'REVIEWED' | 'APPROVED';
type AccountingTab = 'accounts' | 'journals' | 'periods' | 'bank-accounts' | 'tax-codes' | 'charge-items' | 'entries' | 'reconciliations' | 'reports';
type ReportKind = 'trial-balance' | 'profit-and-loss' | 'receivables' | 'payables';

interface PaginationMeta { total: number; page: number; limit: number; pages: number }
interface Account {
  id: string; code: string; nameEn: string; nameAr: string | null; type: AccountType; normalBalance: 'DEBIT' | 'CREDIT';
  parentId: string | null; systemCode: string | null; currency: string | null; isPostable: boolean; isActive: boolean;
  parent: { id: string; code: string; nameEn: string } | null; _count: { children: number; journalLines?: number; bankAccounts?: number; taxCodes?: number };
}
interface FiscalYear {
  id: string; code: string; nameEn: string; startDate: string; endDate: string; isClosed: boolean; _count: { periods: number };
}
interface Journal {
  id: string; code: string; nameEn: string; nameAr: string | null; type: JournalType; isSystem: boolean; isActive: boolean; _count: { entries: number };
}
interface Period {
  id: string; fiscalYearId: string; number: number; name: string; startDate: string; endDate: string; status: PeriodStatus; lockedAt: string | null;
  fiscalYear: { id: string; code: string; nameEn: string; startDate: string; endDate: string; isClosed: boolean };
}
interface JournalLine {
  id: string; description: string | null; debit: string; credit: string;
  account: { id: string; code: string; nameEn: string; nameAr: string | null; type: AccountType; normalBalance: 'DEBIT' | 'CREDIT' };
  partner: { id: string; code: string; nameEn: string } | null;
  paymentId: string | null;
}
interface JournalEntry {
  id: string; number: string; entryDate: string; status: EntryStatus; description: string; sourceType: string | null; sourceId: string | null;
  currency: string; exchangeRate: string; totalDebit: string; totalCredit: string; createdAt: string;
  journal: { id: string; code: string; nameEn: string; type: JournalType };
  period: { id: string; number: number; name: string; status: PeriodStatus };
  lines: JournalLine[];
  reversedEntry: { id: string; number: string; status: EntryStatus } | null;
  reversals: Array<{ id: string; number: string; status: EntryStatus; entryDate: string }>;
}
interface BankAccountOption {
  id: string; code: string; name: string; currency: string; accountId: string; isActive?: boolean;
  iban?: string | null; bankName?: string | null;
  account?: { id: string; code: string; nameEn: string; type?: AccountType; isActive?: boolean; isPostable?: boolean };
  _count?: { payments: number; reconciliations: number };
}
interface TaxCode {
  id: string; code: string; nameEn: string; nameAr: string | null; ratePercent: string; accountId: string | null; isActive: boolean;
  account: { id: string; code: string; nameEn: string; type: AccountType } | null;
  _count: { chargeItems: number; invoiceLines: number; billLines: number };
}
interface ChargeItem {
  id: string; code: string; nameEn: string; nameAr: string | null; type: string; defaultPrice: string | null; currency: string; taxCodeId: string | null; isActive: boolean;
  taxCode: { id: string; code: string; nameEn: string; ratePercent: string; isActive: boolean } | null;
  _count: { quoteLines: number; invoiceLines: number; billLines: number };
}
interface PaymentCandidate {
  id: string; number: string; direction: 'RECEIPT' | 'PAYMENT'; status: 'DRAFT' | 'POSTED' | 'VOID'; amount: string; currency: string; paymentDate: string; bankAccountId: string | null;
}
interface ReconciliationItem {
  id: string; statementDate: string; description: string; amount: string; reference: string | null; matchStatus: 'MATCHED' | 'UNMATCHED';
  paymentId: string | null; journalLineId: string | null;
  payment: { id: string; number: string; direction: 'RECEIPT' | 'PAYMENT'; status: string; amount: string; paymentDate: string } | null;
  journalLine: {
    id: string; debit: string; credit: string; description: string | null; paymentId: string | null;
    account: { id: string; code: string; nameEn: string };
    entry: { id: string; number: string; status: EntryStatus; entryDate: string; currency: string };
  } | null;
}
interface Reconciliation {
  id: string; bankAccountId: string; statementStart: string; statementEnd: string; openingBalance: string; closingBalance: string; status: ReconciliationStatus;
  reviewedById: string | null; approvedById: string | null; approvedAt: string | null; createdAt: string; updatedAt: string;
  bankAccount: BankAccountOption; items: ReconciliationItem[];
}
interface ReportRow {
  id?: string; code?: string; nameEn?: string; nameAr?: string | null; type?: AccountType; normalBalance?: 'DEBIT' | 'CREDIT';
  debit?: string; credit?: string; net?: string; amount?: string;
}
interface ReportPartner { id: string; code: string; nameEn: string; outstanding: string; overdue: string }
interface ReportItem {
  id: string; number: string; issueDate: string | null; dueDate: string | null; currency: string; total: string; paidAmount: string; outstanding: string;
  daysOverdue: number; agingBucket: 'CURRENT' | '1_30' | '31_60' | '61_90' | 'OVER_90';
  customer?: { id: string; code: string; nameEn: string }; vendor?: { id: string; code: string; nameEn: string };
}
interface ReportData {
  currency: string;
  period?: { from: string | null; to: string | null };
  asOf?: string;
  rows?: ReportRow[];
  totals?: { debit?: string; credit?: string; difference?: string; revenue?: string; expenses?: string; netProfit?: string };
  totalOutstanding?: string; overdue?: string; byAging?: Record<string, string>; byPartner?: ReportPartner[]; items?: ReportItem[];
}
interface ReportResponse { data: ReportData; meta?: Record<string, unknown> }

const accountTypes: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
const journalTypes: JournalType[] = ['SALES', 'PURCHASE', 'CASH', 'BANK', 'GENERAL', 'CUSTOMS', 'OPENING'];
const chargeItemTypes = ['FREIGHT', 'ORIGIN', 'DESTINATION', 'CUSTOMS', 'DUTY', 'TAX', 'INSURANCE', 'HANDLING', 'STORAGE', 'OTHER'];
const periodStatuses: PeriodStatus[] = ['OPEN', 'SOFT_CLOSED', 'LOCKED'];
const entryStatuses: EntryStatus[] = ['DRAFT', 'POSTED', 'VOID'];
const reconciliationStatuses: ReconciliationStatus[] = ['DRAFT', 'REVIEWED', 'APPROVED'];
const pageSize = 25;
const plainDecimal = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const signedDecimal = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const agingBuckets = ['CURRENT', '1_30', '31_60', '61_90', 'OVER_90'] as const;

function AdminField({ label, children, className, help }: { label: string; children: ReactNode; className?: string; help?: string }) {
  return <UiAdminField label={label} className={className}>{children}{help ? <span className="mt-1 block text-xs text-steel-500">{help}</span> : null}</UiAdminField>;
}
function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-steel-400">{label}</dt><dd className="mt-1 whitespace-pre-line break-words text-sm text-steel-700">{children || '—'}</dd></div>;
}
function messageFor(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const details = error.details ? Object.values(error.details).flat().filter(Boolean) : [];
  return [error.message, ...details].join(' ');
}
function nullable(value: string): string | null { const trimmed = value.trim(); return trimmed ? trimmed : null; }
function amount(value: string | null | undefined, currency: string): string { return value === null || value === undefined ? '—' : `${value} ${currency}`; }
function validUuid(value: string): boolean { return uuidPattern.test(value.trim()); }
function validUnsigned(value: string, min: number, max: number, scale: number): boolean {
  const trimmed = value.trim();
  if (!plainDecimal.test(trimmed) || (trimmed.split('.')[1] ?? '').length > scale) return false;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max;
}
function validSigned(value: string): boolean {
  const trimmed = value.trim();
  if (!signedDecimal.test(trimmed) || (trimmed.split('.')[1] ?? '').length > 2) return false;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && numeric >= -9999999999999999.99 && numeric <= 9999999999999999.99;
}
function cents(value: string): bigint | null {
  if (!plainDecimal.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
}
function signedCents(value: string): bigint | null {
  if (!signedDecimal.test(value.trim())) return null;
  const negative = value.trim().startsWith('-');
  const result = cents(negative ? value.trim().slice(1) : value.trim());
  return result === null ? null : negative ? -result : result;
}
function fromCents(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const result = `${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
  return negative ? `-${result}` : result;
}
function useOperationKey() {
  const last = useRef<{ payload: string; key: string } | null>(null);
  return {
    keyFor(body: unknown): string {
      const payload = JSON.stringify(body);
      if (!last.current || last.current.payload !== payload) last.current = { payload, key: crypto.randomUUID() };
      return last.current.key;
    },
    reset() { last.current = null; },
  };
}
async function fetchAllPages<T>(path: string, params: URLSearchParams): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;
  let pages = 1;
  do {
    params.set('page', String(page)); params.set('limit', '100');
    const response = await api.get<T[]>(`${path}?${params.toString()}`);
    rows.push(...response.data);
    pages = Number((response.meta as unknown as PaginationMeta | undefined)?.pages ?? 1);
    page += 1;
  } while (page <= pages);
  return rows;
}
function useBankAccountOptions() {
  return useQuery({
    queryKey: ['accounting', 'bank-account-options'],
    queryFn: async () => {
      const banks = await fetchAllPages<BankAccountOption>('/erp/accounting/bank-accounts', new URLSearchParams());
      return [...new Map(banks.map((bank) => [bank.id, bank])).values()].sort((a, b) => a.code.localeCompare(b.code));
    },
    staleTime: 30000,
  });
}
function useAccountOptions(activeOnly = false) {
  return useQuery({
    queryKey: ['accounting', 'account-options', activeOnly],
    queryFn: () => fetchAllPages<Account>('/erp/accounting/accounts', new URLSearchParams(activeOnly ? { isActive: 'true' } : {})),
    staleTime: 30000,
  });
}
function useFiscalYearOptions() {
  return useQuery({ queryKey: ['accounting', 'fiscal-year-options'], queryFn: () => fetchAllPages<FiscalYear>('/erp/accounting/fiscal-years', new URLSearchParams()), staleTime: 30000 });
}
function LoadingState({ label }: { label: string }) { return <div className="p-8"><Spinner label={label} /></div>; }
function ErrorState({ title, error, onRetry }: { title: string; error: unknown; onRetry: () => void }) {
  return <div className="space-y-3 p-6" role="alert"><p className="text-sm font-semibold text-red-700">{title}</p><p className="text-sm text-steel-500">{messageFor(error, 'Please try again.')}</p><Button variant="onlight" size="sm" onClick={onRetry}>Retry</Button></div>;
}
function Pagination({ meta, page, onPage, isFetching, label }: { meta: PaginationMeta; page: number; onPage: (page: number) => void; isFetching: boolean; label: string }) {
  return <nav aria-label={`${label} pagination`} className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs font-semibold text-steel-500">Page {meta.page} of {meta.pages}</span><div className="flex gap-2"><Button variant="onlight" size="sm" disabled={page <= 1 || isFetching} onClick={() => onPage(Math.max(1, page - 1))}>Previous</Button><Button variant="onlight" size="sm" disabled={page >= meta.pages || isFetching} onClick={() => onPage(page + 1)}>Next</Button></div></nav>;
}
function Feedback({ feedback }: { feedback: { kind: 'success' | 'error'; text: string } | null }) {
  return feedback ? <div role={feedback.kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${feedback.kind === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-brand-200 bg-brand-50 text-brand-800'}`}>{feedback.text}</div> : null;
}

interface SelectOption { id: string; label: string }
function SearchableSelect({ label, help, value, onChange, options, loading = false, error, disabled = false, required = false, emptyLabel = 'None', className }: {
  label: string; help?: string; value: string; onChange: (value: string) => void; options: SelectOption[]; loading?: boolean; error?: unknown; disabled?: boolean; required?: boolean; emptyLabel?: string; className?: string;
}) {
  const [search, setSearch] = useState('');
  const normalized = search.trim().toLocaleLowerCase();
  const visible = normalized ? options.filter((option) => option.label.toLocaleLowerCase().includes(normalized)) : options;
  return <AdminField label={label} className={className} help={help}>
    <div className="relative"><Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-steel-400" aria-hidden="true" /><Input dir="ltr" aria-label={`Search ${label}`} className="mb-2 ps-8" maxLength={120} disabled={disabled || loading || !!error} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search code or name" /></div>
    <Select dir="ltr" aria-label={label} required={required} disabled={disabled || loading || !!error} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{loading ? 'Loading…' : error ? 'References unavailable' : emptyLabel}</option>
      {value && !options.some((option) => option.id === value) ? <option value={value}>Unavailable or inactive selection</option> : null}
      {visible.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </Select>
    {error ? <span className="mt-1 block text-xs text-red-600">References could not be loaded.</span> : !loading && !options.length ? <span className="mt-1 block text-xs text-steel-500">No reference options are available.</span> : normalized && !visible.length ? <span className="mt-1 block text-xs text-steel-500">No options match this search.</span> : null}
  </AdminField>;
}

function useConfigurationSave<T>(resource: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body, headers }: { id?: string; body: unknown; headers: HeadersInit }) => id
      ? api.patch<T>(`/erp/accounting/${resource}/${id}`, body, headers)
      : api.post<T>(`/erp/accounting/${resource}`, body, headers),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['accounting'] }); },
  });
}

function ConfigurationStatusDialog({ resource, item, pending, onClose, onSubmit }: {
  resource: string; item: { id: string; label: string; isActive: boolean }; pending: boolean; onClose: () => void; onSubmit: (body: { isActive: boolean; reason: string }, headers: HeadersInit) => void;
}) {
  const [reason, setReason] = useState('');
  const operation = useOperationKey();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!reason.trim()) return;
    const body = { isActive: !item.isActive, reason: reason.trim() };
    onSubmit(body, { 'Idempotency-Key': operation.keyFor(body) });
  };
  return <Panel title={`${item.isActive ? 'Deactivate' : 'Activate'} ${item.label}`} actions={<Button type="button" variant="ghost" size="sm" disabled={pending} icon={<X className="h-4 w-4" />} onClick={onClose}>Cancel</Button>}>
    <form onSubmit={submit}><div className="space-y-4 p-5"><p className="text-sm text-steel-600">{item.isActive ? 'This hides the configuration from new transactions. Existing records remain intact.' : 'This makes the configuration available for new transactions again.'}</p><AdminField label="Audit reason *"><Textarea required rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain this status change" /></AdminField></div><div className="flex justify-end border-t border-steel-200 px-5 py-4"><Button type="submit" variant={item.isActive ? 'secondary' : 'primary'} disabled={pending || !reason.trim()}>{pending ? 'Updating…' : item.isActive ? 'Deactivate' : 'Activate'}</Button></div></form>
  </Panel>;
}

interface AccountForm { code: string; nameEn: string; nameAr: string; type: AccountType; normalBalance: 'DEBIT' | 'CREDIT'; parentId: string; currency: string; isPostable: boolean }
function AccountEditor({ account, accounts, accountsLoading, accountsError, pending, onCancel, onSubmit }: {
  account?: Account; accounts: Account[]; accountsLoading: boolean; accountsError: unknown; pending: boolean; onCancel: () => void; onSubmit: (body: Record<string, unknown>, headers: HeadersInit) => void;
}) {
  const [form, setForm] = useState<AccountForm>(() => account ? { code: account.code, nameEn: account.nameEn, nameAr: account.nameAr ?? '', type: account.type, normalBalance: account.normalBalance, parentId: account.parentId ?? '', currency: account.currency ?? '', isPostable: account.isPostable } : { code: '', nameEn: '', nameAr: '', type: 'ASSET', normalBalance: 'DEBIT', parentId: '', currency: '', isPostable: true });
  const [error, setError] = useState<string | null>(null);
  const operation = useOperationKey();
  const typeLocked = !!account && (!!account.systemCode || !!account._count.journalLines);
  const parentOptions = accounts.filter((option) => option.id !== account?.id && option.isActive && option.type === form.type && option.normalBalance === form.normalBalance).map((option) => ({ id: option.id, label: `${option.code} · ${option.nameEn}` }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!/^[A-Z0-9._/-]+$/.test(form.code.trim().toUpperCase())) { setError('Use letters, numbers, dots, dashes, slashes, or underscores for the code.'); return; }
    if (!form.nameEn.trim()) { setError('Account name is required.'); return; }
    const expected = ['ASSET', 'EXPENSE'].includes(form.type) ? 'DEBIT' : 'CREDIT';
    if (form.normalBalance !== expected) { setError('Normal balance must match the account type.'); return; }
    if (form.currency && !/^[A-Z]{3}$/.test(form.currency.trim().toUpperCase())) { setError('Currency must be blank or a three-letter code.'); return; }
    const body = { code: form.code.trim().toUpperCase(), nameEn: form.nameEn.trim(), nameAr: nullable(form.nameAr), type: form.type, normalBalance: form.normalBalance, parentId: nullable(form.parentId), currency: nullable(form.currency.trim().toUpperCase()), isPostable: form.isPostable };
    setError(null); onSubmit(body, { 'Idempotency-Key': operation.keyFor(body) });
  };
  return <Panel title={account ? `Edit account ${account.code}` : 'Add chart account'} actions={<Button type="button" variant="ghost" size="sm" disabled={pending} icon={<X className="h-4 w-4" />} onClick={onCancel}>Cancel</Button>}>
    <form onSubmit={submit}>{error ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p> : null}<div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
      <AdminField label="Code *"><Input required dir="ltr" maxLength={40} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></AdminField>
      <AdminField label="English name *"><Input required maxLength={200} value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} /></AdminField>
      <AdminField label="Arabic name"><Input dir="rtl" maxLength={200} value={form.nameAr} onChange={(event) => setForm({ ...form, nameAr: event.target.value })} /></AdminField>
      <AdminField label="Type *"><Select required disabled={typeLocked} value={form.type} onChange={(event) => { const type = event.target.value as AccountType; setForm({ ...form, type, normalBalance: ['ASSET', 'EXPENSE'].includes(type) ? 'DEBIT' : 'CREDIT' }); }}>{accountTypes.map((type) => <option key={type} value={type}>{type}</option>)}</Select></AdminField>
      <AdminField label="Normal balance *" help="Derived from the account type."><Select required disabled value={form.normalBalance} onChange={() => undefined}><option value="DEBIT">DEBIT</option><option value="CREDIT">CREDIT</option></Select></AdminField>
      <SearchableSelect label="Parent account" value={form.parentId} onChange={(parentId) => setForm({ ...form, parentId })} options={parentOptions} loading={accountsLoading} error={accountsError} emptyLabel="Top level" className="sm:col-span-2" help="Parents must be active and have the same type, normal balance, and currency." />
      <AdminField label="Currency" help="Blank means any/base currency. Other currencies are rejected."><Input dir="ltr" maxLength={3} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} placeholder="Base currency" /></AdminField>
      <label className="inline-flex items-end gap-2 pb-2 text-sm font-semibold text-steel-600"><input type="checkbox" className="h-4 w-4 rounded border-steel-300" disabled={!!account?.systemCode || !!account?._count.children} checked={form.isPostable} onChange={(event) => setForm({ ...form, isPostable: event.target.checked })} />Postable ledger account</label>
      {account?.systemCode ? <p className="rounded-xl bg-steel-50 p-3 text-xs text-steel-500 sm:col-span-2 lg:col-span-4">System account {account.systemCode}: type, active status, and postability are protected.</p> : null}
    </div><div className="flex justify-end border-t border-steel-200 px-5 py-4"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : account ? 'Save account' : 'Create account'}</Button></div></form>
  </Panel>;
}

function AccountsPanel() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<AccountType | ''>('');
  const [isActive, setIsActive] = useState('');
  const [systemCode, setSystemCode] = useState('');
  const [parentId, setParentId] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusItem, setStatusItem] = useState<Account | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const references = useAccountOptions();
  const save = useConfigurationSave<Account>('accounts');
  const query = useQuery({
    queryKey: ['accounting', 'accounts', search, type, isActive, systemCode, parentId, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search) params.set('search', search); if (type) params.set('type', type); if (isActive) params.set('isActive', isActive); if (systemCode) params.set('systemCode', systemCode); if (parentId) params.set('parentId', parentId);
      const response = await api.get<Account[]>(`/erp/accounting/accounts?${params.toString()}`);
      return { rows: response.data, meta: response.meta as unknown as PaginationMeta };
    },
    placeholderData: keepPreviousData,
  });
  const submit = (event: FormEvent) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(1); };
  const clear = () => { setSearchInput(''); setSearch(''); setType(''); setIsActive(''); setSystemCode(''); setParentId(''); setPage(1); };
  const meta = query.data?.meta;
  const editing = query.data?.rows.find((account) => account.id === editingId) ?? references.data?.find((account) => account.id === editingId) ?? null;
  const submitSave = (body: Record<string, unknown>, headers: HeadersInit) => save.mutate({ id: editing?.id, body, headers }, {
    onSuccess: () => { setShowCreate(false); setEditingId(null); setFeedback({ kind: 'success', text: editing ? `Account ${editing.code} updated.` : 'Chart account created.' }); },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not save the account.') }),
  });
  return <div className="space-y-4"><Feedback feedback={feedback} />
    {showCreate || editing ? <AccountEditor key={editing?.id ?? 'new-account'} account={editing ?? undefined} accounts={references.data ?? []} accountsLoading={references.isLoading} accountsError={references.error} pending={save.isPending} onCancel={() => { setShowCreate(false); setEditingId(null); }} onSubmit={submitSave} /> : null}
    <Panel actions={<Button type="button" variant="onlight" size="sm" disabled={save.isPending} icon={<Plus className="h-4 w-4" />} onClick={() => { setShowCreate((value) => !value); setEditingId(null); setFeedback(null); }}>{showCreate ? 'Close form' : 'Add account'}</Button>}>
    <form role="search" onSubmit={submit} className="grid gap-3 border-b border-steel-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <AdminField label="Search chart of accounts" className="lg:col-span-2"><div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-400" aria-hidden="true" /><Input dir="ltr" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="ps-9" placeholder="Code or account name" /></div></AdminField>
      <AdminField label="Account type"><Select value={type} onChange={(event) => { setType(event.target.value as AccountType | ''); setPage(1); }}><option value="">All types</option>{accountTypes.map((item) => <option key={item} value={item}>{item}</option>)}</Select></AdminField>
      <AdminField label="Active status"><Select value={isActive} onChange={(event) => { setIsActive(event.target.value); setPage(1); }}><option value="">All accounts</option><option value="true">Active</option><option value="false">Inactive</option></Select></AdminField>
      <AdminField label="System code"><Input maxLength={80} value={systemCode} onChange={(event) => { setSystemCode(event.target.value); setPage(1); }} placeholder="e.g. CASH, AR, AP" /></AdminField>
      <SearchableSelect label="Parent account" value={parentId} onChange={(value) => { setParentId(value); setPage(1); }} options={(references.data ?? []).map((account) => ({ id: account.id, label: `${account.code} · ${account.nameEn}` }))} loading={references.isLoading} error={references.error} emptyLabel="All parent accounts" />
      <div className="flex items-end gap-2"><Button type="submit" variant="secondary">Search</Button><Button type="button" variant="ghost" onClick={clear}>Clear</Button></div>
    </form>
    <div className="border-b border-steel-100 px-4 py-2 text-xs text-steel-500" aria-live="polite">{meta ? `${meta.total} account${meta.total === 1 ? '' : 's'}` : 'Accounts'}{query.isFetching && !query.isLoading ? ' · Refreshing…' : ''}</div>
    {query.isLoading ? <LoadingState label="Loading accounts…" /> : query.isError ? <ErrorState title="Accounts could not be loaded." error={query.error} onRetry={() => void query.refetch()} /> : <Table><thead><tr><Th>Code</Th><Th>Account</Th><Th>Type</Th><Th>Normal balance</Th><Th>System / parent</Th><Th>Currency</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead><tbody>{!query.data?.rows.length ? <EmptyRow colSpan={8} message="No accounts match these filters." /> : query.data.rows.map((account) => <tr key={account.id}><Td className="font-mono font-bold text-brand-700">{account.code}</Td><Td><span className="font-semibold text-navy-800">{account.nameEn}</span>{account.nameAr ? <span className="mt-1 block text-xs text-steel-500" dir="rtl">{account.nameAr}</span> : null}<span className="mt-1 block text-[0.65rem] text-steel-400">{account._count.children} child account{account._count.children === 1 ? '' : 's'}</span></Td><Td>{account.type}</Td><Td>{account.normalBalance}</Td><Td><span className="block font-mono text-xs">{account.systemCode || '—'}</span><span className="mt-1 block text-xs text-steel-400">{account.parent ? `${account.parent.code} · ${account.parent.nameEn}` : 'Top level'}</span></Td><Td>{account.currency || 'Any / base'}</Td><Td><StatusPill status={account.isActive ? 'ACTIVE' : 'INACTIVE'} label={account.isActive ? 'ACTIVE' : 'INACTIVE'} /><span className="mt-1 block text-xs text-steel-400">{account.isPostable ? 'Postable' : 'Not postable'}</span></Td><Td><div className="flex flex-wrap gap-1"><Button type="button" variant="onlight" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditingId(account.id); setShowCreate(false); setFeedback(null); }}>Edit</Button><Button type="button" variant="ghost" size="sm" disabled={save.isPending || !!account.systemCode} icon={account.isActive ? <Ban className="h-4 w-4" /> : <Check className="h-4 w-4" />} onClick={() => { setStatusItem(account); setFeedback(null); }}>{account.isActive ? 'Deactivate' : 'Activate'}</Button></div>{account.systemCode ? <span className="mt-1 block text-xs text-steel-400">System protected</span> : null}</Td></tr>)}</tbody></Table>}
  </Panel>{meta ? <Pagination meta={meta} page={page} onPage={setPage} isFetching={query.isFetching} label="Account" /> : null}
    {statusItem ? <ConfigurationStatusDialog resource="accounts" item={{ id: statusItem.id, label: statusItem.code, isActive: statusItem.isActive }} pending={save.isPending} onClose={() => setStatusItem(null)} onSubmit={(body, headers) => save.mutate({ id: statusItem.id, body, headers }, { onSuccess: () => { setStatusItem(null); setFeedback({ kind: 'success', text: `Account ${statusItem.code} ${body.isActive ? 'activated' : 'deactivated'}.` }); }, onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not change account status.') }) })} /> : null}
  </div>;
}

interface JournalForm { code: string; nameEn: string; nameAr: string; type: JournalType }
function JournalEditor({ journal, pending, onCancel, onSubmit }: { journal?: Journal; pending: boolean; onCancel: () => void; onSubmit: (body: Record<string, unknown>, headers: HeadersInit) => void }) {
  const [form, setForm] = useState<JournalForm>(() => journal ? { code: journal.code, nameEn: journal.nameEn, nameAr: journal.nameAr ?? '', type: journal.type } : { code: '', nameEn: '', nameAr: '', type: 'GENERAL' });
  const [error, setError] = useState<string | null>(null);
  const operation = useOperationKey();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!/^[A-Z0-9._/-]+$/.test(form.code.trim().toUpperCase())) { setError('Use letters, numbers, dots, dashes, slashes, or underscores for the code.'); return; }
    if (!form.nameEn.trim()) { setError('Journal name is required.'); return; }
    const body = { code: form.code.trim().toUpperCase(), nameEn: form.nameEn.trim(), nameAr: nullable(form.nameAr), type: form.type };
    setError(null); onSubmit(body, { 'Idempotency-Key': operation.keyFor(body) });
  };
  return <Panel title={journal ? `Edit journal ${journal.code}` : 'Add journal'} actions={<Button type="button" variant="ghost" size="sm" disabled={pending} icon={<X className="h-4 w-4" />} onClick={onCancel}>Cancel</Button>}>
    <form onSubmit={submit}>{error ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p> : null}<div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
      <AdminField label="Code *"><Input required dir="ltr" maxLength={40} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></AdminField>
      <AdminField label="English name *"><Input required maxLength={200} value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} /></AdminField>
      <AdminField label="Arabic name"><Input dir="rtl" maxLength={200} value={form.nameAr} onChange={(event) => setForm({ ...form, nameAr: event.target.value })} /></AdminField>
      <AdminField label="Journal type *"><Select required disabled={!!journal && (journal.isSystem || journal._count.entries > 0)} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as JournalType })}>{journalTypes.map((type) => <option key={type} value={type}>{type}</option>)}</Select></AdminField>
      {journal?.isSystem ? <p className="rounded-xl bg-steel-50 p-3 text-xs text-steel-500 sm:col-span-2 lg:col-span-4">System journals retain their type and active status.</p> : null}
    </div><div className="flex justify-end border-t border-steel-200 px-5 py-4"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : journal ? 'Save journal' : 'Create journal'}</Button></div></form>
  </Panel>;
}

function JournalsPanel() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<JournalType | ''>('');
  const [isActive, setIsActive] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusItem, setStatusItem] = useState<Journal | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const save = useConfigurationSave<Journal>('journals');
  const query = useQuery({
    queryKey: ['accounting', 'journals', search, type, isActive, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search) params.set('search', search); if (type) params.set('type', type); if (isActive) params.set('isActive', isActive);
      const response = await api.get<Journal[]>(`/erp/accounting/journals?${params.toString()}`);
      return { rows: response.data, meta: response.meta as unknown as PaginationMeta };
    },
    placeholderData: keepPreviousData,
  });
  const submit = (event: FormEvent) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(1); };
  const clear = () => { setSearchInput(''); setSearch(''); setType(''); setIsActive(''); setPage(1); };
  const meta = query.data?.meta;
  const editing = query.data?.rows.find((journal) => journal.id === editingId) ?? null;
  const submitSave = (body: Record<string, unknown>, headers: HeadersInit) => save.mutate({ id: editing?.id, body, headers }, {
    onSuccess: () => { setShowCreate(false); setEditingId(null); setFeedback({ kind: 'success', text: editing ? `Journal ${editing.code} updated.` : 'Journal created.' }); },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not save the journal.') }),
  });
  return <div className="space-y-4"><Feedback feedback={feedback} />
    {showCreate || editing ? <JournalEditor key={editing?.id ?? 'new-journal'} journal={editing ?? undefined} pending={save.isPending} onCancel={() => { setShowCreate(false); setEditingId(null); }} onSubmit={submitSave} /> : null}
    <Panel actions={<Button type="button" variant="onlight" size="sm" disabled={save.isPending} icon={<Plus className="h-4 w-4" />} onClick={() => { setShowCreate((value) => !value); setEditingId(null); setFeedback(null); }}>{showCreate ? 'Close form' : 'Add journal'}</Button>}>
    <form role="search" onSubmit={submit} className="grid gap-3 border-b border-steel-200 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,1fr)_12rem_10rem_auto]">
      <AdminField label="Search journals"><div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-400" aria-hidden="true" /><Input dir="ltr" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="ps-9" placeholder="Code or journal name" /></div></AdminField>
      <AdminField label="Journal type"><Select value={type} onChange={(event) => { setType(event.target.value as JournalType | ''); setPage(1); }}><option value="">All types</option>{journalTypes.map((item) => <option key={item} value={item}>{item}</option>)}</Select></AdminField>
      <AdminField label="Active status"><Select value={isActive} onChange={(event) => { setIsActive(event.target.value); setPage(1); }}><option value="">All journals</option><option value="true">Active</option><option value="false">Inactive</option></Select></AdminField>
      <div className="flex items-end gap-2"><Button type="submit" variant="secondary">Search</Button><Button type="button" variant="ghost" onClick={clear}>Clear</Button></div>
    </form>
    <div className="border-b border-steel-100 px-4 py-2 text-xs text-steel-500" aria-live="polite">{meta ? `${meta.total} journal${meta.total === 1 ? '' : 's'}` : 'Journals'}{query.isFetching && !query.isLoading ? ' · Refreshing…' : ''}</div>
    {query.isLoading ? <LoadingState label="Loading journals…" /> : query.isError ? <ErrorState title="Journals could not be loaded." error={query.error} onRetry={() => void query.refetch()} /> : <Table><thead><tr><Th>Code</Th><Th>Journal</Th><Th>Type</Th><Th>Entries</Th><Th>System</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead><tbody>{!query.data?.rows.length ? <EmptyRow colSpan={7} message="No journals match these filters." /> : query.data.rows.map((journal) => <tr key={journal.id}><Td className="font-mono font-bold text-brand-700">{journal.code}</Td><Td><span className="font-semibold text-navy-800">{journal.nameEn}</span>{journal.nameAr ? <span className="mt-1 block text-xs text-steel-500" dir="rtl">{journal.nameAr}</span> : null}</Td><Td>{journal.type}</Td><Td>{journal._count.entries}</Td><Td>{journal.isSystem ? 'System' : 'Custom'}</Td><Td><StatusPill status={journal.isActive ? 'ACTIVE' : 'INACTIVE'} label={journal.isActive ? 'ACTIVE' : 'INACTIVE'} /></Td><Td><div className="flex flex-wrap gap-1"><Button type="button" variant="onlight" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditingId(journal.id); setShowCreate(false); setFeedback(null); }}>Edit</Button><Button type="button" variant="ghost" size="sm" disabled={save.isPending || journal.isSystem} icon={journal.isActive ? <Ban className="h-4 w-4" /> : <Check className="h-4 w-4" />} onClick={() => { setStatusItem(journal); setFeedback(null); }}>{journal.isActive ? 'Deactivate' : 'Activate'}</Button></div>{journal.isSystem ? <span className="mt-1 block text-xs text-steel-400">System protected</span> : null}</Td></tr>)}</tbody></Table>}
  </Panel>{meta ? <Pagination meta={meta} page={page} onPage={setPage} isFetching={query.isFetching} label="Journal" /> : null}
    {statusItem ? <ConfigurationStatusDialog resource="journals" item={{ id: statusItem.id, label: statusItem.code, isActive: statusItem.isActive }} pending={save.isPending} onClose={() => setStatusItem(null)} onSubmit={(body, headers) => save.mutate({ id: statusItem.id, body, headers }, { onSuccess: () => { setStatusItem(null); setFeedback({ kind: 'success', text: `Journal ${statusItem.code} ${body.isActive ? 'activated' : 'deactivated'}.` }); }, onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not change journal status.') }) })} /> : null}
  </div>;
}

function PeriodStatusDialog({ period, pending, onClose, onSubmit }: { period: Period; pending: boolean; onClose: () => void; onSubmit: (body: { status: PeriodStatus; reason: string | null }, headers: HeadersInit) => void }) {
  const [status, setStatus] = useState<PeriodStatus>(period.status === 'OPEN' ? 'SOFT_CLOSED' : 'OPEN');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const operation = useOperationKey();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (period.fiscalYear.isClosed && status !== 'LOCKED') { setError('A closed fiscal year cannot be reopened. Only LOCKED is allowed.'); return; }
    const body = { status, reason: nullable(reason) };
    setError(null); onSubmit(body, { 'Idempotency-Key': operation.keyFor(body) });
  };
  return <Panel title={`Update ${period.fiscalYear.code} · Period ${period.number}`} actions={<Button type="button" variant="ghost" size="sm" disabled={pending} icon={<X className="h-4 w-4" />} onClick={onClose}>Cancel</Button>}>
    <form onSubmit={submit}>{error ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p> : null}<div className="grid gap-4 p-5 sm:grid-cols-2"><AdminField label="Period status *"><Select value={status} onChange={(event) => setStatus(event.target.value as PeriodStatus)}>{periodStatuses.map((item) => <option key={item} value={item}>{item === 'OPEN' ? 'OPEN — reopen period' : item === 'SOFT_CLOSED' ? 'SOFT_CLOSED — soft close' : 'LOCKED — lock period'}</option>)}</Select></AdminField><AdminField label="Reason"><Input maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional audit reason" /></AdminField><p className="text-sm text-steel-500 sm:col-span-2">SOFT_CLOSED records a close but still permits posting. LOCKED blocks posting. OPEN reopens a period unless its fiscal year is closed.</p></div><div className="flex justify-end border-t border-steel-200 px-5 py-4"><Button type="submit" disabled={pending || status === period.status}>{pending ? 'Updating…' : 'Update period'}</Button></div></form>
  </Panel>;
}

function FiscalYearEditor({ pending, onCancel, onSubmit }: { pending: boolean; onCancel: () => void; onSubmit: (body: Record<string, unknown>, headers: HeadersInit) => void }) {
  const [form, setForm] = useState({ code: '', nameEn: '', startDate: '', endDate: '' });
  const [error, setError] = useState<string | null>(null);
  const operation = useOperationKey();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.startDate || !form.endDate || form.startDate > form.endDate) { setError('Enter a valid fiscal year date range.'); return; }
    if (!/^[A-Z0-9._/-]+$/.test(form.code.trim().toUpperCase())) { setError('Enter a valid fiscal year code.'); return; }
    const body = { code: form.code.trim().toUpperCase(), nameEn: form.nameEn.trim(), startDate: form.startDate, endDate: form.endDate };
    setError(null); onSubmit(body, { 'Idempotency-Key': operation.keyFor(body) });
  };
  return <Panel title="Add fiscal year" actions={<Button type="button" variant="ghost" size="sm" disabled={pending} icon={<X className="h-4 w-4" />} onClick={onCancel}>Cancel</Button>}>
    <form onSubmit={submit}>{error ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p> : null}<div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4"><AdminField label="Code *"><Input required dir="ltr" maxLength={40} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></AdminField><AdminField label="English name *"><Input required maxLength={200} value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} /></AdminField><AdminField label="Start date *"><Input required type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></AdminField><AdminField label="End date *"><Input required type="date" min={form.startDate || undefined} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></AdminField></div><p className="px-5 pb-5 text-xs text-steel-500">Fiscal years cannot overlap existing years. Period creation and posting remain separately controlled.</p><div className="flex justify-end border-t border-steel-200 px-5 py-4"><Button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create fiscal year'}</Button></div></form>
  </Panel>;
}

function FiscalPeriodEditor({ years, yearsLoading, yearsError, pending, onCancel, onSubmit }: { years: FiscalYear[]; yearsLoading: boolean; yearsError: unknown; pending: boolean; onCancel: () => void; onSubmit: (body: Record<string, unknown>, headers: HeadersInit) => void }) {
  const [form, setForm] = useState({ fiscalYearId: '', number: '1', name: '', startDate: '', endDate: '', status: 'OPEN' as PeriodStatus });
  const [error, setError] = useState<string | null>(null);
  const operation = useOperationKey();
  const year = years.find((item) => item.id === form.fiscalYearId);
  const openYears = years.filter((item) => !item.isClosed);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!year) { setError('Select an open fiscal year.'); return; }
    const number = Number(form.number);
    if (!Number.isInteger(number) || number < 1 || number > 1000) { setError('Period number must be between 1 and 1000.'); return; }
    if (!form.name.trim() || !form.startDate || !form.endDate || form.startDate > form.endDate) { setError('Enter a period name and valid date range.'); return; }
    if (form.startDate < year.startDate.slice(0, 10) || form.endDate > year.endDate.slice(0, 10)) { setError('Period dates must stay within the selected fiscal year.'); return; }
    const body = { fiscalYearId: year.id, number, name: form.name.trim(), startDate: form.startDate, endDate: form.endDate, status: form.status };
    setError(null); onSubmit(body, { 'Idempotency-Key': operation.keyFor(body) });
  };
  return <Panel title="Add fiscal period" actions={<Button type="button" variant="ghost" size="sm" disabled={pending} icon={<X className="h-4 w-4" />} onClick={onCancel}>Cancel</Button>}>
    <form onSubmit={submit}>{error ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p> : null}<div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4"><SearchableSelect label="Fiscal year *" required value={form.fiscalYearId} onChange={(fiscalYearId) => { const selected = openYears.find((item) => item.id === fiscalYearId); setForm({ ...form, fiscalYearId, startDate: selected?.startDate.slice(0, 10) ?? '', endDate: selected?.endDate.slice(0, 10) ?? '' }); }} options={openYears.map((item) => ({ id: item.id, label: `${item.code} · ${item.nameEn}` }))} loading={yearsLoading} error={yearsError} emptyLabel="Select fiscal year" /><AdminField label="Period number *"><Input required dir="ltr" inputMode="numeric" maxLength={4} value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} /></AdminField><AdminField label="Period name *"><Input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="January" /></AdminField><AdminField label="Initial status"><Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as PeriodStatus })}>{periodStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</Select></AdminField><AdminField label="Start date *"><Input required type="date" min={year?.startDate.slice(0, 10)} max={year?.endDate.slice(0, 10)} value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></AdminField><AdminField label="End date *"><Input required type="date" min={form.startDate || year?.startDate.slice(0, 10)} max={year?.endDate.slice(0, 10)} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></AdminField></div><p className="px-5 pb-5 text-xs text-steel-500">Period numbers must be unique within the year and dates cannot overlap any company period.</p><div className="flex justify-end border-t border-steel-200 px-5 py-4"><Button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create fiscal period'}</Button></div></form>
  </Panel>;
}

function PeriodsPanel() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<PeriodStatus | ''>('');
  const [fiscalYearId, setFiscalYearId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createKind, setCreateKind] = useState<'year' | 'period' | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const years = useFiscalYearOptions();
  const saveYear = useConfigurationSave<FiscalYear>('fiscal-years');
  const savePeriod = useConfigurationSave<Period>('fiscal-periods');
  const query = useQuery({
    queryKey: ['accounting', 'periods', status, fiscalYearId, from, to, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (status) params.set('status', status); if (fiscalYearId) params.set('fiscalYearId', fiscalYearId); if (from) params.set('from', from); if (to) params.set('to', to);
      const response = await api.get<Period[]>(`/erp/accounting/fiscal-periods?${params.toString()}`);
      return { rows: response.data, meta: response.meta as unknown as PaginationMeta };
    },
    placeholderData: keepPreviousData,
  });
  const update = useMutation({
    mutationFn: ({ id, body, headers }: { id: string; body: { status: PeriodStatus; reason: string | null }; headers: HeadersInit }) => api.patch<Period>(`/erp/accounting/fiscal-periods/${id}`, body, headers),
    onSuccess: async (response) => { setFeedback({ kind: 'success', text: `Period ${response.data.number} updated to ${response.data.status}.` }); setSelectedId(null); await queryClient.invalidateQueries({ queryKey: ['accounting'] }); },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not update the fiscal period.') }),
  });
  const meta = query.data?.meta;
  const selected = query.data?.rows.find((period) => period.id === selectedId) ?? null;
  return <div className="space-y-4"><Feedback feedback={feedback} />
    {createKind === 'year' ? <FiscalYearEditor pending={saveYear.isPending} onCancel={() => setCreateKind(null)} onSubmit={(body, headers) => saveYear.mutate({ body, headers }, { onSuccess: () => { setCreateKind(null); setFeedback({ kind: 'success', text: 'Fiscal year created.' }); }, onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not create the fiscal year.') }) })} /> : null}
    {createKind === 'period' ? <FiscalPeriodEditor years={years.data ?? []} yearsLoading={years.isLoading} yearsError={years.error} pending={savePeriod.isPending} onCancel={() => setCreateKind(null)} onSubmit={(body, headers) => savePeriod.mutate({ body, headers }, { onSuccess: () => { setCreateKind(null); setFeedback({ kind: 'success', text: 'Fiscal period created.' }); }, onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not create the fiscal period.') }) })} /> : null}
    <Panel title="Fiscal years" actions={<Button type="button" variant="onlight" size="sm" disabled={saveYear.isPending || savePeriod.isPending} icon={<Plus className="h-4 w-4" />} onClick={() => { setCreateKind((value) => value === 'year' ? null : 'year'); setFeedback(null); }}>{createKind === 'year' ? 'Close form' : 'Add fiscal year'}</Button>}>
      {years.isLoading ? <LoadingState label="Loading fiscal years…" /> : years.isError ? <ErrorState title="Fiscal years could not be loaded." error={years.error} onRetry={() => void years.refetch()} /> : <Table><thead><tr><Th>Code</Th><Th>Fiscal year</Th><Th>Dates</Th><Th>Periods</Th><Th>Status</Th></tr></thead><tbody>{!years.data?.length ? <EmptyRow colSpan={5} message="No fiscal years are configured." /> : years.data.map((year) => <tr key={year.id}><Td className="font-mono font-bold text-brand-700">{year.code}</Td><Td><span className="font-semibold text-navy-800">{year.nameEn}</span><span className="mt-1 block text-xs text-steel-400">{year.id}</span></Td><Td className="whitespace-nowrap">{formatDate(year.startDate, 'en')}<span className="mt-1 block text-xs text-steel-400">to {formatDate(year.endDate, 'en')}</span></Td><Td>{year._count.periods}</Td><Td><StatusPill status={year.isClosed ? 'CLOSED' : 'OPEN'} label={year.isClosed ? 'CLOSED' : 'OPEN'} /></Td></tr>)}</tbody></Table>}
    </Panel>
    <Panel title="Fiscal periods" actions={<Button type="button" variant="onlight" size="sm" disabled={saveYear.isPending || savePeriod.isPending} icon={<Plus className="h-4 w-4" />} onClick={() => { setCreateKind((value) => value === 'period' ? null : 'period'); setFeedback(null); }}>{createKind === 'period' ? 'Close form' : 'Add fiscal period'}</Button>}>
    <form role="search" onSubmit={(event) => { event.preventDefault(); if (from && to && to < from) { setFeedback({ kind: 'error', text: 'End date cannot be earlier than start date.' }); return; } setPage(1); }} className="grid gap-3 border-b border-steel-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <AdminField label="Status"><Select value={status} onChange={(event) => { setStatus(event.target.value as PeriodStatus | ''); setPage(1); }}><option value="">All statuses</option>{periodStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</Select></AdminField>
      <SearchableSelect label="Fiscal year" value={fiscalYearId} onChange={(value) => { setFiscalYearId(value); setPage(1); }} options={(years.data ?? []).map((year) => ({ id: year.id, label: `${year.code} · ${year.nameEn}` }))} loading={years.isLoading} error={years.error} emptyLabel="All fiscal years" />
      <AdminField label="Start date from"><Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></AdminField><AdminField label="Start date to"><Input type="date" min={from || undefined} value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></AdminField>
      <div className="flex items-end gap-2"><Button type="submit" variant="secondary">Search</Button><Button type="button" variant="ghost" onClick={() => { setStatus(''); setFiscalYearId(''); setFrom(''); setTo(''); setPage(1); }}>Clear</Button></div>
    </form>
    <div className="border-b border-steel-100 px-4 py-2 text-xs text-steel-500" aria-live="polite">{meta ? `${meta.total} fiscal period${meta.total === 1 ? '' : 's'}` : 'Fiscal periods'}</div>
    {query.isLoading ? <LoadingState label="Loading fiscal periods…" /> : query.isError ? <ErrorState title="Fiscal periods could not be loaded." error={query.error} onRetry={() => void query.refetch()} /> : <Table><thead><tr><Th>Fiscal year</Th><Th>Period</Th><Th>Dates</Th><Th>Status</Th><Th>Locked</Th><Th><span className="sr-only">Actions</span></Th></tr></thead><tbody>{!query.data?.rows.length ? <EmptyRow colSpan={6} message="No fiscal periods match these filters." /> : query.data.rows.map((period) => <tr key={period.id}><Td><span className="font-semibold text-navy-800">{period.fiscalYear.nameEn}</span><span className="mt-1 block text-xs text-steel-400">{period.fiscalYear.code}{period.fiscalYear.isClosed ? ' · Fiscal year closed' : ''}</span></Td><Td><span className="font-semibold">{period.number} · {period.name}</span><span className="mt-1 block font-mono text-[0.65rem] text-steel-400">{period.id}</span></Td><Td className="whitespace-nowrap">{formatDate(period.startDate, 'en')}<span className="mt-1 block text-xs text-steel-400">to {formatDate(period.endDate, 'en')}</span></Td><Td><StatusPill status={period.status} label={period.status} /></Td><Td className="whitespace-nowrap text-xs">{formatDateTime(period.lockedAt, 'en')}</Td><Td><Button type="button" variant="onlight" size="sm" icon={<Lock className="h-4 w-4" />} disabled={update.isPending} onClick={() => { setSelectedId(period.id); setFeedback(null); }}>{period.status === 'OPEN' ? 'Close / lock' : 'Reopen / lock'}</Button></Td></tr>)}</tbody></Table>}
  </Panel>{meta ? <Pagination meta={meta} page={page} onPage={setPage} isFetching={query.isFetching} label="Fiscal period" /> : null}{selected ? <PeriodStatusDialog key={selected.id} period={selected} pending={update.isPending} onClose={() => setSelectedId(null)} onSubmit={(body, headers) => update.mutate({ id: selected.id, body, headers })} /> : null}</div>;
}

interface BankAccountForm { code: string; name: string; accountId: string; currency: string; iban: string; bankName: string }
function BankAccountEditor({ bank, accounts, accountsLoading, accountsError, pending, onCancel, onSubmit }: {
  bank?: BankAccountOption; accounts: Account[]; accountsLoading: boolean; accountsError: unknown; pending: boolean; onCancel: () => void; onSubmit: (body: Record<string, unknown>, headers: HeadersInit) => void;
}) {
  const [form, setForm] = useState<BankAccountForm>(() => bank ? { code: bank.code, name: bank.name, accountId: bank.accountId, currency: bank.currency, iban: bank.iban ?? '', bankName: bank.bankName ?? '' } : { code: '', name: '', accountId: '', currency: '', iban: '', bankName: '' });
  const [error, setError] = useState<string | null>(null);
  const operation = useOperationKey();
  const ledgerLocked = !!bank && ((bank._count?.payments ?? 0) + (bank._count?.reconciliations ?? 0) > 0);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.accountId || !/^[A-Z]{3}$/.test(form.currency.trim().toUpperCase())) { setError('Enter a name, ledger account, and three-letter base currency.'); return; }
    if (!/^[A-Z0-9._/-]+$/.test(form.code.trim().toUpperCase())) { setError('Enter a valid bank account code.'); return; }
    const body = { code: form.code.trim().toUpperCase(), name: form.name.trim(), accountId: form.accountId, currency: form.currency.trim().toUpperCase(), iban: nullable(form.iban), bankName: nullable(form.bankName) };
    setError(null); onSubmit(body, { 'Idempotency-Key': operation.keyFor(body) });
  };
  return <Panel title={bank ? `Edit bank account ${bank.code}` : 'Add bank account'} actions={<Button type="button" variant="ghost" size="sm" disabled={pending} icon={<X className="h-4 w-4" />} onClick={onCancel}>Cancel</Button>}>
    <form onSubmit={submit}>{error ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p> : null}<div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
      <AdminField label="Code *"><Input required dir="ltr" maxLength={40} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></AdminField>
      <AdminField label="Account name *"><Input required maxLength={200} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></AdminField>
      <SearchableSelect label="Ledger account *" required value={form.accountId} onChange={(accountId) => setForm({ ...form, accountId })} options={accounts.filter((account) => account.isActive && account.isPostable && account.type === 'ASSET').map((account) => ({ id: account.id, label: `${account.code} · ${account.nameEn}` }))} loading={accountsLoading} error={accountsError} disabled={ledgerLocked} emptyLabel="Select asset ledger account" className="sm:col-span-2" help={ledgerLocked ? 'Ledger account is locked after payments or reconciliations exist.' : 'Must be an active postable ASSET account in the base currency.'} />
      <AdminField label="Currency *"><Input required dir="ltr" maxLength={3} disabled={ledgerLocked} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} placeholder="Base currency" /></AdminField>
      <AdminField label="Bank name"><Input maxLength={200} value={form.bankName} onChange={(event) => setForm({ ...form, bankName: event.target.value })} /></AdminField>
      <AdminField label="IBAN"><Input dir="ltr" maxLength={80} value={form.iban} onChange={(event) => setForm({ ...form, iban: event.target.value })} /></AdminField>
    </div><div className="flex justify-end border-t border-steel-200 px-5 py-4"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : bank ? 'Save bank account' : 'Create bank account'}</Button></div></form>
  </Panel>;
}

function BankAccountsPanel() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [isActive, setIsActive] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusItem, setStatusItem] = useState<BankAccountOption | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const accounts = useAccountOptions(true);
  const save = useConfigurationSave<BankAccountOption>('bank-accounts');
  const query = useQuery({
    queryKey: ['accounting', 'bank-accounts', search, isActive, page],
    queryFn: async () => { const params = new URLSearchParams({ page: String(page), limit: String(pageSize) }); if (search) params.set('search', search); if (isActive) params.set('isActive', isActive); const response = await api.get<BankAccountOption[]>(`/erp/accounting/bank-accounts?${params.toString()}`); return { rows: response.data, meta: response.meta as unknown as PaginationMeta }; },
    placeholderData: keepPreviousData,
  });
  const meta = query.data?.meta;
  const editing = query.data?.rows.find((bank) => bank.id === editingId) ?? null;
  return <div className="space-y-4"><Feedback feedback={feedback} />
    {showCreate || editing ? <BankAccountEditor key={editing?.id ?? 'new-bank'} bank={editing ?? undefined} accounts={accounts.data ?? []} accountsLoading={accounts.isLoading} accountsError={accounts.error} pending={save.isPending} onCancel={() => { setShowCreate(false); setEditingId(null); }} onSubmit={(body, headers) => save.mutate({ id: editing?.id, body, headers }, { onSuccess: () => { setShowCreate(false); setEditingId(null); setFeedback({ kind: 'success', text: editing ? 'Bank account updated.' : 'Bank account created.' }); }, onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not save the bank account.') }) })} /> : null}
    <Panel title="Bank accounts" actions={<Button type="button" variant="onlight" size="sm" disabled={save.isPending} icon={<Plus className="h-4 w-4" />} onClick={() => { setShowCreate((value) => !value); setEditingId(null); setFeedback(null); }}>{showCreate ? 'Close form' : 'Add bank account'}</Button>}>
      <form role="search" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(1); }} className="grid gap-3 border-b border-steel-200 p-4 sm:grid-cols-2 lg:grid-cols-4"><AdminField label="Search bank accounts"><Input dir="ltr" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Code, name, bank or IBAN" /></AdminField><AdminField label="Active status"><Select value={isActive} onChange={(event) => { setIsActive(event.target.value); setPage(1); }}><option value="">All accounts</option><option value="true">Active</option><option value="false">Inactive</option></Select></AdminField><div className="flex items-end gap-2"><Button type="submit" variant="secondary">Search</Button><Button type="button" variant="ghost" onClick={() => { setSearchInput(''); setSearch(''); setIsActive(''); setPage(1); }}>Clear</Button></div></form>
      <div className="border-b border-steel-100 px-4 py-2 text-xs text-steel-500">{meta ? `${meta.total} bank account${meta.total === 1 ? '' : 's'}` : 'Bank accounts'}</div>
      {query.isLoading ? <LoadingState label="Loading bank accounts…" /> : query.isError ? <ErrorState title="Bank accounts could not be loaded." error={query.error} onRetry={() => void query.refetch()} /> : <Table><thead><tr><Th>Code</Th><Th>Bank account</Th><Th>Ledger</Th><Th>Currency</Th><Th>Usage</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead><tbody>{!query.data?.rows.length ? <EmptyRow colSpan={7} message="No bank accounts match these filters." /> : query.data.rows.map((bank) => <tr key={bank.id}><Td className="font-mono font-bold text-brand-700">{bank.code}</Td><Td><span className="font-semibold text-navy-800">{bank.name}</span><span className="mt-1 block text-xs text-steel-400">{bank.bankName || 'No bank name'}{bank.iban ? ` · ${bank.iban}` : ''}</span></Td><Td>{bank.account ? `${bank.account.code} · ${bank.account.nameEn}` : bank.accountId}</Td><Td>{bank.currency}</Td><Td>{bank._count?.payments ?? 0} payments<span className="mt-1 block text-xs text-steel-400">{bank._count?.reconciliations ?? 0} reconciliations</span></Td><Td><StatusPill status={bank.isActive ? 'ACTIVE' : 'INACTIVE'} label={bank.isActive ? 'ACTIVE' : 'INACTIVE'} /></Td><Td><div className="flex flex-wrap gap-1"><Button type="button" variant="onlight" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditingId(bank.id); setShowCreate(false); setFeedback(null); }}>Edit</Button><Button type="button" variant="ghost" size="sm" disabled={save.isPending} icon={bank.isActive ? <Ban className="h-4 w-4" /> : <Check className="h-4 w-4" />} onClick={() => { setStatusItem(bank); setFeedback(null); }}>{bank.isActive ? 'Deactivate' : 'Activate'}</Button></div></Td></tr>)}</tbody></Table>}
    </Panel>{meta ? <Pagination meta={meta} page={page} onPage={setPage} isFetching={query.isFetching} label="Bank account" /> : null}
    {statusItem ? <ConfigurationStatusDialog resource="bank-accounts" item={{ id: statusItem.id, label: statusItem.code, isActive: !!statusItem.isActive }} pending={save.isPending} onClose={() => setStatusItem(null)} onSubmit={(body, headers) => save.mutate({ id: statusItem.id, body, headers }, { onSuccess: () => { setStatusItem(null); setFeedback({ kind: 'success', text: `Bank account ${statusItem.code} ${body.isActive ? 'activated' : 'deactivated'}.` }); }, onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not change bank account status.') }) })} /> : null}
  </div>;
}

interface TaxCodeForm { code: string; nameEn: string; nameAr: string; ratePercent: string; accountId: string }
function TaxCodeEditor({ tax, accounts, accountsLoading, accountsError, pending, onCancel, onSubmit }: {
  tax?: TaxCode; accounts: Account[]; accountsLoading: boolean; accountsError: unknown; pending: boolean; onCancel: () => void; onSubmit: (body: Record<string, unknown>, headers: HeadersInit) => void;
}) {
  const [form, setForm] = useState<TaxCodeForm>(() => tax ? { code: tax.code, nameEn: tax.nameEn, nameAr: tax.nameAr ?? '', ratePercent: tax.ratePercent, accountId: tax.accountId ?? '' } : { code: '', nameEn: '', nameAr: '', ratePercent: '0', accountId: '' });
  const [error, setError] = useState<string | null>(null);
  const operation = useOperationKey();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.nameEn.trim() || !/^[A-Z0-9._/-]+$/.test(form.code.trim().toUpperCase())) { setError('Enter a valid code and English name.'); return; }
    if (!validUnsigned(form.ratePercent, 0, 100, 4)) { setError('Tax rate must be between 0 and 100 with at most 4 decimal places.'); return; }
    const body = { code: form.code.trim().toUpperCase(), nameEn: form.nameEn.trim(), nameAr: nullable(form.nameAr), ratePercent: form.ratePercent.trim(), accountId: nullable(form.accountId) };
    setError(null); onSubmit(body, { 'Idempotency-Key': operation.keyFor(body) });
  };
  return <Panel title={tax ? `Edit tax code ${tax.code}` : 'Add tax code'} actions={<Button type="button" variant="ghost" size="sm" disabled={pending} icon={<X className="h-4 w-4" />} onClick={onCancel}>Cancel</Button>}>
    <form onSubmit={submit}>{error ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p> : null}<div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4"><AdminField label="Code *"><Input required dir="ltr" maxLength={40} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></AdminField><AdminField label="English name *"><Input required maxLength={200} value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} /></AdminField><AdminField label="Arabic name"><Input dir="rtl" maxLength={200} value={form.nameAr} onChange={(event) => setForm({ ...form, nameAr: event.target.value })} /></AdminField><AdminField label="Rate % *"><Input required dir="ltr" inputMode="decimal" value={form.ratePercent} onChange={(event) => setForm({ ...form, ratePercent: event.target.value })} /></AdminField><SearchableSelect label="Tax account" value={form.accountId} onChange={(accountId) => setForm({ ...form, accountId })} options={accounts.filter((account) => account.isActive && account.isPostable && ['ASSET', 'LIABILITY'].includes(account.type)).map((account) => ({ id: account.id, label: `${account.code} · ${account.nameEn} · ${account.type}` }))} loading={accountsLoading} error={accountsError} emptyLabel="System VAT defaults" className="sm:col-span-2" help="ASSET for input tax; LIABILITY for output tax. Blank uses the system VAT defaults." /></div><div className="flex justify-end border-t border-steel-200 px-5 py-4"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : tax ? 'Save tax code' : 'Create tax code'}</Button></div></form>
  </Panel>;
}

function TaxCodesPanel() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [isActive, setIsActive] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusItem, setStatusItem] = useState<TaxCode | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const accounts = useAccountOptions(true);
  const save = useConfigurationSave<TaxCode>('tax-codes');
  const query = useQuery({ queryKey: ['accounting', 'tax-codes', search, isActive, page], queryFn: async () => { const params = new URLSearchParams({ page: String(page), limit: String(pageSize) }); if (search) params.set('search', search); if (isActive) params.set('isActive', isActive); const response = await api.get<TaxCode[]>(`/erp/accounting/tax-codes?${params.toString()}`); return { rows: response.data, meta: response.meta as unknown as PaginationMeta }; }, placeholderData: keepPreviousData });
  const meta = query.data?.meta;
  const editing = query.data?.rows.find((tax) => tax.id === editingId) ?? null;
  return <div className="space-y-4"><Feedback feedback={feedback} />
    {showCreate || editing ? <TaxCodeEditor key={editing?.id ?? 'new-tax'} tax={editing ?? undefined} accounts={accounts.data ?? []} accountsLoading={accounts.isLoading} accountsError={accounts.error} pending={save.isPending} onCancel={() => { setShowCreate(false); setEditingId(null); }} onSubmit={(body, headers) => save.mutate({ id: editing?.id, body, headers }, { onSuccess: () => { setShowCreate(false); setEditingId(null); setFeedback({ kind: 'success', text: editing ? 'Tax code updated.' : 'Tax code created.' }); }, onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not save the tax code.') }) })} /> : null}
    <Panel title="Tax codes" actions={<Button type="button" variant="onlight" size="sm" disabled={save.isPending} icon={<Plus className="h-4 w-4" />} onClick={() => { setShowCreate((value) => !value); setEditingId(null); setFeedback(null); }}>{showCreate ? 'Close form' : 'Add tax code'}</Button>}>
      <form role="search" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(1); }} className="grid gap-3 border-b border-steel-200 p-4 sm:grid-cols-2 lg:grid-cols-4"><AdminField label="Search tax codes"><Input dir="ltr" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Code or name" /></AdminField><AdminField label="Active status"><Select value={isActive} onChange={(event) => { setIsActive(event.target.value); setPage(1); }}><option value="">All tax codes</option><option value="true">Active</option><option value="false">Inactive</option></Select></AdminField><div className="flex items-end gap-2"><Button type="submit" variant="secondary">Search</Button><Button type="button" variant="ghost" onClick={() => { setSearchInput(''); setSearch(''); setIsActive(''); setPage(1); }}>Clear</Button></div></form>
      <div className="border-b border-steel-100 px-4 py-2 text-xs text-steel-500">{meta ? `${meta.total} tax code${meta.total === 1 ? '' : 's'}` : 'Tax codes'}</div>
      {query.isLoading ? <LoadingState label="Loading tax codes…" /> : query.isError ? <ErrorState title="Tax codes could not be loaded." error={query.error} onRetry={() => void query.refetch()} /> : <Table><thead><tr><Th>Code</Th><Th>Tax code</Th><Th>Rate</Th><Th>Account</Th><Th>Usage</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead><tbody>{!query.data?.rows.length ? <EmptyRow colSpan={7} message="No tax codes match these filters." /> : query.data.rows.map((tax) => <tr key={tax.id}><Td className="font-mono font-bold text-brand-700">{tax.code}</Td><Td><span className="font-semibold text-navy-800">{tax.nameEn}</span>{tax.nameAr ? <span className="mt-1 block text-xs text-steel-500" dir="rtl">{tax.nameAr}</span> : null}</Td><Td>{tax.ratePercent}%</Td><Td>{tax.account ? `${tax.account.code} · ${tax.account.nameEn} · ${tax.account.type}` : 'System VAT defaults'}</Td><Td>{tax._count.invoiceLines} invoices<span className="mt-1 block text-xs text-steel-400">{tax._count.billLines} bills · {tax._count.chargeItems} charges</span></Td><Td><StatusPill status={tax.isActive ? 'ACTIVE' : 'INACTIVE'} label={tax.isActive ? 'ACTIVE' : 'INACTIVE'} /></Td><Td><div className="flex flex-wrap gap-1"><Button type="button" variant="onlight" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditingId(tax.id); setShowCreate(false); setFeedback(null); }}>Edit</Button><Button type="button" variant="ghost" size="sm" disabled={save.isPending} icon={tax.isActive ? <Ban className="h-4 w-4" /> : <Check className="h-4 w-4" />} onClick={() => { setStatusItem(tax); setFeedback(null); }}>{tax.isActive ? 'Deactivate' : 'Activate'}</Button></div></Td></tr>)}</tbody></Table>}
    </Panel>{meta ? <Pagination meta={meta} page={page} onPage={setPage} isFetching={query.isFetching} label="Tax code" /> : null}
    {statusItem ? <ConfigurationStatusDialog resource="tax-codes" item={{ id: statusItem.id, label: statusItem.code, isActive: statusItem.isActive }} pending={save.isPending} onClose={() => setStatusItem(null)} onSubmit={(body, headers) => save.mutate({ id: statusItem.id, body, headers }, { onSuccess: () => { setStatusItem(null); setFeedback({ kind: 'success', text: `Tax code ${statusItem.code} ${body.isActive ? 'activated' : 'deactivated'}.` }); }, onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not change tax code status.') }) })} /> : null}
  </div>;
}

interface ChargeItemForm { code: string; nameEn: string; nameAr: string; type: string; defaultPrice: string; currency: string; taxCodeId: string }
function ChargeItemEditor({ charge, taxes, taxesLoading, taxesError, pending, onCancel, onSubmit }: {
  charge?: ChargeItem; taxes: TaxCode[]; taxesLoading: boolean; taxesError: unknown; pending: boolean; onCancel: () => void; onSubmit: (body: Record<string, unknown>, headers: HeadersInit) => void;
}) {
  const [form, setForm] = useState<ChargeItemForm>(() => charge ? { code: charge.code, nameEn: charge.nameEn, nameAr: charge.nameAr ?? '', type: charge.type, defaultPrice: charge.defaultPrice ?? '', currency: charge.currency, taxCodeId: charge.taxCodeId ?? '' } : { code: '', nameEn: '', nameAr: '', type: 'FREIGHT', defaultPrice: '', currency: '', taxCodeId: '' });
  const [error, setError] = useState<string | null>(null);
  const operation = useOperationKey();
  const typeLocked = !!charge && charge._count.invoiceLines + charge._count.billLines > 0;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.nameEn.trim() || !/^[A-Z0-9._/-]+$/.test(form.code.trim().toUpperCase())) { setError('Enter a valid code and English name.'); return; }
    if (form.defaultPrice && !validUnsigned(form.defaultPrice, 0, 9999999999999999.99, 2)) { setError('Default price must be a non-negative decimal with at most 2 decimal places.'); return; }
    if (form.currency && !/^[A-Z]{3}$/.test(form.currency.trim().toUpperCase())) { setError('Currency must be blank or a three-letter code.'); return; }
    const body = { code: form.code.trim().toUpperCase(), nameEn: form.nameEn.trim(), nameAr: nullable(form.nameAr), type: form.type, defaultPrice: form.defaultPrice.trim() || null, ...(form.currency.trim() ? { currency: form.currency.trim().toUpperCase() } : {}), taxCodeId: nullable(form.taxCodeId) };
    setError(null); onSubmit(body, { 'Idempotency-Key': operation.keyFor(body) });
  };
  return <Panel title={charge ? `Edit charge item ${charge.code}` : 'Add charge item'} actions={<Button type="button" variant="ghost" size="sm" disabled={pending} icon={<X className="h-4 w-4" />} onClick={onCancel}>Cancel</Button>}>
    <form onSubmit={submit}>{error ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p> : null}<div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4"><AdminField label="Code *"><Input required dir="ltr" maxLength={40} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></AdminField><AdminField label="English name *"><Input required maxLength={200} value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} /></AdminField><AdminField label="Arabic name"><Input dir="rtl" maxLength={200} value={form.nameAr} onChange={(event) => setForm({ ...form, nameAr: event.target.value })} /></AdminField><AdminField label="Charge type *"><Select required disabled={typeLocked} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{chargeItemTypes.map((type) => <option key={type} value={type}>{type}</option>)}</Select></AdminField><AdminField label="Default price"><Input dir="ltr" inputMode="decimal" value={form.defaultPrice} onChange={(event) => setForm({ ...form, defaultPrice: event.target.value })} placeholder="Blank for no default" /></AdminField><AdminField label="Currency" help="Blank uses or retains the company base currency."><Input dir="ltr" maxLength={3} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} placeholder="Base currency" /></AdminField><SearchableSelect label="Default tax code" value={form.taxCodeId} onChange={(taxCodeId) => setForm({ ...form, taxCodeId })} options={taxes.map((tax) => ({ id: tax.id, label: `${tax.code} · ${tax.nameEn} · ${tax.ratePercent}%` }))} loading={taxesLoading} error={taxesError} emptyLabel="No default tax" className="sm:col-span-2" /></div><div className="flex justify-end border-t border-steel-200 px-5 py-4"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : charge ? 'Save charge item' : 'Create charge item'}</Button></div></form>
  </Panel>;
}

function ChargeItemsPanel() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [isActive, setIsActive] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusItem, setStatusItem] = useState<ChargeItem | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const taxes = useQuery({ queryKey: ['accounting', 'tax-code-options'], queryFn: () => fetchAllPages<TaxCode>('/erp/accounting/tax-codes', new URLSearchParams({ isActive: 'true' })), staleTime: 30000 });
  const save = useConfigurationSave<ChargeItem>('charge-items');
  const query = useQuery({ queryKey: ['accounting', 'charge-items', search, type, isActive, page], queryFn: async () => { const params = new URLSearchParams({ page: String(page), limit: String(pageSize) }); if (search) params.set('search', search); if (type) params.set('type', type); if (isActive) params.set('isActive', isActive); const response = await api.get<ChargeItem[]>(`/erp/accounting/charge-items?${params.toString()}`); return { rows: response.data, meta: response.meta as unknown as PaginationMeta }; }, placeholderData: keepPreviousData });
  const meta = query.data?.meta;
  const editing = query.data?.rows.find((charge) => charge.id === editingId) ?? null;
  return <div className="space-y-4"><Feedback feedback={feedback} />
    {showCreate || editing ? <ChargeItemEditor key={editing?.id ?? 'new-charge'} charge={editing ?? undefined} taxes={taxes.data ?? []} taxesLoading={taxes.isLoading} taxesError={taxes.error} pending={save.isPending} onCancel={() => { setShowCreate(false); setEditingId(null); }} onSubmit={(body, headers) => save.mutate({ id: editing?.id, body, headers }, { onSuccess: () => { setShowCreate(false); setEditingId(null); setFeedback({ kind: 'success', text: editing ? 'Charge item updated.' : 'Charge item created.' }); }, onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not save the charge item.') }) })} /> : null}
    <Panel title="Charge items" actions={<Button type="button" variant="onlight" size="sm" disabled={save.isPending} icon={<Plus className="h-4 w-4" />} onClick={() => { setShowCreate((value) => !value); setEditingId(null); setFeedback(null); }}>{showCreate ? 'Close form' : 'Add charge item'}</Button>}>
      <form role="search" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(1); }} className="grid gap-3 border-b border-steel-200 p-4 sm:grid-cols-2 lg:grid-cols-4"><AdminField label="Search charge items"><Input dir="ltr" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Code or name" /></AdminField><AdminField label="Charge type"><Select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="">All types</option>{chargeItemTypes.map((item) => <option key={item} value={item}>{item}</option>)}</Select></AdminField><AdminField label="Active status"><Select value={isActive} onChange={(event) => { setIsActive(event.target.value); setPage(1); }}><option value="">All charge items</option><option value="true">Active</option><option value="false">Inactive</option></Select></AdminField><div className="flex items-end gap-2"><Button type="submit" variant="secondary">Search</Button><Button type="button" variant="ghost" onClick={() => { setSearchInput(''); setSearch(''); setType(''); setIsActive(''); setPage(1); }}>Clear</Button></div></form>
      <div className="border-b border-steel-100 px-4 py-2 text-xs text-steel-500">{meta ? `${meta.total} charge item${meta.total === 1 ? '' : 's'}` : 'Charge items'}</div>
      {query.isLoading ? <LoadingState label="Loading charge items…" /> : query.isError ? <ErrorState title="Charge items could not be loaded." error={query.error} onRetry={() => void query.refetch()} /> : <Table><thead><tr><Th>Code</Th><Th>Charge item</Th><Th>Type</Th><Th>Default price</Th><Th>Default tax</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead><tbody>{!query.data?.rows.length ? <EmptyRow colSpan={7} message="No charge items match these filters." /> : query.data.rows.map((charge) => <tr key={charge.id}><Td className="font-mono font-bold text-brand-700">{charge.code}</Td><Td><span className="font-semibold text-navy-800">{charge.nameEn}</span>{charge.nameAr ? <span className="mt-1 block text-xs text-steel-500" dir="rtl">{charge.nameAr}</span> : null}<span className="mt-1 block text-xs text-steel-400">{charge._count.quoteLines} quotes · {charge._count.invoiceLines} invoices · {charge._count.billLines} bills</span></Td><Td>{charge.type}</Td><Td className="whitespace-nowrap">{amount(charge.defaultPrice, charge.currency)}</Td><Td>{charge.taxCode ? `${charge.taxCode.code} · ${charge.taxCode.ratePercent}%${charge.taxCode.isActive ? '' : ' · inactive'}` : 'None'}</Td><Td><StatusPill status={charge.isActive ? 'ACTIVE' : 'INACTIVE'} label={charge.isActive ? 'ACTIVE' : 'INACTIVE'} /></Td><Td><div className="flex flex-wrap gap-1"><Button type="button" variant="onlight" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditingId(charge.id); setShowCreate(false); setFeedback(null); }}>Edit</Button><Button type="button" variant="ghost" size="sm" disabled={save.isPending} icon={charge.isActive ? <Ban className="h-4 w-4" /> : <Check className="h-4 w-4" />} onClick={() => { setStatusItem(charge); setFeedback(null); }}>{charge.isActive ? 'Deactivate' : 'Activate'}</Button></div></Td></tr>)}</tbody></Table>}
    </Panel>{meta ? <Pagination meta={meta} page={page} onPage={setPage} isFetching={query.isFetching} label="Charge item" /> : null}
    {statusItem ? <ConfigurationStatusDialog resource="charge-items" item={{ id: statusItem.id, label: statusItem.code, isActive: statusItem.isActive }} pending={save.isPending} onClose={() => setStatusItem(null)} onSubmit={(body, headers) => save.mutate({ id: statusItem.id, body, headers }, { onSuccess: () => { setStatusItem(null); setFeedback({ kind: 'success', text: `Charge item ${statusItem.code} ${body.isActive ? 'activated' : 'deactivated'}.` }); }, onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not change charge item status.') }) })} /> : null}
  </div>;
}

interface ManualJournalLineForm { key: string; accountId: string; description: string; debit: string; credit: string }
interface ManualJournalPayload {
  journalId: string;
  periodId: string | null;
  entryDate: string;
  description: string;
  lines: Array<{ accountId: string; description: string | null; debit: string; credit: string }>;
}
function emptyManualJournalLine(): ManualJournalLineForm {
  return { key: crypto.randomUUID(), accountId: '', description: '', debit: '', credit: '0' };
}

function ManualJournalEditor({ accounts, journals, periods, pending, onCancel, onSubmit }: {
  accounts: Account[];
  journals: Journal[];
  periods: Period[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (body: ManualJournalPayload, headers: HeadersInit) => void;
}) {
  const [journalId, setJournalId] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<ManualJournalLineForm[]>([emptyManualJournalLine(), { ...emptyManualJournalLine(), debit: '0', credit: '' }]);
  const [error, setError] = useState<string | null>(null);
  const operation = useOperationKey();
  const postableAccounts = accounts.filter((account) => account.isActive && account.isPostable);
  const manualJournals = journals.filter((journal) => journal.isActive && ['GENERAL', 'OPENING'].includes(journal.type));
  const updateLine = (index: number, patch: Partial<ManualJournalLineForm>) => setLines((current) => current.map((line, position) => position === index ? { ...line, ...patch } : line));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!validUuid(journalId)) { setError('Select a GENERAL or OPENING journal.'); return; }
    if (!entryDate) { setError('Enter the posting date.'); return; }
    if (!description.trim()) { setError('Enter a journal description.'); return; }
    if (lines.length < 2 || lines.length > 200) { setError('Add between 2 and 200 journal lines.'); return; }
    let debitTotal = 0n;
    let creditTotal = 0n;
    for (const [index, line] of lines.entries()) {
      if (!validUuid(line.accountId)) { setError(`Select a valid account for line ${index + 1}.`); return; }
      if (!validUnsigned(line.debit || '0', 0, 9999999999999999.99, 2) || !validUnsigned(line.credit || '0', 0, 9999999999999999.99, 2)) {
        setError(`Line ${index + 1} amounts must be plain decimals with at most 2 decimal places.`); return;
      }
      const debit = cents(line.debit || '0') ?? 0n;
      const credit = cents(line.credit || '0') ?? 0n;
      if ((debit === 0n && credit === 0n) || (debit > 0n && credit > 0n)) {
        setError(`Line ${index + 1} must have exactly one positive debit or credit.`); return;
      }
      debitTotal += debit;
      creditTotal += credit;
    }
    if (debitTotal === 0n || debitTotal !== creditTotal) { setError(`Debits and credits must balance. Difference: ${fromCents(debitTotal - creditTotal)}.`); return; }
    const body: ManualJournalPayload = {
      journalId,
      periodId: periodId || null,
      entryDate,
      description: description.trim(),
      lines: lines.map((line) => ({ accountId: line.accountId, description: nullable(line.description), debit: line.debit || '0', credit: line.credit || '0' })),
    };
    setError(null);
    onSubmit(body, { 'Idempotency-Key': operation.keyFor(body) });
  };
  return <Panel title="New manual journal" actions={<Button type="button" variant="ghost" size="sm" icon={<X className="h-4 w-4" />} disabled={pending} onClick={onCancel}>Cancel</Button>}>
    <form onSubmit={submit}>
      {error ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p> : null}
      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <AdminField label="Journal *" help="Manual postings use GENERAL or OPENING journals."><Select required value={journalId} onChange={(event) => setJournalId(event.target.value)}><option value="">Select journal</option>{manualJournals.map((journal) => <option key={journal.id} value={journal.id}>{journal.code} · {journal.nameEn} · {journal.type}</option>)}</Select></AdminField>
        <AdminField label="Fiscal period" help="Leave automatic to select the period covering the posting date."><Select value={periodId} onChange={(event) => setPeriodId(event.target.value)}><option value="">Automatic from date</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.fiscalYear.code} · P{period.number} · {period.status}</option>)}</Select></AdminField>
        <AdminField label="Posting date *"><Input required type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} /></AdminField>
        <AdminField label="Description *"><Input required maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Opening balance or adjustment" /></AdminField>
      </div>
      <section className="border-t border-steel-200">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><h3 className="text-sm font-bold text-navy-800">Journal lines</h3><p className="text-xs text-steel-500">Use the company base currency. Posted entries are immutable; correct mistakes with a reversal.</p></div><Button type="button" variant="onlight" size="sm" disabled={pending || lines.length >= 200} icon={<Plus className="h-4 w-4" />} onClick={() => setLines([...lines, emptyManualJournalLine()])}>Add line</Button></div>
        <Table><thead><tr><Th>Account</Th><Th>Description</Th><Th>Debit</Th><Th>Credit</Th><Th><span className="sr-only">Remove</span></Th></tr></thead><tbody>{lines.map((line, index) => <tr key={line.key}><Td className="min-w-[15rem]"><Select required aria-label={`Journal line ${index + 1} account`} value={line.accountId} onChange={(event) => updateLine(index, { accountId: event.target.value })}><option value="">Select postable account</option>{postableAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.nameEn}</option>)}</Select></Td><Td className="min-w-[14rem]"><Input maxLength={500} aria-label={`Journal line ${index + 1} description`} value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} /></Td><Td><Input required dir="ltr" inputMode="decimal" aria-label={`Journal line ${index + 1} debit`} value={line.debit} onChange={(event) => updateLine(index, { debit: event.target.value })} placeholder="0.00" /></Td><Td><Input required dir="ltr" inputMode="decimal" aria-label={`Journal line ${index + 1} credit`} value={line.credit} onChange={(event) => updateLine(index, { credit: event.target.value })} placeholder="0.00" /></Td><Td><Button type="button" variant="ghost" size="sm" disabled={pending || lines.length <= 2} aria-label={`Remove journal line ${index + 1}`} icon={<Trash2 className="h-4 w-4" />} onClick={() => setLines(lines.filter((_, position) => position !== index))}>Remove</Button></Td></tr>)}</tbody></Table>
        <dl className="grid gap-3 border-t border-steel-200 bg-steel-50/60 px-5 py-4 text-sm sm:grid-cols-3"><div><dt className="text-xs text-steel-500">Total debit</dt><dd className="mt-1 font-semibold">{fromCents(lines.reduce((sum, line) => sum + (cents(line.debit || '0') ?? 0n), 0n))}</dd></div><div><dt className="text-xs text-steel-500">Total credit</dt><dd className="mt-1 font-semibold">{fromCents(lines.reduce((sum, line) => sum + (cents(line.credit || '0') ?? 0n), 0n))}</dd></div><div><dt className="text-xs text-steel-500">Difference</dt><dd className="mt-1 font-semibold">{fromCents(lines.reduce((sum, line) => sum + (cents(line.debit || '0') ?? 0n) - (cents(line.credit || '0') ?? 0n), 0n))}</dd></div></dl>
      </section>
      <div className="flex justify-end border-t border-steel-200 px-5 py-4"><Button type="submit" disabled={pending}>{pending ? 'Posting…' : 'Post journal'}</Button></div>
    </form>
  </Panel>;
}

function ReverseJournalEntryDialog({ entry, pending, onCancel, onSubmit }: {
  entry: JournalEntry;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (body: { entryDate: string; reason: string }, headers: HeadersInit) => void;
}) {
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const operation = useOperationKey();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!entryDate || !reason.trim()) { setError('Enter a reversal date and reason.'); return; }
    const body = { entryDate, reason: reason.trim() };
    setError(null);
    onSubmit(body, { 'Idempotency-Key': operation.keyFor(body) });
  };
  return <Panel title={`Reverse ${entry.number}`} actions={<Button type="button" variant="ghost" size="sm" icon={<X className="h-4 w-4" />} disabled={pending} onClick={onCancel}>Cancel</Button>}>
    <form onSubmit={submit}>{error ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p> : null}<div className="grid gap-4 p-5 sm:grid-cols-2"><AdminField label="Reversal date *"><Input required type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} /></AdminField><AdminField label="Reason *"><Input required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this entry being reversed?" /></AdminField><p className="text-sm text-steel-500 sm:col-span-2">This creates an equal and opposite posted entry. The original remains immutable for audit purposes.</p></div><div className="flex justify-end border-t border-steel-200 px-5 py-4"><Button type="submit" disabled={pending}>{pending ? 'Reversing…' : 'Post reversal'}</Button></div></form>
  </Panel>;
}

function JournalEntriesPanel() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [journalId, setJournalId] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [status, setStatus] = useState<EntryStatus | ''>('');
  const [sourceType, setSourceType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [reverseEntry, setReverseEntry] = useState<JournalEntry | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const references = useQuery({
    queryKey: ['accounting', 'entry-filter-options'],
    queryFn: async () => {
      const [journals, periods, accounts] = await Promise.all([
        fetchAllPages<Journal>('/erp/accounting/journals', new URLSearchParams()),
        fetchAllPages<Period>('/erp/accounting/fiscal-periods', new URLSearchParams()),
        fetchAllPages<Account>('/erp/accounting/accounts', new URLSearchParams({ isActive: 'true' })),
      ]);
      return { journals, periods, accounts };
    },
    staleTime: 30000,
  });
  const query = useQuery({
    queryKey: ['accounting', 'journal-entries', search, journalId, periodId, status, sourceType, from, to, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search) params.set('search', search); if (journalId) params.set('journalId', journalId); if (periodId) params.set('periodId', periodId); if (status) params.set('status', status); if (sourceType) params.set('sourceType', sourceType); if (from) params.set('from', from); if (to) params.set('to', to);
      const response = await api.get<JournalEntry[]>(`/erp/accounting/journal-entries?${params.toString()}`);
      return { rows: response.data, meta: response.meta as unknown as PaginationMeta };
    },
    placeholderData: keepPreviousData,
  });
  const detail = useQuery({ queryKey: ['accounting', 'journal-entries', 'detail', selectedId], queryFn: async () => (await api.get<JournalEntry>(`/erp/accounting/journal-entries/${selectedId}`)).data, enabled: selectedId !== null });
  const create = useMutation({
    mutationFn: ({ body, headers }: { body: ManualJournalPayload; headers: HeadersInit }) => api.post<JournalEntry>('/erp/accounting/journal-entries', body, headers),
    onSuccess: async (response) => {
      setFeedback({ kind: 'success', text: `Journal ${response.data.number} posted.` });
      setShowCreate(false);
      setSelectedId(response.data.id);
      await queryClient.invalidateQueries({ queryKey: ['accounting'] });
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not post the manual journal.') }),
  });
  const reverse = useMutation({
    mutationFn: ({ id, body, headers }: { id: string; body: { entryDate: string; reason: string }; headers: HeadersInit }) => api.post<JournalEntry>(`/erp/accounting/journal-entries/${id}/reverse`, body, headers),
    onSuccess: async (response) => {
      setFeedback({ kind: 'success', text: `Reversal ${response.data.number} posted.` });
      setReverseEntry(null);
      setSelectedId(response.data.reversedEntry?.id ?? response.data.id);
      await queryClient.invalidateQueries({ queryKey: ['accounting'] });
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not reverse the journal entry.') }),
  });
  const pending = create.isPending || reverse.isPending;
  const submit = (event: FormEvent) => { event.preventDefault(); if (from && to && to < from) return; setSearch(searchInput.trim()); setPage(1); };
  const clear = () => { setSearchInput(''); setSearch(''); setJournalId(''); setPeriodId(''); setStatus(''); setSourceType(''); setFrom(''); setTo(''); setPage(1); };
  const meta = query.data?.meta;
  const entry = detail.data;
  return <div className="space-y-4">
    <Feedback feedback={feedback} />
    {showCreate ? <ManualJournalEditor accounts={references.data?.accounts ?? []} journals={references.data?.journals ?? []} periods={references.data?.periods ?? []} pending={create.isPending} onCancel={() => setShowCreate(false)} onSubmit={(body, headers) => create.mutate({ body, headers })} /> : null}
    <Panel actions={<Button type="button" variant="onlight" size="sm" disabled={pending || references.isLoading} icon={<Plus className="h-4 w-4" />} onClick={() => { setShowCreate((value) => !value); setFeedback(null); }}>{showCreate ? 'Close form' : 'New manual journal'}</Button>}>
    <form role="search" onSubmit={submit} className="grid gap-3 border-b border-steel-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <AdminField label="Search entries"><Input dir="ltr" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Number, description or source" /></AdminField>
      <AdminField label="Journal"><Select value={journalId} disabled={references.isLoading} onChange={(event) => { setJournalId(event.target.value); setPage(1); }}><option value="">All journals</option>{(references.data?.journals ?? []).map((journal) => <option key={journal.id} value={journal.id}>{journal.code} · {journal.nameEn}</option>)}</Select></AdminField>
      <AdminField label="Fiscal period"><Select value={periodId} disabled={references.isLoading} onChange={(event) => { setPeriodId(event.target.value); setPage(1); }}><option value="">All periods</option>{(references.data?.periods ?? []).map((period) => <option key={period.id} value={period.id}>{period.fiscalYear.code} · P{period.number} · {period.status}</option>)}</Select></AdminField>
      <AdminField label="Status"><Select value={status} onChange={(event) => { setStatus(event.target.value as EntryStatus | ''); setPage(1); }}><option value="">All statuses</option>{entryStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</Select></AdminField>
      <AdminField label="Source type"><Input maxLength={80} value={sourceType} onChange={(event) => { setSourceType(event.target.value); setPage(1); }} placeholder="Invoice, Bill, Payment…" /></AdminField>
      <AdminField label="Entry date from"><Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></AdminField><AdminField label="Entry date to"><Input type="date" min={from || undefined} value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></AdminField>
      <div className="flex items-end gap-2"><Button type="submit" variant="secondary">Search</Button><Button type="button" variant="ghost" onClick={clear}>Clear</Button></div>
    </form>
    <div className="border-b border-steel-100 px-4 py-2 text-xs text-steel-500" aria-live="polite">{meta ? `${meta.total} journal entr${meta.total === 1 ? 'y' : 'ies'}` : 'Journal entries'}</div>
    {query.isLoading ? <LoadingState label="Loading journal entries…" /> : query.isError ? <ErrorState title="Journal entries could not be loaded." error={query.error} onRetry={() => void query.refetch()} /> : <Table><thead><tr><Th>Entry</Th><Th>Date</Th><Th>Journal / period</Th><Th>Source</Th><Th>Debit</Th><Th>Credit</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead><tbody>{!query.data?.rows.length ? <EmptyRow colSpan={8} message="No journal entries match these filters." /> : query.data.rows.map((item) => <tr key={item.id}><Td><button type="button" onClick={() => setSelectedId(item.id)} className="font-mono text-[0.8rem] font-bold text-brand-700 hover:underline">{item.number}</button><span className="mt-1 block max-w-[18rem] truncate text-xs text-steel-500">{item.description}</span></Td><Td className="whitespace-nowrap">{formatDate(item.entryDate, 'en')}</Td><Td>{item.journal.code} · {item.journal.type}<span className="mt-1 block text-xs text-steel-400">{item.period.name} · {item.period.status}</span></Td><Td>{item.sourceType || '—'}{item.sourceId ? <span className="mt-1 block break-all text-[0.62rem] text-steel-400">{item.sourceId}</span> : null}</Td><Td className="whitespace-nowrap">{amount(item.totalDebit, item.currency)}</Td><Td className="whitespace-nowrap">{amount(item.totalCredit, item.currency)}</Td><Td><StatusPill status={item.status} label={item.status} /></Td><Td><Button type="button" variant="onlight" size="sm" icon={<Eye className="h-4 w-4" />} aria-label={`View journal entry ${item.number}`} onClick={() => setSelectedId(item.id)}>View</Button></Td></tr>)}</tbody></Table>}
  </Panel>{meta ? <Pagination meta={meta} page={page} onPage={setPage} isFetching={query.isFetching} label="Journal entry" /> : null}
    {selectedId ? <Panel title={entry ? `${entry.number} · ${entry.journal.nameEn}` : 'Journal entry detail'} actions={<div className="flex flex-wrap gap-2">{entry?.status === 'POSTED' && entry.sourceType === 'MANUAL' && !entry.reversedEntry && !entry.reversals.length ? <Button type="button" variant="onlight" size="sm" disabled={pending} icon={<ArrowRight className="h-4 w-4" />} onClick={() => { setReverseEntry(entry); setFeedback(null); }}>Reverse</Button> : null}<Button type="button" variant="ghost" size="sm" icon={<X className="h-4 w-4" />} onClick={() => { setSelectedId(null); setReverseEntry(null); }}>Close</Button></div>}>{detail.isLoading ? <LoadingState label="Loading journal entry…" /> : detail.isError ? <ErrorState title="Journal entry could not be loaded." error={detail.error} onRetry={() => void detail.refetch()} /> : entry ? <div className="space-y-5 p-5"><div className="flex flex-wrap items-center gap-2"><StatusPill status={entry.status} label={entry.status} /><span className="text-sm text-steel-500">{entry.currency} · rate {entry.exchangeRate}</span></div><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><DetailItem label="Entry date">{formatDate(entry.entryDate, 'en')}</DetailItem><DetailItem label="Journal">{`${entry.journal.code} · ${entry.journal.nameEn}`}</DetailItem><DetailItem label="Period">{`${entry.period.name} · ${entry.period.status}`}</DetailItem><DetailItem label="Description">{entry.description}</DetailItem><DetailItem label="Source">{entry.sourceType ? `${entry.sourceType} · ${entry.sourceId}` : null}</DetailItem><DetailItem label="Total debit">{amount(entry.totalDebit, entry.currency)}</DetailItem><DetailItem label="Total credit">{amount(entry.totalCredit, entry.currency)}</DetailItem><DetailItem label="Created">{formatDateTime(entry.createdAt, 'en')}</DetailItem></dl>{entry.reversedEntry ? <Button type="button" variant="onlight" size="sm" icon={<ArrowRight className="h-4 w-4" />} onClick={() => setSelectedId(entry.reversedEntry!.id)}>View reversed entry {entry.reversedEntry.number}</Button> : null}{entry.reversals.length ? <div className="flex flex-wrap gap-2"><span className="self-center text-xs font-semibold text-steel-500">Reversals:</span>{entry.reversals.map((reversal) => <Button key={reversal.id} type="button" variant="onlight" size="sm" onClick={() => setSelectedId(reversal.id)}>{reversal.number} · {reversal.status}</Button>)}</div> : null}<Table><thead><tr><Th>Account</Th><Th>Partner</Th><Th>Description</Th><Th>Debit</Th><Th>Credit</Th></tr></thead><tbody>{entry.lines.map((line) => <tr key={line.id}><Td><span className="font-mono text-xs text-steel-400">{line.account.code}</span><span className="block font-semibold text-navy-800">{line.account.nameEn}</span></Td><Td>{line.partner ? `${line.partner.code} · ${line.partner.nameEn}` : '—'}</Td><Td>{line.description || '—'}</Td><Td className="whitespace-nowrap">{amount(line.debit, entry.currency)}</Td><Td className="whitespace-nowrap">{amount(line.credit, entry.currency)}</Td></tr>)}</tbody></Table></div> : null}</Panel> : null}
    {reverseEntry ? <ReverseJournalEntryDialog entry={reverseEntry} pending={reverse.isPending} onCancel={() => setReverseEntry(null)} onSubmit={(body, headers) => reverse.mutate({ id: reverseEntry.id, body, headers })} /> : null}
  </div>;
}

interface StatementItemForm { key: string; statementDate: string; description: string; amount: string; reference: string }
interface ReconciliationForm { bankAccountId: string; statementStart: string; statementEnd: string; openingBalance: string; closingBalance: string; items: StatementItemForm[] }
interface ReconciliationPayload { bankAccountId: string; statementStart: string; statementEnd: string; openingBalance: string; closingBalance: string; items: Array<{ statementDate: string; description: string; amount: string; reference: string | null }> }
function emptyStatementItem(): StatementItemForm { return { key: crypto.randomUUID(), statementDate: '', description: '', amount: '', reference: '' }; }
function emptyReconciliationForm(): ReconciliationForm { return { bankAccountId: '', statementStart: '', statementEnd: '', openingBalance: '', closingBalance: '', items: [emptyStatementItem()] }; }

function ReconciliationEditor({ banks, banksLoading, banksError, pending, onCancel, onSubmit }: { banks: BankAccountOption[]; banksLoading: boolean; banksError: unknown; pending: boolean; onCancel: () => void; onSubmit: (body: ReconciliationPayload) => void }) {
  const [form, setForm] = useState<ReconciliationForm>(emptyReconciliationForm);
  const [error, setError] = useState<string | null>(null);
  const activeBanks = banks.filter((bank) => bank.isActive !== false);
  const opening = signedCents(form.openingBalance);
  const itemTotal = form.items.reduce((sum, item) => sum + (signedCents(item.amount) ?? 0n), 0n);
  const calculatedClosing = opening === null ? null : opening + itemTotal;
  const updateItem = (index: number, patch: Partial<StatementItemForm>) => setForm((current) => ({ ...current, items: current.items.map((item, position) => position === index ? { ...item, ...patch } : item) }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!activeBanks.some((bank) => bank.id === form.bankAccountId)) { setError('Select an active bank account.'); return; }
    if (!form.statementStart || !form.statementEnd || form.statementEnd < form.statementStart) { setError('Enter a valid statement period; start cannot be after end.'); return; }
    if (!validSigned(form.openingBalance) || !validSigned(form.closingBalance)) { setError('Opening and closing balances must be plain decimals with at most 2 decimal places.'); return; }
    if (!form.items.length || form.items.length > 500) { setError('Add between 1 and 500 statement items.'); return; }
    for (const [index, item] of form.items.entries()) {
      if (!item.statementDate || item.statementDate < form.statementStart || item.statementDate > form.statementEnd) { setError(`Statement item ${index + 1} must have a date within the statement period.`); return; }
      if (!item.description.trim()) { setError(`Enter a description for statement item ${index + 1}.`); return; }
      if (!validSigned(item.amount) || signedCents(item.amount) === 0n) { setError(`Statement item ${index + 1} must be a non-zero signed decimal with at most 2 decimal places.`); return; }
    }
    if (calculatedClosing === null || signedCents(form.closingBalance) !== calculatedClosing) { setError(`Closing balance must equal opening balance plus statement items (${fromCents(calculatedClosing ?? 0n)}).`); return; }
    const body: ReconciliationPayload = { bankAccountId: form.bankAccountId.trim(), statementStart: form.statementStart, statementEnd: form.statementEnd, openingBalance: form.openingBalance.trim(), closingBalance: form.closingBalance.trim(), items: form.items.map((item) => ({ statementDate: item.statementDate, description: item.description.trim(), amount: item.amount.trim(), reference: nullable(item.reference) })) };
    setError(null); onSubmit(body);
  };
  return <form onSubmit={submit}>{error ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p> : null}<div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4"><SearchableSelect label="Bank account *" required value={form.bankAccountId} onChange={(bankAccountId) => setForm({ ...form, bankAccountId })} options={activeBanks.map((bank) => ({ id: bank.id, label: `${bank.code} · ${bank.name} · ${bank.currency}` }))} loading={banksLoading} error={banksError} emptyLabel="Select active bank account" help="The bank and its ledger account must use the company base currency." /><AdminField label="Statement start *"><Input required type="date" value={form.statementStart} onChange={(event) => setForm({ ...form, statementStart: event.target.value })} /></AdminField><AdminField label="Statement end *"><Input required type="date" min={form.statementStart || undefined} value={form.statementEnd} onChange={(event) => setForm({ ...form, statementEnd: event.target.value })} /></AdminField><AdminField label="Opening balance *"><Input required dir="ltr" inputMode="decimal" value={form.openingBalance} onChange={(event) => setForm({ ...form, openingBalance: event.target.value })} placeholder="0.00" /></AdminField><AdminField label="Closing balance *"><Input required dir="ltr" inputMode="decimal" value={form.closingBalance} onChange={(event) => setForm({ ...form, closingBalance: event.target.value })} placeholder="0.00" /></AdminField></div>
    <section className="border-t border-steel-200"><div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><h3 className="text-sm font-bold text-navy-800">Statement items</h3><p className="text-xs text-steel-500">Use positive amounts for money in and negative amounts for money out. 1–500 items.</p></div><Button type="button" variant="onlight" size="sm" disabled={pending || form.items.length >= 500} icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ ...form, items: [...form.items, emptyStatementItem()] })}>Add item</Button></div><Table><thead><tr><Th>Date</Th><Th>Description</Th><Th>Signed amount</Th><Th>Reference</Th><Th><span className="sr-only">Remove</span></Th></tr></thead><tbody>{form.items.map((item, index) => <tr key={item.key}><Td><Input required type="date" aria-label={`Statement item ${index + 1} date`} min={form.statementStart || undefined} max={form.statementEnd || undefined} value={item.statementDate} onChange={(event) => updateItem(index, { statementDate: event.target.value })} /></Td><Td className="min-w-[16rem]"><Input required maxLength={500} aria-label={`Statement item ${index + 1} description`} value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} /></Td><Td><Input required dir="ltr" inputMode="decimal" aria-label={`Statement item ${index + 1} signed amount`} value={item.amount} onChange={(event) => updateItem(index, { amount: event.target.value })} placeholder="100.00 or -100.00" /></Td><Td><Input maxLength={120} aria-label={`Statement item ${index + 1} reference`} value={item.reference} onChange={(event) => updateItem(index, { reference: event.target.value })} /></Td><Td><Button type="button" variant="ghost" size="sm" disabled={pending || form.items.length === 1} aria-label={`Remove statement item ${index + 1}`} icon={<Trash2 className="h-4 w-4" />} onClick={() => setForm({ ...form, items: form.items.filter((_, position) => position !== index) })}>Remove</Button></Td></tr>)}</tbody></Table><dl className="grid gap-3 border-t border-steel-200 bg-steel-50/60 px-5 py-4 text-sm sm:grid-cols-3"><div><dt className="text-xs text-steel-500">Statement net</dt><dd className="mt-1 font-semibold">{fromCents(itemTotal)}</dd></div><div><dt className="text-xs text-steel-500">Calculated closing</dt><dd className="mt-1 font-semibold">{calculatedClosing === null ? '—' : fromCents(calculatedClosing)}</dd></div><div><dt className="text-xs text-steel-500">Entered closing</dt><dd className="mt-1 font-semibold">{form.closingBalance || '—'}</dd></div></dl></section>
    <div className="flex justify-end gap-2 border-t border-steel-200 px-5 py-4"><Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create reconciliation'}</Button></div></form>;
}

function ReconciliationHeaderEditor({ reconciliation, banks, banksLoading, banksError, pending, onCancel, onSubmit }: {
  reconciliation: Reconciliation; banks: BankAccountOption[]; banksLoading: boolean; banksError: unknown; pending: boolean; onCancel: () => void; onSubmit: (body: Record<string, unknown>, headers: HeadersInit) => void;
}) {
  const [form, setForm] = useState({ bankAccountId: reconciliation.bankAccountId, statementStart: reconciliation.statementStart.slice(0, 10), statementEnd: reconciliation.statementEnd.slice(0, 10), openingBalance: reconciliation.openingBalance, closingBalance: reconciliation.closingBalance, reason: '' });
  const [error, setError] = useState<string | null>(null);
  const operation = useOperationKey();
  const opening = signedCents(form.openingBalance);
  const statementNet = reconciliation.items.reduce((sum, item) => sum + (signedCents(item.amount) ?? 0n), 0n);
  const calculatedClosing = opening === null ? null : opening + statementNet;
  const bankLocked = reconciliation.items.some((item) => item.matchStatus === 'MATCHED');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.reason.trim()) { setError('An audit reason is required.'); return; }
    if (!form.statementStart || !form.statementEnd || form.statementStart > form.statementEnd) { setError('Enter a valid statement period.'); return; }
    if (reconciliation.items.some((item) => item.statementDate.slice(0, 10) < form.statementStart || item.statementDate.slice(0, 10) > form.statementEnd)) { setError('Every statement item must remain within the statement period.'); return; }
    if (!validSigned(form.openingBalance) || !validSigned(form.closingBalance)) { setError('Balances must be signed decimals with at most 2 decimal places.'); return; }
    if (calculatedClosing === null || signedCents(form.closingBalance) !== calculatedClosing) { setError(`Closing balance must equal ${fromCents(calculatedClosing ?? 0n)}.`); return; }
    if (!bankLocked && !banks.some((bank) => bank.id === form.bankAccountId && bank.isActive !== false)) { setError('Select an active bank account.'); return; }
    const body = { ...(bankLocked ? {} : { bankAccountId: form.bankAccountId }), statementStart: form.statementStart, statementEnd: form.statementEnd, openingBalance: form.openingBalance.trim(), closingBalance: form.closingBalance.trim(), reason: form.reason.trim() };
    setError(null); onSubmit(body, { 'Idempotency-Key': operation.keyFor(body) });
  };
  return <Panel title="Correct reconciliation header" actions={<Button type="button" variant="ghost" size="sm" disabled={pending} icon={<X className="h-4 w-4" />} onClick={onCancel}>Cancel</Button>}>
    <form onSubmit={submit}>{error ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p> : null}<div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4"><SearchableSelect label="Bank account" value={form.bankAccountId} onChange={(bankAccountId) => setForm({ ...form, bankAccountId })} options={banks.filter((bank) => bank.isActive !== false).map((bank) => ({ id: bank.id, label: `${bank.code} · ${bank.name} · ${bank.currency}` }))} loading={banksLoading} error={banksError} disabled={bankLocked} emptyLabel="Select active bank account" help={bankLocked ? 'Unmatch every item before changing the bank account.' : undefined} /><AdminField label="Statement start *"><Input required type="date" value={form.statementStart} onChange={(event) => setForm({ ...form, statementStart: event.target.value })} /></AdminField><AdminField label="Statement end *"><Input required type="date" min={form.statementStart || undefined} value={form.statementEnd} onChange={(event) => setForm({ ...form, statementEnd: event.target.value })} /></AdminField><AdminField label="Opening balance *"><Input required dir="ltr" inputMode="decimal" value={form.openingBalance} onChange={(event) => setForm({ ...form, openingBalance: event.target.value })} /></AdminField><AdminField label="Closing balance *" help={`Calculated from current items: ${calculatedClosing === null ? '—' : fromCents(calculatedClosing)}`}><Input required dir="ltr" inputMode="decimal" value={form.closingBalance} onChange={(event) => setForm({ ...form, closingBalance: event.target.value })} /></AdminField><AdminField label="Audit reason *" className="sm:col-span-2 lg:col-span-4"><Textarea required rows={3} maxLength={500} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></AdminField></div><div className="flex justify-end border-t border-steel-200 px-5 py-4"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save header correction'}</Button></div></form>
  </Panel>;
}

function ReconciliationItemEditor({ reconciliation, item, pending, onCancel, onSubmit }: {
  reconciliation: Reconciliation; item: ReconciliationItem; pending: boolean; onCancel: () => void; onSubmit: (body: Record<string, unknown>, headers: HeadersInit) => void;
}) {
  const [form, setForm] = useState({ statementDate: item.statementDate.slice(0, 10), description: item.description, amount: item.amount, reference: item.reference ?? '', reason: '' });
  const [error, setError] = useState<string | null>(null);
  const operation = useOperationKey();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (item.matchStatus !== 'UNMATCHED') { setError('Unmatch this item before editing it.'); return; }
    if (!form.reason.trim() || !form.description.trim()) { setError('Description and audit reason are required.'); return; }
    if (!form.statementDate || form.statementDate < reconciliation.statementStart.slice(0, 10) || form.statementDate > reconciliation.statementEnd.slice(0, 10)) { setError('Statement date must remain within the statement period.'); return; }
    if (!validSigned(form.amount) || signedCents(form.amount) === 0n) { setError('Amount must be a non-zero signed decimal with at most 2 decimal places.'); return; }
    const body = { statementDate: form.statementDate, description: form.description.trim(), amount: form.amount.trim(), reference: nullable(form.reference), reason: form.reason.trim() };
    setError(null); onSubmit(body, { 'Idempotency-Key': operation.keyFor(body) });
  };
  return <Panel title="Correct unmatched statement item" actions={<Button type="button" variant="ghost" size="sm" disabled={pending} icon={<X className="h-4 w-4" />} onClick={onCancel}>Cancel</Button>}>
    <form onSubmit={submit}>{error ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p> : null}<div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4"><AdminField label="Statement date *"><Input required type="date" min={reconciliation.statementStart.slice(0, 10)} max={reconciliation.statementEnd.slice(0, 10)} value={form.statementDate} onChange={(event) => setForm({ ...form, statementDate: event.target.value })} /></AdminField><AdminField label="Description *" className="sm:col-span-2"><Input required maxLength={500} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></AdminField><AdminField label="Signed amount *"><Input required dir="ltr" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></AdminField><AdminField label="Reference"><Input maxLength={120} value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} /></AdminField><AdminField label="Audit reason *" className="sm:col-span-2"><Textarea required rows={3} maxLength={500} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></AdminField><p className="text-sm text-steel-500 sm:col-span-2">Saving recalculates the closing balance from the opening balance and all current statement items. Financial transactions are not changed.</p></div><div className="flex justify-end border-t border-steel-200 px-5 py-4"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save item correction'}</Button></div></form>
  </Panel>;
}

function ReconciliationReasonDialog({ kind, pending, onCancel, onSubmit }: { kind: 'delete' | 'reopen'; pending: boolean; onCancel: () => void; onSubmit: (reason: string, headers: HeadersInit) => void }) {
  const [reason, setReason] = useState('');
  const operation = useOperationKey();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!reason.trim()) return;
    const body = { reason: reason.trim() };
    onSubmit(body.reason, { 'Idempotency-Key': operation.keyFor(body) });
  };
  return <Panel title={kind === 'delete' ? 'Delete draft reconciliation' : 'Reopen reviewed reconciliation'} actions={<Button type="button" variant="ghost" size="sm" disabled={pending} icon={<X className="h-4 w-4" />} onClick={onCancel}>Cancel</Button>}>
    <form onSubmit={submit}><div className="space-y-4 p-5"><p className="text-sm text-steel-600">{kind === 'delete' ? 'Only an unmatched DRAFT can be deleted. Its audit snapshot is retained; payments and journal entries are not changed.' : 'This audited action returns a REVIEWED reconciliation to DRAFT. APPROVED reconciliations cannot be reopened.'}</p><AdminField label="Audit reason *"><Textarea required rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></AdminField></div><div className="flex justify-end border-t border-steel-200 px-5 py-4"><Button type="submit" variant={kind === 'delete' ? 'secondary' : 'primary'} disabled={pending || !reason.trim()}>{pending ? 'Submitting…' : kind === 'delete' ? 'Delete reconciliation' : 'Reopen to DRAFT'}</Button></div></form>
  </Panel>;
}

interface MatchCandidate { id: string; label: string }
function ReconciliationItemDialog({ reconciliation, item, mode, candidates, candidatesLoading, candidatesError, pending, onClose, onSubmit }: {
  reconciliation: Reconciliation; item: ReconciliationItem; mode: 'match' | 'unmatch'; candidates: { payments: MatchCandidate[]; journals: MatchCandidate[] }; candidatesLoading: boolean; candidatesError: unknown; pending: boolean; onClose: () => void; onSubmit: (body: { paymentId?: string; journalLineId?: string; reason?: string | null }, headers: HeadersInit) => void;
}) {
  const [targetKind, setTargetKind] = useState<'payment' | 'journal'>('payment');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const operation = useOperationKey();
  const listId = useId();
  const currentCandidates = candidates[targetKind === 'payment' ? 'payments' : 'journals'];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'match' && !validUuid(targetId)) { setError('Select or enter a valid payment or journal line UUID.'); return; }
    const body = mode === 'match' ? (targetKind === 'payment' ? { paymentId: targetId.trim() } : { journalLineId: targetId.trim() }) : { reason: nullable(reason) };
    setError(null); onSubmit(body, { 'Idempotency-Key': operation.keyFor(body) });
  };
  return <Panel title={`${mode === 'match' ? 'Match' : 'Unmatch'} statement item`} actions={<Button type="button" variant="ghost" size="sm" disabled={pending} icon={<X className="h-4 w-4" />} onClick={onClose}>Cancel</Button>}><form onSubmit={submit}>{error ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p> : null}<div className="space-y-4 p-5"><div className="rounded-xl bg-steel-50 p-4 text-sm"><p className="font-semibold text-navy-800">{item.description}</p><p className="mt-1 text-steel-500">{formatDate(item.statementDate, 'en')} · {amount(item.amount, reconciliation.bankAccount.currency)} · {item.reference || 'No reference'}</p></div>{mode === 'match' ? <><AdminField label="Match target type *"><Select value={targetKind} onChange={(event) => { setTargetKind(event.target.value as 'payment' | 'journal'); setTargetId(''); }}><option value="payment">Posted payment / receipt</option><option value="journal">Posted bank journal line</option></Select></AdminField><AdminField label={targetKind === 'payment' ? 'Payment *' : 'Journal line *'} help="Only unused candidates with the exact signed amount are suggested. You may also enter a valid UUID."><Input list={listId} required dir="ltr" maxLength={36} value={targetId} onChange={(event) => setTargetId(event.target.value)} placeholder="Target UUID" /><datalist id={listId}>{currentCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}</datalist>{candidatesLoading ? <Spinner label="Loading matching transactions…" /> : candidatesError ? <span className="mt-1 block text-xs text-red-700">Candidates could not be loaded. {messageFor(candidatesError, 'You can still enter a UUID.')}</span> : !currentCandidates.length ? <span className="mt-1 block text-xs text-steel-500">No unused transaction with this exact signed amount was found.</span> : null}</AdminField></> : <AdminField label="Unmatch reason"><Textarea rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional audit reason" /></AdminField>}</div><div className="flex justify-end border-t border-steel-200 px-5 py-4"><Button type="submit" disabled={pending || (mode === 'match' && candidatesLoading)}>{pending ? 'Submitting…' : mode === 'match' ? 'Match item' : 'Unmatch item'}</Button></div></form></Panel>;
}

function ReconciliationsPanel() {
  const queryClient = useQueryClient();
  const createOperation = useOperationKey();
  const reviewOperation = useOperationKey();
  const [bankFilter, setBankFilter] = useState('');
  const [status, setStatus] = useState<ReconciliationStatus | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [itemAction, setItemAction] = useState<{ item: ReconciliationItem; mode: 'match' | 'unmatch' } | null>(null);
  const [editingHeader, setEditingHeader] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [reasonAction, setReasonAction] = useState<'delete' | 'reopen' | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const banksQuery = useBankAccountOptions();
  const query = useQuery({
    queryKey: ['accounting', 'reconciliations', bankFilter, status, from, to, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (bankFilter) params.set('bankAccountId', bankFilter); if (status) params.set('status', status); if (from) params.set('from', from); if (to) params.set('to', to);
      const response = await api.get<Reconciliation[]>(`/erp/accounting/reconciliations?${params.toString()}`);
      return { rows: response.data, meta: response.meta as unknown as PaginationMeta };
    },
    placeholderData: keepPreviousData,
  });
  const detail = useQuery({ queryKey: ['accounting', 'reconciliations', 'detail', selectedId], queryFn: async () => (await api.get<Reconciliation>(`/erp/accounting/reconciliations/${selectedId}`)).data, enabled: selectedId !== null });
  const candidates = useQuery({
    queryKey: ['accounting', 'reconciliation-candidates', selectedId, itemAction?.item.id, itemAction?.mode],
    queryFn: async () => {
      if (!detail.data || !itemAction || itemAction.mode !== 'match') return { payments: [] as MatchCandidate[], journals: [] as MatchCandidate[] };
      const reconciliation = detail.data;
      const item = itemAction.item;
      const expected = signedCents(item.amount);
      const usedPayments = new Set(reconciliation.items.flatMap((record) => [record.paymentId, record.journalLine?.paymentId]).filter((id): id is string => Boolean(id)));
      const usedJournals = new Set(reconciliation.items.flatMap((record) => record.journalLineId).filter((id): id is string => Boolean(id)));
      const [payments, entries] = await Promise.all([
        fetchAllPages<PaymentCandidate>('/erp/accounting/payments', new URLSearchParams({ bankAccountId: reconciliation.bankAccountId, status: 'POSTED', from: reconciliation.statementStart.slice(0, 10), to: reconciliation.statementEnd.slice(0, 10) })),
        fetchAllPages<JournalEntry>('/erp/accounting/journal-entries', new URLSearchParams({ status: 'POSTED', from: reconciliation.statementStart.slice(0, 10), to: reconciliation.statementEnd.slice(0, 10) })),
      ]);
      const paymentOptions = payments.filter((payment) => !usedPayments.has(payment.id) && payment.currency.toUpperCase() === reconciliation.bankAccount.currency.toUpperCase() && (payment.direction === 'RECEIPT' ? cents(payment.amount) : -(cents(payment.amount) ?? 0n)) === expected).map((payment) => ({ id: payment.id, label: `${payment.number} · ${payment.direction} · ${formatDate(payment.paymentDate, 'en')} · ${payment.direction === 'RECEIPT' ? '+' : '-'}${payment.amount}` }));
      const journalOptions = entries.flatMap((entry) => entry.lines.filter((line) => line.account.id === reconciliation.bankAccount.accountId && !usedJournals.has(line.id) && !(line.paymentId && usedPayments.has(line.paymentId)) && entry.currency.toUpperCase() === reconciliation.bankAccount.currency.toUpperCase() && (cents(line.debit) ?? 0n) - (cents(line.credit) ?? 0n) === expected).map((line) => ({ id: line.id, label: `${entry.number} · ${line.account.code} · ${formatDate(entry.entryDate, 'en')} · ${(cents(line.debit) ?? 0n) > 0n ? '+' : '-'}${(cents(line.debit) ?? 0n) > 0n ? line.debit : line.credit}` })));
      return { payments: paymentOptions, journals: journalOptions };
    },
    enabled: Boolean(detail.data && itemAction?.mode === 'match'),
  });
  const create = useMutation({
    mutationFn: (body: ReconciliationPayload) => api.post<Reconciliation>('/erp/accounting/reconciliations', body, { 'Idempotency-Key': createOperation.keyFor(body) }),
    onSuccess: async (response) => { createOperation.reset(); setFeedback({ kind: 'success', text: 'Bank reconciliation created as DRAFT.' }); setShowCreate(false); setSelectedId(response.data.id); setItemAction(null); await queryClient.invalidateQueries({ queryKey: ['accounting'] }); },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not create the reconciliation.') }),
  });
  const correctHeader = useMutation({
    mutationFn: ({ id, body, headers }: { id: string; body: Record<string, unknown>; headers: HeadersInit }) => api.patch<Reconciliation>(`/erp/accounting/reconciliations/${id}`, body, headers),
    onSuccess: async () => { setEditingHeader(false); setFeedback({ kind: 'success', text: 'Reconciliation header corrected.' }); await queryClient.invalidateQueries({ queryKey: ['accounting'] }); },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not correct the reconciliation header.') }),
  });
  const correctItem = useMutation({
    mutationFn: ({ id, itemId, body, headers }: { id: string; itemId: string; body: Record<string, unknown>; headers: HeadersInit }) => api.patch<Reconciliation>(`/erp/accounting/reconciliations/${id}/items/${itemId}`, body, headers),
    onSuccess: async () => { setEditingItemId(null); setFeedback({ kind: 'success', text: 'Statement item corrected and closing balance recalculated.' }); await queryClient.invalidateQueries({ queryKey: ['accounting'] }); },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not correct the statement item.') }),
  });
  const reasonMutation = useMutation<Envelope<Reconciliation> | Envelope<{ id: string; deleted: boolean }>, Error, { id: string; kind: 'delete' | 'reopen'; reason: string; headers: HeadersInit }>({
    mutationFn: ({ id, kind, reason, headers }: { id: string; kind: 'delete' | 'reopen'; reason: string; headers: HeadersInit }) => kind === 'delete'
      ? api.post<{ id: string; deleted: boolean }>(`/erp/accounting/reconciliations/${id}/delete`, { reason }, headers)
      : api.post<Reconciliation>(`/erp/accounting/reconciliations/${id}/reopen`, { reason }, headers),
    onSuccess: async (_, variables) => { setReasonAction(null); setEditingHeader(false); setEditingItemId(null); setItemAction(null); if (variables.kind === 'delete') setSelectedId(null); setFeedback({ kind: 'success', text: variables.kind === 'delete' ? 'Draft reconciliation deleted with an audit snapshot.' : 'Reviewed reconciliation reopened to DRAFT.' }); await queryClient.invalidateQueries({ queryKey: ['accounting'] }); },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not update the reconciliation.') }),
  });
  const mutateItem = useMutation({
    mutationFn: ({ id, itemId, mode, body, headers }: { id: string; itemId: string; mode: 'match' | 'unmatch'; body: { paymentId?: string; journalLineId?: string; reason?: string | null }; headers: HeadersInit }) => api.post<Reconciliation>(`/erp/accounting/reconciliations/${id}/items/${itemId}/${mode}`, body, headers),
    onSuccess: async (_, variables) => { setFeedback({ kind: 'success', text: `Statement item ${variables.mode === 'match' ? 'matched' : 'unmatched'}.` }); setItemAction(null); await queryClient.invalidateQueries({ queryKey: ['accounting'] }); },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not update the reconciliation item.') }),
  });
  const reviewApprove = useMutation({
    mutationFn: ({ id, kind, headers }: { id: string; kind: 'review' | 'approve'; headers: HeadersInit }) => api.post<Reconciliation>(`/erp/accounting/reconciliations/${id}/${kind}`, undefined, headers),
    onSuccess: async (response) => { reviewOperation.reset(); setEditingHeader(false); setEditingItemId(null); setItemAction(null); setReasonAction(null); setFeedback({ kind: 'success', text: `Reconciliation ${response.data.status === 'REVIEWED' ? 'reviewed' : 'approved'}.` }); await queryClient.invalidateQueries({ queryKey: ['accounting'] }); },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not update the reconciliation status.') }),
  });
  const pending = create.isPending || mutateItem.isPending || reviewApprove.isPending || correctHeader.isPending || correctItem.isPending || reasonMutation.isPending;
  const meta = query.data?.meta;
  const reconciliation = detail.data;
  const canEdit = reconciliation?.status === 'DRAFT';
  const canDelete = reconciliation?.status === 'DRAFT' && reconciliation.items.every((item) => item.matchStatus === 'UNMATCHED');
  const editingItem = canEdit ? reconciliation.items.find((item) => item.id === editingItemId && item.matchStatus === 'UNMATCHED') ?? null : null;
  const openReconciliation = (id: string) => { setSelectedId(id); setShowCreate(false); setItemAction(null); setEditingHeader(false); setEditingItemId(null); setReasonAction(null); setFeedback(null); };
  const closeReconciliation = () => { setSelectedId(null); setItemAction(null); setEditingHeader(false); setEditingItemId(null); setReasonAction(null); };
  const submitHeader = (body: Record<string, unknown>, headers: HeadersInit) => {
    if (!selectedId || !reconciliation || reconciliation.id !== selectedId || reconciliation.status !== 'DRAFT') { setEditingHeader(false); setFeedback({ kind: 'error', text: 'Only a DRAFT reconciliation can be changed.' }); return; }
    correctHeader.mutate({ id: selectedId, body, headers });
  };
  const submitItemCorrection = (body: Record<string, unknown>, headers: HeadersInit) => {
    if (!selectedId || !editingItemId || !reconciliation || reconciliation.id !== selectedId || reconciliation.status !== 'DRAFT' || !reconciliation.items.some((item) => item.id === editingItemId && item.matchStatus === 'UNMATCHED')) { setEditingItemId(null); setFeedback({ kind: 'error', text: 'Only an unmatched item in a DRAFT reconciliation can be changed.' }); return; }
    correctItem.mutate({ id: selectedId, itemId: editingItemId, body, headers });
  };
  const submitReason = (reason: string, headers: HeadersInit) => {
    if (!selectedId || !reasonAction || !reconciliation || reconciliation.id !== selectedId) return;
    const allowed = reasonAction === 'delete'
      ? reconciliation.status === 'DRAFT' && reconciliation.items.every((item) => item.matchStatus === 'UNMATCHED')
      : reconciliation.status === 'REVIEWED';
    if (!allowed) { setReasonAction(null); setFeedback({ kind: 'error', text: 'This reconciliation can no longer be deleted or reopened.' }); return; }
    reasonMutation.mutate({ id: selectedId, kind: reasonAction, reason, headers });
  };
  const submitItemAction = (body: { paymentId?: string; journalLineId?: string; reason?: string | null }, headers: HeadersInit) => {
    if (!selectedId || !itemAction || !reconciliation || reconciliation.id !== selectedId || reconciliation.status !== 'DRAFT') { setItemAction(null); setFeedback({ kind: 'error', text: 'Only a DRAFT reconciliation can be changed.' }); return; }
    const currentItem = reconciliation.items.find((item) => item.id === itemAction.item.id);
    const expectedStatus = itemAction.mode === 'match' ? 'UNMATCHED' : 'MATCHED';
    if (!currentItem || currentItem.matchStatus !== expectedStatus) { setItemAction(null); setFeedback({ kind: 'error', text: 'The statement item match status has changed. Refresh the detail and try again.' }); return; }
    mutateItem.mutate({ id: selectedId, itemId: itemAction.item.id, mode: itemAction.mode, body, headers });
  };
  const runReview = (kind: 'review' | 'approve') => {
    if (!selectedId || !reconciliation || reconciliation.id !== selectedId || reconciliation.items.some((item) => item.matchStatus !== 'MATCHED')) return;
    if (kind === 'review' ? reconciliation.status !== 'DRAFT' : !['DRAFT', 'REVIEWED'].includes(reconciliation.status)) return;
    const body = { id: selectedId, kind };
    reviewApprove.mutate({ id: selectedId, kind, headers: { 'Idempotency-Key': reviewOperation.keyFor(body) } });
  };
  return <div className="space-y-4"><Feedback feedback={feedback} /><Panel title="Bank reconciliations" actions={<Button variant="onlight" size="sm" disabled={pending} icon={<Plus className="h-4 w-4" />} onClick={() => { setShowCreate((value) => !value); createOperation.reset(); setFeedback(null); }}>{showCreate ? 'Close form' : 'New reconciliation'}</Button>}>
      {showCreate ? <ReconciliationEditor banks={banksQuery.data ?? []} banksLoading={banksQuery.isLoading} banksError={banksQuery.error} pending={create.isPending} onCancel={() => { setShowCreate(false); createOperation.reset(); }} onSubmit={(body) => create.mutate(body)} /> : null}
      <form role="search" onSubmit={(event) => { event.preventDefault(); if (from && to && to < from) { setFeedback({ kind: 'error', text: 'End date cannot be earlier than start date.' }); return; } setPage(1); }} className="grid gap-3 border-b border-steel-200 p-4 sm:grid-cols-2 lg:grid-cols-4"><AdminField label="Bank account"><Select value={bankFilter} disabled={banksQuery.isLoading} onChange={(event) => { setBankFilter(event.target.value); setPage(1); }}><option value="">All bank accounts</option>{(banksQuery.data ?? []).map((bank) => <option key={bank.id} value={bank.id}>{bank.code} · {bank.name}</option>)}</Select></AdminField><AdminField label="Status"><Select value={status} onChange={(event) => { setStatus(event.target.value as ReconciliationStatus | ''); setPage(1); }}><option value="">All statuses</option>{reconciliationStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</Select></AdminField><AdminField label="Statement end from"><Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></AdminField><AdminField label="Statement end to"><Input type="date" min={from || undefined} value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></AdminField><div className="flex items-end gap-2"><Button type="submit" variant="secondary">Search</Button><Button type="button" variant="ghost" onClick={() => { setBankFilter(''); setStatus(''); setFrom(''); setTo(''); setPage(1); }}>Clear</Button></div></form>
      <div className="border-b border-steel-100 px-4 py-2 text-xs text-steel-500" aria-live="polite">{meta ? `${meta.total} reconciliation${meta.total === 1 ? '' : 's'}` : 'Reconciliations'}</div>
      {query.isLoading ? <LoadingState label="Loading reconciliations…" /> : query.isError ? <ErrorState title="Reconciliations could not be loaded." error={query.error} onRetry={() => void query.refetch()} /> : <Table><thead><tr><Th>Bank account</Th><Th>Statement period</Th><Th>Opening</Th><Th>Closing</Th><Th>Matched</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead><tbody>{!query.data?.rows.length ? <EmptyRow colSpan={7} message="No reconciliations match these filters." /> : query.data.rows.map((item) => <tr key={item.id}><Td><span className="font-semibold text-navy-800">{item.bankAccount.code} · {item.bankAccount.name}</span><span className="mt-1 block text-xs text-steel-400">{item.bankAccount.currency}</span></Td><Td className="whitespace-nowrap">{formatDate(item.statementStart, 'en')}<span className="mt-1 block text-xs text-steel-400">to {formatDate(item.statementEnd, 'en')}</span></Td><Td className="whitespace-nowrap">{amount(item.openingBalance, item.bankAccount.currency)}</Td><Td className="whitespace-nowrap font-semibold">{amount(item.closingBalance, item.bankAccount.currency)}</Td><Td>{item.items.filter((record) => record.matchStatus === 'MATCHED').length} / {item.items.length}</Td><Td><StatusPill status={item.status} label={item.status} /></Td><Td><Button type="button" variant="onlight" size="sm" icon={<Eye className="h-4 w-4" />} onClick={() => openReconciliation(item.id)}>View</Button></Td></tr>)}</tbody></Table>}
    </Panel>{meta ? <Pagination meta={meta} page={page} onPage={setPage} isFetching={query.isFetching} label="Reconciliation" /> : null}
    {selectedId ? <Panel title={reconciliation ? `${reconciliation.bankAccount.code} · ${formatDate(reconciliation.statementEnd, 'en')}` : 'Reconciliation detail'} actions={<div className="flex flex-wrap gap-2">{canEdit ? <Button type="button" variant="onlight" size="sm" disabled={pending} icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditingHeader(true); setEditingItemId(null); setItemAction(null); setReasonAction(null); setFeedback(null); }}>Edit header</Button> : null}{canDelete ? <Button type="button" variant="ghost" size="sm" disabled={pending} icon={<Trash2 className="h-4 w-4" />} onClick={() => { setReasonAction('delete'); setEditingHeader(false); setEditingItemId(null); setItemAction(null); setFeedback(null); }}>Delete DRAFT</Button> : null}{reconciliation?.status === 'REVIEWED' ? <Button type="button" variant="onlight" size="sm" disabled={pending} icon={<RefreshCw className="h-4 w-4" />} onClick={() => { setReasonAction('reopen'); setEditingHeader(false); setEditingItemId(null); setItemAction(null); setFeedback(null); }}>Reopen REVIEWED</Button> : null}<Button type="button" variant="ghost" size="sm" disabled={pending} icon={<X className="h-4 w-4" />} onClick={closeReconciliation}>Close</Button></div>}>{detail.isLoading ? <LoadingState label="Loading reconciliation detail…" /> : detail.isError ? <ErrorState title="Reconciliation could not be loaded." error={detail.error} onRetry={() => void detail.refetch()} /> : reconciliation ? <div className="space-y-5 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><StatusPill status={reconciliation.status} label={reconciliation.status} /><span className="text-xs text-steel-400">Updated {formatDateTime(reconciliation.updatedAt, 'en')}</span>{reconciliation.status === 'APPROVED' ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-steel-500"><Lock className="h-3.5 w-3.5" />Approved records are immutable</span> : null}</div><div className="flex flex-wrap gap-2">{reconciliation.status === 'DRAFT' ? <Button type="button" variant="onlight" size="sm" disabled={pending || reconciliation.items.some((item) => item.matchStatus !== 'MATCHED')} icon={<Check className="h-4 w-4" />} onClick={() => runReview('review')}>Review</Button> : null}{['DRAFT', 'REVIEWED'].includes(reconciliation.status) ? <Button type="button" size="sm" disabled={pending || reconciliation.items.some((item) => item.matchStatus !== 'MATCHED')} icon={<ShieldCheck className="h-4 w-4" />} onClick={() => runReview('approve')}>Approve</Button> : null}</div></div><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><DetailItem label="Bank account">{`${reconciliation.bankAccount.code} · ${reconciliation.bankAccount.name}`}</DetailItem><DetailItem label="Ledger account">{reconciliation.bankAccount.account ? `${reconciliation.bankAccount.account.code} · ${reconciliation.bankAccount.account.nameEn}` : reconciliation.bankAccount.accountId}</DetailItem><DetailItem label="Statement period">{`${formatDate(reconciliation.statementStart, 'en')} — ${formatDate(reconciliation.statementEnd, 'en')}`}</DetailItem><DetailItem label="Opening / closing">{`${reconciliation.openingBalance} / ${reconciliation.closingBalance} ${reconciliation.bankAccount.currency}`}</DetailItem><DetailItem label="Reviewed by">{reconciliation.reviewedById}</DetailItem><DetailItem label="Approved by">{reconciliation.approvedById}</DetailItem><DetailItem label="Approved at">{formatDateTime(reconciliation.approvedAt, 'en')}</DetailItem></dl>{reconciliation.items.some((item) => item.matchStatus !== 'MATCHED') ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">All statement items must be matched before review or approval.</p> : null}<Table><thead><tr><Th>Statement item</Th><Th>Signed amount</Th><Th>Match</Th><Th>Linked transaction</Th><Th><span className="sr-only">Actions</span></Th></tr></thead><tbody>{reconciliation.items.map((item) => <tr key={item.id}><Td className="min-w-[16rem]"><span className="font-semibold text-navy-800">{item.description}</span><span className="mt-1 block text-xs text-steel-400">{formatDate(item.statementDate, 'en')} · {item.reference || 'No reference'}</span></Td><Td className="whitespace-nowrap font-semibold">{amount(item.amount, reconciliation.bankAccount.currency)}</Td><Td><StatusPill status={item.matchStatus} label={item.matchStatus} /></Td><Td>{item.payment ? <><span className="font-mono font-bold text-brand-700">{item.payment.number}</span><span className="mt-1 block text-xs text-steel-400">{item.payment.direction} · {item.payment.status} · {formatDate(item.payment.paymentDate, 'en')}</span></> : item.journalLine ? <><span className="font-mono font-bold text-brand-700">{item.journalLine.entry.number}</span><span className="mt-1 block text-xs text-steel-400">{item.journalLine.account.code} · {item.journalLine.entry.status} · {formatDate(item.journalLine.entry.entryDate, 'en')}</span></> : '—'}</Td><Td>{canEdit ? <div className="flex flex-wrap gap-1">{item.matchStatus === 'MATCHED' ? <Button type="button" variant="ghost" size="sm" disabled={pending} icon={<Unlink className="h-4 w-4" />} onClick={() => { setItemAction({ item, mode: 'unmatch' }); setEditingHeader(false); setEditingItemId(null); setReasonAction(null); setFeedback(null); }}>Unmatch</Button> : <><Button type="button" variant="onlight" size="sm" disabled={pending} icon={<Link2 className="h-4 w-4" />} onClick={() => { setItemAction({ item, mode: 'match' }); setEditingHeader(false); setEditingItemId(null); setReasonAction(null); setFeedback(null); }}>Match</Button><Button type="button" variant="ghost" size="sm" disabled={pending} icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditingItemId(item.id); setEditingHeader(false); setItemAction(null); setReasonAction(null); setFeedback(null); }}>Edit unmatched item</Button></>}</div> : null}</Td></tr>)}</tbody></Table></div> : null}</Panel> : null}
    {reconciliation && canEdit && itemAction ? <ReconciliationItemDialog key={`${itemAction.item.id}-${itemAction.mode}`} reconciliation={reconciliation} item={itemAction.item} mode={itemAction.mode} candidates={itemAction.mode === 'match' && candidates.data ? candidates.data : { payments: [], journals: [] }} candidatesLoading={candidates.isLoading} candidatesError={candidates.error} pending={mutateItem.isPending} onClose={() => setItemAction(null)} onSubmit={submitItemAction} /> : null}
    {reconciliation && canEdit && editingHeader ? <ReconciliationHeaderEditor key={reconciliation.id} reconciliation={reconciliation} banks={banksQuery.data ?? []} banksLoading={banksQuery.isLoading} banksError={banksQuery.error} pending={correctHeader.isPending} onCancel={() => setEditingHeader(false)} onSubmit={submitHeader} /> : null}
    {reconciliation && editingItem ? <ReconciliationItemEditor key={editingItem.id} reconciliation={reconciliation} item={editingItem} pending={correctItem.isPending} onCancel={() => setEditingItemId(null)} onSubmit={submitItemCorrection} /> : null}
    {reconciliation && reasonAction && (reasonAction === 'delete' ? canDelete : reconciliation.status === 'REVIEWED') ? <ReconciliationReasonDialog key={reasonAction} kind={reasonAction} pending={reasonMutation.isPending} onCancel={() => setReasonAction(null)} onSubmit={submitReason} /> : null}
  </div>;
}


function ReportFilters({ kind, onKindChange, filters, onApply }: { kind: ReportKind; onKindChange: (kind: ReportKind) => void; filters: { from: string; to: string; currency: string }; onApply: (filters: { from: string; to: string; currency: string }) => void }) {
  const [draft, setDraft] = useState(filters);
  const [error, setError] = useState<string | null>(null);
  const labels: Array<[ReportKind, string]> = [['trial-balance', 'Trial balance'], ['profit-and-loss', 'Profit & loss'], ['receivables', 'Receivables'], ['payables', 'Payables']];
  return <Panel><div className="overflow-x-auto border-b border-steel-200 p-4"><div className="flex min-w-max gap-2" role="group" aria-label="Report type">{labels.map(([value, label]) => <Button key={value} type="button" variant={kind === value ? 'primary' : 'onlight'} size="sm" onClick={() => onKindChange(value)}>{label}</Button>)}</div></div><form onSubmit={(event) => { event.preventDefault(); if (draft.from && draft.to && draft.to < draft.from) { setError('Report start cannot be after report end.'); return; } if (draft.currency && !/^[A-Z]{3}$/i.test(draft.currency.trim())) { setError('Currency must be a three-letter code.'); return; } setError(null); onApply({ ...draft, currency: draft.currency.trim().toUpperCase() }); }} className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">{error ? <p role="alert" className="text-sm text-red-700 sm:col-span-2 lg:col-span-4">{error}</p> : null}<AdminField label="From date"><Input type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></AdminField><AdminField label="To date"><Input type="date" min={draft.from || undefined} value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></AdminField><AdminField label="Currency" help="Optional. Reports only support the company base currency."><Input dir="ltr" maxLength={3} value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value.toUpperCase() })} placeholder="Base currency" /></AdminField><div className="flex items-end"><Button type="submit" variant="secondary" icon={<RefreshCw className="h-4 w-4" />}>Run report</Button></div></form></Panel>;
}

function TrialBalance({ data, meta }: { data: ReportData; meta?: Record<string, unknown> }) {
  const rows = data.rows ?? [];
  const totals = data.totals ?? {};
  return <div className="space-y-4"><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl border border-steel-200 bg-white p-4"><dt className="text-xs text-steel-500">Total debit</dt><dd className="mt-1 font-bold text-navy-800">{amount(totals.debit, data.currency)}</dd></div><div className="rounded-xl border border-steel-200 bg-white p-4"><dt className="text-xs text-steel-500">Total credit</dt><dd className="mt-1 font-bold text-navy-800">{amount(totals.credit, data.currency)}</dd></div><div className="rounded-xl border border-steel-200 bg-white p-4"><dt className="text-xs text-steel-500">Difference</dt><dd className="mt-1 font-bold text-navy-800">{amount(totals.difference, data.currency)}</dd></div><div className="rounded-xl border border-steel-200 bg-white p-4"><dt className="text-xs text-steel-500">Balance status</dt><dd className="mt-1"><StatusPill status={meta?.balanced === true ? 'BALANCED' : 'UNBALANCED'} label={meta?.balanced === true ? 'BALANCED' : 'UNBALANCED'} /></dd></div></dl><Panel><Table><thead><tr><Th>Code</Th><Th>Account</Th><Th>Type</Th><Th>Normal balance</Th><Th>Debit</Th><Th>Credit</Th><Th>Net</Th></tr></thead><tbody>{!rows.length ? <EmptyRow colSpan={7} message="No posted journal movements in this period." /> : rows.map((row, index) => <tr key={row.id ?? index}><Td className="font-mono font-bold text-brand-700">{row.code}</Td><Td><span className="font-semibold text-navy-800">{row.nameEn}</span>{row.nameAr ? <span className="mt-1 block text-xs text-steel-500" dir="rtl">{row.nameAr}</span> : null}</Td><Td>{row.type}</Td><Td>{row.normalBalance}</Td><Td className="whitespace-nowrap">{amount(row.debit, data.currency)}</Td><Td className="whitespace-nowrap">{amount(row.credit, data.currency)}</Td><Td className="whitespace-nowrap font-semibold">{amount(row.net, data.currency)}</Td></tr>)}</tbody></Table></Panel></div>;
}
function ProfitAndLoss({ data }: { data: ReportData }) {
  const rows = data.rows ?? []; const totals = data.totals ?? {};
  return <div className="space-y-4"><dl className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-steel-200 bg-white p-4"><dt className="text-xs text-steel-500">Revenue</dt><dd className="mt-1 font-bold text-navy-800">{amount(totals.revenue, data.currency)}</dd></div><div className="rounded-xl border border-steel-200 bg-white p-4"><dt className="text-xs text-steel-500">Expenses</dt><dd className="mt-1 font-bold text-navy-800">{amount(totals.expenses, data.currency)}</dd></div><div className="rounded-xl border border-brand-200 bg-brand-50 p-4"><dt className="text-xs text-brand-700">Net profit</dt><dd className="mt-1 font-bold text-navy-800">{amount(totals.netProfit, data.currency)}</dd></div></dl><Panel><Table><thead><tr><Th>Code</Th><Th>Account</Th><Th>Type</Th><Th>Debit</Th><Th>Credit</Th><Th>P&L amount</Th></tr></thead><tbody>{!rows.length ? <EmptyRow colSpan={6} message="No revenue or expense movements in this period." /> : rows.map((row, index) => <tr key={row.id ?? index}><Td className="font-mono font-bold text-brand-700">{row.code}</Td><Td><span className="font-semibold text-navy-800">{row.nameEn}</span>{row.nameAr ? <span className="mt-1 block text-xs text-steel-500" dir="rtl">{row.nameAr}</span> : null}</Td><Td>{row.type}</Td><Td className="whitespace-nowrap">{amount(row.debit, data.currency)}</Td><Td className="whitespace-nowrap">{amount(row.credit, data.currency)}</Td><Td className="whitespace-nowrap font-semibold">{amount(row.amount, data.currency)}</Td></tr>)}</tbody></Table></Panel></div>;
}
function AgingReport({ data, kind }: { data: ReportData; kind: 'receivables' | 'payables' }) {
  const items = data.items ?? []; const partners = data.byPartner ?? [];
  return <div className="space-y-4"><dl className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-steel-200 bg-white p-4"><dt className="text-xs text-steel-500">Total outstanding</dt><dd className="mt-1 font-bold text-navy-800">{amount(data.totalOutstanding, data.currency)}</dd></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><dt className="text-xs text-amber-700">Overdue</dt><dd className="mt-1 font-bold text-navy-800">{amount(data.overdue, data.currency)}</dd></div><div className="rounded-xl border border-steel-200 bg-white p-4"><dt className="text-xs text-steel-500">Aging as of</dt><dd className="mt-1 font-bold text-navy-800">{formatDate(data.asOf, 'en')}</dd></div></dl><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{agingBuckets.map((bucket) => <div key={bucket} className="rounded-xl border border-steel-200 bg-white p-4"><dt className="text-xs font-semibold text-steel-500">{bucket.replace(/_/g, '–')}</dt><dd className="mt-1 font-bold text-navy-800">{amount(data.byAging?.[bucket], data.currency)}</dd></div>)}</div><Panel><Table><thead><tr><Th>Document</Th><Th>{kind === 'receivables' ? 'Customer' : 'Vendor'}</Th><Th>Issue / due</Th><Th>Total</Th><Th>Paid</Th><Th>Outstanding</Th><Th>Aging</Th></tr></thead><tbody>{!items.length ? <EmptyRow colSpan={7} message={`No outstanding ${kind} in this period.`} /> : items.map((item) => <tr key={item.id}><Td className="font-mono font-bold text-brand-700">{item.number}</Td><Td><span className="font-semibold text-navy-800">{(item.customer ?? item.vendor)?.nameEn}</span><span className="mt-1 block text-xs text-steel-400">{(item.customer ?? item.vendor)?.code}</span></Td><Td className="whitespace-nowrap text-xs">{formatDate(item.issueDate, 'en')}<span className="mt-1 block text-steel-400">Due {formatDate(item.dueDate, 'en')}</span></Td><Td className="whitespace-nowrap">{amount(item.total, item.currency)}</Td><Td className="whitespace-nowrap">{amount(item.paidAmount, item.currency)}</Td><Td className="whitespace-nowrap font-semibold">{amount(item.outstanding, item.currency)}</Td><Td><StatusPill status={item.agingBucket} label={`${item.agingBucket.replace(/_/g, '–')} · ${item.daysOverdue}d`} /></Td></tr>)}</tbody></Table></Panel>{partners.length ? <Panel title={`${kind === 'receivables' ? 'Customer' : 'Vendor'} summary`}><Table><thead><tr><Th>Partner</Th><Th>Outstanding</Th><Th>Overdue</Th></tr></thead><tbody>{partners.map((partner) => <tr key={partner.id}><Td><span className="font-semibold text-navy-800">{partner.nameEn}</span><span className="mt-1 block text-xs text-steel-400">{partner.code}</span></Td><Td className="whitespace-nowrap font-semibold">{amount(partner.outstanding, data.currency)}</Td><Td className="whitespace-nowrap">{amount(partner.overdue, data.currency)}</Td></tr>)}</tbody></Table></Panel> : null}</div>;
}
function ReportsPanel() {
  const [kind, setKind] = useState<ReportKind>('trial-balance');
  const [filters, setFilters] = useState({ from: '', to: '', currency: '' });
  const query = useQuery({
    queryKey: ['accounting', 'reports', kind, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.from) params.set('from', filters.from); if (filters.to) params.set('to', filters.to); if (filters.currency) params.set('currency', filters.currency);
      return api.get<ReportData>(`/erp/accounting/reports/${kind}?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });
  const title = kind === 'trial-balance' ? 'Trial balance' : kind === 'profit-and-loss' ? 'Profit & loss' : kind === 'receivables' ? 'Receivables aging' : 'Payables aging';
  return <div className="space-y-4"><ReportFilters kind={kind} onKindChange={setKind} filters={filters} onApply={setFilters} /><Panel title={title} actions={query.isFetching ? <Spinner label="Refreshing…" /> : null}>{query.isLoading ? <LoadingState label={`Loading ${title.toLowerCase()}…`} /> : query.isError ? <ErrorState title="Report could not be loaded." error={query.error} onRetry={() => void query.refetch()} /> : query.data ? <div className="p-4">{kind === 'trial-balance' ? <TrialBalance data={query.data.data} meta={query.data.meta} /> : kind === 'profit-and-loss' ? <ProfitAndLoss data={query.data.data} /> : <AgingReport data={query.data.data} kind={kind} />}</div> : null}</Panel></div>;
}

export default function Accounting() {
  const [tab, setTab] = useState<AccountingTab>('reports');
  const tabsId = useId();
  const tabs: Array<[AccountingTab, string]> = [['accounts', 'Accounts'], ['journals', 'Journals'], ['periods', 'Periods'], ['bank-accounts', 'Bank accounts'], ['tax-codes', 'Tax codes'], ['charge-items', 'Charge items'], ['entries', 'Journal entries'], ['reconciliations', 'Reconciliations'], ['reports', 'Reports']];
  return <AdminPage title="Accounting" description="Manage the chart of accounts, fiscal periods, ledger, bank reconciliations and financial reports."><div className="overflow-x-auto"><div id={tabsId} role="tablist" aria-label="Accounting sections" className="flex min-w-max gap-2 rounded-2xl border border-steel-200 bg-white p-2 shadow-soft">{tabs.map(([value, label]) => <Button key={value} id={`${tabsId}-${value}-tab`} type="button" role="tab" aria-selected={tab === value} aria-controls={`${tabsId}-${value}-panel`} variant={tab === value ? 'primary' : 'ghost'} size="sm" onClick={() => setTab(value)}>{label}</Button>)}</div></div><div id={`${tabsId}-${tab}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}-tab`} className="mt-4 focus:outline-none">{tab === 'accounts' ? <AccountsPanel /> : tab === 'journals' ? <JournalsPanel /> : tab === 'periods' ? <PeriodsPanel /> : tab === 'bank-accounts' ? <BankAccountsPanel /> : tab === 'tax-codes' ? <TaxCodesPanel /> : tab === 'charge-items' ? <ChargeItemsPanel /> : tab === 'entries' ? <JournalEntriesPanel /> : tab === 'reconciliations' ? <ReconciliationsPanel /> : <ReportsPanel />}</div></AdminPage>;
}
