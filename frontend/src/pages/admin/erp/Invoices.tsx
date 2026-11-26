import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, Eye, FileText, Pencil, Plus, Search, Send, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../../../lib/api';
import { AdminField as UiAdminField, AdminPage, EmptyRow, Panel, Table, Td, Th } from '../../../components/admin/ui';
import { Button } from '../../../components/ui/Button';
import { Input, Select, Textarea } from '../../../components/ui/Field';
import { Spinner } from '../../../components/ui/Spinner';
import { StatusPill } from '../../../components/ui/StatusPill';
import { formatDate, formatDateTime } from '../../../lib/utils';

type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
type PartnerType = 'CUSTOMER' | 'BOTH';

interface PartnerOption {
  id: string;
  code: string;
  nameEn: string;
  currency: string;
  status: 'ACTIVE' | 'INACTIVE';
  type: 'CUSTOMER' | 'VENDOR' | 'BOTH';
}

interface PartnerSummary {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string | null;
  email: string | null;
  phone: string | null;
  currency: string;
  paymentTermDays: number;
}

interface ChargeItemOption {
  id: string; code: string; nameEn: string; type: string; defaultPrice: string | null; currency: string;
  taxCode: { id: string; code: string; nameEn: string; ratePercent: string; isActive: boolean } | null;
}
interface TaxCodeOption {
  id: string; code: string; nameEn: string; ratePercent: string;
  account: { id: string; code: string; nameEn: string; type: 'ASSET' | 'LIABILITY' } | null;
}

interface InvoiceLine {
  id: string;
  position: number;
  chargeItemId: string | null;
  taxCodeId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxPercent: string;
  subtotal: string;
  discount: string;
  taxAmount: string;
  total: string;
}

interface PaymentAllocation {
  id: string;
  amount: string;
  createdAt: string;
  payment: {
    id: string;
    number: string;
    direction: 'RECEIPT' | 'PAYMENT';
    status: 'DRAFT' | 'POSTED' | 'VOID';
    paymentDate: string;
  };
}

interface PostedEntry {
  id: string;
  number: string;
  status: 'DRAFT' | 'POSTED' | 'VOID';
  entryDate: string;
  totalDebit: string;
  totalCredit: string;
  reversals: Array<{ id: string; number: string; status: string; entryDate: string; totalDebit: string; totalCredit: string }>;
  lines: Array<{
    id: string;
    description: string | null;
    debit: string;
    credit: string;
    account: { id: string; code: string; nameEn: string };
  }>;
}

interface InvoiceSummary {
  id: string;
  number: string;
  customerId: string;
  branchId: string | null;
  shipmentId: string | null;
  status: InvoiceStatus;
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  subtotal: string;
  discount: string;
  taxAmount: string;
  total: string;
  paidAmount: string;
  balance: string;
  createdAt: string;
  customer: Pick<PartnerSummary, 'id' | 'code' | 'nameEn'>;
  _count: { lines: number; allocations: number };
}

interface Invoice extends InvoiceSummary {
  exchangeRate: string;
  quoteId: string | null;
  bookingId: string | null;
  notes: string | null;
  terms: string | null;
  postedEntryId: string | null;
  updatedAt: string;
  customer: PartnerSummary;
  branch: { id: string; code: string; nameEn: string } | null;
  quote: { id: string; number: string } | null;
  booking: { id: string; number: string } | null;
  shipment: { id: string; trackingNumber: string } | null;
  lines: InvoiceLine[];
  allocations: PaymentAllocation[];
  postedEntry: PostedEntry | null;
}

interface LineForm {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxPercent: string;
  chargeItemId: string;
  taxCodeId: string;
}

interface InvoiceForm {
  customerId: string;
  branchId: string;
  quoteId: string;
  bookingId: string;
  shipmentId: string;
  currency: string;
  exchangeRate: string;
  issueDate: string;
  dueDate: string;
  notes: string;
  terms: string;
  lines: LineForm[];
}

interface InvoicePayload {
  customerId: string;
  branchId: string | null;
  quoteId: string | null;
  bookingId: string | null;
  shipmentId: string | null;
  currency?: string;
  exchangeRate: string;
  issueDate?: string;
  dueDate?: string | null;
  notes: string | null;
  terms: string | null;
  lines: Array<Omit<LineForm, 'key' | 'chargeItemId' | 'taxCodeId'> & { chargeItemId: string | null; taxCodeId: string | null }>;
}

type ActionKind = 'issue' | 'post' | 'void';
interface ActionForm {
  issueDate: string;
  dueDate: string;
  entryDate: string;
  journalId: string;
  periodId: string;
  description: string;
  reason: string;
}
interface ActionPayload {
  issueDate?: string;
  dueDate?: string | null;
  entryDate?: string;
  journalId?: string;
  periodId?: string;
  description?: string | null;
  reason?: string;
}

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const invoiceStatuses: InvoiceStatus[] = ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'];
const pageSize = 25;
const plainDecimal = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function emptyLine(): LineForm {
  return { key: crypto.randomUUID(), description: '', quantity: '1', unitPrice: '0', discountPercent: '0', taxPercent: '0', chargeItemId: '', taxCodeId: '' };
}

function emptyInvoiceForm(baseCurrency = ''): InvoiceForm {
  return {
    customerId: '', branchId: '', quoteId: '', bookingId: '', shipmentId: '',
    currency: baseCurrency, exchangeRate: '1', issueDate: '', dueDate: '', notes: '', terms: '', lines: [emptyLine()],
  };
}

function invoiceToForm(invoice: Invoice): InvoiceForm {
  return {
    customerId: invoice.customerId, branchId: invoice.branchId ?? '', quoteId: invoice.quoteId ?? '',
    bookingId: invoice.bookingId ?? '', shipmentId: invoice.shipmentId ?? '', currency: invoice.currency,
    exchangeRate: invoice.exchangeRate, issueDate: invoice.issueDate?.slice(0, 10) ?? '',
    dueDate: invoice.dueDate?.slice(0, 10) ?? '', notes: invoice.notes ?? '', terms: invoice.terms ?? '',
    lines: invoice.lines.map((line) => ({
      key: crypto.randomUUID(), description: line.description, quantity: line.quantity, unitPrice: line.unitPrice,
      discountPercent: line.discountPercent, taxPercent: line.taxPercent,
      chargeItemId: line.chargeItemId ?? '', taxCodeId: line.taxCodeId ?? '',
    })),
  };
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function amount(value: string, currency: string): string {
  return `${value} ${currency}`;
}

function messageFor(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const details = error.details ? Object.values(error.details).flat().filter(Boolean) : [];
  return [error.message, ...details].join(' ');
}

function validUuid(value: string): boolean {
  return uuidPattern.test(value.trim());
}

function validDecimal(value: string, min: number, max: number, scale: number): boolean {
  const trimmed = value.trim();
  if (!plainDecimal.test(trimmed)) return false;
  const fraction = trimmed.split('.')[1] ?? '';
  if (fraction.length > scale) return false;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max;
}

function invoicePayload(form: InvoiceForm): InvoicePayload {
  return {
    customerId: form.customerId,
    branchId: nullable(form.branchId),
    quoteId: nullable(form.quoteId),
    bookingId: nullable(form.bookingId),
    shipmentId: nullable(form.shipmentId),
    ...(form.currency.trim() ? { currency: form.currency.trim().toUpperCase() } : {}),
    exchangeRate: '1',
    ...(form.issueDate ? { issueDate: form.issueDate } : {}),
    ...(form.dueDate ? { dueDate: form.dueDate } : {}),
    notes: nullable(form.notes),
    terms: nullable(form.terms),
    lines: form.lines.map((line) => ({
      description: line.description.trim(), quantity: line.quantity.trim(), unitPrice: line.unitPrice.trim(),
      discountPercent: line.discountPercent.trim() || '0', taxPercent: line.taxPercent.trim() || '0',
      chargeItemId: nullable(line.chargeItemId), taxCodeId: nullable(line.taxCodeId),
    })),
  };
}

function validateInvoiceForm(form: InvoiceForm, baseCurrency: string): string | null {
  if (!form.customerId) return 'Select a customer.';
  const currency = form.currency.trim().toUpperCase();
  if (currency && !/^[A-Z]{3}$/.test(currency)) return 'Currency must be a three-letter code.';
  if (currency && baseCurrency && currency !== baseCurrency.toUpperCase()) return `This company only supports its base currency (${baseCurrency.toUpperCase()}).`;
  for (const field of [form.branchId, form.quoteId, form.bookingId, form.shipmentId]) {
    if (field.trim() && !validUuid(field)) return 'Optional branch and source references must be valid UUIDs.';
  }
  if (form.issueDate && form.dueDate && form.dueDate < form.issueDate) return 'Due date cannot be earlier than issue date.';
  if (!form.lines.length || form.lines.length > 200) return 'Add between 1 and 200 invoice lines.';
  for (const [index, line] of form.lines.entries()) {
    if (!line.description.trim()) return `Enter a description for line ${index + 1}.`;
    if (!validDecimal(line.quantity, 0.001, 999999999999999, 3)) return `Quantity for line ${index + 1} must be a positive decimal with at most 3 decimal places.`;
    if (!validDecimal(line.unitPrice, 0, 9999999999999999.99, 2)) return `Unit price for line ${index + 1} must be a non-negative decimal with at most 2 decimal places.`;
    if (!validDecimal(line.discountPercent, 0, 100, 4)) return `Discount for line ${index + 1} must be between 0 and 100 with at most 4 decimal places.`;
    if (!validDecimal(line.taxPercent, 0, 100, 4)) return `Tax for line ${index + 1} must be between 0 and 100 with at most 4 decimal places.`;
    for (const reference of [line.chargeItemId, line.taxCodeId]) {
      if (reference.trim() && !validUuid(reference)) return `Charge item and tax code IDs on line ${index + 1} must be valid UUIDs.`;
    }
  }
  return null;
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
  const partners: PartnerOption[] = [];
  let page = 1;
  let pages = 1;
  do {
    const params = new URLSearchParams({ type, status: 'ACTIVE', page: String(page), limit: '100' });
    const response = await api.get<PartnerOption[]>(`/erp/partners?${params.toString()}`);
    partners.push(...response.data);
    pages = Number((response.meta as unknown as PaginationMeta | undefined)?.pages ?? 1);
    page += 1;
  } while (page <= pages);
  const unique = new Map(partners.map((partner) => [partner.id, partner]));
  return [...unique.values()].sort((a, b) => a.nameEn.localeCompare(b.nameEn));
}

function useCustomerOptions() {
  return useQuery({
    queryKey: ['erp', 'partners', 'accounting-customer-options'],
    queryFn: async () => {
      const [customers, both] = await Promise.all([fetchPartners('CUSTOMER'), fetchPartners('BOTH')]);
      return [...new Map([...customers, ...both].map((partner) => [partner.id, partner])).values()];
    },
    staleTime: 30000,
  });
}

function AdminField({ label, children, className, help }: { label: string; children: ReactNode; className?: string; help?: string }) {
  return <UiAdminField label={label} className={className}>{children}{help ? <span className="mt-1 block text-xs text-steel-500">{help}</span> : null}</UiAdminField>;
}

async function fetchAccountingOptions<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;
  let pages = 1;
  do {
    const params = new URLSearchParams({ isActive: 'true', page: String(page), limit: '100' });
    const response = await api.get<T[]>(`${path}?${params.toString()}`);
    rows.push(...response.data);
    pages = Number((response.meta as unknown as PaginationMeta | undefined)?.pages ?? 1);
    page += 1;
  } while (page <= pages);
  return rows;
}

function ReferencePicker({ label, ariaLabel, value, onChange, options, loading, error, disabled, help }: {
  label: string; ariaLabel: string; value: string; onChange: (value: string) => void;
  options: Array<{ id: string; label: string }>; loading: boolean; error?: unknown; disabled?: boolean; help?: string;
}) {
  const [search, setSearch] = useState('');
  const normalized = search.trim().toLowerCase();
  const filtered = options.filter((option) => !normalized || option.label.toLowerCase().includes(normalized));
  const selected = options.find((option) => option.id === value);
  const displayed = selected ? options : value ? [{ id: value, label: 'Unavailable or inactive selection' }, ...options] : options;
  const visible = normalized ? displayed.filter((option) => option.label.toLowerCase().includes(normalized) || option.id === value) : displayed;
  return <AdminField label={label} help={help}>
    <Input type="search" dir="ltr" aria-label={`Search ${ariaLabel}`} maxLength={200} disabled={disabled || loading} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by code or name" />
    <Select aria-label={ariaLabel} disabled={disabled || loading} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{loading ? 'Loading references…' : 'None / manual entry'}</option>
      {visible.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </Select>
    {error ? <span className="mt-1 block text-xs text-red-700">References could not be loaded. {messageFor(error, 'Please retry.')}</span> : null}
    {!loading && !options.length && !error ? <span className="mt-1 block text-xs text-steel-500">No active references are configured.</span> : null}
  </AdminField>;
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-steel-400">{label}</dt><dd className="mt-1 whitespace-pre-line break-words text-sm text-steel-700">{children || '—'}</dd></div>;
}

function JournalLinkage({ entry, currency }: { entry: PostedEntry; currency: string }) {
  return (
    <section aria-labelledby="invoice-journal-heading" className="space-y-3">
      <h3 id="invoice-journal-heading" className="text-sm font-bold text-navy-800">Journal linkage</h3>
      <dl className="grid gap-4 rounded-xl border border-steel-200 bg-steel-50/60 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <DetailItem label="Entry"><span className="font-mono font-bold text-brand-700">{entry.number}</span></DetailItem>
        <DetailItem label="Status"><StatusPill status={entry.status} label={entry.status} /></DetailItem>
        <DetailItem label="Entry date">{formatDate(entry.entryDate, 'en')}</DetailItem>
        <DetailItem label="Debit / credit">{`${entry.totalDebit} / ${entry.totalCredit} ${currency}`}</DetailItem>
        <DetailItem label="Entry ID" ><span className="font-mono text-xs">{entry.id}</span></DetailItem>
      </dl>
      {entry.reversals.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-bold">Reversal entries</p>
          {entry.reversals.map((reversal) => <p key={reversal.id} className="mt-1">{reversal.number} · {reversal.status} · {formatDate(reversal.entryDate, 'en')}</p>)}
        </div>
      ) : null}
      <Table>
        <thead><tr><Th>Account</Th><Th>Description</Th><Th>Debit</Th><Th>Credit</Th></tr></thead>
        <tbody>{entry.lines.map((line) => <tr key={line.id}><Td><span className="font-mono text-xs text-steel-400">{line.account.code}</span><span className="block font-semibold text-navy-800">{line.account.nameEn}</span></Td><Td>{line.description || '—'}</Td><Td className="whitespace-nowrap">{amount(line.debit, currency)}</Td><Td className="whitespace-nowrap">{amount(line.credit, currency)}</Td></tr>)}</tbody>
      </Table>
    </section>
  );
}

function useInvoiceReferences() {
  const charges = useQuery({ queryKey: ['accounting', 'charge-item-options'], queryFn: () => fetchAccountingOptions<ChargeItemOption>('/erp/accounting/charge-items'), staleTime: 30000 });
  const taxes = useQuery({ queryKey: ['accounting', 'tax-code-options'], queryFn: () => fetchAccountingOptions<TaxCodeOption>('/erp/accounting/tax-codes'), staleTime: 30000 });
  return {
    charges,
    taxes,
    chargeOptions: (charges.data ?? []).map((item) => ({ id: item.id, label: `${item.code} · ${item.nameEn} · ${item.type}` })),
    taxOptions: (taxes.data ?? []).filter((item) => !item.account || item.account.type === 'LIABILITY').map((item) => ({ id: item.id, label: `${item.code} · ${item.nameEn} · ${item.ratePercent}%` })),
  };
}

function InvoiceEditor({ partners, partnersLoading, baseCurrency, initial, pending, onCancel, onSubmit }: {
  partners: PartnerOption[];
  partnersLoading: boolean;
  baseCurrency: string;
  initial?: Invoice;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (body: InvoicePayload) => void;
}) {
  const [form, setForm] = useState<InvoiceForm>(() => initial ? invoiceToForm(initial) : emptyInvoiceForm(baseCurrency));
  const [formError, setFormError] = useState<string | null>(null);
  const linesHeadingId = useId();
  const references = useInvoiceReferences();
  const updateLine = (index: number, patch: Partial<LineForm>) => setForm((current) => ({ ...current, lines: current.lines.map((line, position) => position === index ? { ...line, ...patch } : line) }));
  const selectCharge = (index: number, id: string) => {
    const charge = references.charges.data?.find((item) => item.id === id);
    const defaultTax = charge?.taxCode?.isActive ? references.taxes.data?.find((item) => item.id === charge.taxCode?.id && (!item.account || item.account.type === 'LIABILITY')) : undefined;
    updateLine(index, {
      chargeItemId: id,
      ...(!form.lines[index].description.trim() && charge ? { description: charge.nameEn } : {}),
      ...(form.lines[index].unitPrice.trim() === '0' && charge?.defaultPrice !== null && charge?.defaultPrice !== undefined ? { unitPrice: charge.defaultPrice } : {}),
      ...(!form.lines[index].taxCodeId && defaultTax ? { taxCodeId: defaultTax.id, taxPercent: defaultTax.ratePercent } : {}),
    });
  };
  const selectTax = (index: number, id: string) => {
    const tax = references.taxes.data?.find((item) => item.id === id);
    updateLine(index, { taxCodeId: id, taxPercent: tax?.ratePercent ?? '0' });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateInvoiceForm(form, baseCurrency);
    if (validationError) { setFormError(validationError); return; }
    setFormError(null);
    onSubmit(invoicePayload(form));
  };

  return (
    <form onSubmit={submit}>
      {formError ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{formError}</p> : null}
      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <AdminField label="Customer *" className="sm:col-span-2">
          <Select required disabled={partnersLoading || !partners.length} value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}>
            <option value="">{partnersLoading ? 'Loading customers…' : 'Select an active customer'}</option>
            {partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.nameEn} ({partner.code})</option>)}
          </Select>
          {!partnersLoading && !partners.length ? <span className="mt-1 block text-xs text-steel-500">No active CUSTOMER or BOTH partners are available.</span> : null}
        </AdminField>
        <AdminField label="Branch ID"><Input dir="ltr" maxLength={36} value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value })} placeholder="Optional UUID" /></AdminField>
        <AdminField label="Currency" help={`Leave blank to use the company base currency${baseCurrency ? ` (${baseCurrency})` : ''}. Only base-currency documents are supported.`}>
          <Input dir="ltr" maxLength={3} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} placeholder={baseCurrency || 'Base currency'} />
        </AdminField>
        <AdminField label="Exchange rate" help="The current API supports a rate of 1 only."><Input dir="ltr" readOnly value="1" /></AdminField>
        <AdminField label="Issue date"><Input type="date" value={form.issueDate} onChange={(event) => setForm({ ...form, issueDate: event.target.value })} /></AdminField>
        <AdminField label="Due date"><Input type="date" min={form.issueDate || undefined} value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></AdminField>
        <AdminField label="Quote ID"><Input dir="ltr" maxLength={36} value={form.quoteId} onChange={(event) => setForm({ ...form, quoteId: event.target.value })} placeholder="Optional UUID" /></AdminField>
        <AdminField label="Booking ID"><Input dir="ltr" maxLength={36} value={form.bookingId} onChange={(event) => setForm({ ...form, bookingId: event.target.value })} placeholder="Optional UUID" /></AdminField>
        <AdminField label="Shipment ID" className="sm:col-span-2"><Input dir="ltr" maxLength={36} value={form.shipmentId} onChange={(event) => setForm({ ...form, shipmentId: event.target.value })} placeholder="Optional UUID; linked records must belong to the customer" /></AdminField>
        <AdminField label="Notes" className="sm:col-span-2 lg:col-span-4"><Textarea rows={2} maxLength={4000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></AdminField>
        <AdminField label="Terms" className="sm:col-span-2 lg:col-span-4"><Textarea rows={2} maxLength={8000} value={form.terms} onChange={(event) => setForm({ ...form, terms: event.target.value })} /></AdminField>
      </div>
      <section aria-labelledby={linesHeadingId} className="border-t border-steel-200">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div><h3 id={linesHeadingId} className="text-sm font-bold text-navy-800">Invoice lines</h3><p className="text-xs text-steel-500">Enter plain decimals. The server calculates and stores final totals.</p></div>
          <Button type="button" variant="onlight" size="sm" disabled={pending || form.lines.length >= 200} icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ ...form, lines: [...form.lines, emptyLine()] })}>Add line</Button>
        </div>
        <Table>
          <thead><tr><Th>Description and references</Th><Th>Quantity</Th><Th>Unit price</Th><Th>Discount %</Th><Th>Tax %</Th><Th><span className="sr-only">Remove</span></Th></tr></thead>
          <tbody>{form.lines.map((line, index) => (
            <tr key={line.key}>
              <Td className="min-w-[22rem]">
                <Input required dir="ltr" aria-label={`Line ${index + 1} description`} maxLength={500} value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} placeholder="Description" />
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <ReferencePicker label="Charge item" ariaLabel={`line ${index + 1} charge item`} value={line.chargeItemId} onChange={(value) => selectCharge(index, value)} options={references.chargeOptions} loading={references.charges.isLoading} error={references.charges.error} help="Selection fills a blank description, zero price, and an unused tax default." />
                  <ReferencePicker label="Tax code" ariaLabel={`line ${index + 1} tax code`} value={line.taxCodeId} onChange={(value) => selectTax(index, value)} options={references.taxOptions} loading={references.taxes.isLoading} error={references.taxes.error} help="Invoice accounts must be liability accounts; manual tax percentages remain available." />
                </div>
              </Td>
              <Td><Input required dir="ltr" inputMode="decimal" aria-label={`Line ${index + 1} quantity`} value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} className="min-w-[7rem]" /></Td>
              <Td><Input required dir="ltr" inputMode="decimal" aria-label={`Line ${index + 1} unit price`} value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} className="min-w-[8rem]" /></Td>
              <Td><Input required dir="ltr" inputMode="decimal" aria-label={`Line ${index + 1} discount percentage`} value={line.discountPercent} onChange={(event) => updateLine(index, { discountPercent: event.target.value })} className="min-w-[7rem]" /></Td>
              <Td><Input required dir="ltr" inputMode="decimal" aria-label={`Line ${index + 1} tax percentage`} value={line.taxPercent} onChange={(event) => updateLine(index, { taxPercent: event.target.value })} className="min-w-[7rem]" /></Td>
              <Td><Button type="button" variant="ghost" size="sm" disabled={pending || form.lines.length === 1} aria-label={`Remove line ${index + 1}`} icon={<Trash2 className="h-4 w-4" />} onClick={() => setForm((current) => ({ ...current, lines: current.lines.filter((_, position) => position !== index) }))}>Remove</Button></Td>
            </tr>
          ))}</tbody>
        </Table>
      </section>
      <div className="flex justify-end gap-2 border-t border-steel-200 px-5 py-4">
        <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending || partnersLoading || !partners.length}>{pending ? 'Saving…' : initial ? 'Save changes' : 'Create invoice'}</Button>
      </div>
    </form>
  );
}

function initialActionForm(invoice: Invoice, kind: ActionKind): ActionForm {
  return {
    issueDate: invoice.issueDate?.slice(0, 10) ?? '',
    dueDate: invoice.dueDate?.slice(0, 10) ?? '',
    entryDate: kind === 'post' ? invoice.issueDate?.slice(0, 10) ?? '' : '',
    journalId: '', periodId: '', description: '', reason: '',
  };
}

function InvoiceActionDialog({ invoice, kind, pending, onClose, onSubmit }: {
  invoice: Invoice;
  kind: ActionKind;
  pending: boolean;
  onClose: () => void;
  onSubmit: (body: ActionPayload, headers: HeadersInit) => void;
}) {
  const [form, setForm] = useState<ActionForm>(() => initialActionForm(invoice, kind));
  const [formError, setFormError] = useState<string | null>(null);
  const operation = useOperationKey();
  const title = kind === 'issue' ? `Issue ${invoice.number}` : kind === 'post' ? `Post ${invoice.number}` : `Void ${invoice.number}`;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (kind === 'issue' && form.issueDate && form.dueDate && form.dueDate < form.issueDate) { setFormError('Due date cannot be earlier than issue date.'); return; }
    if (kind === 'void' && !form.reason.trim()) { setFormError('A void reason is required.'); return; }
    for (const field of [form.journalId, form.periodId]) {
      if (field.trim() && !validUuid(field)) { setFormError('Journal and period IDs must be valid UUIDs.'); return; }
    }
    const body: ActionPayload = kind === 'issue'
      ? { ...(form.issueDate ? { issueDate: form.issueDate } : {}), dueDate: form.dueDate || null }
      : kind === 'post'
        ? { ...(form.entryDate ? { entryDate: form.entryDate } : {}), ...(form.journalId.trim() ? { journalId: form.journalId.trim() } : {}), ...(form.periodId.trim() ? { periodId: form.periodId.trim() } : {}), description: nullable(form.description) }
        : { ...(form.entryDate ? { entryDate: form.entryDate } : {}), reason: form.reason.trim() };
    setFormError(null);
    onSubmit(body, { 'Idempotency-Key': operation.keyFor(body) });
  };

  return (
    <Panel title={title} actions={<Button type="button" variant="ghost" size="sm" disabled={pending} icon={<X className="h-4 w-4" />} onClick={onClose}>Cancel</Button>}>
      <form onSubmit={submit}>
        {formError ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{formError}</p> : null}
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {kind === 'issue' ? <><AdminField label="Issue date" help="Leave blank to keep the draft date or use today."><Input type="date" value={form.issueDate} onChange={(event) => setForm({ ...form, issueDate: event.target.value })} /></AdminField><AdminField label="Due date" help="Leave blank to use partner terms; an existing draft due date is retained."><Input type="date" min={form.issueDate || undefined} value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></AdminField></> : null}
          {kind === 'post' ? <><AdminField label="Entry date" help="Leave blank to use the invoice issue date."><Input type="date" value={form.entryDate} onChange={(event) => setForm({ ...form, entryDate: event.target.value })} /></AdminField><AdminField label="Sales journal ID" help="Leave blank to select the active system SALES journal."><Input dir="ltr" maxLength={36} value={form.journalId} onChange={(event) => setForm({ ...form, journalId: event.target.value })} placeholder="Optional UUID" /></AdminField><AdminField label="Fiscal period ID" help="Leave blank to find the open period covering the entry date."><Input dir="ltr" maxLength={36} value={form.periodId} onChange={(event) => setForm({ ...form, periodId: event.target.value })} placeholder="Optional UUID" /></AdminField><AdminField label="Entry description" className="sm:col-span-2 lg:col-span-3"><Input maxLength={500} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder={`Invoice ${invoice.number}`} /></AdminField></> : null}
          {kind === 'void' ? <><AdminField label="Reversal entry date" help="Leave blank to use today."><Input type="date" value={form.entryDate} onChange={(event) => setForm({ ...form, entryDate: event.target.value })} /></AdminField><AdminField label="Void reason *" className="sm:col-span-2"><Textarea required rows={3} maxLength={500} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Explain why this invoice is being voided" /></AdminField>{invoice.allocations.length ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 sm:col-span-3">This invoice has payment allocations. Void or reverse all allocated payments before voiding it.</p> : null}</> : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-steel-200 px-5 py-4"><p className="text-xs text-steel-500">A stable Idempotency-Key protects this operation from duplicate submissions.</p><Button type="submit" variant={kind === 'void' ? 'secondary' : 'primary'} disabled={pending}>{pending ? 'Submitting…' : kind === 'issue' ? 'Issue invoice' : kind === 'post' ? 'Post invoice' : 'Void invoice'}</Button></div>
      </form>
    </Panel>
  );
}

export default function Invoices() {
  const queryClient = useQueryClient();
  const createOperation = useOperationKey();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<InvoiceStatus | ''>('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [shipmentFilter, setShipmentFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const customersQuery = useCustomerOptions();

  const invoicesQuery = useQuery({
    queryKey: ['accounting', 'invoices', 'list', search, status, customerFilter, shipmentFilter, branchFilter, currencyFilter, from, to, overdue, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (customerFilter) params.set('customerId', customerFilter);
      if (shipmentFilter) params.set('shipmentId', shipmentFilter);
      if (branchFilter) params.set('branchId', branchFilter);
      if (currencyFilter) params.set('currency', currencyFilter.trim().toUpperCase());
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (overdue) params.set('overdue', 'true');
      const response = await api.get<InvoiceSummary[]>(`/erp/accounting/invoices?${params.toString()}`);
      return { rows: response.data, meta: response.meta as unknown as PaginationMeta };
    },
    placeholderData: keepPreviousData,
  });

  const invoiceQuery = useQuery({
    queryKey: ['accounting', 'invoices', 'detail', selectedId],
    queryFn: async () => (await api.get<Invoice>(`/erp/accounting/invoices/${selectedId}`)).data,
    enabled: selectedId !== null,
  });

  const createInvoice = useMutation({
    mutationFn: (body: InvoicePayload) => api.post<Invoice>('/erp/accounting/invoices', body, { 'Idempotency-Key': createOperation.keyFor(body) }),
    onSuccess: async (response) => {
      createOperation.reset();
      setFeedback({ kind: 'success', text: `Invoice ${response.data.number} created as DRAFT.` });
      setShowCreate(false);
      setSelectedId(response.data.id);
      setAction(null);
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'invoices'] });
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not create the invoice.') }),
  });

  const updateInvoice = useMutation({
    mutationFn: ({ id, body }: { id: string; body: InvoicePayload }) => api.patch<Invoice>(`/erp/accounting/invoices/${id}`, body, { 'Idempotency-Key': createOperation.keyFor(body) }),
    onSuccess: async (response) => {
      createOperation.reset(); setEditingId(null); setFeedback({ kind: 'success', text: `Draft invoice ${response.data.number} updated.` });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['accounting', 'invoices'] }), queryClient.invalidateQueries({ queryKey: ['accounting', 'payment-allocation-options'] })]);
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not update the draft invoice.') }),
  });
  const deleteInvoice = useMutation({
    mutationFn: (id: string) => api.delete<{ id: string; number: string; deleted: boolean }>(`/erp/accounting/invoices/${id}`, { 'Idempotency-Key': `delete-${id}` }),
    onSuccess: async (response) => {
      setSelectedId(null); setEditingId(null); setFeedback({ kind: 'success', text: `Draft invoice ${response.data.number} deleted.` });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['accounting', 'invoices'] }), queryClient.invalidateQueries({ queryKey: ['accounting', 'payment-allocation-options'] })]);
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not delete the draft invoice.') }),
  });

  const mutateInvoice = useMutation({
    mutationFn: ({ id, kind, body, headers }: { id: string; kind: ActionKind; body: ActionPayload; headers: HeadersInit }) => api.post<Invoice>(`/erp/accounting/invoices/${id}/${kind}`, body, headers),
    onSuccess: async (response) => {
      const verb = action === 'issue' ? 'issued' : action === 'post' ? 'posted' : 'voided';
      setFeedback({ kind: 'success', text: `Invoice ${response.data.number} ${verb}.` });
      setAction(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounting', 'invoices'] }),
        queryClient.invalidateQueries({ queryKey: ['accounting', 'payments'] }),
        queryClient.invalidateQueries({ queryKey: ['accounting', 'reports'] }),
        queryClient.invalidateQueries({ queryKey: ['accounting', 'journal-entries'] }),
        queryClient.invalidateQueries({ queryKey: ['accounting', 'payment-allocation-options'] }),
      ]);
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not update the invoice.') }),
  });

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    if (from && to && to < from) { setFeedback({ kind: 'error', text: 'End date cannot be earlier than start date.' }); return; }
    setSearch(searchInput.trim()); setPage(1);
  };
  const clearFilters = () => {
    setSearchInput(''); setSearch(''); setStatus(''); setCustomerFilter(''); setShipmentFilter(''); setBranchFilter(''); setCurrencyFilter(''); setFrom(''); setTo(''); setOverdue(false); setPage(1);
  };
  const openInvoice = (id: string) => { setSelectedId(id); setEditingId(null); setAction(null); setFeedback(null); };
  const closeInvoice = () => { setSelectedId(null); setEditingId(null); setAction(null); };
  const pending = createInvoice.isPending || updateInvoice.isPending || deleteInvoice.isPending || mutateInvoice.isPending;
  const meta = invoicesQuery.data?.meta;
  const invoice = invoiceQuery.data;
  const baseCurrency = invoicesQuery.data?.rows[0]?.currency ?? '';

  return (
    <AdminPage title="Invoices" description="Create, issue, post and reconcile customer invoices against the accounting ledger." actions={<Button variant="onlight" disabled={pending} icon={<Plus className="h-4 w-4" />} onClick={() => { setShowCreate((value) => !value); setEditingId(null); createOperation.reset(); setFeedback(null); }}>{showCreate ? 'Close form' : 'New invoice'}</Button>}>
      {feedback ? <div role={feedback.kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${feedback.kind === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-brand-200 bg-brand-50 text-brand-800'}`}>{feedback.text}</div> : null}
      {selectedId && editingId === selectedId && invoice?.status === 'DRAFT' ? <Panel title={`Edit draft ${invoice.number}`} actions={<Button type="button" variant="ghost" size="sm" disabled={updateInvoice.isPending} icon={<X className="h-4 w-4" />} onClick={() => setEditingId(null)}>Close</Button>}>{customersQuery.isError ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">Customers could not be loaded. {messageFor(customersQuery.error, 'Please retry.')}</p> : null}<InvoiceEditor key={invoice.id} initial={invoice} partners={customersQuery.data ?? []} partnersLoading={customersQuery.isLoading} baseCurrency={baseCurrency} pending={updateInvoice.isPending} onCancel={() => setEditingId(null)} onSubmit={(body) => updateInvoice.mutate({ id: invoice.id, body })} /></Panel> : null}
      {showCreate ? <Panel title="Create invoice">{customersQuery.isError ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">Customers could not be loaded. {messageFor(customersQuery.error, 'Please retry.')} <button type="button" className="font-bold underline" onClick={() => void customersQuery.refetch()}>Retry</button></p> : null}<InvoiceEditor key={baseCurrency || 'base'} partners={customersQuery.data ?? []} partnersLoading={customersQuery.isLoading} baseCurrency={baseCurrency} pending={createInvoice.isPending} onCancel={() => { setShowCreate(false); createOperation.reset(); }} onSubmit={(body) => createInvoice.mutate(body)} /></Panel> : null}

      <Panel>
        <form role="search" onSubmit={submitSearch} className="grid gap-3 border-b border-steel-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminField label="Search invoices" className="lg:col-span-2"><div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-400" aria-hidden="true" /><Input dir="ltr" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="ps-9" placeholder="Invoice number or customer" /></div></AdminField>
          <AdminField label="Status"><Select value={status} onChange={(event) => { setStatus(event.target.value as InvoiceStatus | ''); setPage(1); }}><option value="">All statuses</option>{invoiceStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</Select></AdminField>
          <AdminField label="Customer"><Select value={customerFilter} disabled={customersQuery.isLoading} onChange={(event) => { setCustomerFilter(event.target.value); setPage(1); }}><option value="">{customersQuery.isLoading ? 'Loading…' : 'All customers'}</option>{(customersQuery.data ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.nameEn}</option>)}</Select></AdminField>
          <AdminField label="Shipment ID"><Input dir="ltr" maxLength={36} value={shipmentFilter} onChange={(event) => { setShipmentFilter(event.target.value); setPage(1); }} placeholder="Optional UUID" /></AdminField>
          <AdminField label="Branch ID"><Input dir="ltr" maxLength={36} value={branchFilter} onChange={(event) => { setBranchFilter(event.target.value); setPage(1); }} placeholder="Optional UUID" /></AdminField>
          <AdminField label="Currency"><Input dir="ltr" maxLength={3} value={currencyFilter} onChange={(event) => { setCurrencyFilter(event.target.value.toUpperCase()); setPage(1); }} placeholder="All currencies" /></AdminField>
          <AdminField label="Issue date from"><Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></AdminField>
          <AdminField label="Issue date to"><Input type="date" min={from || undefined} value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></AdminField>
          <label className="inline-flex items-end gap-2 pb-2 text-sm font-semibold text-steel-600"><input type="checkbox" className="h-4 w-4 rounded border-steel-300" checked={overdue} onChange={(event) => { setOverdue(event.target.checked); setPage(1); }} />Overdue only</label>
          <div className="flex items-end gap-2"><Button type="submit" variant="secondary">Search</Button><Button type="button" variant="ghost" onClick={clearFilters}>Clear</Button></div>
        </form>
        <div className="flex items-center justify-between gap-3 border-b border-steel-100 px-4 py-2 text-xs text-steel-500"><span aria-live="polite">{meta ? `${meta.total} invoice${meta.total === 1 ? '' : 's'}` : 'Invoices'}</span>{invoicesQuery.isFetching && !invoicesQuery.isLoading ? <Spinner label="Refreshing…" /> : null}</div>
        {invoicesQuery.isLoading ? <div className="p-8"><Spinner label="Loading invoices…" /></div> : invoicesQuery.isError ? <div className="space-y-3 p-6" role="alert"><p className="text-sm font-semibold text-red-700">Invoices could not be loaded.</p><p className="text-sm text-steel-500">{messageFor(invoicesQuery.error, 'Please try again.')}</p><Button variant="onlight" size="sm" onClick={() => void invoicesQuery.refetch()}>Retry</Button></div> : <Table>
          <thead><tr><Th>Invoice</Th><Th>Customer</Th><Th>Dates</Th><Th>Total</Th><Th>Paid</Th><Th>Balance</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
          <tbody>{!invoicesQuery.data?.rows.length ? <EmptyRow colSpan={8} message="No invoices match these filters." /> : invoicesQuery.data.rows.map((item) => <tr key={item.id} className="hover:bg-steel-50/60"><Td><button type="button" onClick={() => openInvoice(item.id)} className="font-mono text-[0.8rem] font-bold text-brand-700 hover:underline">{item.number}</button><span className="mt-1 block text-xs text-steel-400">{item._count.lines} line{item._count.lines === 1 ? '' : 's'} · {item._count.allocations} allocation{item._count.allocations === 1 ? '' : 's'}</span></Td><Td><span className="font-semibold text-navy-800">{item.customer.nameEn}</span><span className="mt-1 block text-xs text-steel-400">{item.customer.code}</span></Td><Td className="whitespace-nowrap text-xs">Issued {formatDate(item.issueDate, 'en')}<span className="mt-1 block text-steel-400">Due {formatDate(item.dueDate, 'en')}</span></Td><Td className="whitespace-nowrap font-semibold text-navy-800">{amount(item.total, item.currency)}</Td><Td className="whitespace-nowrap">{amount(item.paidAmount, item.currency)}</Td><Td className="whitespace-nowrap font-semibold">{amount(item.balance, item.currency)}</Td><Td><StatusPill status={item.status} label={item.status} /></Td><Td><div className="flex flex-wrap gap-1"><Button type="button" variant="onlight" size="sm" icon={<Eye className="h-4 w-4" />} aria-label={`View invoice ${item.number}`} onClick={() => openInvoice(item.id)}>View</Button>{item.status === 'DRAFT' ? <><Button type="button" variant="ghost" size="sm" icon={<Pencil className="h-4 w-4" />} aria-label={`Edit invoice ${item.number}`} onClick={() => { openInvoice(item.id); setEditingId(item.id); }}>Edit</Button><Button type="button" variant="ghost" size="sm" disabled={deleteInvoice.isPending} icon={<Trash2 className="h-4 w-4" />} aria-label={`Delete invoice ${item.number}`} onClick={() => { if (window.confirm(`Delete draft invoice ${item.number}? This cannot be undone.`)) deleteInvoice.mutate(item.id); }}>Delete</Button></> : null}</div></Td></tr>)}</tbody>
        </Table>}
      </Panel>

      {meta ? <nav aria-label="Invoice pagination" className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs font-semibold text-steel-500">Page {meta.page} of {meta.pages}</span><div className="flex gap-2"><Button variant="onlight" size="sm" disabled={page <= 1 || invoicesQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button><Button variant="onlight" size="sm" disabled={page >= meta.pages || invoicesQuery.isFetching} onClick={() => setPage((current) => current + 1)}>Next</Button></div></nav> : null}

      {selectedId ? <Panel title={invoice ? `${invoice.number} · ${invoice.customer.nameEn}` : 'Invoice detail'} actions={<Button variant="ghost" size="sm" disabled={mutateInvoice.isPending} icon={<X className="h-4 w-4" />} onClick={closeInvoice}>Close</Button>}>
        {invoiceQuery.isLoading ? <div className="p-8"><Spinner label="Loading invoice detail…" /></div> : invoiceQuery.isError ? <div className="space-y-3 p-6" role="alert"><p className="text-sm font-semibold text-red-700">Invoice detail could not be loaded.</p><p className="text-sm text-steel-500">{messageFor(invoiceQuery.error, 'Please try again.')}</p><Button variant="onlight" size="sm" onClick={() => void invoiceQuery.refetch()}>Retry</Button></div> : invoice ? <div className="space-y-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><StatusPill status={invoice.status} label={invoice.status} /><span className="text-xs text-steel-400">Updated {formatDateTime(invoice.updatedAt, 'en')}</span></div><div className="flex flex-wrap gap-2">{invoice.status === 'DRAFT' ? <><Button variant="onlight" size="sm" disabled={pending} icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditingId(invoice.id); setAction(null); setFeedback(null); }}>Edit draft</Button><Button variant="ghost" size="sm" disabled={pending} icon={<Trash2 className="h-4 w-4" />} onClick={() => { if (window.confirm(`Delete draft invoice ${invoice.number}? This cannot be undone.`)) deleteInvoice.mutate(invoice.id); }}>Delete draft</Button><Button variant="onlight" size="sm" disabled={pending} icon={<Send className="h-4 w-4" />} onClick={() => { setAction('issue'); setFeedback(null); }}>Issue</Button></> : null}{invoice.status === 'ISSUED' && !invoice.postedEntryId ? <Button size="sm" disabled={mutateInvoice.isPending} icon={<Check className="h-4 w-4" />} onClick={() => { setAction('post'); setFeedback(null); }}>Post</Button> : null}{invoice.status !== 'VOID' ? <Button variant="ghost" size="sm" disabled={mutateInvoice.isPending} icon={<Ban className="h-4 w-4" />} onClick={() => { setAction('void'); setFeedback(null); }}>Void</Button> : null}</div></div>
          <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"><DetailItem label="Customer">{invoice.customer.nameEn}</DetailItem><DetailItem label="Currency / rate">{`${invoice.currency} / ${invoice.exchangeRate}`}</DetailItem><DetailItem label="Issue date">{formatDate(invoice.issueDate, 'en')}</DetailItem><DetailItem label="Due date">{formatDate(invoice.dueDate, 'en')}</DetailItem><DetailItem label="Total">{amount(invoice.total, invoice.currency)}</DetailItem><DetailItem label="Paid">{amount(invoice.paidAmount, invoice.currency)}</DetailItem><DetailItem label="Balance">{amount(invoice.balance, invoice.currency)}</DetailItem><DetailItem label="Branch">{invoice.branch ? `${invoice.branch.code} · ${invoice.branch.nameEn}` : invoice.branchId}</DetailItem><DetailItem label="Quote">{invoice.quote ? `${invoice.quote.number} · ${invoice.quote.id}` : invoice.quoteId}</DetailItem><DetailItem label="Booking">{invoice.booking ? `${invoice.booking.number} · ${invoice.booking.id}` : invoice.bookingId}</DetailItem><DetailItem label="Shipment">{invoice.shipment ? `${invoice.shipment.trackingNumber} · ${invoice.shipment.id}` : invoice.shipmentId}</DetailItem><DetailItem label="Created">{formatDateTime(invoice.createdAt, 'en')}</DetailItem></dl>
          <section aria-labelledby="invoice-lines-heading"><h3 id="invoice-lines-heading" className="mb-3 text-sm font-bold text-navy-800">Lines and totals</h3><Table><thead><tr><Th>Description</Th><Th>Quantity</Th><Th>Unit price</Th><Th>Discount</Th><Th>Tax</Th><Th>Total</Th></tr></thead><tbody>{invoice.lines.map((line) => <tr key={line.id}><Td className="min-w-[16rem]"><span className="font-semibold text-navy-800">{line.description}</span>{line.chargeItemId || line.taxCodeId ? <span className="mt-1 block break-all font-mono text-[0.65rem] text-steel-400">Charge: {line.chargeItemId || '—'} · Tax code: {line.taxCodeId || '—'}</span> : null}</Td><Td>{line.quantity}</Td><Td className="whitespace-nowrap">{amount(line.unitPrice, invoice.currency)}</Td><Td className="whitespace-nowrap">{line.discountPercent}%<span className="block text-xs text-steel-400">{amount(line.discount, invoice.currency)}</span></Td><Td className="whitespace-nowrap">{line.taxPercent}%<span className="block text-xs text-steel-400">{amount(line.taxAmount, invoice.currency)}</span></Td><Td className="whitespace-nowrap font-semibold text-navy-800">{amount(line.total, invoice.currency)}</Td></tr>)}</tbody></Table><dl className="mt-3 grid gap-3 rounded-xl bg-steel-50 p-4 text-sm sm:grid-cols-4"><div><dt className="text-xs text-steel-500">Subtotal after discount</dt><dd className="mt-1 font-semibold">{amount(invoice.subtotal, invoice.currency)}</dd></div><div><dt className="text-xs text-steel-500">Discount</dt><dd className="mt-1 font-semibold">{amount(invoice.discount, invoice.currency)}</dd></div><div><dt className="text-xs text-steel-500">Tax</dt><dd className="mt-1 font-semibold">{amount(invoice.taxAmount, invoice.currency)}</dd></div><div><dt className="text-xs text-steel-500">Total</dt><dd className="mt-1 font-bold text-navy-800">{amount(invoice.total, invoice.currency)}</dd></div></dl></section>
          <section aria-labelledby="invoice-allocations-heading"><h3 id="invoice-allocations-heading" className="mb-3 text-sm font-bold text-navy-800">Payment allocations</h3>{!invoice.allocations.length ? <p className="rounded-xl border border-dashed border-steel-200 p-5 text-sm text-steel-500">No payment allocations.</p> : <Table><thead><tr><Th>Payment</Th><Th>Direction</Th><Th>Date</Th><Th>Status</Th><Th>Allocated</Th></tr></thead><tbody>{invoice.allocations.map((allocation) => <tr key={allocation.id}><Td><span className="font-mono font-bold text-brand-700">{allocation.payment.number}</span><span className="mt-1 block break-all text-[0.65rem] text-steel-400">{allocation.payment.id}</span></Td><Td>{allocation.payment.direction}</Td><Td className="whitespace-nowrap">{formatDate(allocation.payment.paymentDate, 'en')}</Td><Td><StatusPill status={allocation.payment.status} label={allocation.payment.status} /></Td><Td className="whitespace-nowrap font-semibold">{amount(allocation.amount, invoice.currency)}</Td></tr>)}</tbody></Table>}</section>
          {invoice.postedEntry ? <JournalLinkage entry={invoice.postedEntry} currency={invoice.currency} /> : <p className="rounded-xl border border-dashed border-steel-200 p-5 text-sm text-steel-500">No posted journal entry. Issue and post this invoice to create the ledger entry.</p>}
          {invoice.notes ? <section><h3 className="mb-2 text-sm font-bold text-navy-800">Notes</h3><p className="whitespace-pre-line text-sm text-steel-600">{invoice.notes}</p></section> : null}{invoice.terms ? <section><h3 className="mb-2 text-sm font-bold text-navy-800">Terms</h3><p className="whitespace-pre-line text-sm text-steel-600">{invoice.terms}</p></section> : null}
        </div> : null}
      </Panel> : null}

      {selectedId && invoice && action ? <InvoiceActionDialog key={`${invoice.id}-${action}`} invoice={invoice} kind={action} pending={mutateInvoice.isPending} onClose={() => setAction(null)} onSubmit={(body, headers) => mutateInvoice.mutate({ id: invoice.id, kind: action, body, headers })} /> : null}
    </AdminPage>
  );
}
