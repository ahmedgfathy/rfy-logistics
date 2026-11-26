import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Ban, Eye, Pencil, Plus, Search, X } from 'lucide-react';
import { api, ApiError } from '../../../lib/api';
import { AdminField, AdminPage, EmptyRow, Panel, Table, Td, Th } from '../../../components/admin/ui';
import { Button } from '../../../components/ui/Button';
import { Input, Select, Textarea } from '../../../components/ui/Field';
import { Spinner } from '../../../components/ui/Spinner';
import { StatusPill } from '../../../components/ui/StatusPill';
import { formatDateTime } from '../../../lib/utils';

type BookingStatus = 'CONFIRMED' | 'OPERATIONAL' | 'COMPLETED' | 'CANCELLED';
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

interface Booking {
  id: string;
  number: string;
  branchId: string | null;
  quoteId: string | null;
  customerId: string;
  status: BookingStatus;
  mode: FreightMode;
  origin: string;
  destination: string;
  carrier: string | null;
  vesselOrFlight: string | null;
  incoterms: string | null;
  etd: string | null;
  eta: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  customer: CustomerSummary;
  quote: { id: string; number: string; status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED' } | null;
}

interface BookingForm {
  customerId: string;
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

interface BookingPayload {
  customerId: string;
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

const bookingStatuses: BookingStatus[] = ['CONFIRMED', 'OPERATIONAL', 'COMPLETED', 'CANCELLED'];
const nextBookingStatuses: Record<BookingStatus, BookingStatus[]> = {
  CONFIRMED: ['OPERATIONAL', 'CANCELLED'],
  OPERATIONAL: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};
const freightModes: FreightMode[] = ['SEA', 'AIR', 'ROAD', 'RAIL', 'MULTIMODAL'];
const pageSize = 10;

function emptyBookingForm(): BookingForm {
  return {
    customerId: '',
    mode: 'SEA',
    origin: '',
    destination: '',
    carrier: '',
    vesselOrFlight: '',
    incoterms: '',
    etd: '',
    eta: '',
    notes: '',
  };
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function dateTimeToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function bookingPayload(form: BookingForm): BookingPayload {
  return {
    customerId: form.customerId,
    mode: form.mode,
    origin: form.origin.trim(),
    destination: form.destination.trim(),
    carrier: nullable(form.carrier),
    vesselOrFlight: nullable(form.vesselOrFlight),
    incoterms: nullable(form.incoterms),
    etd: dateTimeToIso(form.etd),
    eta: dateTimeToIso(form.eta),
    notes: nullable(form.notes),
  };
}

function validateBookingForm(form: BookingForm): string | null {
  if (!form.customerId) return 'Select a customer.';
  if (!form.origin.trim()) return 'Enter the origin.';
  if (!form.destination.trim()) return 'Enter the destination.';
  if (form.etd && form.eta && new Date(form.eta) < new Date(form.etd)) return 'ETA cannot be earlier than ETD.';
  return null;
}

function messageFor(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const details = error.details ? Object.values(error.details).flat().filter(Boolean) : [];
  return [error.message, ...details].join(' ');
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

function BookingDetailItem({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-steel-400">{label}</dt><dd className="mt-1 whitespace-pre-line text-sm text-steel-700">{children || '—'}</dd></div>;
}

function bookingToForm(booking: Booking): BookingForm {
  return {
    customerId: booking.customerId,
    mode: booking.mode,
    origin: booking.origin,
    destination: booking.destination,
    carrier: booking.carrier ?? '',
    vesselOrFlight: booking.vesselOrFlight ?? '',
    incoterms: booking.incoterms ?? '',
    etd: booking.etd?.slice(0, 16) ?? '',
    eta: booking.eta?.slice(0, 16) ?? '',
    notes: booking.notes ?? '',
  };
}

function BookingEditor({ booking, pending, onCancel, onSubmit }: {
  booking: Booking;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (body: Omit<BookingPayload, 'customerId'>) => void;
}) {
  const [form, setForm] = useState<BookingForm>(() => bookingToForm(booking));
  const [formError, setFormError] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateBookingForm(form);
    if (validationError) { setFormError(validationError); return; }
    const { customerId: _customerId, ...body } = bookingPayload(form);
    setFormError(null);
    onSubmit(body);
  };
  return (
    <form onSubmit={submit}>
      {formError ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{formError}</p> : null}
      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <AdminField label="Customer"><Input value={booking.customer.nameEn} disabled /></AdminField>
        <AdminField label="Freight mode *"><Select required value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value as FreightMode })}>{freightModes.map((mode) => <option key={mode}>{mode}</option>)}</Select></AdminField>
        <AdminField label="Incoterms"><Input maxLength={20} value={form.incoterms} onChange={(event) => setForm({ ...form, incoterms: event.target.value })} placeholder="FOB" /></AdminField>
        <AdminField label="Origin *"><Input required maxLength={300} value={form.origin} onChange={(event) => setForm({ ...form, origin: event.target.value })} /></AdminField>
        <AdminField label="Destination *"><Input required maxLength={300} value={form.destination} onChange={(event) => setForm({ ...form, destination: event.target.value })} /></AdminField>
        <AdminField label="Carrier"><Input maxLength={120} value={form.carrier} onChange={(event) => setForm({ ...form, carrier: event.target.value })} /></AdminField>
        <AdminField label="Vessel or flight"><Input maxLength={120} value={form.vesselOrFlight} onChange={(event) => setForm({ ...form, vesselOrFlight: event.target.value })} /></AdminField>
        <AdminField label="ETD"><Input type="datetime-local" value={form.etd} onChange={(event) => setForm({ ...form, etd: event.target.value })} /></AdminField>
        <AdminField label="ETA"><Input type="datetime-local" value={form.eta} onChange={(event) => setForm({ ...form, eta: event.target.value })} /></AdminField>
        <AdminField label="Notes" className="sm:col-span-2 lg:col-span-3"><Textarea rows={3} maxLength={4000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></AdminField>
      </div>
      <div className="flex justify-end gap-2 border-t border-steel-200 px-5 py-4"><Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save booking'}</Button></div>
    </form>
  );
}

export default function Bookings() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<BookingStatus | ''>('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<BookingForm>(emptyBookingForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [statusDraft, setStatusDraft] = useState<BookingStatus>('CONFIRMED');
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const customersQuery = useCustomerOptions();

  const bookingsQuery = useQuery({
    queryKey: ['erp', 'bookings', 'list', search, status, customerFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (customerFilter) params.set('customerId', customerFilter);
      const response = await api.get<Booking[]>(`/erp/bookings?${params.toString()}`);
      return { rows: response.data, meta: response.meta as unknown as PaginationMeta };
    },
    placeholderData: keepPreviousData,
  });

  const bookingQuery = useQuery({
    queryKey: ['erp', 'bookings', 'detail', selectedId],
    queryFn: async () => (await api.get<Booking>(`/erp/bookings/${selectedId}`)).data,
    enabled: selectedId !== null,
  });

  const booking = bookingQuery.data;
  useEffect(() => {
    if (booking) setStatusDraft(nextBookingStatuses[booking.status][0] ?? booking.status);
  }, [booking?.id, booking?.status]);

  const createBooking = useMutation({
    mutationFn: (body: BookingPayload) => api.post<Booking>('/erp/bookings', body),
    onSuccess: async (response) => {
      setFeedback({ kind: 'success', text: `Booking ${response.data.number} created.` });
      setShowCreate(false);
      setForm(emptyBookingForm());
      setFormError(null);
      setSelectedId(response.data.id);
      await queryClient.invalidateQueries({ queryKey: ['erp', 'bookings'] });
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not create the booking.') }),
  });

  const updateBooking = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Omit<BookingPayload, 'customerId'> }) => api.patch<Booking>(`/erp/bookings/${id}`, body),
    onSuccess: async (response) => {
      setFeedback({ kind: 'success', text: `Booking ${response.data.number} updated.` });
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ['erp', 'bookings'] });
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not update the booking.') }),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status: nextStatus }: { id: string; status: BookingStatus }) => api.patch<Booking>(`/erp/bookings/${id}/status`, { status: nextStatus }),
    onSuccess: async (response) => {
      setFeedback({ kind: 'success', text: `Booking ${response.data.number} moved to ${response.data.status}.` });
      await queryClient.invalidateQueries({ queryKey: ['erp', 'bookings'] });
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not update the booking status.') }),
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

  const openBooking = (id: string, edit = false) => {
    setSelectedId(id);
    setEditing(edit);
    setFeedback(null);
  };

  const closeBooking = () => {
    setSelectedId(null);
    setEditing(false);
    setFeedback(null);
  };

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateBookingForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    createBooking.mutate(bookingPayload(form));
  };

  const meta = bookingsQuery.data?.meta;

  return (
    <AdminPage
      title="Bookings"
      description="Create freight bookings, track their operational status and retain source quote linkage."
      actions={<Button variant="onlight" disabled={createBooking.isPending || updateStatus.isPending || updateBooking.isPending} icon={<Plus className="h-4 w-4" />} onClick={() => { setShowCreate((value) => !value); setFormError(null); setFeedback(null); }}>{showCreate ? 'Close form' : 'New booking'}</Button>}
    >
      {feedback ? (
        <div role={feedback.kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${feedback.kind === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-brand-200 bg-brand-50 text-brand-800'}`}>
          {feedback.text}
        </div>
      ) : null}

      {customersQuery.isError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>Customer choices could not be loaded. {messageFor(customersQuery.error, 'Please try again.')}</span>
          <Button variant="onlight" size="sm" onClick={() => void customersQuery.refetch()}>Retry customers</Button>
        </div>
      ) : null}

      {showCreate ? (
        <Panel title="Create booking">
          <form onSubmit={submitCreate}>
            {formError ? <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{formError}</p> : null}
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
              <AdminField label="Customer *">
                <Select required value={form.customerId} disabled={customersQuery.isLoading || !customersQuery.data?.length} onChange={(event) => setForm({ ...form, customerId: event.target.value })}>
                  <option value="">{customersQuery.isLoading ? 'Loading customers…' : 'Select a customer'}</option>
                  {(customersQuery.data ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.nameEn} ({customer.code}){customer.status === 'INACTIVE' ? ' — inactive' : ''}</option>)}
                </Select>
                {!customersQuery.isLoading && !customersQuery.data?.length && !customersQuery.isError ? <span className="mt-1 block text-xs text-steel-500">No customers found. Create a CUSTOMER or BOTH partner first.</span> : null}
              </AdminField>
              <AdminField label="Freight mode *">
                <Select required value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value as FreightMode })}>{freightModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</Select>
              </AdminField>
              <AdminField label="Incoterms"><Input maxLength={20} value={form.incoterms} onChange={(event) => setForm({ ...form, incoterms: event.target.value })} placeholder="FOB" /></AdminField>
              <AdminField label="Origin *"><Input required maxLength={300} value={form.origin} onChange={(event) => setForm({ ...form, origin: event.target.value })} /></AdminField>
              <AdminField label="Destination *"><Input required maxLength={300} value={form.destination} onChange={(event) => setForm({ ...form, destination: event.target.value })} /></AdminField>
              <AdminField label="Carrier"><Input maxLength={120} value={form.carrier} onChange={(event) => setForm({ ...form, carrier: event.target.value })} /></AdminField>
              <AdminField label="Vessel or flight"><Input maxLength={120} value={form.vesselOrFlight} onChange={(event) => setForm({ ...form, vesselOrFlight: event.target.value })} /></AdminField>
              <AdminField label="ETD"><Input type="datetime-local" value={form.etd} onChange={(event) => setForm({ ...form, etd: event.target.value })} /></AdminField>
              <AdminField label="ETA"><Input type="datetime-local" value={form.eta} onChange={(event) => setForm({ ...form, eta: event.target.value })} /></AdminField>
              <AdminField label="Notes" className="sm:col-span-2 lg:col-span-3"><Textarea rows={3} maxLength={4000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></AdminField>
            </div>
            <div className="flex justify-end gap-2 border-t border-steel-200 px-5 py-4">
              <Button type="button" variant="ghost" disabled={createBooking.isPending} onClick={() => { setShowCreate(false); setForm(emptyBookingForm()); setFormError(null); }}>Cancel</Button>
              <Button type="submit" disabled={createBooking.isPending || customersQuery.isLoading || !customersQuery.data?.length}>{createBooking.isPending ? 'Creating…' : 'Create booking'}</Button>
            </div>
          </form>
        </Panel>
      ) : null}

      <Panel>
        <form role="search" onSubmit={submitSearch} className="grid gap-3 border-b border-steel-200 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,1fr)_11rem_13rem_auto]">
          <AdminField label="Search bookings">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-400" aria-hidden="true" />
              <Input dir="ltr" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="ps-9" placeholder="Number, route, carrier or quote" />
            </div>
          </AdminField>
          <AdminField label="Status">
            <Select value={status} onChange={(event) => { setStatus(event.target.value as BookingStatus | ''); setPage(1); }}>
              <option value="">All statuses</option>
              {bookingStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
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
          <span aria-live="polite">{meta ? `${meta.total} booking${meta.total === 1 ? '' : 's'}` : 'Bookings'}</span>
          {bookingsQuery.isFetching && !bookingsQuery.isLoading ? <Spinner label="Refreshing…" /> : null}
        </div>
        {bookingsQuery.isLoading ? (
          <div className="p-8"><Spinner label="Loading bookings…" /></div>
        ) : bookingsQuery.isError ? (
          <div className="space-y-3 p-6" role="alert">
            <p className="text-sm font-semibold text-red-700">Bookings could not be loaded.</p>
            <p className="text-sm text-steel-500">{messageFor(bookingsQuery.error, 'Please try again.')}</p>
            <Button variant="onlight" size="sm" onClick={() => void bookingsQuery.refetch()}>Retry</Button>
          </div>
        ) : (
          <Table>
            <thead><tr><Th>Booking</Th><Th>Customer</Th><Th>Route</Th><Th>Schedule</Th><Th>Source quote</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {!bookingsQuery.data?.rows.length ? <EmptyRow colSpan={7} message="No bookings match these filters." /> : bookingsQuery.data.rows.map((item) => (
                <tr key={item.id} className="hover:bg-steel-50/60">
                  <Td>
                    <button type="button" onClick={() => openBooking(item.id)} className="font-mono text-[0.8rem] font-bold text-brand-700 hover:underline">{item.number}</button>
                    <span className="mt-1 block text-xs text-steel-500">{item.mode}{item.carrier ? ` · ${item.carrier}` : ''}</span>
                  </Td>
                  <Td>
                    <span className="font-semibold text-navy-800">{item.customer.nameEn}</span>
                  </Td>
                  <Td className="min-w-[14rem]"><span className="block">{item.origin}</span><span className="my-1 flex items-center gap-1 text-xs text-steel-400"><ArrowRight className="h-3 w-3" aria-hidden="true" />{item.destination}</span></Td>
                  <Td className="whitespace-nowrap text-xs text-steel-500"><span className="block">ETD {formatDateTime(item.etd, 'en')}</span><span className="mt-1 block">ETA {formatDateTime(item.eta, 'en')}</span></Td>
                  <Td>
                    {item.quote ? <><span className="font-mono text-xs font-semibold text-navy-800">{item.quote.number}</span><span className="mt-1 block max-w-[10rem] truncate font-mono text-[0.62rem] text-steel-400" title={item.quote.id}>{item.quote.id}</span></> : <span className="text-xs text-steel-400">Direct booking</span>}
                  </Td>
                  <Td><StatusPill status={item.status} label={item.status} /></Td>
                  <Td><div className="flex flex-wrap gap-2"><Button type="button" variant="onlight" size="sm" icon={<Eye className="h-4 w-4" />} aria-label={`View booking ${item.number}`} onClick={() => openBooking(item.id)}>View</Button>{['CONFIRMED', 'OPERATIONAL'].includes(item.status) ? <Button type="button" variant="ghost" size="sm" icon={<Pencil className="h-4 w-4" />} aria-label={`Edit booking ${item.number}`} onClick={() => openBooking(item.id, true)}>Edit</Button> : null}</div></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      {meta ? (
        <nav aria-label="Booking pagination" className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-semibold text-steel-500">Page {meta.page} of {meta.pages}</span>
          <div className="flex gap-2">
            <Button variant="onlight" size="sm" disabled={page <= 1 || bookingsQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
            <Button variant="onlight" size="sm" disabled={page >= meta.pages || bookingsQuery.isFetching} onClick={() => setPage((current) => current + 1)}>Next</Button>
          </div>
        </nav>
      ) : null}

      {selectedId ? (
        <Panel
          title={booking ? `${booking.number} · ${booking.customer.nameEn}` : 'Booking detail'}
          actions={<Button variant="ghost" size="sm" disabled={updateStatus.isPending || updateBooking.isPending} icon={<X className="h-4 w-4" />} onClick={closeBooking}>Close</Button>}
        >
          {bookingQuery.isLoading ? (
            <div className="p-8"><Spinner label="Loading booking detail…" /></div>
          ) : bookingQuery.isError ? (
            <div className="space-y-3 p-6" role="alert">
              <p className="text-sm font-semibold text-red-700">Booking detail could not be loaded.</p>
              <p className="text-sm text-steel-500">{messageFor(bookingQuery.error, 'Please try again.')}</p>
              <Button variant="onlight" size="sm" onClick={() => void bookingQuery.refetch()}>Retry</Button>
            </div>
          ) : booking && editing ? (
            <BookingEditor key={booking.id} booking={booking} pending={updateBooking.isPending} onCancel={() => setEditing(false)} onSubmit={(body) => updateBooking.mutate({ id: booking.id, body })} />
          ) : booking ? (
            <div className="space-y-6 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={booking.status} label={booking.status} />
                  <span className="text-xs text-steel-400">Updated {formatDateTime(booking.updatedAt, 'en')}</span>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  {['CONFIRMED', 'OPERATIONAL'].includes(booking.status) ? <Button variant="onlight" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Edit booking</Button> : null}
                  {nextBookingStatuses[booking.status].length ? (
                    <>
                      <AdminField label="Update status">
                        <Select aria-label="New booking status" value={statusDraft} disabled={updateStatus.isPending} onChange={(event) => setStatusDraft(event.target.value as BookingStatus)}>{nextBookingStatuses[booking.status].map((item) => <option key={item} value={item}>{item}</option>)}</Select>
                      </AdminField>
                      <Button size="sm" disabled={updateStatus.isPending || statusDraft === booking.status} onClick={() => updateStatus.mutate({ id: booking.id, status: statusDraft })}>{updateStatus.isPending ? 'Updating…' : 'Update status'}</Button>
                    </>
                  ) : null}
                  {['CONFIRMED', 'OPERATIONAL'].includes(booking.status) ? <Button variant="ghost" size="sm" icon={<Ban className="h-4 w-4" />} disabled={updateStatus.isPending} onClick={() => { if (window.confirm(`Cancel booking ${booking.number}? This keeps its audit history.`)) updateStatus.mutate({ id: booking.id, status: 'CANCELLED' }); }}>Cancel booking</Button> : null}
                </div>
              </div>

              {booking.quote ? (
                <section className="rounded-xl border border-brand-200 bg-brand-50/50 p-4" aria-labelledby="booking-source-quote">
                  <h3 id="booking-source-quote" className="text-sm font-bold text-navy-800">Created from quote</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-brand-700">{booking.quote.number}</span>
                    <StatusPill status={booking.quote.status} label={booking.quote.status} />
                  </div>
                  <p className="mt-2 break-all font-mono text-[0.68rem] text-steel-500" dir="ltr">Quote ID: {booking.quote.id}</p>
                </section>
              ) : (
                <p className="rounded-xl border border-dashed border-steel-200 px-4 py-3 text-sm text-steel-500">This booking was created directly and has no source quote.</p>
              )}

              <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <BookingDetailItem label="Customer">{booking.customer.nameEn}</BookingDetailItem>
                <BookingDetailItem label="Customer ID">{booking.customerId}</BookingDetailItem>
                <BookingDetailItem label="Email">{booking.customer.email}</BookingDetailItem>
                <BookingDetailItem label="Phone">{booking.customer.phone}</BookingDetailItem>
                <BookingDetailItem label="Freight mode">{booking.mode}</BookingDetailItem>
                <BookingDetailItem label="Origin">{booking.origin}</BookingDetailItem>
                <BookingDetailItem label="Destination">{booking.destination}</BookingDetailItem>
                <BookingDetailItem label="Carrier">{booking.carrier}</BookingDetailItem>
                <BookingDetailItem label="Vessel or flight">{booking.vesselOrFlight}</BookingDetailItem>
                <BookingDetailItem label="Incoterms">{booking.incoterms}</BookingDetailItem>
                <BookingDetailItem label="ETD">{formatDateTime(booking.etd, 'en')}</BookingDetailItem>
                <BookingDetailItem label="ETA">{formatDateTime(booking.eta, 'en')}</BookingDetailItem>
                <BookingDetailItem label="Branch ID">{booking.branchId}</BookingDetailItem>
                <BookingDetailItem label="Created">{formatDateTime(booking.createdAt, 'en')}</BookingDetailItem>
              </dl>

              {booking.notes ? <section><h3 className="mb-2 text-sm font-bold text-navy-800">Notes</h3><p className="whitespace-pre-line text-sm text-steel-600">{booking.notes}</p></section> : null}
              <div className="rounded-xl border border-steel-200 bg-steel-50 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-steel-500">Booking ID</p>
                <p className="mt-1 break-all font-mono text-xs text-navy-800" dir="ltr">{booking.id}</p>
              </div>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </AdminPage>
  );
}
