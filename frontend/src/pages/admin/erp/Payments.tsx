import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Ban, Check, Eye, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../../../lib/api';
import { AdminField as UiAdminField, AdminPage, EmptyRow, Panel, Table, Td, Th } from '../../../components/admin/ui';
import { Button } from '../../../components/ui/Button';
import { Input, Select, Textarea } from '../../../components/ui/Field';
import { Spinner } from '../../../components/ui/Spinner';
import { StatusPill } from '../../../components/ui/StatusPill';
import { formatDate, formatDateTime } from '../../../lib/utils';

type PaymentDirection = 'RECEIPT' | 'PAYMENT';
type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD' | 'OTHER';
type PaymentStatus = 'DRAFT' | 'POSTED' | 'VOID';
type PartnerType = 'CUSTOMER' | 'VENDOR' | 'BOTH';

interface PartnerOption {
  id: string;
  code: string;
  nameEn: string;
  status: 'ACTIVE' | 'INACTIVE';
  type: PartnerType;
}

interface BankAccountOption {
  id: string;
  code: string;
  name: string;
  currency: string;
  accountId: string;
}

interface AllocationDocument {
  id: string;
  number: string;
  status: 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
  currency: string;
  total: string;
  paidAmount: string;
  balance: string;
}

interface PaymentAllocation {
  id: string;
  amount: string;
  invoice: AllocationDocument | null;
  bill: AllocationDocument | null;
}

interface PostedEntry {
  id: string;
  number: string;
  status: 'DRAFT' | 'POSTED' | 'VOID';
  entryDate: string;
  totalDebit: string;
  totalCredit: string;
  reversals: Array<{ id: string; number: string; status: string; entryDate: string; totalDebit: string; totalCredit: string }>;
  lines: Array<{ id: string; description: string | null; debit: string; credit: string; account: { id: string; code: string; nameEn: string } }>;
}

interface Payment {
  id: string;
  number: string;
  direction: PaymentDirection;
  partnerId: string;
  method: PaymentMethod;
  bankAccountId: string | null;
  paymentDate: string;
  currency: string;
  exchangeRate: string;
  amount: string;
  reference: string | null;
  notes: string | null;
  status: PaymentStatus;
  postedEntryId: string | null;
  postedAt: string | null;
  createdAt: string;
  updatedAt: string;
  partner: { id: string; code: string; nameEn: string; nameAr: string | null };
  bankAccount: BankAccountOption | null;
  allocations: PaymentAllocation[];
  postedEntry: PostedEntry | null;
  reconciliationItems: Array<{ id: string; reconciliationId: string; reconciliation: { status: 'DRAFT' | 'REVIEWED' | 'APPROVED' } }>;
}

interface AllocationForm { key: string; documentId: string; amount: string }
interface PaymentForm {
  direction: PaymentDirection;
  partnerId: string;
  method: PaymentMethod;
  bankAccountId: string;
  paymentDate: string;
  currency: string;
  exchangeRate: string;
  amount: string;
  reference: string;
  notes: string;
  allocations: AllocationForm[];
}
interface PaymentPayload {
  direction: PaymentDirection;
  partnerId: string;
  method: PaymentMethod;
  bankAccountId: string | null;
  paymentDate: string;
  currency?: string;
  exchangeRate: string;
  amount: string;
  reference: string | null;
  notes: string | null;
  allocations: Array<{ invoiceId?: string; billId?: string; amount: string }>;
}
interface ActionForm { entryDate: string; journalId: string; periodId: string; description: string; reason: string }
interface ActionPayload { entryDate?: string; journalId?: string; periodId?: string; description?: string | null; reason?: string }
interface PaginationMeta { total: number; page: number; limit: number; pages: number }

const paymentDirections: PaymentDirection[] = ['RECEIPT', 'PAYMENT'];
const paymentMethods: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER'];
const paymentStatuses: PaymentStatus[] = ['DRAFT', 'POSTED', 'VOID'];
const pageSize = 25;
const plainDecimal = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function nullable(value: string): string | null { const trimmed = value.trim(); return trimmed ? trimmed : null; }
function amount(value: string, currency: string): string { return `${value} ${currency}`; }
function today(): string { return new Date().toISOString().slice(0, 10); }
function emptyAllocation(): AllocationForm { return { key: crypto.randomUUID(), documentId: '', amount: '' }; }
function emptyPaymentForm(baseCurrency = ''): PaymentForm {
  return { direction: 'RECEIPT', partnerId: '', method: 'BANK_TRANSFER', bankAccountId: '', paymentDate: today(), currency: baseCurrency, exchangeRate: '1', amount: '', reference: '', notes: '', allocations: [] };
}
function paymentToForm(payment: Payment): PaymentForm {
  return {
    direction: payment.direction, partnerId: payment.partnerId, method: payment.method,
    bankAccountId: payment.bankAccountId ?? '', paymentDate: payment.paymentDate.slice(0, 10),
    currency: payment.currency, exchangeRate: payment.exchangeRate, amount: payment.amount,
    reference: payment.reference ?? '', notes: payment.notes ?? '',
    allocations: payment.allocations.map((allocation) => ({
      key: crypto.randomUUID(), documentId: allocation.invoice?.id ?? allocation.bill?.id ?? '', amount: allocation.amount,
    })),
  };
}
function messageFor(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const details = error.details ? Object.values(error.details).flat().filter(Boolean) : [];
  return [error.message, ...details].join(' ');
}
function validUuid(value: string): boolean { return uuidPattern.test(value.trim()); }
function validDecimal(value: string, min: number, max: number, scale: number): boolean {
  const trimmed = value.trim();
  if (!plainDecimal.test(trimmed)) return false;
  if ((trimmed.split('.')[1] ?? '').length > scale) return false;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max;
}
function cents(value: string): bigint | null {
  if (!plainDecimal.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
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

async function fetchPartners(type: PartnerType): Promise<PartnerOption[]> {
  const rows: PartnerOption[] = [];
  let page = 1;
  let pages = 1;
  do {
    const params = new URLSearchParams({ type, status: 'ACTIVE', page: String(page), limit: '100' });
    const response = await api.get<PartnerOption[]>(`/erp/partners?${params.toString()}`);
    rows.push(...response.data);
    pages = Number((response.meta as unknown as PaginationMeta | undefined)?.pages ?? 1);
    page += 1;
  } while (page <= pages);
  return rows;
}

function usePartnerOptions() {
  return useQuery({
    queryKey: ['erp', 'partners', 'accounting-payment-options'],
    queryFn: async () => {
      const rows = (await Promise.all([fetchPartners('CUSTOMER'), fetchPartners('VENDOR'), fetchPartners('BOTH')])).flat();
      return [...new Map(rows.map((partner) => [partner.id, partner])).values()].sort((a, b) => a.nameEn.localeCompare(b.nameEn));
    },
    staleTime: 30000,
  });
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
      const banks = await fetchAllPages<BankAccountOption>('/erp/accounting/bank-accounts', new URLSearchParams({ isActive: 'true' }));
      return [...new Map(banks.map((bank) => [bank.id, bank])).values()].sort((a, b) => a.code.localeCompare(b.code));
    },
    staleTime: 30000,
  });
}

function useAllocationDocuments(direction: PaymentDirection, partnerId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['accounting', 'payment-allocation-options', direction, partnerId],
    queryFn: async () => {
      const params = new URLSearchParams(direction === 'RECEIPT' ? { customerId: partnerId } : { vendorId: partnerId });
      const path = direction === 'RECEIPT' ? '/erp/accounting/invoices' : '/erp/accounting/bills';
      const rows = await fetchAllPages<AllocationDocument>(path, params);
      return rows.filter((document) => ['ISSUED', 'PARTIALLY_PAID', 'PAID'].includes(document.status) && (cents(document.balance) ?? 0n) > 0n);
    },
    enabled: enabled && Boolean(partnerId),
    staleTime: 15000,
  });
}

function paymentPayload(form: PaymentForm): PaymentPayload {
  return {
    direction: form.direction, partnerId: form.partnerId, method: form.method,
    bankAccountId: form.method === 'CASH' ? null : form.bankAccountId.trim(),
    paymentDate: form.paymentDate,
    ...(form.currency.trim() ? { currency: form.currency.trim().toUpperCase() } : {}), exchangeRate: '1', amount: form.amount.trim(),
    reference: nullable(form.reference), notes: nullable(form.notes),
    allocations: form.allocations.map((allocation) => form.direction === 'RECEIPT' ? { invoiceId: allocation.documentId, amount: allocation.amount.trim() } : { billId: allocation.documentId, amount: allocation.amount.trim() }),
  };
}

function AdminField({ label, children, className, help }: { label: string; children: ReactNode; className?: string; help?: string }) {
  return <UiAdminField label={label} className={className}>{children}{help ? <span className="mt-1 block text-xs text-steel-500">{help}</span> : null}</UiAdminField>;
}

function BankAccountPicker({ banks, loading, error, value, onChange, disabled }: {
  banks: BankAccountOption[];
  loading: boolean;
  error: unknown;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const normalized = search.trim().toLocaleLowerCase();
  const visible = normalized ? banks.filter((bank) => `${bank.code} ${bank.name} ${bank.currency}`.toLocaleLowerCase().includes(normalized)) : banks;
  return (
    <AdminField label="Bank account" help={disabled ? 'Cash uses the system cash account; no bank account is allowed.' : 'Required for non-cash methods. Select an active bank account by code or name.'}>
      <div className="relative">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-steel-400" aria-hidden="true" />
        <Input dir="ltr" aria-label="Search bank accounts" className="mb-2 ps-8" maxLength={120} disabled={disabled} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search code, name or currency" />
      </div>
      <Select dir="ltr" aria-label="Bank account" disabled={disabled || loading || !!error || !banks.length} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{disabled ? 'Not applicable for cash' : loading ? 'Loading bank accounts…' : error ? 'Bank accounts unavailable' : 'Select an active bank account'}</option>
        {value && !banks.some((bank) => bank.id === value) ? <option value={value}>Unavailable or inactive selection</option> : null}
        {visible.map((bank) => <option key={bank.id} value={bank.id}>{bank.code} · {bank.name} · {bank.currency}</option>)}
      </Select>
      {!disabled && !loading && error ? <span className="mt-1 block text-xs text-red-600">Active bank accounts could not be loaded.</span> : !disabled && !loading && !banks.length ? <span className="mt-1 block text-xs text-steel-500">No active bank accounts are available.</span> : !disabled && normalized && !visible.length ? <span className="mt-1 block text-xs text-steel-500">No bank accounts match this search.</span> : null}
    </AdminField>
  );
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-steel-400">{label}</dt><dd className="mt-1 whitespace-pre-line break-words text-sm text-steel-700">{children || '—'}</dd></div>;
}

function JournalLinkage({ entry, currency }: { entry: PostedEntry; currency: string }) {
  return (
    <section aria-labelledby="payment-journal-heading" className="space-y-3">
      <h3 id="payment-journal-heading" className="text-sm font-bold text-navy-800">Journal linkage</h3>
      <dl className="grid gap-4 rounded-xl border border-steel-200 bg-steel-50/60 p-4 sm:grid-cols-2 lg:grid-cols-4"><DetailItem label="Entry"><span className="font-mono font-bold text-brand-700">{entry.number}</span></DetailItem><DetailItem label="Status"><StatusPill status={entry.status} label={entry.status} /></DetailItem><DetailItem label="Entry date">{formatDate(entry.entryDate, 'en')}</DetailItem><DetailItem label="Debit / credit">{`${entry.totalDebit} / ${entry.totalCredit} ${currency}`}</DetailItem><DetailItem label="Entry ID"><span className="font-mono text-xs">{entry.id}</span></DetailItem></dl>
      {entry.reversals.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><p className="font-bold">Reversal entries</p>{entry.reversals.map((reversal) => <p key={reversal.id} className="mt-1">{reversal.number} · {reversal.status} · {formatDate(reversal.entryDate, 'en')}</p>)}</div> : null}
      <Table><thead><tr><Th>Account</Th><Th>Description</Th><Th>Debit</Th><Th>Credit</Th></tr></thead><tbody>{entry.lines.map((line) => <tr key={line.id}><Td><span className="font-mono text-xs text-steel-400">{line.account.code}</span><span className="block font-semibold text-navy-800">{line.account.nameEn}</span></Td><Td>{line.description || '—'}</Td><Td className="whitespace-nowrap">{amount(line.debit, currency)}</Td><Td className="whitespace-nowrap">{amount(line.credit, currency)}</Td></tr>)}</tbody></Table>
    </section>
  );
}

function PaymentEditor({ partners, partnersLoading, banks, banksLoading, banksError, baseCurrency, initial, pending, onCancel, onSubmit }: {
  partners: PartnerOption[]; partnersLoading: boolean; banks: BankAccountOption[]; banksLoading: boolean; banksError: unknown; baseCurrency: string; initial?: Payment; pending: boolean; onCancel: () => void; onSubmit: (body: PaymentPayload) => void;
}) {
  const [form, setForm] = useState<PaymentForm>(() => initial ? paymentToForm(initial) : emptyPaymentForm(baseCurrency));
  const [formError, setFormError] = useState<string | null>(null);
  const documentsQuery = useAllocationDocuments(form.direction, form.partnerId, true);
  const documents = documentsQuery.data ?? [];
  const eligiblePartners = partners.filter((partner) => form.direction === 'RECEIPT' ? ['CUSTOMER', 'BOTH'].includes(partner.type) : ['VENDOR', 'BOTH'].includes(partner.type));
  const paymentCents = cents(form.amount);
  const allocatedCents = form.allocations.reduce((sum, allocation) => sum + (cents(allocation.amount) ?? 0n), 0n);
  const updateAllocation = (index: number, patch: Partial<AllocationForm>) => setForm((current) => ({ ...current, allocations: current.allocations.map((allocation, position) => position === index ? { ...allocation, ...patch } : allocation) }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.partnerId) { setFormError('Select a payment partner.'); return; }
    if (!form.paymentDate) { setFormError('Payment date is required.'); return; }
    if (!validDecimal(form.amount, 0.01, 9999999999999999.99, 2)) { setFormError('Amount must be a positive plain decimal with at most 2 decimal places.'); return; }
    const currency = form.currency.trim().toUpperCase();
    if (currency && !/^[A-Z]{3}$/.test(currency)) { setFormError('Currency must be a three-letter code.'); return; }
    if (currency && baseCurrency && currency !== baseCurrency.toUpperCase()) { setFormError(`This company only supports its base currency (${baseCurrency.toUpperCase()}).`); return; }
    if (form.method !== 'CASH' && !banks.some((bank) => bank.id === form.bankAccountId)) { setFormError('Select an active bank account for non-cash methods.'); return; }
    if (form.allocations.length > 200) { setFormError('A payment can have at most 200 allocations.'); return; }
    const targets = new Set<string>();
    for (const [index, allocation] of form.allocations.entries()) {
      const document = documents.find((item) => item.id === allocation.documentId);
      if (!document) { setFormError(`Select a valid posted document for allocation ${index + 1}.`); return; }
      if (targets.has(document.id)) { setFormError('A document can only be allocated once per payment.'); return; }
      targets.add(document.id);
      if (!validDecimal(allocation.amount, 0.01, 9999999999999999.99, 2)) { setFormError(`Allocation ${index + 1} must be a positive decimal with at most 2 decimal places.`); return; }
      const documentCurrency = currency || baseCurrency || document.currency;
      if (document.currency.toUpperCase() !== documentCurrency.toUpperCase()) { setFormError(`Allocation ${index + 1} currency must match the payment currency.`); return; }
      if ((cents(allocation.amount) ?? 0n) > (cents(document?.balance ?? '0') ?? 0n)) { setFormError(`Allocation ${index + 1} exceeds the current balance of ${document.number}.`); return; }
    }
    if (allocatedCents > (paymentCents ?? 0n)) { setFormError('Payment allocations cannot exceed the payment amount.'); return; }
    setFormError(null); onSubmit(paymentPayload(form));
  };

  return (
    <form onSubmit={submit}>
      {formError ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{formError}</p> : null}
      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <AdminField label="Direction *"><Select value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value as PaymentDirection, partnerId: '', allocations: [] })}>{paymentDirections.map((direction) => <option key={direction} value={direction}>{direction === 'RECEIPT' ? 'RECEIPT — customer receipt' : 'PAYMENT — vendor payment'}</option>)}</Select></AdminField>
        <AdminField label="Partner *" className="sm:col-span-2"><Select required disabled={partnersLoading || !eligiblePartners.length} value={form.partnerId} onChange={(event) => setForm({ ...form, partnerId: event.target.value, allocations: [] })}><option value="">{partnersLoading ? 'Loading partners…' : form.direction === 'RECEIPT' ? 'Select a customer' : 'Select a vendor'}</option>{eligiblePartners.map((partner) => <option key={partner.id} value={partner.id}>{partner.nameEn} ({partner.code}) · {partner.type}</option>)}</Select>{!partnersLoading && !eligiblePartners.length ? <span className="mt-1 block text-xs text-steel-500">No active partner is available for this direction.</span> : null}</AdminField>
        <AdminField label="Method *"><Select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value as PaymentMethod, bankAccountId: event.target.value === 'CASH' ? '' : form.bankAccountId })}>{paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}</Select></AdminField>
        <BankAccountPicker banks={banks} loading={banksLoading} error={banksError} disabled={form.method === 'CASH'} value={form.bankAccountId} onChange={(value) => setForm({ ...form, bankAccountId: value })} />
        <AdminField label="Payment date *"><Input required type="date" value={form.paymentDate} onChange={(event) => setForm({ ...form, paymentDate: event.target.value })} /></AdminField>
        <AdminField label="Amount *"><Input required dir="ltr" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0.00" /></AdminField>
        <AdminField label="Currency" help={`Leave blank for company base currency${baseCurrency ? ` (${baseCurrency})` : ''}.`}><Input dir="ltr" maxLength={3} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} placeholder={baseCurrency || 'Base currency'} /></AdminField>
        <AdminField label="Exchange rate" help="Only a rate of 1 is supported."><Input dir="ltr" readOnly value="1" /></AdminField>
        <AdminField label="Reference"><Input maxLength={120} value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} placeholder="Bank or receipt reference" /></AdminField>
        <AdminField label="Notes" className="sm:col-span-2 lg:col-span-4"><Textarea rows={2} maxLength={4000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></AdminField>
      </div>
      <section aria-labelledby="payment-allocations-heading" className="border-t border-steel-200">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><h3 id="payment-allocations-heading" className="text-sm font-bold text-navy-800">Allocate to {form.direction === 'RECEIPT' ? 'invoices' : 'bills'}</h3><p className="text-xs text-steel-500">Optional, up to 200. Documents must be posted, belong to this partner and match the payment currency.</p></div><Button type="button" variant="onlight" size="sm" disabled={pending || !form.partnerId || form.allocations.length >= 200} icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ ...form, allocations: [...form.allocations, emptyAllocation()] })}>Add allocation</Button></div>
        {documentsQuery.isError ? <p role="alert" className="px-5 pb-4 text-sm text-red-700">Allocation documents could not be loaded. {messageFor(documentsQuery.error, 'Please retry.')} <button type="button" className="font-bold underline" onClick={() => void documentsQuery.refetch()}>Retry</button></p> : null}
        {!form.partnerId ? <p className="px-5 pb-5 text-sm text-steel-500">Select a partner to load eligible documents.</p> : documentsQuery.isLoading ? <div className="px-5 pb-5"><Spinner label="Loading allocation documents…" /></div> : !form.allocations.length ? <p className="px-5 pb-5 text-sm text-steel-500">No allocations added. The full amount will post to the partner control account.</p> : <Table><thead><tr><Th>Document</Th><Th>Current balance</Th><Th>Allocation amount</Th><Th><span className="sr-only">Remove</span></Th></tr></thead><tbody>{form.allocations.map((allocation, index) => {
          const document = documents.find((item) => item.id === allocation.documentId);
          return <tr key={allocation.key}><Td className="min-w-[18rem]"><Select aria-label={`Allocation ${index + 1} document`} value={allocation.documentId} onChange={(event) => updateAllocation(index, { documentId: event.target.value })}><option value="">{documents.length ? 'Select a document' : 'No eligible documents found'}</option>{documents.map((item) => <option key={item.id} value={item.id}>{item.number} · {item.status} · balance {item.balance} {item.currency}</option>)}</Select>{document ? <span className="mt-1 block text-xs text-steel-500">Total {amount(document.total, document.currency)} · paid {amount(document.paidAmount, document.currency)}</span> : null}</Td><Td className="whitespace-nowrap">{document ? amount(document.balance, document.currency) : '—'}</Td><Td><Input dir="ltr" inputMode="decimal" aria-label={`Allocation ${index + 1} amount`} value={allocation.amount} onChange={(event) => updateAllocation(index, { amount: event.target.value })} placeholder="0.00" /></Td><Td><Button type="button" variant="ghost" size="sm" aria-label={`Remove allocation ${index + 1}`} icon={<Trash2 className="h-4 w-4" />} onClick={() => setForm({ ...form, allocations: form.allocations.filter((_, position) => position !== index) })}>Remove</Button></Td></tr>;
        })}</tbody></Table>}
        <dl className="grid gap-3 border-t border-steel-200 bg-steel-50/60 px-5 py-4 text-sm sm:grid-cols-3"><div><dt className="text-xs text-steel-500">Payment amount</dt><dd className="mt-1 font-semibold">{form.amount ? amount(form.amount, form.currency || baseCurrency || 'base') : '—'}</dd></div><div><dt className="text-xs text-steel-500">Allocated</dt><dd className="mt-1 font-semibold">{amount(fromCents(allocatedCents), form.currency || baseCurrency || 'base')}</dd></div><div><dt className="text-xs text-steel-500">Unallocated</dt><dd className="mt-1 font-semibold">{paymentCents === null ? '—' : amount(fromCents(paymentCents - allocatedCents), form.currency || baseCurrency || 'base')}</dd></div></dl>
      </section>
      <div className="flex justify-end gap-2 border-t border-steel-200 px-5 py-4"><Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={pending || partnersLoading || !eligiblePartners.length}>{pending ? 'Saving…' : initial ? 'Save changes' : form.direction === 'RECEIPT' ? 'Create receipt' : 'Create payment'}</Button></div>
    </form>
  );
}

function PaymentActionDialog({ payment, kind, pending, onClose, onSubmit }: {
  payment: Payment; kind: 'post' | 'void'; pending: boolean; onClose: () => void; onSubmit: (body: ActionPayload, headers: HeadersInit) => void;
}) {
  const [form, setForm] = useState<ActionForm>({ entryDate: kind === 'post' ? payment.paymentDate.slice(0, 10) : '', journalId: '', periodId: '', description: '', reason: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const operation = useOperationKey();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (kind === 'void' && !form.reason.trim()) { setFormError('A void reason is required.'); return; }
    for (const field of [form.journalId, form.periodId]) if (field.trim() && !validUuid(field)) { setFormError('Journal and period IDs must be valid UUIDs.'); return; }
    const body: ActionPayload = kind === 'post'
      ? { ...(form.entryDate ? { entryDate: form.entryDate } : {}), ...(form.journalId.trim() ? { journalId: form.journalId.trim() } : {}), ...(form.periodId.trim() ? { periodId: form.periodId.trim() } : {}), description: nullable(form.description) }
      : { ...(form.entryDate ? { entryDate: form.entryDate } : {}), reason: form.reason.trim() };
    setFormError(null); onSubmit(body, { 'Idempotency-Key': operation.keyFor(body) });
  };
  return (
    <Panel title={`${kind === 'post' ? 'Post' : 'Void'} ${payment.number}`} actions={<Button type="button" variant="ghost" size="sm" disabled={pending} icon={<X className="h-4 w-4" />} onClick={onClose}>Cancel</Button>}>
      <form onSubmit={submit}>
        {formError ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{formError}</p> : null}
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <AdminField label={kind === 'post' ? 'Entry date' : 'Reversal entry date'} help={kind === 'post' ? 'Leave blank to use the payment date.' : 'Leave blank to use today.'}><Input type="date" value={form.entryDate} onChange={(event) => setForm({ ...form, entryDate: event.target.value })} /></AdminField>
          {kind === 'post' ? <><AdminField label={`${payment.method === 'CASH' ? 'Cash' : 'Bank'} journal ID`} help="Leave blank to select the active system journal."><Input dir="ltr" maxLength={36} value={form.journalId} onChange={(event) => setForm({ ...form, journalId: event.target.value })} placeholder="Optional UUID" /></AdminField><AdminField label="Fiscal period ID" help="Leave blank to find the open period covering the entry date."><Input dir="ltr" maxLength={36} value={form.periodId} onChange={(event) => setForm({ ...form, periodId: event.target.value })} placeholder="Optional UUID" /></AdminField><AdminField label="Entry description" className="sm:col-span-2 lg:col-span-3"><Input maxLength={500} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder={`${payment.direction === 'RECEIPT' ? 'Receipt' : 'Payment'} ${payment.number}`} /></AdminField></> : <AdminField label="Void reason *" className="sm:col-span-2"><Textarea required rows={3} maxLength={500} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Explain why this payment is being voided" /></AdminField>}
          {kind === 'void' && payment.reconciliationItems.length ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 sm:col-span-3">This payment is matched to a bank reconciliation. Unmatch the statement item before voiding it.</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-steel-200 px-5 py-4"><p className="text-xs text-steel-500">A stable Idempotency-Key protects this operation from duplicate submissions.</p><Button type="submit" variant={kind === 'void' ? 'secondary' : 'primary'} disabled={pending}>{pending ? 'Submitting…' : kind === 'post' ? 'Post payment' : 'Void payment'}</Button></div>
      </form>
    </Panel>
  );
}

export default function Payments() {
  const queryClient = useQueryClient();
  const createOperation = useOperationKey();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState<PaymentDirection | ''>('');
  const [partnerFilter, setPartnerFilter] = useState('');
  const [bankFilter, setBankFilter] = useState('');
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [action, setAction] = useState<'post' | 'void' | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const partnersQuery = usePartnerOptions();
  const banksQuery = useBankAccountOptions();

  const paymentsQuery = useQuery({
    queryKey: ['accounting', 'payments', 'list', search, direction, partnerFilter, bankFilter, status, method, from, to, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search) params.set('search', search);
      if (direction) params.set('direction', direction);
      if (partnerFilter) params.set('partnerId', partnerFilter);
      if (bankFilter) params.set('bankAccountId', bankFilter);
      if (status) params.set('status', status);
      if (method) params.set('method', method);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const response = await api.get<Payment[]>(`/erp/accounting/payments?${params.toString()}`);
      return { rows: response.data, meta: response.meta as unknown as PaginationMeta };
    },
    placeholderData: keepPreviousData,
  });
  const paymentQuery = useQuery({ queryKey: ['accounting', 'payments', 'detail', selectedId], queryFn: async () => (await api.get<Payment>(`/erp/accounting/payments/${selectedId}`)).data, enabled: selectedId !== null });

  const createPayment = useMutation({
    mutationFn: (body: PaymentPayload) => api.post<Payment>('/erp/accounting/payments', body, { 'Idempotency-Key': createOperation.keyFor(body) }),
    onSuccess: async (response) => {
      createOperation.reset(); setFeedback({ kind: 'success', text: `${response.data.direction === 'RECEIPT' ? 'Receipt' : 'Payment'} ${response.data.number} created as DRAFT.` }); setShowCreate(false); setSelectedId(response.data.id); setAction(null);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['accounting', 'payments'] }), queryClient.invalidateQueries({ queryKey: ['accounting', 'bank-account-options'] })]);
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not create the payment.') }),
  });
  const updatePayment = useMutation({
    mutationFn: ({ id, body }: { id: string; body: PaymentPayload }) => api.patch<Payment>(`/erp/accounting/payments/${id}`, body, { 'Idempotency-Key': createOperation.keyFor(body) }),
    onSuccess: async (response) => {
      createOperation.reset(); setEditingId(null); setFeedback({ kind: 'success', text: `Draft ${response.data.direction === 'RECEIPT' ? 'receipt' : 'payment'} ${response.data.number} updated.` });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['accounting', 'payments'] }), queryClient.invalidateQueries({ queryKey: ['accounting', 'payment-allocation-options'] })]);
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not update the draft payment.') }),
  });
  const deletePayment = useMutation({
    mutationFn: (id: string) => api.delete<{ id: string; number: string; deleted: boolean }>(`/erp/accounting/payments/${id}`, { 'Idempotency-Key': `delete-${id}` }),
    onSuccess: async (response) => {
      setSelectedId(null); setEditingId(null); setFeedback({ kind: 'success', text: `Draft payment ${response.data.number} deleted.` });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['accounting', 'payments'] }), queryClient.invalidateQueries({ queryKey: ['accounting', 'payment-allocation-options'] })]);
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not delete the draft payment.') }),
  });
  const mutatePayment = useMutation({
    mutationFn: ({ id, kind, body, headers }: { id: string; kind: 'post' | 'void'; body: ActionPayload; headers: HeadersInit }) => api.post<Payment>(`/erp/accounting/payments/${id}/${kind}`, body, headers),
    onSuccess: async (response, variables) => {
      setFeedback({ kind: 'success', text: `${response.data.direction === 'RECEIPT' ? 'Receipt' : 'Payment'} ${response.data.number} ${variables.kind === 'post' ? 'posted' : 'voided'}.` }); setAction(null);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['accounting', 'payments'] }), queryClient.invalidateQueries({ queryKey: ['accounting', 'invoices'] }), queryClient.invalidateQueries({ queryKey: ['accounting', 'bills'] }), queryClient.invalidateQueries({ queryKey: ['accounting', 'reconciliations'] }), queryClient.invalidateQueries({ queryKey: ['accounting', 'reports'] }), queryClient.invalidateQueries({ queryKey: ['accounting', 'journal-entries'] }), queryClient.invalidateQueries({ queryKey: ['accounting', 'payment-allocation-options'] }), queryClient.invalidateQueries({ queryKey: ['accounting', 'bank-account-options'] })]);
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not update the payment.') }),
  });

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    if (from && to && to < from) { setFeedback({ kind: 'error', text: 'End date cannot be earlier than start date.' }); return; }
    setSearch(searchInput.trim()); setPage(1);
  };
  const clearFilters = () => { setSearchInput(''); setSearch(''); setDirection(''); setPartnerFilter(''); setBankFilter(''); setStatus(''); setMethod(''); setFrom(''); setTo(''); setPage(1); };
  const openPayment = (id: string) => { setSelectedId(id); setEditingId(null); setAction(null); setFeedback(null); };
  const closePayment = () => { setSelectedId(null); setEditingId(null); setAction(null); };
  const pending = createPayment.isPending || updatePayment.isPending || deletePayment.isPending || mutatePayment.isPending;
  const meta = paymentsQuery.data?.meta;
  const payment = paymentQuery.data;
  const baseCurrency = paymentsQuery.data?.rows[0]?.currency ?? '';

  return (
    <AdminPage title="Payments & receipts" description="Record customer receipts and vendor payments, allocate settlements and post cash or bank movements." actions={<Button variant="onlight" disabled={pending} icon={<Plus className="h-4 w-4" />} onClick={() => { setShowCreate((value) => !value); setEditingId(null); createOperation.reset(); setFeedback(null); }}>{showCreate ? 'Close form' : 'New payment'}</Button>}>
      {feedback ? <div role={feedback.kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${feedback.kind === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-brand-200 bg-brand-50 text-brand-800'}`}>{feedback.text}</div> : null}
      {selectedId && editingId === selectedId && payment?.status === 'DRAFT' ? <Panel title={`Edit draft ${payment.number}`} actions={<Button type="button" variant="ghost" size="sm" disabled={updatePayment.isPending} icon={<X className="h-4 w-4" />} onClick={() => setEditingId(null)}>Close</Button>}>{partnersQuery.isError ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">Partners could not be loaded. {messageFor(partnersQuery.error, 'Please retry.')}</p> : null}<PaymentEditor key={payment.id} initial={payment} partners={partnersQuery.data ?? []} partnersLoading={partnersQuery.isLoading} banks={banksQuery.data ?? []} banksLoading={banksQuery.isLoading} banksError={banksQuery.error} baseCurrency={baseCurrency} pending={updatePayment.isPending} onCancel={() => setEditingId(null)} onSubmit={(body) => updatePayment.mutate({ id: payment.id, body })} /></Panel> : null}
      {showCreate ? <Panel title="Create payment or receipt">{partnersQuery.isError ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">Partners could not be loaded. {messageFor(partnersQuery.error, 'Please retry.')} <button type="button" className="font-bold underline" onClick={() => void partnersQuery.refetch()}>Retry</button></p> : null}<PaymentEditor key={baseCurrency || 'base'} partners={partnersQuery.data ?? []} partnersLoading={partnersQuery.isLoading} banks={banksQuery.data ?? []} banksLoading={banksQuery.isLoading} banksError={banksQuery.error} baseCurrency={baseCurrency} pending={createPayment.isPending} onCancel={() => { setShowCreate(false); createOperation.reset(); }} onSubmit={(body) => createPayment.mutate(body)} /></Panel> : null}

      <Panel>
        <form role="search" onSubmit={submitSearch} className="grid gap-3 border-b border-steel-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminField label="Search payments" className="lg:col-span-2"><div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-400" aria-hidden="true" /><Input dir="ltr" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="ps-9" placeholder="Number, reference or partner" /></div></AdminField>
          <AdminField label="Direction"><Select value={direction} onChange={(event) => { setDirection(event.target.value as PaymentDirection | ''); setPage(1); }}><option value="">All directions</option>{paymentDirections.map((item) => <option key={item} value={item}>{item}</option>)}</Select></AdminField>
          <AdminField label="Status"><Select value={status} onChange={(event) => { setStatus(event.target.value as PaymentStatus | ''); setPage(1); }}><option value="">All statuses</option>{paymentStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</Select></AdminField>
          <AdminField label="Partner"><Select value={partnerFilter} disabled={partnersQuery.isLoading} onChange={(event) => { setPartnerFilter(event.target.value); setPage(1); }}><option value="">{partnersQuery.isLoading ? 'Loading…' : 'All partners'}</option>{(partnersQuery.data ?? []).map((partner) => <option key={partner.id} value={partner.id}>{partner.nameEn}</option>)}</Select></AdminField>
          <AdminField label="Bank account"><Select value={bankFilter} disabled={banksQuery.isLoading} onChange={(event) => { setBankFilter(event.target.value); setPage(1); }}><option value="">{banksQuery.isLoading ? 'Loading…' : 'All bank accounts'}</option>{(banksQuery.data ?? []).map((bank) => <option key={bank.id} value={bank.id}>{bank.code} · {bank.name}</option>)}</Select></AdminField>
          <AdminField label="Method"><Select value={method} onChange={(event) => { setMethod(event.target.value as PaymentMethod | ''); setPage(1); }}><option value="">All methods</option>{paymentMethods.map((item) => <option key={item} value={item}>{item}</option>)}</Select></AdminField>
          <AdminField label="Payment date from"><Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></AdminField>
          <AdminField label="Payment date to"><Input type="date" min={from || undefined} value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></AdminField>
          <div className="flex items-end gap-2"><Button type="submit" variant="secondary">Search</Button><Button type="button" variant="ghost" onClick={clearFilters}>Clear</Button></div>
        </form>
        <div className="flex items-center justify-between gap-3 border-b border-steel-100 px-4 py-2 text-xs text-steel-500"><span aria-live="polite">{meta ? `${meta.total} payment${meta.total === 1 ? '' : 's'}` : 'Payments'}</span>{paymentsQuery.isFetching && !paymentsQuery.isLoading ? <Spinner label="Refreshing…" /> : null}</div>
        {paymentsQuery.isLoading ? <div className="p-8"><Spinner label="Loading payments…" /></div> : paymentsQuery.isError ? <div className="space-y-3 p-6" role="alert"><p className="text-sm font-semibold text-red-700">Payments could not be loaded.</p><p className="text-sm text-steel-500">{messageFor(paymentsQuery.error, 'Please try again.')}</p><Button variant="onlight" size="sm" onClick={() => void paymentsQuery.refetch()}>Retry</Button></div> : <Table><thead><tr><Th>Payment</Th><Th>Direction</Th><Th>Partner</Th><Th>Method / bank</Th><Th>Date</Th><Th>Amount</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead><tbody>{!paymentsQuery.data?.rows.length ? <EmptyRow colSpan={8} message="No payments match these filters." /> : paymentsQuery.data.rows.map((item) => <tr key={item.id} className="hover:bg-steel-50/60"><Td><button type="button" onClick={() => openPayment(item.id)} className="font-mono text-[0.8rem] font-bold text-brand-700 hover:underline">{item.number}</button><span className="mt-1 block text-xs text-steel-400">{item.reference || 'No reference'}</span></Td><Td><span className={`inline-flex items-center gap-1.5 font-semibold ${item.direction === 'RECEIPT' ? 'text-emerald-700' : 'text-ocean-700'}`}>{item.direction === 'RECEIPT' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}{item.direction}</span></Td><Td><span className="font-semibold text-navy-800">{item.partner.nameEn}</span><span className="mt-1 block text-xs text-steel-400">{item.partner.code}</span></Td><Td>{item.method}<span className="mt-1 block text-xs text-steel-400">{item.bankAccount ? `${item.bankAccount.code} · ${item.bankAccount.name}` : 'Cash account'}</span></Td><Td className="whitespace-nowrap">{formatDate(item.paymentDate, 'en')}</Td><Td className="whitespace-nowrap font-semibold text-navy-800">{amount(item.amount, item.currency)}</Td><Td><StatusPill status={item.status} label={item.status} /></Td><Td><div className="flex flex-wrap gap-1"><Button type="button" variant="onlight" size="sm" icon={<Eye className="h-4 w-4" />} aria-label={`View payment ${item.number}`} onClick={() => openPayment(item.id)}>View</Button>{item.status === 'DRAFT' ? <><Button type="button" variant="ghost" size="sm" icon={<Pencil className="h-4 w-4" />} aria-label={`Edit payment ${item.number}`} onClick={() => { openPayment(item.id); setEditingId(item.id); }}>Edit</Button><Button type="button" variant="ghost" size="sm" disabled={deletePayment.isPending} icon={<Trash2 className="h-4 w-4" />} aria-label={`Delete payment ${item.number}`} onClick={() => { if (window.confirm(`Delete draft payment ${item.number}? This cannot be undone.`)) deletePayment.mutate(item.id); }}>Delete</Button></> : null}</div></Td></tr>)}</tbody></Table>}
      </Panel>

      {meta ? <nav aria-label="Payment pagination" className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs font-semibold text-steel-500">Page {meta.page} of {meta.pages}</span><div className="flex gap-2"><Button variant="onlight" size="sm" disabled={page <= 1 || paymentsQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button><Button variant="onlight" size="sm" disabled={page >= meta.pages || paymentsQuery.isFetching} onClick={() => setPage((current) => current + 1)}>Next</Button></div></nav> : null}

      {selectedId ? <Panel title={payment ? `${payment.number} · ${payment.partner.nameEn}` : 'Payment detail'} actions={<Button variant="ghost" size="sm" disabled={mutatePayment.isPending} icon={<X className="h-4 w-4" />} onClick={closePayment}>Close</Button>}>
        {paymentQuery.isLoading ? <div className="p-8"><Spinner label="Loading payment detail…" /></div> : paymentQuery.isError ? <div className="space-y-3 p-6" role="alert"><p className="text-sm font-semibold text-red-700">Payment detail could not be loaded.</p><p className="text-sm text-steel-500">{messageFor(paymentQuery.error, 'Please try again.')}</p><Button variant="onlight" size="sm" onClick={() => void paymentQuery.refetch()}>Retry</Button></div> : payment ? <div className="space-y-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><StatusPill status={payment.status} label={payment.status} /><StatusPill status={payment.direction} label={payment.direction} /><span className="text-xs text-steel-400">Updated {formatDateTime(payment.updatedAt, 'en')}</span></div><div className="flex flex-wrap gap-2">{payment.status === 'DRAFT' ? <><Button variant="onlight" size="sm" disabled={pending} icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditingId(payment.id); setAction(null); setFeedback(null); }}>Edit draft</Button><Button variant="ghost" size="sm" disabled={pending} icon={<Trash2 className="h-4 w-4" />} onClick={() => { if (window.confirm(`Delete draft payment ${payment.number}? This cannot be undone.`)) deletePayment.mutate(payment.id); }}>Delete draft</Button><Button size="sm" disabled={pending} icon={<Check className="h-4 w-4" />} onClick={() => { setAction('post'); setFeedback(null); }}>Post</Button></> : null}{payment.status === 'POSTED' ? <Button variant="ghost" size="sm" disabled={mutatePayment.isPending} icon={<Ban className="h-4 w-4" />} onClick={() => { setAction('void'); setFeedback(null); }}>Void</Button> : null}</div></div>
          <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"><DetailItem label="Direction">{payment.direction}</DetailItem><DetailItem label="Partner">{payment.partner.nameEn}</DetailItem><DetailItem label="Method">{payment.method}</DetailItem><DetailItem label="Bank account">{payment.bankAccount ? `${payment.bankAccount.code} · ${payment.bankAccount.name}` : 'Cash system account'}</DetailItem><DetailItem label="Payment date">{formatDate(payment.paymentDate, 'en')}</DetailItem><DetailItem label="Amount">{amount(payment.amount, payment.currency)}</DetailItem><DetailItem label="Currency / rate">{`${payment.currency} / ${payment.exchangeRate}`}</DetailItem><DetailItem label="Reference">{payment.reference}</DetailItem><DetailItem label="Posted">{formatDateTime(payment.postedAt, 'en')}</DetailItem><DetailItem label="Bank account ID">{payment.bankAccountId}</DetailItem></dl>
          <section aria-labelledby="payment-allocations-detail-heading"><h3 id="payment-allocations-detail-heading" className="mb-3 text-sm font-bold text-navy-800">Allocations</h3>{!payment.allocations.length ? <p className="rounded-xl border border-dashed border-steel-200 p-5 text-sm text-steel-500">No document allocations.</p> : <Table><thead><tr><Th>Document</Th><Th>Status</Th><Th>Total</Th><Th>Paid</Th><Th>Balance</Th><Th>Allocated</Th></tr></thead><tbody>{payment.allocations.map((allocation) => {
            const document = allocation.invoice ?? allocation.bill;
            return <tr key={allocation.id}><Td><span className="font-mono font-bold text-brand-700">{document?.number ?? '—'}</span><span className="mt-1 block text-xs text-steel-400">{allocation.invoice ? 'Invoice' : 'Bill'} · {document?.id}</span></Td><Td>{document ? <StatusPill status={document.status} label={document.status} /> : '—'}</Td><Td className="whitespace-nowrap">{document ? amount(document.total, document.currency) : '—'}</Td><Td className="whitespace-nowrap">{document ? amount(document.paidAmount, document.currency) : '—'}</Td><Td className="whitespace-nowrap">{document ? amount(document.balance, document.currency) : '—'}</Td><Td className="whitespace-nowrap font-semibold">{amount(allocation.amount, payment.currency)}</Td></tr>;
          })}</tbody></Table>}</section>
          {payment.postedEntry ? <JournalLinkage entry={payment.postedEntry} currency={payment.currency} /> : <p className="rounded-xl border border-dashed border-steel-200 p-5 text-sm text-steel-500">No posted journal entry. Post this {payment.direction === 'RECEIPT' ? 'receipt' : 'payment'} to create the ledger entry.</p>}
          {payment.reconciliationItems.length ? <section className="rounded-xl border border-ocean-200 bg-ocean-50/50 p-4"><h3 className="text-sm font-bold text-navy-800">Bank reconciliation matches</h3>{payment.reconciliationItems.map((item) => <p key={item.id} className="mt-1 text-sm text-steel-600">Item {item.id} · Reconciliation {item.reconciliationId} · <StatusPill status={item.reconciliation.status} label={item.reconciliation.status} /></p>)}</section> : null}
          {payment.notes ? <section><h3 className="mb-2 text-sm font-bold text-navy-800">Notes</h3><p className="whitespace-pre-line text-sm text-steel-600">{payment.notes}</p></section> : null}
        </div> : null}
      </Panel> : null}

      {selectedId && payment && action ? <PaymentActionDialog key={`${payment.id}-${action}`} payment={payment} kind={action} pending={mutatePayment.isPending} onClose={() => setAction(null)} onSubmit={(body, headers) => mutatePayment.mutate({ id: payment.id, kind: action, body, headers })} /> : null}
    </AdminPage>
  );
}
