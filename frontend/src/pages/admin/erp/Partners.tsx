import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Eye, Pencil, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../../../lib/api';
import { AdminField, AdminPage, EmptyRow, Panel, Table, Td, Th } from '../../../components/admin/ui';
import { Button } from '../../../components/ui/Button';
import { Input, Select, Textarea } from '../../../components/ui/Field';
import { Spinner } from '../../../components/ui/Spinner';
import { StatusPill } from '../../../components/ui/StatusPill';
import { formatDate } from '../../../lib/utils';

type PartnerType = 'CUSTOMER' | 'VENDOR' | 'BOTH';
type PartnerStatus = 'ACTIVE' | 'INACTIVE';

interface PartnerContact {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

interface PartnerAddress {
  id: string;
  label: string;
  address: string;
  city: string | null;
  countryCode: string;
  isDefault: boolean;
}

interface Partner {
  id: string;
  code: string;
  type: PartnerType;
  status: PartnerStatus;
  nameEn: string;
  nameAr: string | null;
  legalName: string | null;
  taxNumber: string | null;
  registrationNumber: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  countryCode: string;
  currency: string;
  creditLimit: string | null;
  paymentTermDays: number;
  notes: string | null;
  contacts: PartnerContact[];
  addresses: PartnerAddress[];
  createdAt: string;
  updatedAt: string;
}

interface ContactForm {
  key: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  isPrimary: boolean;
}

interface AddressForm {
  key: string;
  label: string;
  address: string;
  city: string;
  countryCode: string;
  isDefault: boolean;
}

interface PartnerForm {
  type: PartnerType;
  status: PartnerStatus;
  nameEn: string;
  nameAr: string;
  legalName: string;
  taxNumber: string;
  registrationNumber: string;
  email: string;
  phone: string;
  website: string;
  billingAddress: string;
  shippingAddress: string;
  countryCode: string;
  currency: string;
  creditLimit: string;
  paymentTermDays: string;
  notes: string;
  contacts: ContactForm[];
  addresses: AddressForm[];
}

interface PartnerPayload {
  type: PartnerType;
  status: PartnerStatus;
  nameEn: string;
  nameAr: string | null;
  legalName: string | null;
  taxNumber: string | null;
  registrationNumber: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  countryCode: string;
  currency: string;
  creditLimit: string | null;
  paymentTermDays: number;
  notes: string | null;
  contacts: Array<{ name: string; title: string | null; email: string | null; phone: string | null; isPrimary: boolean }>;
  addresses: Array<{ label: string; address: string; city: string | null; countryCode: string; isDefault: boolean }>;
}

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const partnerTypes: PartnerType[] = ['CUSTOMER', 'VENDOR', 'BOTH'];
const partnerStatuses: PartnerStatus[] = ['ACTIVE', 'INACTIVE'];
const pageSize = 10;

function emptyContact(): ContactForm {
  return { key: crypto.randomUUID(), name: '', title: '', email: '', phone: '', isPrimary: false };
}

function emptyAddress(): AddressForm {
  return { key: crypto.randomUUID(), label: '', address: '', city: '', countryCode: 'EG', isDefault: false };
}

function emptyPartnerForm(): PartnerForm {
  return {
    type: 'CUSTOMER',
    status: 'ACTIVE',
    nameEn: '',
    nameAr: '',
    legalName: '',
    taxNumber: '',
    registrationNumber: '',
    email: '',
    phone: '',
    website: '',
    billingAddress: '',
    shippingAddress: '',
    countryCode: 'EG',
    currency: 'EGP',
    creditLimit: '',
    paymentTermDays: '0',
    notes: '',
    contacts: [],
    addresses: [],
  };
}

function partnerToForm(partner: Partner): PartnerForm {
  return {
    type: partner.type,
    status: partner.status,
    nameEn: partner.nameEn,
    nameAr: partner.nameAr ?? '',
    legalName: partner.legalName ?? '',
    taxNumber: partner.taxNumber ?? '',
    registrationNumber: partner.registrationNumber ?? '',
    email: partner.email ?? '',
    phone: partner.phone ?? '',
    website: partner.website ?? '',
    billingAddress: partner.billingAddress ?? '',
    shippingAddress: partner.shippingAddress ?? '',
    countryCode: partner.countryCode,
    currency: partner.currency,
    creditLimit: partner.creditLimit ?? '',
    paymentTermDays: String(partner.paymentTermDays),
    notes: partner.notes ?? '',
    contacts: partner.contacts.map((contact) => ({
      key: contact.id,
      name: contact.name,
      title: contact.title ?? '',
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      isPrimary: contact.isPrimary,
    })),
    addresses: partner.addresses.map((address) => ({
      key: address.id,
      label: address.label,
      address: address.address,
      city: address.city ?? '',
      countryCode: address.countryCode,
      isDefault: address.isDefault,
    })),
  };
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function partnerPayload(form: PartnerForm): PartnerPayload {
  return {
    type: form.type,
    status: form.status,
    nameEn: form.nameEn.trim(),
    nameAr: nullable(form.nameAr),
    legalName: nullable(form.legalName),
    taxNumber: nullable(form.taxNumber),
    registrationNumber: nullable(form.registrationNumber),
    email: nullable(form.email),
    phone: nullable(form.phone),
    website: nullable(form.website),
    billingAddress: nullable(form.billingAddress),
    shippingAddress: nullable(form.shippingAddress),
    countryCode: form.countryCode.trim().toUpperCase(),
    currency: form.currency.trim().toUpperCase(),
    creditLimit: nullable(form.creditLimit),
    paymentTermDays: Number(form.paymentTermDays),
    notes: nullable(form.notes),
    contacts: form.contacts.map((contact) => ({
      name: contact.name.trim(),
      title: nullable(contact.title),
      email: nullable(contact.email),
      phone: nullable(contact.phone),
      isPrimary: contact.isPrimary,
    })),
    addresses: form.addresses.map((address) => ({
      label: address.label.trim(),
      address: address.address.trim(),
      city: nullable(address.city),
      countryCode: address.countryCode.trim().toUpperCase(),
      isDefault: address.isDefault,
    })),
  };
}

function validatePartnerForm(form: PartnerForm): string | null {
  if (!form.nameEn.trim()) return 'Enter the partner name in English.';
  if (!/^[A-Z]{2}$/i.test(form.countryCode.trim())) return 'Country must be a two-letter code, such as EG.';
  if (!/^[A-Z]{3}$/i.test(form.currency.trim())) return 'Currency must be a three-letter code, such as EGP.';
  if (!Number.isInteger(Number(form.paymentTermDays)) || Number(form.paymentTermDays) < 0 || Number(form.paymentTermDays) > 3650) {
    return 'Payment terms must be a whole number between 0 and 3650 days.';
  }
  if (form.contacts.some((contact) => !contact.name.trim())) return 'Enter a name for each contact or remove the empty contact.';
  if (form.contacts.filter((contact) => contact.isPrimary).length > 1) return 'Only one contact can be primary.';
  if (form.addresses.some((address) => !address.label.trim() || !address.address.trim())) {
    return 'Enter a label and address for each address or remove the incomplete address.';
  }
  if (form.addresses.some((address) => !/^[A-Z]{2}$/i.test(address.countryCode.trim()))) {
    return 'Each address country must be a two-letter code.';
  }
  if (form.addresses.filter((address) => address.isDefault).length > 1) return 'Only one address can be the default.';
  return null;
}

function messageFor(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const details = error.details ? Object.values(error.details).flat().filter(Boolean) : [];
  return [error.message, ...details].join(' ');
}

function PartnerDetailsFields({ form, onChange }: { form: PartnerForm; onChange: (patch: Partial<PartnerForm>) => void }) {
  return (
    <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
      <AdminField label="English name *">
        <Input required maxLength={200} value={form.nameEn} onChange={(event) => onChange({ nameEn: event.target.value })} />
      </AdminField>
      <AdminField label="Arabic name">
        <Input dir="rtl" maxLength={200} value={form.nameAr} onChange={(event) => onChange({ nameAr: event.target.value })} />
      </AdminField>
      <AdminField label="Legal name">
        <Input maxLength={200} value={form.legalName} onChange={(event) => onChange({ legalName: event.target.value })} />
      </AdminField>
      <AdminField label="Partner type *">
        <Select value={form.type} onChange={(event) => onChange({ type: event.target.value as PartnerType })}>
          {partnerTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </Select>
      </AdminField>
      <AdminField label="Status *">
        <Select value={form.status} onChange={(event) => onChange({ status: event.target.value as PartnerStatus })}>
          {partnerStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
        </Select>
      </AdminField>
      <AdminField label="Country code *">
        <Input required dir="ltr" maxLength={2} value={form.countryCode} onChange={(event) => onChange({ countryCode: event.target.value.toUpperCase() })} placeholder="EG" />
      </AdminField>
      <AdminField label="Currency code *">
        <Input required dir="ltr" maxLength={3} value={form.currency} onChange={(event) => onChange({ currency: event.target.value.toUpperCase() })} placeholder="EGP" />
      </AdminField>
      <AdminField label="Tax number">
        <Input maxLength={80} value={form.taxNumber} onChange={(event) => onChange({ taxNumber: event.target.value })} />
      </AdminField>
      <AdminField label="Registration number">
        <Input maxLength={80} value={form.registrationNumber} onChange={(event) => onChange({ registrationNumber: event.target.value })} />
      </AdminField>
      <AdminField label="Email">
        <Input type="email" dir="ltr" maxLength={180} value={form.email} onChange={(event) => onChange({ email: event.target.value })} />
      </AdminField>
      <AdminField label="Phone">
        <Input type="tel" maxLength={32} value={form.phone} onChange={(event) => onChange({ phone: event.target.value })} />
      </AdminField>
      <AdminField label="Website">
        <Input type="url" dir="ltr" maxLength={500} value={form.website} onChange={(event) => onChange({ website: event.target.value })} placeholder="https://" />
      </AdminField>
      <AdminField label="Credit limit">
        <Input type="number" min="0" step="0.01" value={form.creditLimit} onChange={(event) => onChange({ creditLimit: event.target.value })} />
      </AdminField>
      <AdminField label="Payment term days *">
        <Input type="number" required min="0" max="3650" step="1" value={form.paymentTermDays} onChange={(event) => onChange({ paymentTermDays: event.target.value })} />
      </AdminField>
      <AdminField label="Billing address" className="sm:col-span-2 lg:col-span-3">
        <Textarea rows={2} maxLength={1000} value={form.billingAddress} onChange={(event) => onChange({ billingAddress: event.target.value })} />
      </AdminField>
      <AdminField label="Shipping address" className="sm:col-span-2 lg:col-span-3">
        <Textarea rows={2} maxLength={1000} value={form.shippingAddress} onChange={(event) => onChange({ shippingAddress: event.target.value })} />
      </AdminField>
      <AdminField label="Notes" className="sm:col-span-2 lg:col-span-3">
        <Textarea rows={3} maxLength={4000} value={form.notes} onChange={(event) => onChange({ notes: event.target.value })} />
      </AdminField>
    </div>
  );
}

function PartnerSubrecordsFields({ form, onChange, pending }: { form: PartnerForm; onChange: (patch: Partial<PartnerForm>) => void; pending: boolean }) {
  const headingId = useId();
  const updateContact = (index: number, patch: Partial<ContactForm>) => {
    onChange({ contacts: form.contacts.map((contact, position) => position === index ? { ...contact, ...patch } : contact) });
  };
  const updateAddress = (index: number, patch: Partial<AddressForm>) => {
    onChange({ addresses: form.addresses.map((address, position) => position === index ? { ...address, ...patch } : address) });
  };

  return (
    <div className="space-y-5 border-t border-steel-200 p-5">
      <section aria-labelledby={`${headingId}-contacts`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id={`${headingId}-contacts`} className="text-sm font-bold text-navy-800">Contacts</h3>
            <p className="text-xs text-steel-500">Up to 50 contacts. Saving replaces the current contact list.</p>
          </div>
          <Button type="button" variant="onlight" size="sm" disabled={pending} icon={<Plus className="h-4 w-4" />} onClick={() => onChange({ contacts: [...form.contacts, emptyContact()] })}>Add contact</Button>
        </div>
        {!form.contacts.length ? <p className="rounded-xl border border-dashed border-steel-200 px-4 py-5 text-sm text-steel-500">No contacts added.</p> : (
          <div className="space-y-3">
            {form.contacts.map((contact, index) => (
              <div key={contact.key} className="rounded-xl border border-steel-200 bg-steel-50/50 p-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <AdminField label={`Contact ${index + 1} name *`}>
                    <Input required maxLength={120} value={contact.name} onChange={(event) => updateContact(index, { name: event.target.value })} />
                  </AdminField>
                  <AdminField label="Title">
                    <Input maxLength={120} value={contact.title} onChange={(event) => updateContact(index, { title: event.target.value })} />
                  </AdminField>
                  <AdminField label="Email">
                    <Input type="email" dir="ltr" maxLength={180} value={contact.email} onChange={(event) => updateContact(index, { email: event.target.value })} />
                  </AdminField>
                  <AdminField label="Phone">
                    <Input type="tel" maxLength={32} value={contact.phone} onChange={(event) => updateContact(index, { phone: event.target.value })} />
                  </AdminField>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-steel-600">
                    <input type="checkbox" className="h-4 w-4 rounded border-steel-300" checked={contact.isPrimary} onChange={(event) => updateContact(index, { isPrimary: event.target.checked })} />
                    Primary contact
                  </label>
                  <Button type="button" variant="ghost" size="sm" disabled={pending} icon={<Trash2 className="h-4 w-4" />} aria-label={`Remove contact ${index + 1}`} onClick={() => onChange({ contacts: form.contacts.filter((_, position) => position !== index) })}>Remove</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby={`${headingId}-addresses`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id={`${headingId}-addresses`} className="text-sm font-bold text-navy-800">Addresses</h3>
            <p className="text-xs text-steel-500">Up to 50 addresses. Saving replaces the current address list.</p>
          </div>
          <Button type="button" variant="onlight" size="sm" disabled={pending} icon={<Plus className="h-4 w-4" />} onClick={() => onChange({ addresses: [...form.addresses, emptyAddress()] })}>Add address</Button>
        </div>
        {!form.addresses.length ? <p className="rounded-xl border border-dashed border-steel-200 px-4 py-5 text-sm text-steel-500">No addresses added.</p> : (
          <div className="space-y-3">
            {form.addresses.map((address, index) => (
              <div key={address.key} className="rounded-xl border border-steel-200 bg-steel-50/50 p-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <AdminField label={`Address ${index + 1} label *`}>
                    <Input required maxLength={80} value={address.label} onChange={(event) => updateAddress(index, { label: event.target.value })} placeholder="Head office" />
                  </AdminField>
                  <AdminField label="City">
                    <Input maxLength={120} value={address.city} onChange={(event) => updateAddress(index, { city: event.target.value })} />
                  </AdminField>
                  <AdminField label="Country code *">
                    <Input required dir="ltr" maxLength={2} value={address.countryCode} onChange={(event) => updateAddress(index, { countryCode: event.target.value.toUpperCase() })} />
                  </AdminField>
                  <AdminField label="Full address *" className="sm:col-span-2 lg:col-span-4">
                    <Textarea required rows={2} maxLength={500} value={address.address} onChange={(event) => updateAddress(index, { address: event.target.value })} />
                  </AdminField>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-steel-600">
                    <input type="checkbox" className="h-4 w-4 rounded border-steel-300" checked={address.isDefault} onChange={(event) => updateAddress(index, { isDefault: event.target.checked })} />
                    Default address
                  </label>
                  <Button type="button" variant="ghost" size="sm" disabled={pending} icon={<Trash2 className="h-4 w-4" />} aria-label={`Remove address ${index + 1}`} onClick={() => onChange({ addresses: form.addresses.filter((_, position) => position !== index) })}>Remove</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-steel-400">{label}</dt>
      <dd className="mt-1 whitespace-pre-line text-sm text-steel-700">{children || '—'}</dd>
    </div>
  );
}

export default function Partners() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<PartnerType | ''>('');
  const [status, setStatus] = useState<PartnerStatus | ''>('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<PartnerForm>(emptyPartnerForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PartnerForm | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const partnersQuery = useQuery({
    queryKey: ['erp', 'partners', 'list', search, type, status, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search) params.set('search', search);
      if (type) params.set('type', type);
      if (status) params.set('status', status);
      const response = await api.get<Partner[]>(`/erp/partners?${params.toString()}`);
      return { rows: response.data, meta: response.meta as unknown as PaginationMeta };
    },
    placeholderData: keepPreviousData,
  });

  const partnerQuery = useQuery({
    queryKey: ['erp', 'partners', 'detail', selectedId],
    queryFn: async () => (await api.get<Partner>(`/erp/partners/${selectedId}`)).data,
    enabled: selectedId !== null,
  });

  const createPartner = useMutation({
    mutationFn: (body: PartnerPayload) => api.post<Partner>('/erp/partners', body),
    onSuccess: async (response) => {
      setFeedback({ kind: 'success', text: `Partner ${response.data.code} created.` });
      setShowCreate(false);
      setCreateForm(emptyPartnerForm());
      setSelectedId(response.data.id);
      setEditForm(null);
      await queryClient.invalidateQueries({ queryKey: ['erp', 'partners'] });
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not create the partner.') }),
  });

  const updatePartner = useMutation({
    mutationFn: ({ id, body }: { id: string; body: PartnerPayload }) => api.patch<Partner>(`/erp/partners/${id}`, body),
    onSuccess: async (response) => {
      setFeedback({ kind: 'success', text: `Partner ${response.data.code} updated.` });
      setEditForm(null);
      await queryClient.invalidateQueries({ queryKey: ['erp', 'partners'] });
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not update the partner.') }),
  });

  const setPartnerStatus = useMutation({
    mutationFn: ({ id, status: nextStatus }: { id: string; status: PartnerStatus }) => api.patch<Partner>(`/erp/partners/${id}`, { status: nextStatus }),
    onSuccess: async (response) => {
      setFeedback({ kind: 'success', text: `${response.data.nameEn} is now ${response.data.status}.` });
      await queryClient.invalidateQueries({ queryKey: ['erp', 'partners'] });
    },
    onError: (error) => setFeedback({ kind: 'error', text: messageFor(error, 'Could not change the partner status.') }),
  });

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setType('');
    setStatus('');
    setPage(1);
  };

  const openPartner = (id: string) => {
    setSelectedId(id);
    setEditForm(null);
  };

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    const validationError = validatePartnerForm(createForm);
    if (validationError) {
      setFeedback({ kind: 'error', text: validationError });
      return;
    }
    createPartner.mutate(partnerPayload(createForm));
  };

  const submitUpdate = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId || !editForm) return;
    const validationError = validatePartnerForm(editForm);
    if (validationError) {
      setFeedback({ kind: 'error', text: validationError });
      return;
    }
    updatePartner.mutate({ id: selectedId, body: partnerPayload(editForm) });
  };

  const meta = partnersQuery.data?.meta;
  const partner = partnerQuery.data;

  return (
    <AdminPage
      title="Business partners"
      description="Maintain customer and vendor records, contacts, addresses and commercial terms."
      actions={<Button variant="onlight" disabled={createPartner.isPending || updatePartner.isPending} icon={<Plus className="h-4 w-4" />} onClick={() => { setShowCreate((value) => !value); setFeedback(null); }}>{showCreate ? 'Close form' : 'New partner'}</Button>}
    >
      {feedback ? (
        <div role={feedback.kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${feedback.kind === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-brand-200 bg-brand-50 text-brand-800'}`}>
          {feedback.text}
        </div>
      ) : null}

      {showCreate ? (
        <Panel title="Create partner">
          <form onSubmit={submitCreate}>
            <PartnerDetailsFields form={createForm} onChange={(patch) => setCreateForm((current) => ({ ...current, ...patch }))} />
            <PartnerSubrecordsFields form={createForm} pending={createPartner.isPending} onChange={(patch) => setCreateForm((current) => ({ ...current, ...patch }))} />
            <div className="flex justify-end gap-2 border-t border-steel-200 px-5 py-4">
              <Button type="button" variant="ghost" disabled={createPartner.isPending} onClick={() => { setShowCreate(false); setCreateForm(emptyPartnerForm()); }}>Cancel</Button>
              <Button type="submit" disabled={createPartner.isPending}>{createPartner.isPending ? 'Creating…' : 'Create partner'}</Button>
            </div>
          </form>
        </Panel>
      ) : null}

      <Panel>
        <form role="search" onSubmit={submitSearch} className="grid gap-3 border-b border-steel-200 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,1fr)_10rem_10rem_auto]">
          <AdminField label="Search partners">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-400" aria-hidden="true" />
              <Input dir="ltr" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="ps-9" placeholder="Code, name, email, phone or tax number" />
            </div>
          </AdminField>
          <AdminField label="Type">
            <Select value={type} onChange={(event) => { setType(event.target.value as PartnerType | ''); setPage(1); }}>
              <option value="">All types</option>
              {partnerTypes.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
          </AdminField>
          <AdminField label="Status">
            <Select value={status} onChange={(event) => { setStatus(event.target.value as PartnerStatus | ''); setPage(1); }}>
              <option value="">All statuses</option>
              {partnerStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
          </AdminField>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="secondary">Search</Button>
            <Button type="button" variant="ghost" onClick={clearFilters}>Clear</Button>
          </div>
        </form>
        <div className="flex items-center justify-between gap-3 border-b border-steel-100 px-4 py-2 text-xs text-steel-500">
          <span aria-live="polite">{meta ? `${meta.total} partner${meta.total === 1 ? '' : 's'}` : 'Partners'}</span>
          {partnersQuery.isFetching && !partnersQuery.isLoading ? <Spinner label="Refreshing…" /> : null}
        </div>
        {partnersQuery.isLoading ? (
          <div className="p-8"><Spinner label="Loading partners…" /></div>
        ) : partnersQuery.isError ? (
          <div className="space-y-3 p-6" role="alert">
            <p className="text-sm font-semibold text-red-700">Partners could not be loaded.</p>
            <p className="text-sm text-steel-500">{messageFor(partnersQuery.error, 'Please try again.')}</p>
            <Button variant="onlight" size="sm" onClick={() => void partnersQuery.refetch()}>Retry</Button>
          </div>
        ) : (
          <Table>
            <thead><tr><Th>Partner</Th><Th>Type</Th><Th>Contact</Th><Th>Commercial terms</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {!partnersQuery.data?.rows.length ? <EmptyRow colSpan={6} message="No partners match these filters." /> : partnersQuery.data.rows.map((item) => (
                <tr key={item.id} className="hover:bg-steel-50/60">
                  <Td>
                    <button type="button" onClick={() => openPartner(item.id)} className="text-start font-semibold text-navy-800 hover:text-brand-700 hover:underline">{item.nameEn}</button>
                    <span className="mt-1 block font-mono text-[0.68rem] text-steel-400">{item.code}</span>
                    {item.nameAr ? <span className="mt-1 block text-xs text-steel-500" dir="rtl">{item.nameAr}</span> : null}
                  </Td>
                  <Td><StatusPill status={item.type} label={item.type} /></Td>
                  <Td>
                    {item.email || item.phone ? <><span className="block">{item.email ?? item.phone}</span>{item.email && item.phone ? <span className="block text-xs text-steel-400">{item.phone}</span> : null}</> : '—'}
                    <span className="mt-1 block text-[0.68rem] text-steel-400">{item.contacts.length} contact{item.contacts.length === 1 ? '' : 's'} · {item.addresses.length} address{item.addresses.length === 1 ? '' : 'es'}</span>
                  </Td>
                  <Td>
                    <span className="font-semibold text-navy-800">{item.currency}</span>
                    <span className="mt-1 block text-xs text-steel-500">{item.paymentTermDays} day terms · {item.countryCode}</span>
                  </Td>
                  <Td><StatusPill status={item.status} label={item.status} /></Td>
                  <Td><div className="flex flex-wrap gap-2"><Button type="button" variant="onlight" size="sm" icon={<Eye className="h-4 w-4" />} aria-label={`View ${item.nameEn}`} onClick={() => openPartner(item.id)}>View</Button><Button type="button" variant="ghost" size="sm" icon={<Pencil className="h-4 w-4" />} aria-label={`Edit ${item.nameEn}`} onClick={() => { openPartner(item.id); setEditForm(partnerToForm(item)); }}>Edit</Button></div></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      {meta ? (
        <nav aria-label="Partner pagination" className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-semibold text-steel-500">Page {meta.page} of {meta.pages}</span>
          <div className="flex gap-2">
            <Button variant="onlight" size="sm" disabled={page <= 1 || partnersQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
            <Button variant="onlight" size="sm" disabled={page >= meta.pages || partnersQuery.isFetching} onClick={() => setPage((current) => current + 1)}>Next</Button>
          </div>
        </nav>
      ) : null}

      {selectedId ? (
        <Panel
          title={partner ? `${partner.code} · ${partner.nameEn}` : 'Partner detail'}
          actions={<Button variant="ghost" size="sm" disabled={updatePartner.isPending} icon={<X className="h-4 w-4" />} onClick={() => { setSelectedId(null); setEditForm(null); }}>Close</Button>}
        >
          {partnerQuery.isLoading ? (
            <div className="p-8"><Spinner label="Loading partner detail…" /></div>
          ) : partnerQuery.isError ? (
            <div className="space-y-3 p-6" role="alert">
              <p className="text-sm font-semibold text-red-700">Partner detail could not be loaded.</p>
              <p className="text-sm text-steel-500">{messageFor(partnerQuery.error, 'Please try again.')}</p>
              <Button variant="onlight" size="sm" onClick={() => void partnerQuery.refetch()}>Retry</Button>
            </div>
          ) : partner && editForm ? (
            <form onSubmit={submitUpdate}>
              <PartnerDetailsFields form={editForm} onChange={(patch) => setEditForm((current) => current ? { ...current, ...patch } : current)} />
              <PartnerSubrecordsFields form={editForm} pending={updatePartner.isPending} onChange={(patch) => setEditForm((current) => current ? { ...current, ...patch } : current)} />
              <div className="flex justify-end gap-2 border-t border-steel-200 px-5 py-4">
                <Button type="button" variant="ghost" disabled={updatePartner.isPending} onClick={() => setEditForm(null)}>Cancel</Button>
                <Button type="submit" disabled={updatePartner.isPending}>{updatePartner.isPending ? 'Saving…' : 'Save changes'}</Button>
              </div>
            </form>
          ) : partner ? (
            <div className="space-y-6 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={partner.status} label={partner.status} />
                  <StatusPill status={partner.type} label={partner.type} />
                  <span className="text-xs text-steel-400">Updated {formatDate(partner.updatedAt, 'en')}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="onlight" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditForm(partnerToForm(partner))}>Edit partner</Button>
                  <Button variant="ghost" size="sm" icon={partner.status === 'ACTIVE' ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />} disabled={setPartnerStatus.isPending} onClick={() => { const nextStatus = partner.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'; if (window.confirm(`Set ${partner.nameEn} to ${nextStatus}? Existing transactions will be retained.`)) setPartnerStatus.mutate({ id: partner.id, status: nextStatus }); }}>{partner.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</Button>
                </div>
              </div>
              <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <DetailItem label="Legal name">{partner.legalName}</DetailItem>
                <DetailItem label="Email">{partner.email}</DetailItem>
                <DetailItem label="Phone">{partner.phone}</DetailItem>
                <DetailItem label="Website">{partner.website}</DetailItem>
                <DetailItem label="Country">{partner.countryCode}</DetailItem>
                <DetailItem label="Currency">{partner.currency}</DetailItem>
                <DetailItem label="Credit limit">{partner.creditLimit === null ? null : `${partner.creditLimit} ${partner.currency}`}</DetailItem>
                <DetailItem label="Payment terms">{`${partner.paymentTermDays} days`}</DetailItem>
                <DetailItem label="Tax number">{partner.taxNumber}</DetailItem>
                <DetailItem label="Registration number">{partner.registrationNumber}</DetailItem>
                <DetailItem label="Billing address">{partner.billingAddress}</DetailItem>
                <DetailItem label="Shipping address">{partner.shippingAddress}</DetailItem>
              </dl>

              <section aria-labelledby="partner-detail-contacts">
                <h3 id="partner-detail-contacts" className="mb-3 text-sm font-bold text-navy-800">Contacts</h3>
                {!partner.contacts.length ? <p className="text-sm text-steel-500">No contacts added.</p> : (
                  <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {partner.contacts.map((contact) => (
                      <li key={contact.id} className="rounded-xl border border-steel-200 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-navy-800">{contact.name}</span>
                          {contact.isPrimary ? <span className="rounded-full bg-brand-50 px-2 py-1 text-[0.65rem] font-bold text-brand-700">PRIMARY</span> : null}
                        </div>
                        {contact.title ? <p className="mt-1 text-xs text-steel-500">{contact.title}</p> : null}
                        {contact.email ? <a href={`mailto:${contact.email}`} className="mt-2 block break-all text-xs text-brand-700 hover:underline">{contact.email}</a> : null}
                        {contact.phone ? <a href={`tel:${contact.phone}`} className="mt-1 block text-xs text-brand-700 hover:underline">{contact.phone}</a> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-labelledby="partner-detail-addresses">
                <h3 id="partner-detail-addresses" className="mb-3 text-sm font-bold text-navy-800">Addresses</h3>
                {!partner.addresses.length ? <p className="text-sm text-steel-500">No addresses added.</p> : (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {partner.addresses.map((address) => (
                      <li key={address.id} className="rounded-xl border border-steel-200 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-navy-800">{address.label}</span>
                          {address.isDefault ? <span className="rounded-full bg-brand-50 px-2 py-1 text-[0.65rem] font-bold text-brand-700">DEFAULT</span> : null}
                        </div>
                        <p className="mt-2 whitespace-pre-line text-sm text-steel-600">{address.address}</p>
                        <p className="mt-1 text-xs text-steel-400">{[address.city, address.countryCode].filter(Boolean).join(', ')}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {partner.notes ? <section aria-labelledby="partner-detail-notes"><h3 id="partner-detail-notes" className="mb-2 text-sm font-bold text-navy-800">Notes</h3><p className="whitespace-pre-line text-sm text-steel-600">{partner.notes}</p></section> : null}
            </div>
          ) : null}
        </Panel>
      ) : null}
    </AdminPage>
  );
}
