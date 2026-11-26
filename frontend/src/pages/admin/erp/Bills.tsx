import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, Eye, Pencil, Plus, Search, Send, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../../../lib/api';
import { AdminField as UiAdminField, AdminPage, EmptyRow, Panel, Table, Td, Th } from '../../../components/admin/ui';
import { Button } from '../../../components/ui/Button';
import { Input, Select, Textarea } from '../../../components/ui/Field';
import { Spinner } from '../../../components/ui/Spinner';
import { StatusPill } from '../../../components/ui/StatusPill';
import { formatDate, formatDateTime } from '../../../lib/utils';

type BillStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
type PartnerType = 'VENDOR' | 'BOTH';

interface PartnerOption {
  id: string;
  code: string;
  nameEn: string;
  currency: string;
  status: 'ACTIVE' | 'INACTIVE';
  type: 'CUSTOMER' | 'VENDOR' | 'BOTH';
}

interface ChargeItemOption {
  id: string;
  code: string;
  nameEn: string;
  type: string;
  defaultPrice: string | null;
  currency: string;
  taxCode: {
    id: string;
    code: string;
    nameEn: string;
    ratePercent: string;
    account: { id: string; code: string; nameEn: string; type: 'ASSET' | 'LIABILITY' } | null;
  } | null;
}

interface TaxCodeOption {
  id: string;
  code: string;
  nameEn: string;
  ratePercent: string;
  account: { id: string; code: string; nameEn: string; type: 'ASSET' | 'LIABILITY' } | null;
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

interface BillLine {
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
  lines: Array<{ id: string; description: string | null; debit: string; credit: string; account: { id: string; code: string; nameEn: string } }>;
}

interface BillSummary {
  id: string;
  number: string;
  vendorId: string;
  branchId: string | null;
  shipmentId: string | null;
  vendorReference: string | null;
  status: BillStatus;
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
  vendor: Pick<PartnerSummary, 'id' | 'code' | 'nameEn'>;
  _count: { lines: number; allocations: number };
}

interface Bill extends BillSummary {
  exchangeRate: string;
  bookingId: string | null;
  customsFileId: string | null;
  declarationId: string | null;
  notes: string | null;
  postedEntryId: string | null;
  updatedAt: string;
  vendor: PartnerSummary;
  branch: { id: string; code: string; nameEn: string } | null;
  booking: { id: string; number: string } | null;
  shipment: { id: string; trackingNumber: string } | null;
  customsFile: { id: string; number: string } | null;
  declaration: { id: string; number: string; declarationNumber: string | null } | null;
  lines: BillLine[];
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

interface BillForm {
  vendorId: string;
  branchId: string;
  bookingId: string;
  shipmentId: string;
  customsFileId: string;
  declarationId: string;
  vendorReference: string;
  currency: string;
  exchangeRate: string;
  issueDate: string;
  dueDate: string;
  notes: string;
  lines: LineForm[];
}

interface BillPayload {
  vendorId: string;
  branchId: string | null;
  bookingId: string | null;
  shipmentId: string | null;
  customsFileId: string | null;
  declarationId: string | null;
  vendorReference: string | null;
  currency?: string;
  exchangeRate: string;
  issueDate?: string;
  dueDate?: string | null;
  notes: string | null;
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

interface PaginationMeta { total: number; page: number; limit: number; pages: number }

const billStatuses: BillStatus[] = ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'];
const pageSize = 25;
const plainDecimal = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function emptyLine(): LineForm {
  return { key: crypto.randomUUID(), description: '', quantity: '1', unitPrice: '0', discountPercent: '0', taxPercent: '0', chargeItemId: '', taxCodeId: '' };
}

function emptyBillForm(baseCurrency = ''): BillForm {
  return {
    vendorId: '', branchId: '', bookingId: '', shipmentId: '', customsFileId: '', declarationId: '', vendorReference: '',
    currency: baseCurrency, exchangeRate: '1', issueDate: '', dueDate: '', notes: '', lines: [emptyLine()],
  };
}

function billToForm(bill: Bill): BillForm {
  return {
    vendorId: bill.vendorId, branchId: bill.branchId ?? '', bookingId: bill.bookingId ?? '', shipmentId: bill.shipmentId ?? '',
    customsFileId: bill.customsFileId ?? '', declarationId: bill.declarationId ?? '', vendorReference: bill.vendorReference ?? '',
    currency: bill.currency, exchangeRate: bill.exchangeRate, issueDate: bill.issueDate?.slice(0, 10) ?? '',
    dueDate: bill.dueDate?.slice(0, 10) ?? '', notes: bill.notes ?? '',
    lines: bill.lines.map((line) => ({
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

function amount(value: string, currency: string): string { return `${value} ${currency}`; }

function messageFor(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const details = error.details ? Object.values(error.details).flat().filter(Boolean) : [];
  return [error.message, ...details].join(' ');
}

function validUuid(value: string): boolean { return uuidPattern.test(value.trim()); }

function validDecimal(value: string, min: number, max: number, scale: number): boolean {
  const trimmed = value.trim();
  if (!plainDecimal.test(trimmed)) return false;
  const fraction = trimmed.split('.')[1] ?? '';
  if (fraction.length > scale) return false;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max;
}

function billPayload(form: BillForm): BillPayload {
  return {
    vendorId: form.vendorId,
    branchId: nullable(form.branchId), bookingId: nullable(form.bookingId), shipmentId: nullable(form.shipmentId),
    customsFileId: nullable(form.customsFileId), declarationId: nullable(form.declarationId), vendorReference: nullable(form.vendorReference),
    ...(form.currency.trim() ? { currency: form.currency.trim().toUpperCase() } : {}), exchangeRate: '1',
    ...(form.issueDate ? { issueDate: form.issueDate } : {}), ...(form.dueDate ? { dueDate: form.dueDate } : {}), notes: nullable(form.notes),
    lines: form.lines.map((line) => ({
      description: line.description.trim(), quantity: line.quantity.trim(), unitPrice: line.unitPrice.trim(),
      discountPercent: line.discountPercent.trim() || '0', taxPercent: line.taxPercent.trim() || '0',
      chargeItemId: nullable(line.chargeItemId), taxCodeId: nullable(line.taxCodeId),
    })),
  };
}

function validateBillForm(form: BillForm, baseCurrency: string): string | null {
  if (!form.vendorId) return 'Select a vendor.';
  const currency = form.currency.trim().toUpperCase();
  if (currency && !/^[A-Z]{3}$/.test(currency)) return 'Currency must be a three-letter code.';
  if (currency && baseCurrency && currency !== baseCurrency.toUpperCase()) return `This company only supports its base currency (${baseCurrency.toUpperCase()}).`;
  for (const field of [form.branchId, form.bookingId, form.shipmentId, form.customsFileId, form.declarationId]) {
    if (field.trim() && !validUuid(field)) return 'Optional branch and source references must be valid UUIDs.';
  }
  if (form.issueDate && form.dueDate && form.dueDate < form.issueDate) return 'Due date cannot be earlier than issue date.';
  if (!form.lines.length || form.lines.length > 200) return 'Add between 1 and 200 bill lines.';
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
  return [...new Map(partners.map((partner) => [partner.id, partner])).values()].sort((a, b) => a.nameEn.localeCompare(b.nameEn));
}

function useVendorOptions() {
  return useQuery({
    queryKey: ['erp', 'partners', 'accounting-vendor-options'],
    queryFn: async () => {
      const [vendors, both] = await Promise.all([fetchPartners('VENDOR'), fetchPartners('BOTH')]);
      return [...new Map([...vendors, ...both].map((partner) => [partner.id, partner])).values()];
    },
    staleTime: 30000,
  });
}

async function fetchAccountingOptions<T extends { id: string }>(path: string): Promise<T[]> {
  const options: T[] = [];
  let page = 1;
  let pages = 1;
  do {
    const response = await api.get<T[]>(`${path}${path.includes('?') ? '&' : '?'}page=${page}&limit=100`);
    options.push(...response.data);
    pages = Number((response.meta as unknown as PaginationMeta | undefined)?.pages ?? 1);
    page += 1;
  } while (page <= pages);
  return [...new Map(options.map((option) => [option.id, option])).values()];
}

function ReferencePicker({ label, ariaLabel, value, onChange, options, loading, error, help }: {
  label: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; code: string; nameEn: string; detail?: string }>;
  loading: boolean;
  error: unknown;
  help?: string;
}) {
  const [search, setSearch] = useState('');
  const normalized = search.trim().toLocaleLowerCase();
  const visible = normalized ? options.filter((option) => `${option.code} ${option.nameEn} ${option.detail ?? ''}`.toLocaleLowerCase().includes(normalized)) : options;
  return (
    <AdminField label={label} help={help}>
      <div className="relative">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-steel-400" aria-hidden="true" />
        <Input dir="ltr" aria-label={`Search ${ariaLabel}`} className="mb-2 ps-8" maxLength={120} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search code or name" />
      </div>
      <Select dir="ltr" aria-label={ariaLabel} disabled={loading || !!error || !options.length} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{loading ? 'Loading references…' : error ? 'References unavailable' : 'None / manual entry'}</option>
        {value && !options.some((option) => option.id === value) ? <option value={value}>Unavailable or inactive selection</option> : null}
        {visible.map((option) => <option key={option.id} value={option.id}>{option.code} · {option.nameEn}{option.detail ? ` (${option.detail})` : ''}</option>)}
      </Select>
      {!loading && error ? <span className="mt-1 block text-xs text-red-600">Could not load active references.</span> : !loading && !options.length ? <span className="mt-1 block text-xs text-steel-500">No active references are available.</span> : normalized && !visible.length ? <span className="mt-1 block text-xs text-steel-500">No references match this search.</span> : null}
    </AdminField>
  );
}

function useBillReferences() {
  const charges = useQuery({ queryKey: ['erp', 'accounting', 'charge-items', 'bill-options'], queryFn: () => fetchAccountingOptions<ChargeItemOption>('/erp/accounting/charge-items?isActive=true'), staleTime: 30000 });
  const taxes = useQuery({ queryKey: ['erp', 'accounting', 'tax-codes', 'bill-options'], queryFn: () => fetchAccountingOptions<TaxCodeOption>('/erp/accounting/tax-codes?isActive=true'), staleTime: 30000 });
  const chargeOptions = (charges.data ?? []).filter((charge) => !charge.taxCode || !charge.taxCode.account || charge.taxCode.account.type === 'ASSET');
  const taxOptions = (taxes.data ?? []).filter((tax) => !tax.account || tax.account.type === 'ASSET');
  return { charges, taxes, chargeOptions, taxOptions };
}

function AdminField({ label, children, className, help }: { label: string; children: ReactNode; className?: string; help?: string }) {
  return <UiAdminField label={label} className={className}>{children}{help ? <span className="mt-1 block text-xs text-steel-500">{help}</span> : null}</UiAdminField>;
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-steel-400">{label}</dt><dd className="mt-1 whitespace-pre-line break-words text-sm text-steel-700">{children || '—'}</dd></div>;
}

function JournalLinkage({ entry, currency }: { entry: PostedEntry; currency: string }) {
  return (
    <section aria-labelledby="bill-journal-heading" className="space-y-3">
      <h3 id="bill-journal-heading" className="text-sm font-bold text-navy-800">Journal linkage</h3>
      <dl className="grid gap-4 rounded-xl border border-steel-200 bg-steel-50/60 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <DetailItem label="Entry"><span className="font-mono font-bold text-brand-700">{entry.number}</span></DetailItem>
        <DetailItem label="Status"><StatusPill status={entry.status} label={entry.status} /></DetailItem>
        <DetailItem label="Entry date">{formatDate(entry.entryDate, 'en')}</DetailItem>
        <DetailItem label="Debit / credit">{`${entry.totalDebit} / ${entry.totalCredit} ${currency}`}</DetailItem>
        <DetailItem label="Entry ID"><span className="font-mono text-xs">{entry.id}</span></DetailItem>
      </dl>
      {entry.reversals.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><p className="font-bold">Reversal entries</p>{entry.reversals.map((reversal) => <p key={reversal.id} className="mt-1">{reversal.number} · {reversal.status} · {formatDate(reversal.entryDate, 'en')}</p>)}</div> : null}
      <Table><thead><tr><Th>Account</Th><Th>Description</Th><Th>Debit</Th><Th>Credit</Th></tr></thead><tbody>{entry.lines.map((line) => <tr key={line.id}><Td><span className="font-mono text-xs text-steel-400">{line.account.code}</span><span className="block font-semibold text-navy-800">{line.account.nameEn}</span></Td><Td>{line.description || '—'}</Td><Td className="whitespace-nowrap">{amount(line.debit, currency)}</Td><Td className="whitespace-nowrap">{amount(line.credit, currency)}</Td></tr>)}</tbody></Table>
    </section>
  );
}

function BillEditor({ vendors, vendorsLoading, baseCurrency, initial, pending, onCancel, onSubmit }: {
  vendors: PartnerOption[]; vendorsLoading: boolean; baseCurrency: string; initial?: Bill; pending: boolean; onCancel: () => void; onSubmit: (body: BillPayload) => void;
}) {
  const [form, setForm] = useState<BillForm>(() => initial ? billToForm(initial) : emptyBillForm(baseCurrency));
  const [formError, setFormError] = useState<string | null>(null);
  const linesHeadingId = useId();
  const references = useBillReferences();
  const updateLine = (index: number, patch: Partial<LineForm>) => setForm((current) => ({ ...current, lines: current.lines.map((line, position) => position === index ? { ...line, ...patch } : line) }));
  const selectCharge = (index: number, value: string) => {
    const charge = references.chargeOptions.find((option) => option.id === value);
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, position) => {
        if (position !== index) return line;
        const compatibleTax = charge?.taxCode && (!charge.taxCode.account || charge.taxCode.account.type === 'ASSET');
        return {
          ...line,
          chargeItemId: value,
          ...(!line.description.trim() && charge ? { description: charge.nameEn } : {}),
          ...(charge?.defaultPrice !== null && charge?.defaultPrice !== undefined && line.unitPrice.trim() === '0' ? { unitPrice: charge.defaultPrice } : {}),
          ...(!line.taxCodeId && compatibleTax && charge.taxCode ? { taxCodeId: charge.taxCode.id, taxPercent: charge.taxCode.ratePercent } : {}),
        };
      }),
    }));
  };
  const selectTax = (index: number, value: string) => {
    const tax = references.taxOptions.find((option) => option.id === value);
    updateLine(index, { taxCodeId: value, ...(tax ? { taxPercent: tax.ratePercent } : {}) });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateBillForm(form, baseCurrency);
    if (validationError) { setFormError(validationError); return; }
    setFormError(null); onSubmit(billPayload(form));
  };

  return (
    <form onSubmit={submit}>
      {formError ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{formError}</p> : null}
      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <AdminField label="Vendor *" className="sm:col-span-2"><Select required disabled={vendorsLoading || !vendors.length} value={form.vendorId} onChange={(event) => setForm({ ...form, vendorId: event.target.value })}><option value="">{vendorsLoading ? 'Loading vendors…' : 'Select an active vendor'}</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.nameEn} ({vendor.code})</option>)}</Select>{!vendorsLoading && !vendors.length ? <span className="mt-1 block text-xs text-steel-500">No active VENDOR or BOTH partners are available.</span> : null}</AdminField>
        <AdminField label="Vendor reference"><Input maxLength={120} value={form.vendorReference} onChange={(event) => setForm({ ...form, vendorReference: event.target.value })} placeholder="Vendor invoice number" /></AdminField>
        <AdminField label="Branch ID"><Input dir="ltr" maxLength={36} value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value })} placeholder="Optional UUID" /></AdminField>
        <AdminField label="Currency" help={`Leave blank to use the company base currency${baseCurrency ? ` (${baseCurrency})` : ''}. Only base-currency documents are supported.`}><Input dir="ltr" maxLength={3} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} placeholder={baseCurrency || 'Base currency'} /></AdminField>
        <AdminField label="Exchange rate" help="The current API supports a rate of 1 only."><Input dir="ltr" readOnly value="1" /></AdminField>
        <AdminField label="Issue date"><Input type="date" value={form.issueDate} onChange={(event) => setForm({ ...form, issueDate: event.target.value })} /></AdminField>
        <AdminField label="Due date"><Input type="date" min={form.issueDate || undefined} value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></AdminField>
        <AdminField label="Booking ID"><Input dir="ltr" maxLength={36} value={form.bookingId} onChange={(event) => setForm({ ...form, bookingId: event.target.value })} placeholder="Optional UUID" /></AdminField>
        <AdminField label="Shipment ID"><Input dir="ltr" maxLength={36} value={form.shipmentId} onChange={(event) => setForm({ ...form, shipmentId: event.target.value })} placeholder="Optional UUID" /></AdminField>
        <AdminField label="Customs file ID"><Input dir="ltr" maxLength={36} value={form.customsFileId} onChange={(event) => setForm({ ...form, customsFileId: event.target.value })} placeholder="Optional UUID" /></AdminField>
        <AdminField label="Declaration ID" help="Must belong to the selected customs file."><Input dir="ltr" maxLength={36} value={form.declarationId} onChange={(event) => setForm({ ...form, declarationId: event.target.value })} placeholder="Optional UUID" /></AdminField>
        <AdminField label="Notes" className="sm:col-span-2 lg:col-span-4"><Textarea rows={2} maxLength={4000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></AdminField>
      </div>
      <section aria-labelledby={linesHeadingId} className="border-t border-steel-200">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><h3 id={linesHeadingId} className="text-sm font-bold text-navy-800">Bill lines</h3><p className="text-xs text-steel-500">Enter plain decimals. The server calculates and stores final totals.</p></div><Button type="button" variant="onlight" size="sm" disabled={pending || form.lines.length >= 200} icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ ...form, lines: [...form.lines, emptyLine()] })}>Add line</Button></div>
        <Table><thead><tr><Th>Description and references</Th><Th>Quantity</Th><Th>Unit price</Th><Th>Discount %</Th><Th>Tax %</Th><Th><span className="sr-only">Remove</span></Th></tr></thead><tbody>{form.lines.map((line, index) => <tr key={line.key}><Td className="min-w-[22rem]"><Input required dir="ltr" aria-label={`Line ${index + 1} description`} maxLength={500} value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} placeholder="Description" /><div className="mt-2 grid gap-2 sm:grid-cols-2"><ReferencePicker label="Charge item" ariaLabel={`line ${index + 1} charge item`} value={line.chargeItemId} onChange={(value) => selectCharge(index, value)} options={references.chargeOptions} loading={references.charges.isLoading} error={references.charges.error} help="Selection fills a blank description, zero price, and an unused tax default." /><ReferencePicker label="Tax code" ariaLabel={`line ${index + 1} tax code`} value={line.taxCodeId} onChange={(value) => selectTax(index, value)} options={references.taxOptions} loading={references.taxes.isLoading} error={references.taxes.error} help="Bill accounts must be asset accounts; manual tax percentages remain available." /></div></Td><Td><Input required dir="ltr" inputMode="decimal" aria-label={`Line ${index + 1} quantity`} value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} className="min-w-[7rem]" /></Td><Td><Input required dir="ltr" inputMode="decimal" aria-label={`Line ${index + 1} unit price`} value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} className="min-w-[8rem]" /></Td><Td><Input required dir="ltr" inputMode="decimal" aria-label={`Line ${index + 1} discount percentage`} value={line.discountPercent} onChange={(event) => updateLine(index, { discountPercent: event.target.value })} className="min-w-[7rem]" /></Td><Td><Input required dir="ltr" inputMode="decimal" aria-label={`Line ${index + 1} tax percentage`} value={line.taxPercent} onChange={(event) => updateLine(index, { taxPercent: event.target.value })} className="min-w-[7rem]" /></Td><Td><Button type="button" variant="ghost" size="sm" disabled={pending || form.lines.length === 1} aria-label={`Remove line ${index + 1}`} icon={<Trash2 className="h-4 w-4" />} onClick={() => setForm((current) => ({ ...current, lines: current.lines.filter((_, position) => position !== index) }))}>Remove</Button></Td></tr>)}</tbody></Table>
      </section>
      <div className="flex justify-end gap-2 border-t border-steel-200 px-5 py-4"><Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={pending || vendorsLoading || !vendors.length}>{pending ? 'Saving…' : initial ? 'Save changes' : 'Create bill'}</Button></div>
    </form>
  );
}

function initialActionForm(bill: Bill, kind: ActionKind): ActionForm {
  return { issueDate: bill.issueDate?.slice(0, 10) ?? '', dueDate: bill.dueDate?.slice(0, 10) ?? '', entryDate: kind === 'post' ? bill.issueDate?.slice(0, 10) ?? '' : '', journalId: '', periodId: '', description: '', reason: '' };
}

function BillActionDialog({ bill, kind, pending, onClose, onSubmit }: {
  bill: Bill; kind: ActionKind; pending: boolean; onClose: () => void; onSubmit: (body: ActionPayload, headers: HeadersInit) => void;
}) {
  const [form, setForm] = useState<ActionForm>(() => initialActionForm(bill, kind));
  const [formError, setFormError] = useState<string | null>(null);
  const operation = useOperationKey();
  const title = kind === 'issue' ? `Issue ${bill.number}` : kind === 'post' ? `Post ${bill.number}` : `Void ${bill.number}`;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (kind === 'issue' && form.issueDate && form.dueDate && form.dueDate < form.issueDate) { setFormError('Due date cannot be earlier than issue date.'); return; }
    if (kind === 'void' && !form.reason.trim()) { setFormError('A void reason is required.'); return; }
    for (const field of [form.journalId, form.periodId]) if (field.trim() && !validUuid(field)) { setFormError('Journal and period IDs must be valid UUIDs.'); return; }
    const body: ActionPayload = kind === 'issue'
      ? { ...(form.issueDate ? { issueDate: form.issueDate } : {}), dueDate: form.dueDate || null }
      : kind === 'post'
        ? { ...(form.entryDate ? { entryDate: form.entryDate } : {}), ...(form.journalId.trim() ? { journalId: form.journalId.trim() } : {}), ...(form.periodId.trim() ? { periodId: form.periodId.trim() } : {}), description: nullable(form.description) }
        : { ...(form.entryDate ? { entryDate: form.entryDate } : {}), reason: form.reason.trim() };
    setFormError(null); onSubmit(body, { 'Idempotency-Key': operation.keyFor(body) });
  };

  return (
    <Panel title={title} actions={<Button type="button" variant="ghost" size="sm" disabled={pending} icon={<X className="h-4 w-4" />} onClick={onClose}>Cancel</Button>}>
      <form onSubmit={submit}>
        {formError ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{formError}</p> : null}
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {kind === 'issue' ? <><AdminField label="Issue date" help="Leave blank to keep the draft date or use today."><Input type="date" value={form.issueDate} onChange={(event) => setForm({ ...form, issueDate: event.target.value })} /></AdminField><AdminField label="Due date" help="Leave blank to use partner terms; an existing draft due date is retained."><Input type="date" min={form.issueDate || undefined} value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></AdminField></> : null}
          {kind === 'post' ? <><AdminField label="Entry date" help="Leave blank to use the bill issue date."><Input type="date" value={form.entryDate} onChange={(event) => setForm({ ...form, entryDate: event.target.value })} /></AdminField><AdminField label="Purchase journal ID" help="Leave blank to select the active system PURCHASE journal."><Input dir="ltr" maxLength={36} value={form.journalId} onChange={(event) => setForm({ ...form, journalId: event.target.value })} placeholder="Optional UUID" /></AdminField><AdminField label="Fiscal period ID" help="Leave blank to find the open period covering the entry date."><Input dir="ltr" maxLength={36} value={form.periodId} onChange={(event) => setForm({ ...form, periodId: event.target.value })} placeholder="Optional UUID" /></AdminField><AdminField label="Entry description" className="sm:col-span-2 lg:col-span-3"><Input maxLength={500} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder={`Bill ${bill.number}`} /></AdminField></> : null}
          {kind === 'void' ? <><AdminField label="Reversal entry date" help="Leave blank to use today."><Input type="date" value={form.entryDate} onChange={(event) => setForm({ ...form, entryDate: event.target.value })} /></AdminField><AdminField label="Void reason *" className="sm:col-span-2"><Textarea required rows={3} maxLength={500} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Explain why this bill is being voided" /></AdminField>{bill.allocations.length ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 sm:col-span-3">This bill has payment allocations. Void or reverse all allocated payments before voiding it.</p> : null}</> : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-steel-200 px-5 py-4"><p className="text-xs text-steel-500">A stable Idempotency-Key protects this operation from duplicate submissions.</p><Button type="submit" variant={kind === 'void' ? 'secondary' : 'primary'} disabled={pending}>{pending ? 'Submitting…' : kind === 'issue' ? 'Issue bill' : kind === 'post' ? 'Post bill' : 'Void bill'}</Button></div>
      </form>
    </Panel>
  );
}

export default function Bills() {
  const queryClient = useQueryClient();
  const createOperation = useOperationKey();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<BillStatus | ''>('');
  const [vendorFilter, setVendorFilter] = useState('');
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
  const vendorsQuery = useVendorOptions();

  const billsQuery = useQuery({
    queryKey: ['accounting', 'bills', 'list', search, status, vendorFilter, shipmentFilter, branchFilter, currencyFilter, from, to, overdue, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (vendorFilter) params.set('vendorId', vendorFilter);
      if (shipmentFilter) params.set('shipmentId', shipmentFilter);
      if (branchFilter) params.set('branchId', branchFilter);
      if (currencyFilter) params.set('currency', currencyFilter.trim().toUpperCase());
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (overdue) params.set('overdue', 'true');
      const response = await api.get<BillSummary[]>(`/erp/accounting/bills?${params.toString()}`);
      return { rows: response.data, meta: response.meta as unknown as PaginationMeta };
    },
    placeholderData: keepPreviousData,
  });

  const billQuery = useQuery({ queryKey: ['accounting', 'bills', 'detail', selectedId], queryFn: async () => (await api.get<Bill>(`/erp/accounting/bills/${selectedId}`)).data, enabled: selectedId !== null });

  const createBill = useMutation({
    mutationFn: (body: BillPayload) => api.post<Bill>('/erp/accounting/bills', body, { 'Idempotency-Key': createOperation.keyFor(body) }),
    onSuccess: async (response) => {
      createOperation.reset(); setFeedback({ kind: 'success', text: `Bill ${response.data.number} created as DRAFT.` }); setShowCreate(false); setSelectedId(response.data.id); setAction(null);
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'bills'] });
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not create the bill.') }),
  });

  const updateBill = useMutation({
    mutationFn: ({ id, body }: { id: string; body: BillPayload }) => api.patch<Bill>(`/erp/accounting/bills/${id}`, body, { 'Idempotency-Key': createOperation.keyFor(body) }),
    onSuccess: async (response) => {
      createOperation.reset(); setEditingId(null); setFeedback({ kind: 'success', text: `Draft bill ${response.data.number} updated.` });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['accounting', 'bills'] }), queryClient.invalidateQueries({ queryKey: ['accounting', 'payment-allocation-options'] })]);
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not update the draft bill.') }),
  });
  const deleteBill = useMutation({
    mutationFn: (id: string) => api.delete<{ id: string; number: string; deleted: boolean }>(`/erp/accounting/bills/${id}`, { 'Idempotency-Key': `delete-${id}` }),
    onSuccess: async (response) => {
      setSelectedId(null); setEditingId(null); setFeedback({ kind: 'success', text: `Draft bill ${response.data.number} deleted.` });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['accounting', 'bills'] }), queryClient.invalidateQueries({ queryKey: ['accounting', 'payment-allocation-options'] })]);
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not delete the draft bill.') }),
  });

  const mutateBill = useMutation({
    mutationFn: ({ id, kind, body, headers }: { id: string; kind: ActionKind; body: ActionPayload; headers: HeadersInit }) => api.post<Bill>(`/erp/accounting/bills/${id}/${kind}`, body, headers),
    onSuccess: async (response) => {
      const verb = action === 'issue' ? 'issued' : action === 'post' ? 'posted' : 'voided';
      setFeedback({ kind: 'success', text: `Bill ${response.data.number} ${verb}.` }); setAction(null);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['accounting', 'bills'] }), queryClient.invalidateQueries({ queryKey: ['accounting', 'payments'] }), queryClient.invalidateQueries({ queryKey: ['accounting', 'reports'] }), queryClient.invalidateQueries({ queryKey: ['accounting', 'journal-entries'] }), queryClient.invalidateQueries({ queryKey: ['accounting', 'payment-allocation-options'] })]);
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not update the bill.') }),
  });

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    if (from && to && to < from) { setFeedback({ kind: 'error', text: 'End date cannot be earlier than start date.' }); return; }
    setSearch(searchInput.trim()); setPage(1);
  };
  const clearFilters = () => { setSearchInput(''); setSearch(''); setStatus(''); setVendorFilter(''); setShipmentFilter(''); setBranchFilter(''); setCurrencyFilter(''); setFrom(''); setTo(''); setOverdue(false); setPage(1); };
  const openBill = (id: string) => { setSelectedId(id); setEditingId(null); setAction(null); setFeedback(null); };
  const closeBill = () => { setSelectedId(null); setEditingId(null); setAction(null); };
  const pending = createBill.isPending || updateBill.isPending || deleteBill.isPending || mutateBill.isPending;
  const meta = billsQuery.data?.meta;
  const bill = billQuery.data;
  const baseCurrency = billsQuery.data?.rows[0]?.currency ?? '';

  return (
    <AdminPage title="Bills" description="Record vendor costs, link operational documents, post payable entries and track settlements." actions={<Button variant="onlight" disabled={pending} icon={<Plus className="h-4 w-4" />} onClick={() => { setShowCreate((value) => !value); setEditingId(null); createOperation.reset(); setFeedback(null); }}>{showCreate ? 'Close form' : 'New bill'}</Button>}>
      {feedback ? <div role={feedback.kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${feedback.kind === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-brand-200 bg-brand-50 text-brand-800'}`}>{feedback.text}</div> : null}
      {selectedId && editingId === selectedId && bill?.status === 'DRAFT' ? <Panel title={`Edit draft ${bill.number}`} actions={<Button type="button" variant="ghost" size="sm" disabled={updateBill.isPending} icon={<X className="h-4 w-4" />} onClick={() => setEditingId(null)}>Close</Button>}>{vendorsQuery.isError ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">Vendors could not be loaded. {messageFor(vendorsQuery.error, 'Please retry.')}</p> : null}<BillEditor key={bill.id} initial={bill} vendors={vendorsQuery.data ?? []} vendorsLoading={vendorsQuery.isLoading} baseCurrency={baseCurrency} pending={updateBill.isPending} onCancel={() => setEditingId(null)} onSubmit={(body) => updateBill.mutate({ id: bill.id, body })} /></Panel> : null}
      {showCreate ? <Panel title="Create bill">{vendorsQuery.isError ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">Vendors could not be loaded. {messageFor(vendorsQuery.error, 'Please retry.')} <button type="button" className="font-bold underline" onClick={() => void vendorsQuery.refetch()}>Retry</button></p> : null}<BillEditor key={baseCurrency || 'base'} vendors={vendorsQuery.data ?? []} vendorsLoading={vendorsQuery.isLoading} baseCurrency={baseCurrency} pending={createBill.isPending} onCancel={() => { setShowCreate(false); createOperation.reset(); }} onSubmit={(body) => createBill.mutate(body)} /></Panel> : null}

      <Panel>
        <form role="search" onSubmit={submitSearch} className="grid gap-3 border-b border-steel-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminField label="Search bills" className="lg:col-span-2"><div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-400" aria-hidden="true" /><Input dir="ltr" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="ps-9" placeholder="Bill number, vendor or reference" /></div></AdminField>
          <AdminField label="Status"><Select value={status} onChange={(event) => { setStatus(event.target.value as BillStatus | ''); setPage(1); }}><option value="">All statuses</option>{billStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</Select></AdminField>
          <AdminField label="Vendor"><Select value={vendorFilter} disabled={vendorsQuery.isLoading} onChange={(event) => { setVendorFilter(event.target.value); setPage(1); }}><option value="">{vendorsQuery.isLoading ? 'Loading…' : 'All vendors'}</option>{(vendorsQuery.data ?? []).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.nameEn}</option>)}</Select></AdminField>
          <AdminField label="Shipment ID"><Input dir="ltr" maxLength={36} value={shipmentFilter} onChange={(event) => { setShipmentFilter(event.target.value); setPage(1); }} placeholder="Optional UUID" /></AdminField>
          <AdminField label="Branch ID"><Input dir="ltr" maxLength={36} value={branchFilter} onChange={(event) => { setBranchFilter(event.target.value); setPage(1); }} placeholder="Optional UUID" /></AdminField>
          <AdminField label="Currency"><Input dir="ltr" maxLength={3} value={currencyFilter} onChange={(event) => { setCurrencyFilter(event.target.value.toUpperCase()); setPage(1); }} placeholder="All currencies" /></AdminField>
          <AdminField label="Issue date from"><Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></AdminField>
          <AdminField label="Issue date to"><Input type="date" min={from || undefined} value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></AdminField>
          <label className="inline-flex items-end gap-2 pb-2 text-sm font-semibold text-steel-600"><input type="checkbox" className="h-4 w-4 rounded border-steel-300" checked={overdue} onChange={(event) => { setOverdue(event.target.checked); setPage(1); }} />Overdue only</label>
          <div className="flex items-end gap-2"><Button type="submit" variant="secondary">Search</Button><Button type="button" variant="ghost" onClick={clearFilters}>Clear</Button></div>
        </form>
        <div className="flex items-center justify-between gap-3 border-b border-steel-100 px-4 py-2 text-xs text-steel-500"><span aria-live="polite">{meta ? `${meta.total} bill${meta.total === 1 ? '' : 's'}` : 'Bills'}</span>{billsQuery.isFetching && !billsQuery.isLoading ? <Spinner label="Refreshing…" /> : null}</div>
        {billsQuery.isLoading ? <div className="p-8"><Spinner label="Loading bills…" /></div> : billsQuery.isError ? <div className="space-y-3 p-6" role="alert"><p className="text-sm font-semibold text-red-700">Bills could not be loaded.</p><p className="text-sm text-steel-500">{messageFor(billsQuery.error, 'Please try again.')}</p><Button variant="onlight" size="sm" onClick={() => void billsQuery.refetch()}>Retry</Button></div> : <Table><thead><tr><Th>Bill</Th><Th>Vendor</Th><Th>Dates</Th><Th>Total</Th><Th>Paid</Th><Th>Balance</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead><tbody>{!billsQuery.data?.rows.length ? <EmptyRow colSpan={8} message="No bills match these filters." /> : billsQuery.data.rows.map((item) => <tr key={item.id} className="hover:bg-steel-50/60"><Td><button type="button" onClick={() => openBill(item.id)} className="font-mono text-[0.8rem] font-bold text-brand-700 hover:underline">{item.number}</button><span className="mt-1 block text-xs text-steel-400">{item.vendorReference || 'No vendor reference'}</span><span className="mt-1 block text-xs text-steel-400">{item._count.lines} line{item._count.lines === 1 ? '' : 's'} · {item._count.allocations} allocation{item._count.allocations === 1 ? '' : 's'}</span></Td><Td><span className="font-semibold text-navy-800">{item.vendor.nameEn}</span><span className="mt-1 block text-xs text-steel-400">{item.vendor.code}</span></Td><Td className="whitespace-nowrap text-xs">Issued {formatDate(item.issueDate, 'en')}<span className="mt-1 block text-steel-400">Due {formatDate(item.dueDate, 'en')}</span></Td><Td className="whitespace-nowrap font-semibold text-navy-800">{amount(item.total, item.currency)}</Td><Td className="whitespace-nowrap">{amount(item.paidAmount, item.currency)}</Td><Td className="whitespace-nowrap font-semibold">{amount(item.balance, item.currency)}</Td><Td><StatusPill status={item.status} label={item.status} /></Td><Td><div className="flex flex-wrap gap-1"><Button type="button" variant="onlight" size="sm" icon={<Eye className="h-4 w-4" />} aria-label={`View bill ${item.number}`} onClick={() => openBill(item.id)}>View</Button>{item.status === 'DRAFT' ? <><Button type="button" variant="ghost" size="sm" icon={<Pencil className="h-4 w-4" />} aria-label={`Edit bill ${item.number}`} onClick={() => { openBill(item.id); setEditingId(item.id); }}>Edit</Button><Button type="button" variant="ghost" size="sm" disabled={deleteBill.isPending} icon={<Trash2 className="h-4 w-4" />} aria-label={`Delete bill ${item.number}`} onClick={() => { if (window.confirm(`Delete draft bill ${item.number}? This cannot be undone.`)) deleteBill.mutate(item.id); }}>Delete</Button></> : null}</div></Td></tr>)}</tbody></Table>}
      </Panel>

      {meta ? <nav aria-label="Bill pagination" className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs font-semibold text-steel-500">Page {meta.page} of {meta.pages}</span><div className="flex gap-2"><Button variant="onlight" size="sm" disabled={page <= 1 || billsQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button><Button variant="onlight" size="sm" disabled={page >= meta.pages || billsQuery.isFetching} onClick={() => setPage((current) => current + 1)}>Next</Button></div></nav> : null}

      {selectedId ? <Panel title={bill ? `${bill.number} · ${bill.vendor.nameEn}` : 'Bill detail'} actions={<Button variant="ghost" size="sm" disabled={mutateBill.isPending} icon={<X className="h-4 w-4" />} onClick={closeBill}>Close</Button>}>
        {billQuery.isLoading ? <div className="p-8"><Spinner label="Loading bill detail…" /></div> : billQuery.isError ? <div className="space-y-3 p-6" role="alert"><p className="text-sm font-semibold text-red-700">Bill detail could not be loaded.</p><p className="text-sm text-steel-500">{messageFor(billQuery.error, 'Please try again.')}</p><Button variant="onlight" size="sm" onClick={() => void billQuery.refetch()}>Retry</Button></div> : bill ? <div className="space-y-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><StatusPill status={bill.status} label={bill.status} /><span className="text-xs text-steel-400">Updated {formatDateTime(bill.updatedAt, 'en')}</span></div><div className="flex flex-wrap gap-2">{bill.status === 'DRAFT' ? <><Button variant="onlight" size="sm" disabled={pending} icon={<Pencil className="h-4 w-4" />} onClick={() => { setEditingId(bill.id); setAction(null); setFeedback(null); }}>Edit draft</Button><Button variant="ghost" size="sm" disabled={pending} icon={<Trash2 className="h-4 w-4" />} onClick={() => { if (window.confirm(`Delete draft bill ${bill.number}? This cannot be undone.`)) deleteBill.mutate(bill.id); }}>Delete draft</Button><Button variant="onlight" size="sm" disabled={pending} icon={<Send className="h-4 w-4" />} onClick={() => { setAction('issue'); setFeedback(null); }}>Issue</Button></> : null}{bill.status === 'ISSUED' && !bill.postedEntryId ? <Button size="sm" disabled={mutateBill.isPending} icon={<Check className="h-4 w-4" />} onClick={() => { setAction('post'); setFeedback(null); }}>Post</Button> : null}{bill.status !== 'VOID' ? <Button variant="ghost" size="sm" disabled={mutateBill.isPending} icon={<Ban className="h-4 w-4" />} onClick={() => { setAction('void'); setFeedback(null); }}>Void</Button> : null}</div></div>
          <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"><DetailItem label="Vendor">{bill.vendor.nameEn}</DetailItem><DetailItem label="Vendor reference">{bill.vendorReference}</DetailItem><DetailItem label="Currency / rate">{`${bill.currency} / ${bill.exchangeRate}`}</DetailItem><DetailItem label="Issue / due">{`${formatDate(bill.issueDate, 'en')} / ${formatDate(bill.dueDate, 'en')}`}</DetailItem><DetailItem label="Total">{amount(bill.total, bill.currency)}</DetailItem><DetailItem label="Paid">{amount(bill.paidAmount, bill.currency)}</DetailItem><DetailItem label="Balance">{amount(bill.balance, bill.currency)}</DetailItem><DetailItem label="Branch">{bill.branch ? `${bill.branch.code} · ${bill.branch.nameEn}` : bill.branchId}</DetailItem><DetailItem label="Booking">{bill.booking ? `${bill.booking.number} · ${bill.booking.id}` : bill.bookingId}</DetailItem><DetailItem label="Shipment">{bill.shipment ? `${bill.shipment.trackingNumber} · ${bill.shipment.id}` : bill.shipmentId}</DetailItem><DetailItem label="Customs file">{bill.customsFile ? `${bill.customsFile.number} · ${bill.customsFile.id}` : bill.customsFileId}</DetailItem><DetailItem label="Declaration">{bill.declaration ? `${bill.declaration.declarationNumber || bill.declaration.number} · ${bill.declaration.id}` : bill.declarationId}</DetailItem></dl>
          <section aria-labelledby="bill-lines-heading"><h3 id="bill-lines-heading" className="mb-3 text-sm font-bold text-navy-800">Lines and totals</h3><Table><thead><tr><Th>Description</Th><Th>Quantity</Th><Th>Unit price</Th><Th>Discount</Th><Th>Tax</Th><Th>Total</Th></tr></thead><tbody>{bill.lines.map((line) => <tr key={line.id}><Td className="min-w-[16rem]"><span className="font-semibold text-navy-800">{line.description}</span>{line.chargeItemId || line.taxCodeId ? <span className="mt-1 block break-all font-mono text-[0.65rem] text-steel-400">Charge: {line.chargeItemId || '—'} · Tax code: {line.taxCodeId || '—'}</span> : null}</Td><Td>{line.quantity}</Td><Td className="whitespace-nowrap">{amount(line.unitPrice, bill.currency)}</Td><Td className="whitespace-nowrap">{line.discountPercent}%<span className="block text-xs text-steel-400">{amount(line.discount, bill.currency)}</span></Td><Td className="whitespace-nowrap">{line.taxPercent}%<span className="block text-xs text-steel-400">{amount(line.taxAmount, bill.currency)}</span></Td><Td className="whitespace-nowrap font-semibold text-navy-800">{amount(line.total, bill.currency)}</Td></tr>)}</tbody></Table><dl className="mt-3 grid gap-3 rounded-xl bg-steel-50 p-4 text-sm sm:grid-cols-4"><div><dt className="text-xs text-steel-500">Subtotal after discount</dt><dd className="mt-1 font-semibold">{amount(bill.subtotal, bill.currency)}</dd></div><div><dt className="text-xs text-steel-500">Discount</dt><dd className="mt-1 font-semibold">{amount(bill.discount, bill.currency)}</dd></div><div><dt className="text-xs text-steel-500">Tax</dt><dd className="mt-1 font-semibold">{amount(bill.taxAmount, bill.currency)}</dd></div><div><dt className="text-xs text-steel-500">Total</dt><dd className="mt-1 font-bold text-navy-800">{amount(bill.total, bill.currency)}</dd></div></dl></section>
          <section aria-labelledby="bill-allocations-heading"><h3 id="bill-allocations-heading" className="mb-3 text-sm font-bold text-navy-800">Payment allocations</h3>{!bill.allocations.length ? <p className="rounded-xl border border-dashed border-steel-200 p-5 text-sm text-steel-500">No payment allocations.</p> : <Table><thead><tr><Th>Payment</Th><Th>Direction</Th><Th>Date</Th><Th>Status</Th><Th>Allocated</Th></tr></thead><tbody>{bill.allocations.map((allocation) => <tr key={allocation.id}><Td><span className="font-mono font-bold text-brand-700">{allocation.payment.number}</span><span className="mt-1 block break-all text-[0.65rem] text-steel-400">{allocation.payment.id}</span></Td><Td>{allocation.payment.direction}</Td><Td className="whitespace-nowrap">{formatDate(allocation.payment.paymentDate, 'en')}</Td><Td><StatusPill status={allocation.payment.status} label={allocation.payment.status} /></Td><Td className="whitespace-nowrap font-semibold">{amount(allocation.amount, bill.currency)}</Td></tr>)}</tbody></Table>}</section>
          {bill.postedEntry ? <JournalLinkage entry={bill.postedEntry} currency={bill.currency} /> : <p className="rounded-xl border border-dashed border-steel-200 p-5 text-sm text-steel-500">No posted journal entry. Issue and post this bill to create the ledger entry.</p>}
          {bill.notes ? <section><h3 className="mb-2 text-sm font-bold text-navy-800">Notes</h3><p className="whitespace-pre-line text-sm text-steel-600">{bill.notes}</p></section> : null}
        </div> : null}
      </Panel> : null}

      {selectedId && bill && action ? <BillActionDialog key={`${bill.id}-${action}`} bill={bill} kind={action} pending={mutateBill.isPending} onClose={() => setAction(null)} onSubmit={(body, headers) => mutateBill.mutate({ id: bill.id, kind: action, body, headers })} /> : null}
    </AdminPage>
  );
}
