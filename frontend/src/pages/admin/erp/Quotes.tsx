import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Clock3, Eye, Pencil, Plus, Search, Send, Trash2, X, XCircle } from 'lucide-react';
import { api, ApiError } from '../../../lib/api';
import { AdminField, AdminPage, EmptyRow, Panel, Table, Td, Th } from '../../../components/admin/ui';
import { Button } from '../../../components/ui/Button';
import { Input, Select, Textarea } from '../../../components/ui/Field';
import { Spinner } from '../../../components/ui/Spinner';
import { StatusPill } from '../../../components/ui/StatusPill';
import { formatDate, formatDateTime } from '../../../lib/utils';

type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED';
type FreightMode = 'SEA' | 'AIR' | 'ROAD' | 'RAIL' | 'MULTIMODAL';

interface CustomerSummary {
  id: string;
  nameEn: string;
  nameAr: string | null;
  email: string | null;
  phone: string | null;
  currency: string;
}

interface CustomerOption extends CustomerSummary {
  code: string;
  status: 'ACTIVE' | 'INACTIVE';
}

interface QuoteLine {
  id: string;
  position: number;
  chargeItemId: string | null;
  descriptionEn: string;
  descriptionAr: string | null;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxCodeId: string | null;
  taxPercent: string;
  subtotal: string;
  discount: string;
  taxAmount: string;
  total: string;
}

interface SourceQuoteRequest {
  id: string;
  freightMode: FreightMode;
  originCity: string;
  originCountry: string;
  destinationCity: string;
  destinationCountry: string;
  incoterms: string | null;
  expectedShipDate: string | null;
  additionalNotes: string | null;
}

interface Quote {
  id: string;
  number: string;
  customerId: string;
  branchId: string | null;
  status: QuoteStatus;
  currency: string;
  exchangeRate: string;
  validUntil: string | null;
  notes: string | null;
  terms: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer: CustomerSummary;
  branch: { id: string; code: string; nameEn: string } | null;
  sourceQuoteRequest: SourceQuoteRequest | null;
  lines: QuoteLine[];
  totals: { subtotal: string; discount: string; taxAmount: string; total: string };
}

interface BookingRecord {
  id: string;
  number: string;
  customerId: string;
  status: 'CONFIRMED' | 'OPERATIONAL' | 'COMPLETED' | 'CANCELLED';
  mode: FreightMode;
  origin: string;
  destination: string;
  customer: CustomerSummary;
  quote: { id: string; number: string; status: QuoteStatus } | null;
}

interface QuoteLineForm {
  key: string;
  chargeItemId: string | null;
  taxCodeId: string | null;
  descriptionEn: string;
  descriptionAr: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxPercent: string;
}

interface QuoteForm {
  customerId: string;
  currency: string;
  exchangeRate: string;
  validUntil: string;
  notes: string;
  terms: string;
  lines: QuoteLineForm[];
}

interface QuotePayload {
  customerId: string;
  currency: string;
  exchangeRate: string;
  validUntil: string | null;
  notes: string | null;
  terms: string | null;
  lines: Array<{
    chargeItemId: string | null;
    descriptionEn: string;
    descriptionAr: string | null;
    quantity: string;
    unitPrice: string;
    discountPercent: string;
    taxCodeId: string | null;
    taxPercent: string;
  }>;
}

interface ConversionForm {
  mode: FreightMode;
  origin: string;
  destination: string;
  carrier: string;
  vesselOrFlight: string;
  incoterms: string;
  etd: string;
  eta: string;
  notes: string;
}

interface ConversionPayload {
  mode: FreightMode;
  origin: string;
  destination: string;
  carrier: string | null;
  vesselOrFlight: string | null;
  incoterms: string | null;
  etd: string | null;
  eta: string | null;
  notes: string | null;
}

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const quoteStatuses: QuoteStatus[] = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED'];
const freightModes: FreightMode[] = ['SEA', 'AIR', 'ROAD', 'RAIL', 'MULTIMODAL'];
const pageSize = 10;

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isPastValidUntil(quote: Quote): boolean {
  return quote.status !== 'EXPIRED' && quote.validUntil !== null && new Date(quote.validUntil).getTime() < Date.now();
}

function emptyLine(): QuoteLineForm {
  return {
    key: crypto.randomUUID(),
    chargeItemId: null,
    taxCodeId: null,
    descriptionEn: '',
    descriptionAr: '',
    quantity: '1',
    unitPrice: '0',
    discountPercent: '0',
    taxPercent: '0',
  };
}

function emptyQuoteForm(): QuoteForm {
  return { customerId: '', currency: 'EGP', exchangeRate: '1', validUntil: '', notes: '', terms: '', lines: [emptyLine()] };
}

function quoteToForm(quote: Quote): QuoteForm {
  return {
    customerId: quote.customerId,
    currency: quote.currency,
    exchangeRate: quote.exchangeRate,
    validUntil: quote.validUntil?.slice(0, 10) ?? '',
    notes: quote.notes ?? '',
    terms: quote.terms ?? '',
    lines: quote.lines.map((line) => ({
      key: line.id,
      chargeItemId: line.chargeItemId,
      taxCodeId: line.taxCodeId,
      descriptionEn: line.descriptionEn,
      descriptionAr: line.descriptionAr ?? '',
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      taxPercent: line.taxPercent,
    })),
  };
}

function quotePayload(form: QuoteForm): QuotePayload {
  return {
    customerId: form.customerId,
    currency: form.currency.trim().toUpperCase(),
    exchangeRate: form.exchangeRate.trim(),
    validUntil: form.validUntil ? new Date(`${form.validUntil}T00:00:00.000Z`).toISOString() : null,
    notes: nullable(form.notes),
    terms: nullable(form.terms),
    lines: form.lines.map((line) => ({
      chargeItemId: line.chargeItemId,
      descriptionEn: line.descriptionEn.trim(),
      descriptionAr: nullable(line.descriptionAr),
      quantity: line.quantity.trim(),
      unitPrice: line.unitPrice.trim(),
      discountPercent: line.discountPercent.trim() || '0',
      taxCodeId: line.taxCodeId,
      taxPercent: line.taxPercent.trim() || '0',
    })),
  };
}

function validateQuoteForm(form: QuoteForm): string | null {
  if (!form.customerId) return 'Select a customer.';
  if (!/^[A-Z]{3}$/i.test(form.currency.trim())) return 'Currency must be a three-letter code.';
  const exchangeRate = Number(form.exchangeRate);
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0 || exchangeRate > 9999999999) return 'Enter a valid exchange rate greater than zero.';
  if (!form.lines.length) return 'Add at least one quote line.';
  for (const [index, line] of form.lines.entries()) {
    if (!line.descriptionEn.trim()) return `Enter a description for line ${index + 1}.`;
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    const discount = Number(line.discountPercent);
    const tax = Number(line.taxPercent);
    if (!Number.isFinite(quantity) || quantity < 0.001 || quantity > 999999999999999) return `Enter a valid quantity for line ${index + 1}.`;
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 9999999999999999) return `Enter a valid unit price for line ${index + 1}.`;
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) return `Discount for line ${index + 1} must be between 0 and 100.`;
    if (!Number.isFinite(tax) || tax < 0 || tax > 100) return `Tax for line ${index + 1} must be between 0 and 100.`;
  }
  return null;
}

function roundMoney(value: number, currency: string): number {
  const scale = ['KWD', 'BHD', 'OMR'].includes(currency.toUpperCase()) ? 3 : 2;
  const factor = 10 ** scale;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function estimateLine(line: QuoteLineForm, currency: string) {
  const quantity = Number(line.quantity) || 0;
  const unitPrice = Number(line.unitPrice) || 0;
  const discountPercent = Number(line.discountPercent) || 0;
  const taxPercent = Number(line.taxPercent) || 0;
  const gross = roundMoney(quantity * unitPrice, currency);
  const discount = roundMoney(gross * discountPercent / 100, currency);
  const subtotal = roundMoney(gross - discount, currency);
  const taxAmount = roundMoney(subtotal * taxPercent / 100, currency);
  return { subtotal, discount, taxAmount, total: roundMoney(subtotal + taxAmount, currency) };
}

function formatMoney(value: string | number | null | undefined, currency: string): string {
  if (value === null || value === undefined || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  const fractionDigits = ['KWD', 'BHD', 'OMR'].includes(currency.toUpperCase()) ? 3 : 2;
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(amount);
}

function messageFor(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const details = error.details ? Object.values(error.details).flat().filter(Boolean) : [];
  return [error.message, ...details].join(' ');
}

function routeLabel(city: string, country: string): string {
  return [city, country].filter(Boolean).join(', ');
}

function initialConversionForm(quote: Quote): ConversionForm {
  const source = quote.sourceQuoteRequest;
  return {
    mode: source?.freightMode ?? 'SEA',
    origin: source ? routeLabel(source.originCity, source.originCountry) : '',
    destination: source ? routeLabel(source.destinationCity, source.destinationCountry) : '',
    carrier: '',
    vesselOrFlight: '',
    incoterms: source?.incoterms ?? '',
    etd: source?.expectedShipDate?.slice(0, 10) ?? '',
    eta: '',
    notes: quote.notes ?? source?.additionalNotes ?? '',
  };
}

function conversionPayload(form: ConversionForm): ConversionPayload {
  return {
    mode: form.mode,
    origin: form.origin.trim(),
    destination: form.destination.trim(),
    carrier: nullable(form.carrier),
    vesselOrFlight: nullable(form.vesselOrFlight),
    incoterms: nullable(form.incoterms),
    etd: form.etd ? new Date(`${form.etd}T00:00:00.000Z`).toISOString() : null,
    eta: form.eta ? new Date(`${form.eta}T00:00:00.000Z`).toISOString() : null,
    notes: nullable(form.notes),
  };
}

async function fetchCustomerOptions(): Promise<CustomerOption[]> {
  const customers: CustomerOption[] = [];
  for (const type of ['CUSTOMER', 'BOTH']) {
    let page = 1;
    let pages = 1;
    do {
      const params = new URLSearchParams({ type, page: String(page), limit: '100' });
      const response = await api.get<CustomerOption[]>(`/erp/partners?${params.toString()}`);
      customers.push(...response.data);
      pages = Number((response.meta as unknown as PaginationMeta | undefined)?.pages ?? 1);
      page += 1;
    } while (page <= pages);
  }
  const unique = new Map(customers.map((customer) => [customer.id, customer]));
  return [...unique.values()].sort((a, b) => a.nameEn.localeCompare(b.nameEn));
}

function useCustomerOptions() {
  return useQuery({ queryKey: ['erp', 'partners', 'customer-options'], queryFn: fetchCustomerOptions, staleTime: 30000 });
}

function QuoteEditor({
  initial,
  customers,
  customersLoading,
  pending,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial?: Quote;
  customers: CustomerOption[];
  customersLoading: boolean;
  pending: boolean;
  submitLabel: string;
  onCancel?: () => void;
  onSubmit: (body: QuotePayload) => void;
}) {
  const [form, setForm] = useState<QuoteForm>(() => initial ? quoteToForm(initial) : emptyQuoteForm());
  const [formError, setFormError] = useState<string | null>(null);
  const linesHeadingId = useId();
  const estimates = form.lines.map((line) => estimateLine(line, form.currency));
  const totals = estimates.reduce((sum, line) => ({
    subtotal: roundMoney(sum.subtotal + line.subtotal, form.currency),
    discount: roundMoney(sum.discount + line.discount, form.currency),
    taxAmount: roundMoney(sum.taxAmount + line.taxAmount, form.currency),
    total: roundMoney(sum.total + line.total, form.currency),
  }), { subtotal: 0, discount: 0, taxAmount: 0, total: 0 });

  const updateLine = (index: number, patch: Partial<QuoteLineForm>) => {
    setForm((current) => ({ ...current, lines: current.lines.map((line, position) => position === index ? { ...line, ...patch } : line) }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateQuoteForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    onSubmit(quotePayload(form));
  };

  return (
    <form onSubmit={submit}>
      {formError ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{formError}</p> : null}
      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <AdminField label="Customer *" className="sm:col-span-2">
          <Select required value={form.customerId} disabled={customersLoading || !customers.length} onChange={(event) => {
            const customer = customers.find((item) => item.id === event.target.value);
            setForm((current) => ({ ...current, customerId: event.target.value, currency: customer?.currency ?? current.currency }));
          }}>
            <option value="">{customersLoading ? 'Loading customers…' : 'Select a customer'}</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.nameEn} ({customer.code}){customer.status === 'INACTIVE' ? ' — inactive' : ''}</option>)}
          </Select>
          {!customersLoading && !customers.length ? <span className="mt-1 block text-xs text-steel-500">No customers found. Create a CUSTOMER or BOTH partner first.</span> : null}
        </AdminField>
        <AdminField label="Currency *">
          <Input required dir="ltr" maxLength={3} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} />
        </AdminField>
        <AdminField label="Exchange rate *">
          <Input required dir="ltr" type="number" min="0.00000001" max="9999999999" step="0.00000001" value={form.exchangeRate} onChange={(event) => setForm({ ...form, exchangeRate: event.target.value })} />
        </AdminField>
        <AdminField label="Valid until">
          <Input type="date" value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} />
        </AdminField>
        <AdminField label="Notes" className="sm:col-span-2 lg:col-span-3">
          <Textarea rows={2} maxLength={4000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </AdminField>
        <AdminField label="Terms" className="sm:col-span-2 lg:col-span-4">
          <Textarea rows={2} maxLength={8000} value={form.terms} onChange={(event) => setForm({ ...form, terms: event.target.value })} />
        </AdminField>
      </div>

      <section aria-labelledby={linesHeadingId} className="border-t border-steel-200">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h3 id={linesHeadingId} className="text-sm font-bold text-navy-800">Quote lines</h3>
            <p className="text-xs text-steel-500">Discount and tax are percentages. The server calculates final totals.</p>
          </div>
          <Button type="button" variant="onlight" size="sm" disabled={pending || form.lines.length >= 200} icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ ...form, lines: [...form.lines, emptyLine()] })}>Add line</Button>
        </div>
        <Table>
          <thead><tr><Th>Description</Th><Th>Quantity</Th><Th>Unit price</Th><Th>Discount %</Th><Th>Tax %</Th><Th>Estimated total</Th><Th><span className="sr-only">Remove</span></Th></tr></thead>
          <tbody>
            {form.lines.map((line, index) => (
              <tr key={line.key}>
                <Td className="min-w-[18rem]">
                  <Input required dir="ltr" aria-label={`Line ${index + 1} description in English`} maxLength={500} value={line.descriptionEn} onChange={(event) => updateLine(index, { descriptionEn: event.target.value })} placeholder="Description in English" />
                  <Input dir="rtl" aria-label={`Line ${index + 1} description in Arabic`} maxLength={500} value={line.descriptionAr} onChange={(event) => updateLine(index, { descriptionAr: event.target.value })} placeholder="الوصف بالعربية (optional)" className="mt-2" />
                </Td>
                <Td><Input required dir="ltr" aria-label={`Line ${index + 1} quantity`} type="number" min="0.001" max="999999999999999" step="0.001" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} className="min-w-[7rem]" /></Td>
                <Td><Input required dir="ltr" aria-label={`Line ${index + 1} unit price`} type="number" min="0" max="9999999999999999" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} className="min-w-[8rem]" /></Td>
                <Td><Input required dir="ltr" aria-label={`Line ${index + 1} discount percentage`} type="number" min="0" max="100" step="0.0001" value={line.discountPercent} onChange={(event) => updateLine(index, { discountPercent: event.target.value })} className="min-w-[6.5rem]" /></Td>
                <Td><Input required dir="ltr" aria-label={`Line ${index + 1} tax percentage`} type="number" min="0" max="100" step="0.0001" value={line.taxPercent} onChange={(event) => updateLine(index, { taxPercent: event.target.value })} className="min-w-[6.5rem]" /></Td>
                <Td className="whitespace-nowrap font-semibold text-navy-800">{formatMoney(estimates[index]?.total, form.currency)}</Td>
                <Td><Button type="button" variant="ghost" size="sm" disabled={pending || form.lines.length === 1} aria-label={`Remove line ${index + 1}`} icon={<Trash2 className="h-4 w-4" />} onClick={() => setForm((current) => ({ ...current, lines: current.lines.filter((_, position) => position !== index) }))}>Remove</Button></Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <dl className="grid gap-3 border-t border-steel-200 bg-steel-50/60 px-5 py-4 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-steel-500">Subtotal after discount</dt><dd className="mt-1 font-semibold text-navy-800">{formatMoney(totals.subtotal, form.currency)}</dd></div>
          <div><dt className="text-xs text-steel-500">Discount</dt><dd className="mt-1 font-semibold text-navy-800">{formatMoney(totals.discount, form.currency)}</dd></div>
          <div><dt className="text-xs text-steel-500">Tax</dt><dd className="mt-1 font-semibold text-navy-800">{formatMoney(totals.taxAmount, form.currency)}</dd></div>
          <div><dt className="text-xs text-steel-500">Estimated total</dt><dd className="mt-1 font-bold text-navy-800">{formatMoney(totals.total, form.currency)}</dd></div>
        </dl>
      </section>
      <div className="flex justify-end gap-2 border-t border-steel-200 px-5 py-4">
        {onCancel ? <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>Cancel</Button> : null}
        <Button type="submit" disabled={pending || customersLoading || !customers.length}>{pending ? 'Saving…' : submitLabel}</Button>
      </div>
    </form>
  );
}

function QuoteDetailItem({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-steel-400">{label}</dt><dd className="mt-1 whitespace-pre-line text-sm text-steel-700">{children || '—'}</dd></div>;
}

export default function Quotes() {
  const queryClient = useQueryClient();
  const conversionKey = useRef('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<QuoteStatus | ''>('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [conversionForm, setConversionForm] = useState<ConversionForm | null>(null);
  const [conversionResult, setConversionResult] = useState<{ booking: BookingRecord; quote: Quote } | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const customersQuery = useCustomerOptions();

  const quotesQuery = useQuery({
    queryKey: ['erp', 'quotes', 'list', search, status, customerFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (customerFilter) params.set('customerId', customerFilter);
      const response = await api.get<Quote[]>(`/erp/quotes?${params.toString()}`);
      return { rows: response.data, meta: response.meta as unknown as PaginationMeta };
    },
    placeholderData: keepPreviousData,
  });

  const quoteQuery = useQuery({
    queryKey: ['erp', 'quotes', 'detail', selectedId],
    queryFn: async () => (await api.get<Quote>(`/erp/quotes/${selectedId}`)).data,
    enabled: selectedId !== null,
  });

  const createQuote = useMutation({
    mutationFn: (body: QuotePayload) => api.post<Quote>('/erp/quotes', body),
    onSuccess: async (response) => {
      setFeedback({ kind: 'success', text: `Quote ${response.data.number} created as DRAFT.` });
      setShowCreate(false);
      setSelectedId(response.data.id);
      setEditing(false);
      setConversionResult(null);
      await queryClient.invalidateQueries({ queryKey: ['erp', 'quotes'] });
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not create the quote.') }),
  });

  const updateQuote = useMutation({
    mutationFn: ({ id, body }: { id: string; body: QuotePayload }) => api.patch<Quote>(`/erp/quotes/${id}`, body),
    onSuccess: async (response) => {
      setFeedback({ kind: 'success', text: `Quote ${response.data.number} updated.` });
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ['erp', 'quotes'] });
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not update the quote. Only draft quotes can be edited.') }),
  });

  const deleteQuote = useMutation({
    mutationFn: (id: string) => api.delete<{ id: string; number: string; deleted: boolean }>(`/erp/quotes/${id}`),
    onSuccess: async (response) => {
      setFeedback({ kind: 'success', text: `Draft quote ${response.data.number} deleted.` });
      closeQuote();
      await queryClient.invalidateQueries({ queryKey: ['erp', 'quotes'] });
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not delete the draft quote.') }),
  });

  const sendQuote = useMutation({
    mutationFn: (id: string) => api.post<Quote>(`/erp/quotes/${id}/send`),
    onSuccess: async (response) => {
      setFeedback({ kind: 'success', text: `Quote ${response.data.number} marked as sent.` });
      await queryClient.invalidateQueries({ queryKey: ['erp', 'quotes'] });
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not send the quote.') }),
  });

  const rejectQuote = useMutation({
    mutationFn: (id: string) => api.post<Quote>(`/erp/quotes/${id}/reject`),
    onSuccess: async (response) => {
      setFeedback({ kind: 'success', text: `Quote ${response.data.number} rejected.` });
      await queryClient.invalidateQueries({ queryKey: ['erp', 'quotes'] });
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not reject the quote.') }),
  });

  const expireQuote = useMutation({
    mutationFn: (id: string) => api.post<Quote>(`/erp/quotes/${id}/expire`),
    onSuccess: async (response) => {
      setFeedback({ kind: 'success', text: `Quote ${response.data.number} expired.` });
      await queryClient.invalidateQueries({ queryKey: ['erp', 'quotes'] });
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not expire the quote.') }),
  });

  const acceptQuote = useMutation({
    mutationFn: (id: string) => api.post<Quote>(`/erp/quotes/${id}/accept`),
    onSuccess: async (response) => {
      setFeedback({ kind: 'success', text: `Quote ${response.data.number} accepted. It can now be converted to a booking.` });
      await queryClient.invalidateQueries({ queryKey: ['erp', 'quotes'] });
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not accept the quote.') }),
  });

  const convertQuote = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ConversionPayload }) => api.post<{ booking: BookingRecord; quote: Quote }>(`/erp/quotes/${id}/convert`, body, { 'Idempotency-Key': conversionKey.current }),
    onSuccess: async (response) => {
      setConversionResult(response.data);
      setConversionForm(null);
      conversionKey.current = '';
      setFeedback({ kind: 'success', text: `Booking ${response.data.booking.number} created from quote ${response.data.quote.number}.` });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['erp', 'quotes'] }),
        queryClient.invalidateQueries({ queryKey: ['erp', 'bookings'] }),
      ]);
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not convert the quote. The same idempotency key will be used if you retry.') }),
  });

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatus('');
    setCustomerFilter('');
    setPage(1);
  };

  const openQuote = (id: string) => {
    setSelectedId(id);
    setEditing(false);
    setConversionForm(null);
    setConversionResult(null);
    conversionKey.current = '';
  };

  const closeQuote = () => {
    setSelectedId(null);
    setEditing(false);
    setConversionForm(null);
    setConversionResult(null);
    conversionKey.current = '';
  };

  const startConversion = (quote: Quote) => {
    setConversionForm(initialConversionForm(quote));
    conversionKey.current = crypto.randomUUID();
    setFeedback(null);
  };

  const submitConversion = (event: FormEvent) => {
    event.preventDefault();
    if (!conversionForm || !selectedId) return;
    if (!conversionForm.origin.trim() || !conversionForm.destination.trim()) {
      setFeedback({ kind: 'error', text: 'Origin and destination are required for conversion.' });
      return;
    }
    convertQuote.mutate({ id: selectedId, body: conversionPayload(conversionForm) });
  };

  const meta = quotesQuery.data?.meta;
  const quote = quoteQuery.data;
  const lifecyclePending = sendQuote.isPending || rejectQuote.isPending || expireQuote.isPending || acceptQuote.isPending || convertQuote.isPending;
  const quoteExpired = quote ? isPastValidUntil(quote) : false;

  return (
    <AdminPage
      title="Commercial quotes"
      description="Build quotations, approve eligible offers and convert accepted quotes into bookings."
      actions={<Button variant="onlight" disabled={createQuote.isPending || updateQuote.isPending || deleteQuote.isPending || lifecyclePending} icon={<Plus className="h-4 w-4" />} onClick={() => { setShowCreate((value) => !value); setFeedback(null); }}>{showCreate ? 'Close form' : 'New quote'}</Button>}
    >
      {feedback ? (
        <div role={feedback.kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${feedback.kind === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-brand-200 bg-brand-50 text-brand-800'}`}>
          {feedback.text}
        </div>
      ) : null}

      {showCreate ? (
        <Panel title="Create quote">
          {customersQuery.isError ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">Customers could not be loaded. {messageFor(customersQuery.error, 'Please retry.')} <button type="button" className="font-bold underline" onClick={() => void customersQuery.refetch()}>Retry</button></p> : null}
          <QuoteEditor customers={customersQuery.data ?? []} customersLoading={customersQuery.isLoading} pending={createQuote.isPending} submitLabel="Create quote" onCancel={() => setShowCreate(false)} onSubmit={(body) => createQuote.mutate(body)} />
        </Panel>
      ) : null}

      <Panel>
        <form role="search" onSubmit={submitSearch} className="grid gap-3 border-b border-steel-200 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,1fr)_11rem_13rem_auto]">
          <AdminField label="Search quotes">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-400" aria-hidden="true" />
              <Input dir="ltr" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="ps-9" placeholder="Number, customer or line description" />
            </div>
          </AdminField>
          <AdminField label="Status">
            <Select value={status} onChange={(event) => { setStatus(event.target.value as QuoteStatus | ''); setPage(1); }}>
              <option value="">All statuses</option>
              {quoteStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
          </AdminField>
          <AdminField label="Customer">
            <Select value={customerFilter} disabled={customersQuery.isLoading} onChange={(event) => { setCustomerFilter(event.target.value); setPage(1); }}>
              <option value="">{customersQuery.isLoading ? 'Loading customers…' : 'All customers'}</option>
              {(customersQuery.data ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.nameEn}</option>)}
            </Select>
          </AdminField>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="secondary">Search</Button>
            <Button type="button" variant="ghost" onClick={clearFilters}>Clear</Button>
          </div>
        </form>
        <div className="flex items-center justify-between gap-3 border-b border-steel-100 px-4 py-2 text-xs text-steel-500">
          <span aria-live="polite">{meta ? `${meta.total} quote${meta.total === 1 ? '' : 's'}` : 'Quotes'}</span>
          {quotesQuery.isFetching && !quotesQuery.isLoading ? <Spinner label="Refreshing…" /> : null}
        </div>
        {quotesQuery.isLoading ? (
          <div className="p-8"><Spinner label="Loading quotes…" /></div>
        ) : quotesQuery.isError ? (
          <div className="space-y-3 p-6" role="alert">
            <p className="text-sm font-semibold text-red-700">Quotes could not be loaded.</p>
            <p className="text-sm text-steel-500">{messageFor(quotesQuery.error, 'Please try again.')}</p>
            <Button variant="onlight" size="sm" onClick={() => void quotesQuery.refetch()}>Retry</Button>
          </div>
        ) : (
          <Table>
            <thead><tr><Th>Quote</Th><Th>Customer</Th><Th>Total</Th><Th>Valid until</Th><Th>Created</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {!quotesQuery.data?.rows.length ? <EmptyRow colSpan={7} message="No quotes match these filters." /> : quotesQuery.data.rows.map((item) => (
                <tr key={item.id} className="hover:bg-steel-50/60">
                  <Td>
                    <button type="button" onClick={() => openQuote(item.id)} className="font-mono text-[0.8rem] font-bold text-brand-700 hover:underline">{item.number}</button>
                    <span className="mt-1 block max-w-[18rem] truncate text-xs text-steel-500">{item.lines[0]?.descriptionEn ?? 'No lines'}{item.lines.length > 1 ? ` +${item.lines.length - 1} more` : ''}</span>
                  </Td>
                  <Td>
                    <span className="font-semibold text-navy-800">{item.customer.nameEn}</span>
                  </Td>
                  <Td className="whitespace-nowrap font-semibold text-navy-800">{formatMoney(item.totals.total, item.currency)}</Td>
                  <Td className="whitespace-nowrap">{formatDate(item.validUntil, 'en')}</Td>
                  <Td className="whitespace-nowrap text-xs text-steel-500">{formatDate(item.createdAt, 'en')}</Td>
                  <Td><StatusPill status={item.status} label={item.status} /></Td>
                  <Td><Button type="button" variant="onlight" size="sm" icon={<Eye className="h-4 w-4" />} aria-label={`View quote ${item.number}`} onClick={() => openQuote(item.id)}>View</Button></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      {meta ? (
        <nav aria-label="Quote pagination" className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-semibold text-steel-500">Page {meta.page} of {meta.pages}</span>
          <div className="flex gap-2">
            <Button variant="onlight" size="sm" disabled={page <= 1 || quotesQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
            <Button variant="onlight" size="sm" disabled={page >= meta.pages || quotesQuery.isFetching} onClick={() => setPage((current) => current + 1)}>Next</Button>
          </div>
        </nav>
      ) : null}

      {selectedId ? (
        <Panel
          title={quote ? `${quote.number} · ${quote.customer.nameEn}` : 'Quote detail'}
          actions={<Button variant="ghost" size="sm" disabled={updateQuote.isPending || deleteQuote.isPending || lifecyclePending} icon={<X className="h-4 w-4" />} onClick={closeQuote}>Close</Button>}
        >
          {quoteQuery.isLoading ? (
            <div className="p-8"><Spinner label="Loading quote detail…" /></div>
          ) : quoteQuery.isError ? (
            <div className="space-y-3 p-6" role="alert">
              <p className="text-sm font-semibold text-red-700">Quote detail could not be loaded.</p>
              <p className="text-sm text-steel-500">{messageFor(quoteQuery.error, 'Please try again.')}</p>
              <Button variant="onlight" size="sm" onClick={() => void quoteQuery.refetch()}>Retry</Button>
            </div>
          ) : quote && editing ? (
            <QuoteEditor key={quote.id} initial={quote} customers={customersQuery.data ?? []} customersLoading={customersQuery.isLoading} pending={updateQuote.isPending} submitLabel="Save quote" onCancel={() => setEditing(false)} onSubmit={(body) => updateQuote.mutate({ id: quote.id, body })} />
          ) : quote ? (
            <div className="space-y-6 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={quote.status} label={quote.status} />
                  <span className="text-xs text-steel-400">Updated {formatDateTime(quote.updatedAt, 'en')}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {quote.status === 'DRAFT' ? <Button variant="onlight" size="sm" icon={<Pencil className="h-4 w-4" />} disabled={lifecyclePending} onClick={() => setEditing(true)}>Edit quote</Button> : null}
                  {quote.status === 'DRAFT' ? <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} disabled={deleteQuote.isPending || lifecyclePending} onClick={() => { if (window.confirm(`Permanently delete draft quote ${quote.number}?`)) deleteQuote.mutate(quote.id); }}>Delete draft</Button> : null}
                  {quote.status === 'DRAFT' ? <Button variant="onlight" size="sm" icon={<Send className="h-4 w-4" />} disabled={lifecyclePending || quoteExpired} title={quoteExpired ? 'Extend the validity date before sending' : undefined} onClick={() => sendQuote.mutate(quote.id)}>{sendQuote.isPending ? 'Sending…' : 'Send quote'}</Button> : null}
                  {quote.status === 'DRAFT' || quote.status === 'SENT' ? <Button variant="ghost" size="sm" icon={<XCircle className="h-4 w-4" />} disabled={lifecyclePending} onClick={() => { if (window.confirm(`Reject quote ${quote.number}? This cannot be undone.`)) rejectQuote.mutate(quote.id); }}>{rejectQuote.isPending ? 'Rejecting…' : 'Reject'}</Button> : null}
                  {quote.status === 'DRAFT' || quote.status === 'SENT' ? <Button variant="ghost" size="sm" icon={<Clock3 className="h-4 w-4" />} disabled={lifecyclePending} onClick={() => { if (window.confirm(`Mark quote ${quote.number} as expired?`)) expireQuote.mutate(quote.id); }}>{expireQuote.isPending ? 'Expiring…' : 'Expire'}</Button> : null}
                  {quote.status === 'DRAFT' || quote.status === 'SENT' ? <Button size="sm" icon={<Check className="h-4 w-4" />} disabled={lifecyclePending || quoteExpired} title={quoteExpired ? 'This quote is past its validity date' : undefined} onClick={() => acceptQuote.mutate(quote.id)}>{acceptQuote.isPending ? 'Accepting…' : 'Accept quote'}</Button> : null}
                  {quote.status === 'ACCEPTED' ? <Button size="sm" icon={<ArrowRight className="h-4 w-4" />} disabled={lifecyclePending} onClick={() => startConversion(quote)}>Convert to booking</Button> : null}
                </div>
              </div>

              {quoteExpired ? <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{quote.status === 'DRAFT' ? 'The validity date has passed. Extend it before sending or accepting, or mark this quote as expired.' : 'The validity date has passed. This quote can no longer be accepted; mark it as expired.'}</p> : null}

              <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <QuoteDetailItem label="Customer">{quote.customer.nameEn}</QuoteDetailItem>
                <QuoteDetailItem label="Customer ID">{quote.customerId}</QuoteDetailItem>
                <QuoteDetailItem label="Email">{quote.customer.email}</QuoteDetailItem>
                <QuoteDetailItem label="Phone">{quote.customer.phone}</QuoteDetailItem>
                <QuoteDetailItem label="Currency">{quote.currency}</QuoteDetailItem>
                <QuoteDetailItem label="Exchange rate">{quote.exchangeRate}</QuoteDetailItem>
                <QuoteDetailItem label="Valid until">{formatDate(quote.validUntil, 'en')}</QuoteDetailItem>
                <QuoteDetailItem label="Branch">{quote.branch ? `${quote.branch.code} · ${quote.branch.nameEn}` : null}</QuoteDetailItem>
                <QuoteDetailItem label="Created">{formatDateTime(quote.createdAt, 'en')}</QuoteDetailItem>
                <QuoteDetailItem label="Sent">{quote.sentAt ? formatDateTime(quote.sentAt, 'en') : null}</QuoteDetailItem>
                <QuoteDetailItem label="Accepted">{quote.acceptedAt ? formatDateTime(quote.acceptedAt, 'en') : null}</QuoteDetailItem>
                <QuoteDetailItem label="Converted">{quote.convertedAt ? formatDateTime(quote.convertedAt, 'en') : null}</QuoteDetailItem>
              </dl>

              {quote.sourceQuoteRequest ? (
                <section className="rounded-xl border border-ocean-200 bg-ocean-50/40 p-4" aria-labelledby="quote-source-heading">
                  <h3 id="quote-source-heading" className="text-sm font-bold text-navy-800">Source quote request</h3>
                  <p className="mt-1 text-sm text-steel-600">{routeLabel(quote.sourceQuoteRequest.originCity, quote.sourceQuoteRequest.originCountry)} <ArrowRight className="mx-1 inline h-4 w-4" aria-hidden="true" /> {routeLabel(quote.sourceQuoteRequest.destinationCity, quote.sourceQuoteRequest.destinationCountry)}</p>
                  <p className="mt-1 font-mono text-[0.68rem] text-steel-400">{quote.sourceQuoteRequest.id}</p>
                </section>
              ) : null}

              <section aria-labelledby="quote-detail-lines">
                <h3 id="quote-detail-lines" className="mb-3 text-sm font-bold text-navy-800">Lines and totals</h3>
                <Table>
                  <thead><tr><Th>Description</Th><Th>Quantity</Th><Th>Unit price</Th><Th>Discount</Th><Th>Tax</Th><Th>Total</Th></tr></thead>
                  <tbody>
                    {quote.lines.map((line) => (
                      <tr key={line.id}>
                        <Td className="min-w-[16rem]"><span className="font-semibold text-navy-800">{line.descriptionEn}</span>{line.descriptionAr ? <span className="mt-1 block text-xs text-steel-500" dir="rtl">{line.descriptionAr}</span> : null}</Td>
                        <Td>{line.quantity}</Td>
                        <Td className="whitespace-nowrap">{formatMoney(line.unitPrice, quote.currency)}</Td>
                        <Td className="whitespace-nowrap">{line.discountPercent}%<span className="block text-xs text-steel-400">{formatMoney(line.discount, quote.currency)}</span></Td>
                        <Td className="whitespace-nowrap">{line.taxPercent}%<span className="block text-xs text-steel-400">{formatMoney(line.taxAmount, quote.currency)}</span></Td>
                        <Td className="whitespace-nowrap font-semibold text-navy-800">{formatMoney(line.total, quote.currency)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                <dl className="mt-3 grid gap-3 rounded-xl bg-steel-50 p-4 text-sm sm:grid-cols-4">
                  <div><dt className="text-xs text-steel-500">Subtotal after discount</dt><dd className="mt-1 font-semibold text-navy-800">{formatMoney(quote.totals.subtotal, quote.currency)}</dd></div>
                  <div><dt className="text-xs text-steel-500">Discount</dt><dd className="mt-1 font-semibold text-navy-800">{formatMoney(quote.totals.discount, quote.currency)}</dd></div>
                  <div><dt className="text-xs text-steel-500">Tax</dt><dd className="mt-1 font-semibold text-navy-800">{formatMoney(quote.totals.taxAmount, quote.currency)}</dd></div>
                  <div><dt className="text-xs text-steel-500">Total</dt><dd className="mt-1 font-bold text-navy-800">{formatMoney(quote.totals.total, quote.currency)}</dd></div>
                </dl>
              </section>

              {quote.notes ? <section><h3 className="mb-2 text-sm font-bold text-navy-800">Notes</h3><p className="whitespace-pre-line text-sm text-steel-600">{quote.notes}</p></section> : null}
              {quote.terms ? <section><h3 className="mb-2 text-sm font-bold text-navy-800">Terms</h3><p className="whitespace-pre-line text-sm text-steel-600">{quote.terms}</p></section> : null}
            </div>
          ) : null}
        </Panel>
      ) : null}

      {selectedId && quote && conversionForm ? (
        <Panel title={`Convert ${quote.number} to booking`} actions={<Button variant="ghost" size="sm" icon={<X className="h-4 w-4" />} disabled={convertQuote.isPending} onClick={() => { setConversionForm(null); conversionKey.current = ''; }}>Cancel</Button>}>
          <form onSubmit={submitConversion}>
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
              <AdminField label="Freight mode *">
                <Select required value={conversionForm.mode} onChange={(event) => setConversionForm({ ...conversionForm, mode: event.target.value as FreightMode })}>{freightModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</Select>
              </AdminField>
              <AdminField label="Origin *"><Input required maxLength={300} value={conversionForm.origin} onChange={(event) => setConversionForm({ ...conversionForm, origin: event.target.value })} /></AdminField>
              <AdminField label="Destination *"><Input required maxLength={300} value={conversionForm.destination} onChange={(event) => setConversionForm({ ...conversionForm, destination: event.target.value })} /></AdminField>
              <AdminField label="Carrier"><Input maxLength={120} value={conversionForm.carrier} onChange={(event) => setConversionForm({ ...conversionForm, carrier: event.target.value })} /></AdminField>
              <AdminField label="Vessel or flight"><Input maxLength={120} value={conversionForm.vesselOrFlight} onChange={(event) => setConversionForm({ ...conversionForm, vesselOrFlight: event.target.value })} /></AdminField>
              <AdminField label="Incoterms"><Input maxLength={20} value={conversionForm.incoterms} onChange={(event) => setConversionForm({ ...conversionForm, incoterms: event.target.value })} placeholder="FOB" /></AdminField>
              <AdminField label="ETD"><Input type="date" value={conversionForm.etd} onChange={(event) => setConversionForm({ ...conversionForm, etd: event.target.value })} /></AdminField>
              <AdminField label="ETA"><Input type="date" value={conversionForm.eta} onChange={(event) => setConversionForm({ ...conversionForm, eta: event.target.value })} /></AdminField>
              <AdminField label="Booking notes" className="sm:col-span-2 lg:col-span-3"><Textarea rows={3} maxLength={4000} value={conversionForm.notes} onChange={(event) => setConversionForm({ ...conversionForm, notes: event.target.value })} /></AdminField>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-steel-200 px-5 py-4">
              <p className="text-xs text-steel-500">A unique Idempotency-Key protects this conversion from duplicate requests.</p>
              <Button type="submit" disabled={convertQuote.isPending || !conversionForm.origin.trim() || !conversionForm.destination.trim()}>{convertQuote.isPending ? 'Converting…' : 'Create booking'}</Button>
            </div>
          </form>
        </Panel>
      ) : null}

      {conversionResult ? (
        <Panel title="Booking created">
          <div className="space-y-4 p-5" role="status">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-lg font-bold text-brand-700">{conversionResult.booking.number}</span>
              <StatusPill status={conversionResult.booking.status} label={conversionResult.booking.status} />
              <span className="text-sm text-steel-600">{conversionResult.booking.customer.nameEn}</span>
            </div>
            <p className="text-sm text-steel-600">{conversionResult.booking.origin} <ArrowRight className="mx-1 inline h-4 w-4" aria-hidden="true" /> {conversionResult.booking.destination} · {conversionResult.booking.mode}</p>
            <div className="rounded-xl border border-steel-200 bg-steel-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-steel-500">Booking linkage</p>
              <p className="mt-1 break-all font-mono text-xs text-navy-800" dir="ltr">Booking ID: {conversionResult.booking.id}</p>
              <p className="mt-1 break-all font-mono text-xs text-navy-800" dir="ltr">Source quote: {conversionResult.quote.number} · {conversionResult.quote.id}</p>
              <p className="mt-2 text-xs text-steel-500">Find this booking by number or ID in Bookings. Its detail view shows the source quote.</p>
            </div>
          </div>
        </Panel>
      ) : null}
    </AdminPage>
  );
}
