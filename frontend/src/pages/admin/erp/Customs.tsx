import { cloneElement, isValidElement, useEffect, useRef, useState, useId, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Download,
  FileCheck2,
  FilePlus2,
  Files,
  Globe2,
  Hash,
  Landmark,
  ListTree,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Scale,
  Trash2,
  Ban,
  X,
} from 'lucide-react';
import { API_BASE, api, ApiError } from '../../../lib/api';
import { AdminField, AdminPage, EmptyRow, Panel, Table, Td, Th } from '../../../components/admin/ui';
import { Button } from '../../../components/ui/Button';
import { Field as UIField, Input, Select, Textarea } from '../../../components/ui/Field';
import { Spinner, StatePanel } from '../../../components/ui/Spinner';
import { StatusPill } from '../../../components/ui/StatusPill';
import { formatDate, formatDateTime } from '../../../lib/utils';

const DIRECTIONS = ['IMPORT', 'EXPORT', 'TRANSIT'] as const;
const FILE_STATUSES = [
  'DRAFT',
  'ACI_PENDING',
  'ACI_ACCEPTED',
  'DECLARATION_DRAFT',
  'UNDER_REVIEW',
  'INSPECTION',
  'PAYMENT_PENDING',
  'RELEASED',
  'CLOSED',
  'CANCELLED',
] as const;
const ACI_STATUSES = ['DRAFT', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'CANCELLED'] as const;
const DECLARATION_STATUSES = ['DRAFT', 'SUBMITTED', 'ASSESSED', 'PAID', 'RELEASED', 'CANCELLED'] as const;
const PAGE_SIZE = 25;

type Direction = (typeof DIRECTIONS)[number];
type FileStatus = (typeof FILE_STATUSES)[number];
type AciStatus = (typeof ACI_STATUSES)[number];
type DeclarationStatus = (typeof DECLARATION_STATUSES)[number];

const FILE_TRANSITIONS: Record<FileStatus, FileStatus[]> = {
  DRAFT: ['ACI_PENDING', 'DECLARATION_DRAFT', 'UNDER_REVIEW', 'INSPECTION', 'PAYMENT_PENDING', 'CANCELLED'],
  ACI_PENDING: ['ACI_ACCEPTED', 'DECLARATION_DRAFT', 'PAYMENT_PENDING', 'CANCELLED'],
  ACI_ACCEPTED: ['DECLARATION_DRAFT', 'PAYMENT_PENDING', 'CANCELLED'],
  DECLARATION_DRAFT: ['UNDER_REVIEW', 'INSPECTION', 'PAYMENT_PENDING', 'CANCELLED'],
  UNDER_REVIEW: ['DECLARATION_DRAFT', 'INSPECTION', 'PAYMENT_PENDING', 'CANCELLED'],
  INSPECTION: ['UNDER_REVIEW', 'PAYMENT_PENDING', 'CANCELLED'],
  PAYMENT_PENDING: ['RELEASED', 'UNDER_REVIEW', 'INSPECTION', 'CANCELLED'],
  RELEASED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

const ACI_TRANSITIONS: Record<AciStatus, AciStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: [],
  REJECTED: ['SUBMITTED', 'CANCELLED'],
  CANCELLED: [],
};

const TERMINAL_FILE_STATUSES: FileStatus[] = ['RELEASED', 'CLOSED', 'CANCELLED'];

interface PageMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface Notice {
  kind: 'success' | 'error';
  text: string;
}

interface Partner {
  id: string;
  code: string;
  nameEn: string;
  nameAr?: string | null;
  type: 'CUSTOMER' | 'VENDOR' | 'BOTH';
  status: 'ACTIVE' | 'INACTIVE';
}

interface ShipmentOption {
  id: string;
  trackingNumber: string;
  reference: string | null;
  status: string;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

interface CustomsFileRow {
  id: string;
  number: string;
  direction: Direction;
  portCode: string;
  status: FileStatus;
  updatedAt: string;
  shipment: { id: string; trackingNumber: string; reference: string | null; status: string };
  importer: { id: string; code: string; nameEn: string; nameAr: string | null };
  broker: { id: string; code: string; nameEn: string; nameAr: string | null } | null;
  _count: { aciFilings: number; declarations: number; events: number };
}

interface AciFiling {
  id: string;
  acidNumber: string | null;
  nafezaRequestNumber: string | null;
  nafezaItemNumber: string | null;
  status: AciStatus;
  submittedAt: string | null;
  respondedAt: string | null;
  responseReference: string | null;
  payloadHash: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DeclarationSummary {
  id: string;
  customsFileId?: string;
  number: string;
  declarationNumber: string | null;
  direction: Direction;
  status: DeclarationStatus;
  totalPayable: string;
  paidAmount: string;
  balance: string;
  updatedAt: string;
  _count?: { lines: number; charges: number; documents: number };
  lines?: unknown[];
  charges?: unknown[];
}

interface DeclarationRow extends DeclarationSummary {
  customsFile: {
    id: string;
    number: string;
    status: FileStatus;
    shipment: { id: string; trackingNumber: string; reference: string | null };
  };
  _count: { lines: number; charges: number; documents: number };
}

interface CustomsStatusEvent {
  id: string;
  status: FileStatus;
  description: string;
  occurredAt: string;
}

interface CustomsFileDetail extends Omit<CustomsFileRow, '_count'> {
  customsOffice: string | null;
  openedAt: string;
  closedAt: string | null;
  notes: string | null;
  assignedToId: string | null;
  aciFilings: AciFiling[];
  declarations: DeclarationSummary[];
  events: CustomsStatusEvent[];
}

interface DeclarationLine {
  id: string;
  lineNumber: number;
  hsCodeId: string | null;
  hsCodeSnapshot: string;
  description: string;
  originCountry: string;
  quantity: string;
  quantityUnit: string;
  weightKg: string | null;
  customsValue: string;
  currency: string;
  exchangeRate: string;
  cifValueEgp: string;
  dutyRatePercent: string;
  dutyAmount: string;
  taxRatePercent: string;
  taxAmount: string;
  otherAmount: string;
  totalAmount: string;
  hsCode?: { id: string; code: string; descriptionEn: string; descriptionAr: string | null } | null;
}

interface DeclarationCharge {
  id: string;
  label: string;
  amount: string;
  currency: string;
  exchangeRate: string;
  amountEgp: string;
  isPaid: boolean;
  chargeItem: { id: string; code: string; nameEn: string; nameAr: string | null } | null;
}

interface DeclarationDocument {
  document: {
    id: string;
    category: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
  };
}

interface DeclarationBill {
  id: string;
  number: string;
  status: string;
}

interface DeclarationDetail extends DeclarationSummary {
  customsFileId: string;
  declarationDate: string | null;
  assessedDate: string | null;
  releasedDate: string | null;
  currency: string;
  totalCifEgp: string;
  totalDuty: string;
  totalTax: string;
  totalFees: string;
  customsFile: {
    id: string;
    number: string;
    status: FileStatus;
    direction: Direction;
    portCode: string;
    shipment: { id: string; trackingNumber: string; reference: string | null };
    importer: { id: string; code: string; nameEn: string; nameAr: string | null };
  };
  lines: DeclarationLine[];
  charges: DeclarationCharge[];
  bills: DeclarationBill[];
  documents: DeclarationDocument[];
}

interface HsCode {
  id: string;
  code: string;
  descriptionEn: string;
  descriptionAr: string | null;
  defaultDutyRate: string;
  defaultTaxRate: string;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
}

interface DeclarationLineForm {
  key: string;
  hsCodeId: string;
  hsCodeSnapshot: string;
  description: string;
  originCountry: string;
  quantity: string;
  quantityUnit: string;
  weightKg: string;
  customsValue: string;
  currency: string;
  exchangeRate: string;
  dutyRatePercent: string;
  taxRatePercent: string;
  otherAmount: string;
}

let lineSequence = 0;
function newDeclarationLine(overrides: Partial<DeclarationLineForm> = {}): DeclarationLineForm {
  lineSequence += 1;
  return {
    key: `line-${lineSequence}`,
    hsCodeId: '',
    hsCodeSnapshot: '',
    description: '',
    originCountry: 'EG',
    quantity: '1',
    quantityUnit: 'PCS',
    weightKg: '',
    customsValue: '',
    currency: 'USD',
    exchangeRate: '1',
    dutyRatePercent: '',
    taxRatePercent: '',
    otherAmount: '0',
    ...overrides,
  };
}

function declarationLineForm(line: DeclarationLine): DeclarationLineForm {
  return newDeclarationLine({
    hsCodeId: line.hsCodeId ?? '',
    hsCodeSnapshot: line.hsCodeSnapshot,
    description: line.description,
    originCountry: line.originCountry,
    quantity: line.quantity,
    quantityUnit: line.quantityUnit,
    weightKg: line.weightKg ?? '',
    customsValue: line.customsValue,
    currency: line.currency,
    exchangeRate: line.exchangeRate,
    dutyRatePercent: line.dutyRatePercent,
    taxRatePercent: line.taxRatePercent,
    otherAmount: line.otherAmount,
  });
}

function Field({
  label,
  required,
  help,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string }>, { id })
    : children;
  return <UIField label={label} htmlFor={id} required={required} help={help} className={className}>{control}</UIField>;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const detail = Object.values(error.details ?? {})[0]?.[0];
    return detail ? `${error.message} ${detail}` : error.message;
  }
  return fallback;
}

function optionalText(value: string): string | undefined {
  return value.trim() ? value : undefined;
}

function optionalDate(value: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

function toLocalDate(value: string): string {
  return toLocalDateTime(value).slice(0, 10);
}

function hsCodeEffectiveOn(code: HsCode, date: Date): boolean {
  const from = new Date(code.effectiveFrom).getTime();
  const to = code.effectiveTo ? new Date(code.effectiveTo).getTime() : null;
  return code.isActive && from <= date.getTime() && (to === null || date.getTime() < to);
}

function fileMetadataEditable(file: CustomsFileDetail): boolean {
  return (
    !TERMINAL_FILE_STATUSES.includes(file.status) &&
    !file.aciFilings.some((filing) => filing.status === 'ACCEPTED') &&
    !file.declarations.some((declaration) =>
      declaration.declarationNumber || ['ASSESSED', 'PAID', 'RELEASED'].includes(declaration.status),
    )
  );
}

function compareDecimals(left: string, right: string): number {
  const normalize = (value: string) => {
    const [integer = '0', fraction = ''] = value.split('.');
    return { integer: integer.replace(/^0+(?=\d)/, ''), fraction };
  };
  const a = normalize(left);
  const b = normalize(right);
  if (a.integer.length !== b.integer.length) return a.integer.length > b.integer.length ? 1 : -1;
  if (a.integer !== b.integer) return a.integer > b.integer ? 1 : -1;
  const width = Math.max(a.fraction.length, b.fraction.length);
  const aFraction = a.fraction.padEnd(width, '0');
  const bFraction = b.fraction.padEnd(width, '0');
  return aFraction === bFraction ? 0 : aFraction > bFraction ? 1 : -1;
}

function fileCanOperate(status: FileStatus): boolean {
  return !TERMINAL_FILE_STATUSES.includes(status);
}

function NoticeBox({ notice, onDismiss }: { notice: Notice; onDismiss?: () => void }) {
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
        notice.kind === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-brand-200 bg-brand-50 text-brand-800'
      }`}
      role={notice.kind === 'error' ? 'alert' : 'status'}
    >
      <span>{notice.text}</span>
      {onDismiss ? <button type="button" onClick={onDismiss} className="shrink-0 rounded p-0.5 hover:bg-black/5" aria-label="Dismiss message"><X className="h-4 w-4" aria-hidden="true" /></button> : null}
    </div>
  );
}

function ManualNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`rounded-xl border border-amber-200 bg-amber-50 text-amber-900 ${compact ? 'p-4' : 'px-5 py-4'}`} role="note">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-bold">Manual ACI / Nafeza recording</p>
          <p className="mt-1 text-sm leading-6">
            This workspace records ACID numbers, Nafeza request/item references and responses. It does not transmit data to Egyptian Customs, ACI or Nafeza, and saving a status never means a government submission happened automatically. Submit through your authorized external channel first, then record the returned references and status here.
          </p>
        </div>
      </div>
    </div>
  );
}

function QueryError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="p-5" role="alert">
      <p className="text-sm font-semibold text-red-700">{message}</p>
      <Button variant="ghost" size="sm" className="mt-3" icon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>Try again</Button>
    </div>
  );
}

function Pagination({ meta, page, onPage, disabled = false }: { meta?: PageMeta; page: number; onPage: (page: number) => void; disabled?: boolean }) {
  const pages = meta?.pages ?? 1;
  const total = meta?.total ?? 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-steel-200 px-4 py-3">
      <p className="text-xs text-steel-500">{total} {total === 1 ? 'record' : 'records'} · Page {page} of {pages}</p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => onPage(page - 1)} disabled={disabled || page <= 1}>Previous</Button>
        <Button variant="ghost" size="sm" onClick={() => onPage(page + 1)} disabled={disabled || page >= pages}>Next</Button>
      </div>
    </div>
  );
}

function LookupSelect<T extends { id: string }>({
  label,
  value,
  onChange,
  required = false,
  queryKeyPrefix,
  buildPath,
  describe,
  filter,
  help,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  queryKeyPrefix: string[];
  buildPath: (search: string) => string;
  describe: (item: T) => string;
  filter?: (item: T) => boolean;
  help?: string;
}) {
  const [search, setSearch] = useState('');
  const [manual, setManual] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');
  const query = useQuery({
    queryKey: [...queryKeyPrefix, search],
    queryFn: async () => (await api.get<T[]>(buildPath(search))).data,
    enabled: !manual,
  });
  const items = (query.data ?? []).filter((item) => filter?.(item) ?? true);
  const selectedMissing = value && !items.some((item) => item.id === value);

  return (
    <Field label={label} required={required} help={help}>
      {manual ? (
        <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Record UUID" aria-label={label} dir="ltr" required={required} />
      ) : (
        <div className="space-y-2">
          <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${label.toLowerCase()}`} aria-label={`Search ${label.toLowerCase()}`} />
          <Select
            value={value}
            required={required}
            aria-label={label}
            disabled={query.isLoading}
            onChange={(event) => {
              onChange(event.target.value);
              setSelectedLabel(event.target.selectedOptions[0]?.textContent ?? '');
            }}
          >
            <option value="">{query.isLoading ? 'Loading records…' : `Select ${label.toLowerCase()}`}</option>
            {selectedMissing ? <option value={value}>{selectedLabel || `Selected ID: ${value}`}</option> : null}
            {!query.isLoading && !items.length ? <option value="" disabled>No matching records</option> : null}
            {items.map((item) => <option key={item.id} value={item.id}>{describe(item)}</option>)}
          </Select>
          {query.isLoading ? <Spinner label="Loading matching records…" /> : null}
          {query.isError ? <p className="text-xs text-red-700" role="alert">{errorMessage(query.error, 'Could not load records.')} You can enter a UUID manually instead.</p> : null}
          {!query.isLoading && !query.isError && (query.data?.length ?? 0) >= 100 ? <p className="text-xs text-steel-500">Showing the first 100 matches. Refine your search if a record is missing.</p> : null}
        </div>
      )}
      <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => { setManual((current) => !current); onChange(''); setSelectedLabel(''); }}>
        {manual ? 'Choose from records' : 'Enter UUID manually'}
      </Button>
    </Field>
  );
}

function EmptySection({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <div className="flex items-center gap-3 px-4 py-6 text-sm text-steel-500">{icon}<span>{children}</span></div>;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-steel-400">{label}</p><p className="mt-1 break-words text-steel-700">{value}</p></div>;
}

function CustomsFileCreateForm({ onClose, onCreated }: { onClose: () => void; onCreated: (file: { id: string; number: string }) => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    shipmentId: '',
    importerId: '',
    brokerId: '',
    direction: 'IMPORT' as Direction,
    portCode: '',
    customsOffice: '',
    openedAt: '',
    assignedToId: '',
    notes: '',
  });
  const [notice, setNotice] = useState<Notice | null>(null);
  const create = useMutation({
    mutationFn: async () => api.post<{ id: string; number: string }>('/erp/customs/files', {
      shipmentId: form.shipmentId,
      importerId: form.importerId,
      brokerId: optionalText(form.brokerId),
      direction: form.direction,
      portCode: form.portCode,
      customsOffice: optionalText(form.customsOffice),
      openedAt: optionalDate(form.openedAt),
      assignedToId: optionalText(form.assignedToId),
      notes: optionalText(form.notes),
    }),
    onSuccess: async ({ data }) => {
      await queryClient.invalidateQueries({ queryKey: ['erp', 'customs'] });
      onCreated(data);
    },
    onError: (error) => setNotice({ kind: 'error', text: errorMessage(error, 'Could not create customs file.') }),
  });
  const canCreate = !create.isPending && !!form.shipmentId && !!form.importerId && !!form.portCode.trim();

  return (
    <Panel title="Create customs file">
      <form onSubmit={(event) => { event.preventDefault(); if (canCreate) create.mutate(); }}>
        {notice ? <div className="px-5 pt-5"><NoticeBox notice={notice} onDismiss={() => setNotice(null)} /></div> : null}
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <LookupSelect<ShipmentOption>
            label="Shipment"
            value={form.shipmentId}
            onChange={(shipmentId) => setForm({ ...form, shipmentId })}
            required
            queryKeyPrefix={['erp', 'shipments', 'customs-file-source']}
            buildPath={(search) => `/erp/shipments?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`}
            describe={(shipment) => `${shipment.trackingNumber}${shipment.reference ? ` — ${shipment.reference}` : ''}`}
          />
          <LookupSelect<Partner>
            label="Importer"
            value={form.importerId}
            onChange={(importerId) => setForm({ ...form, importerId })}
            required
            queryKeyPrefix={['erp', 'partners', 'customs-importer']}
            buildPath={(search) => `/erp/partners?status=ACTIVE&limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`}
            describe={(partner) => `${partner.code} — ${partner.nameEn}`}
            help="Any active business partner in this company can be recorded as importer."
          />
          <LookupSelect<Partner>
            label="Broker"
            value={form.brokerId}
            onChange={(brokerId) => setForm({ ...form, brokerId })}
            queryKeyPrefix={['erp', 'partners', 'customs-broker']}
            buildPath={(search) => `/erp/partners?status=ACTIVE&limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`}
            describe={(partner) => `${partner.code} — ${partner.nameEn}`}
          />
          <Field label="Direction *">
            <Select value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value as Direction })}>{DIRECTIONS.map((direction) => <option key={direction} value={direction}>{direction}</option>)}</Select>
          </Field>
          <Field label="Port code *"><Input value={form.portCode} onChange={(event) => setForm({ ...form, portCode: event.target.value })} maxLength={40} required /></Field>
          <Field label="Customs office"><Input value={form.customsOffice} onChange={(event) => setForm({ ...form, customsOffice: event.target.value })} maxLength={160} /></Field>
          <Field label="Opened at"><Input type="datetime-local" value={form.openedAt} onChange={(event) => setForm({ ...form, openedAt: event.target.value })} /></Field>
          <LookupSelect<UserOption>
            label="Assigned user"
            value={form.assignedToId}
            onChange={(assignedToId) => setForm({ ...form, assignedToId })}
            queryKeyPrefix={['erp', 'users', 'customs-assignee']}
            buildPath={() => '/admin/users'}
            describe={(user) => `${user.name} — ${user.email}`}
            filter={(user) => user.isActive}
            help="The user list requires administrator access; a UUID can still be entered manually."
          />
          <Field label="Notes" className="sm:col-span-2 lg:col-span-3"><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={4000} /></Field>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-steel-200 px-5 py-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button type="submit" disabled={!canCreate} icon={<FilePlus2 className="h-4 w-4" />}>{create.isPending ? 'Creating…' : 'Create customs file'}</Button>
        </div>
      </form>
    </Panel>
  );
}

function CustomsFileMetadataForm({ file, onCancel, onSaved }: { file: CustomsFileDetail; onCancel: () => void; onSaved: (message: string) => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    shipmentId: file.shipment.id,
    importerId: file.importer.id,
    brokerId: file.broker?.id ?? '',
    direction: file.direction,
    portCode: file.portCode,
    customsOffice: file.customsOffice ?? '',
    openedAt: toLocalDateTime(file.openedAt),
    assignedToId: file.assignedToId ?? '',
    notes: file.notes ?? '',
  });
  const [notice, setNotice] = useState<Notice | null>(null);
  const save = useMutation({
    mutationFn: async () => api.patch(`/erp/customs/files/${file.id}`, {
      shipmentId: form.shipmentId,
      importerId: form.importerId,
      brokerId: form.brokerId || null,
      direction: form.direction,
      portCode: form.portCode,
      customsOffice: form.customsOffice.trim() || null,
      openedAt: new Date(form.openedAt).toISOString(),
      assignedToId: form.assignedToId || null,
      notes: form.notes.trim() || null,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['erp', 'customs'] });
      onSaved('Customs file metadata corrected. Declaration snapshots were not changed.');
    },
    onError: (error) => setNotice({ kind: 'error', text: errorMessage(error, 'Could not update customs file metadata.') }),
  });
  const canSave = !save.isPending && !!form.shipmentId && !!form.importerId && !!form.portCode.trim() && !!form.openedAt;

  return (
    <Panel title={`Correct metadata for ${file.number}`}>
      <form onSubmit={(event) => { event.preventDefault(); if (canSave) save.mutate(); }}>
        {notice ? <div className="px-5 pt-5"><NoticeBox notice={notice} onDismiss={() => setNotice(null)} /></div> : null}
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <LookupSelect<ShipmentOption>
            label="Shipment"
            value={form.shipmentId}
            onChange={(shipmentId) => setForm({ ...form, shipmentId })}
            required
            queryKeyPrefix={['erp', 'shipments', 'customs-file-correction']}
            buildPath={(search) => `/erp/shipments?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`}
            describe={(shipment) => `${shipment.trackingNumber}${shipment.reference ? ` — ${shipment.reference}` : ''}`}
          />
          <LookupSelect<Partner>
            label="Importer"
            value={form.importerId}
            onChange={(importerId) => setForm({ ...form, importerId })}
            required
            queryKeyPrefix={['erp', 'partners', 'customs-importer-correction']}
            buildPath={(search) => `/erp/partners?status=ACTIVE&limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`}
            describe={(partner) => `${partner.code} — ${partner.nameEn}`}
          />
          <LookupSelect<Partner>
            label="Broker"
            value={form.brokerId}
            onChange={(brokerId) => setForm({ ...form, brokerId })}
            queryKeyPrefix={['erp', 'partners', 'customs-broker-correction']}
            buildPath={(search) => `/erp/partners?status=ACTIVE&limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`}
            describe={(partner) => `${partner.code} — ${partner.nameEn}`}
          />
          <Field label="Direction *"><Select value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value as Direction })}>{DIRECTIONS.map((direction) => <option key={direction} value={direction}>{direction}</option>)}</Select></Field>
          <Field label="Port code *"><Input value={form.portCode} onChange={(event) => setForm({ ...form, portCode: event.target.value })} maxLength={40} required /></Field>
          <Field label="Customs office"><Input value={form.customsOffice} onChange={(event) => setForm({ ...form, customsOffice: event.target.value })} maxLength={160} /></Field>
          <Field label="Opened at"><Input type="datetime-local" value={form.openedAt} onChange={(event) => setForm({ ...form, openedAt: event.target.value })} required /></Field>
          <LookupSelect<UserOption>
            label="Assigned user"
            value={form.assignedToId}
            onChange={(assignedToId) => setForm({ ...form, assignedToId })}
            queryKeyPrefix={['erp', 'users', 'customs-assignee-correction']}
            buildPath={() => '/admin/users'}
            describe={(user) => `${user.name} — ${user.email}`}
            filter={(user) => user.isActive}
          />
          <Field label="Notes" className="sm:col-span-2 lg:col-span-3"><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={4000} /></Field>
        </div>
        <p className="px-5 pb-5 text-xs leading-5 text-steel-500">Corrections are audited and locked once a declaration is assessed, paid, released or filed, an ACI is accepted, or the file reaches a terminal status.</p>
        <div className="flex flex-wrap justify-end gap-2 border-t border-steel-200 px-5 py-4">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" disabled={!canSave} icon={<Pencil className="h-4 w-4" />}>{save.isPending ? 'Saving…' : 'Save metadata correction'}</Button>
        </div>
      </form>
    </Panel>
  );
}

function CustomsFilesWorkspace({ onSelect }: { onSelect: (id: string) => void }) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [direction, setDirection] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (direction) params.set('direction', direction);
  const query = useQuery({
    queryKey: ['erp', 'customs', 'files', { search, status, direction, page }],
    queryFn: async () => api.get<CustomsFileRow[]>(`/erp/customs/files?${params.toString()}`),
  });
  const files = query.data?.data ?? [];
  const meta = query.data?.meta as PageMeta | undefined;

  return (
    <div className="space-y-5">
      <Panel>
        <form className="grid gap-3 border-b border-steel-200 p-4 sm:grid-cols-2 xl:grid-cols-[1fr_12rem_10rem_auto]" onSubmit={(event: FormEvent) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()); }}>
          <AdminField label="Search customs files"><Input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="File, shipment, importer, broker or declaration" maxLength={160} /></AdminField>
          <AdminField label="Status"><Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{FILE_STATUSES.map((item) => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}</Select></AdminField>
          <AdminField label="Direction"><Select value={direction} onChange={(event) => { setDirection(event.target.value); setPage(1); }}><option value="">All directions</option>{DIRECTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</Select></AdminField>
          <div className="flex items-end gap-2"><Button type="submit" variant="onlight">Search</Button>{(search || status || direction) ? <Button type="button" variant="ghost" onClick={() => { setSearchInput(''); setSearch(''); setStatus(''); setDirection(''); setPage(1); }}>Clear</Button> : null}</div>
        </form>
        {query.isLoading ? <div className="p-8"><Spinner label="Loading customs files…" /></div> : query.isError ? <QueryError message={errorMessage(query.error, 'Could not load customs files.')} onRetry={() => void query.refetch()} /> : (
          <>
            <Table><thead><tr><Th>File</Th><Th>Shipment</Th><Th>Importer / broker</Th><Th>Direction</Th><Th>Status</Th><Th>Records</Th><Th><span className="sr-only">Actions</span></Th></tr></thead><tbody>
              {!files.length ? <EmptyRow colSpan={7} message={search || status || direction ? 'No customs files match these filters.' : 'No customs files yet.'} /> : files.map((file) => (
                <tr key={file.id}>
                  <Td><button type="button" onClick={() => onSelect(file.id)} className="text-start font-bold text-navy-800 hover:text-brand-700 hover:underline">{file.number}</button><span className="mt-1 block text-[0.68rem] text-steel-400">{file.portCode} · Updated {formatDate(file.updatedAt, 'en')}</span></Td>
                  <Td><span className="font-semibold text-navy-800">{file.shipment.trackingNumber}</span>{file.shipment.reference ? <span className="mt-1 block text-[0.68rem] text-steel-400">{file.shipment.reference}</span> : null}</Td>
                  <Td>{file.importer.nameEn}{file.broker ? <span className="mt-1 block text-[0.68rem] text-steel-400">Broker: {file.broker.nameEn}</span> : <span className="mt-1 block text-[0.68rem] text-steel-400">No broker</span>}</Td>
                  <Td>{file.direction}</Td>
                  <Td><StatusPill status={file.status} label={file.status.replace(/_/g, ' ')} /></Td>
                  <Td className="whitespace-nowrap text-xs">{file._count.declarations} declarations<span className="block text-steel-400">{file._count.aciFilings} ACI · {file._count.events} events</span></Td>
                  <Td><Button variant="ghost" size="sm" onClick={() => onSelect(file.id)}>View</Button></Td>
                </tr>
              ))}
            </tbody></Table>
            <Pagination meta={meta} page={page} onPage={setPage} disabled={query.isFetching} />
          </>
        )}
      </Panel>
      <div className="flex justify-end"><Button variant="onlight" icon={<FilePlus2 className="h-4 w-4" />} aria-expanded={showCreate} onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Close new file' : 'New customs file'}</Button></div>
      {showCreate ? <CustomsFileCreateForm onClose={() => setShowCreate(false)} onCreated={(file) => { setShowCreate(false); onSelect(file.id); }} /> : null}
    </div>
  );
}

function AciFilingForm({ fileId, filing, onCancel, onSaved }: { fileId: string; filing?: AciFiling; onCancel: () => void; onSaved: (message: string) => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    acidNumber: filing?.acidNumber ?? '',
    nafezaRequestNumber: filing?.nafezaRequestNumber ?? '',
    nafezaItemNumber: filing?.nafezaItemNumber ?? '',
    status: filing?.status ?? ('DRAFT' as AciStatus),
    submittedAt: filing?.submittedAt ? toLocalDateTime(filing.submittedAt) : '',
    respondedAt: filing?.respondedAt ? toLocalDateTime(filing.respondedAt) : '',
    responseReference: filing?.responseReference ?? '',
    payloadHash: filing?.payloadHash ?? '',
    notes: filing?.notes ?? '',
  });
  const [notice, setNotice] = useState<Notice | null>(null);
  const nextStatuses = filing ? ACI_TRANSITIONS[filing.status] : [];
  const save = useMutation({
    mutationFn: async () => {
      const dates = {
        submittedAt: form.submittedAt ? new Date(form.submittedAt).toISOString() : null,
        respondedAt: form.respondedAt ? new Date(form.respondedAt).toISOString() : null,
      };
      if (filing) {
        return api.patch(`/erp/customs/aci/${filing.id}`, {
          acidNumber: form.acidNumber.trim() || null,
          nafezaRequestNumber: form.nafezaRequestNumber.trim() || null,
          nafezaItemNumber: form.nafezaItemNumber.trim() || null,
          ...(form.status !== filing.status ? { status: form.status } : {}),
          ...dates,
          responseReference: form.responseReference.trim() || null,
          payloadHash: form.payloadHash.trim() || null,
          notes: form.notes.trim() || null,
        });
      }
      return api.post(`/erp/customs/files/${fileId}/aci`, {
        acidNumber: optionalText(form.acidNumber),
        nafezaRequestNumber: optionalText(form.nafezaRequestNumber),
        nafezaItemNumber: optionalText(form.nafezaItemNumber),
        status: form.status,
        submittedAt: dates.submittedAt ?? undefined,
        respondedAt: dates.respondedAt ?? undefined,
        responseReference: optionalText(form.responseReference),
        payloadHash: optionalText(form.payloadHash),
        notes: optionalText(form.notes),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['erp', 'customs'] });
      onSaved(filing ? 'ACI filing record updated.' : 'ACI filing record created.');
    },
    onError: (error) => setNotice({ kind: 'error', text: errorMessage(error, 'Could not save ACI filing record.') }),
  });

  return (
    <Panel title={filing ? 'Update ACI filing record' : 'Create ACI filing record'}>
      <form onSubmit={(event) => { event.preventDefault(); if (!save.isPending) save.mutate(); }}>
        <div className="border-b border-steel-200 p-5"><ManualNotice compact /></div>
        {notice ? <div className="px-5 pt-5"><NoticeBox notice={notice} onDismiss={() => setNotice(null)} /></div> : null}
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="ACID number"><Input value={form.acidNumber} onChange={(event) => setForm({ ...form, acidNumber: event.target.value })} maxLength={120} dir="ltr" /></Field>
          <Field label="Nafeza request number"><Input value={form.nafezaRequestNumber} onChange={(event) => setForm({ ...form, nafezaRequestNumber: event.target.value })} maxLength={120} dir="ltr" /></Field>
          <Field label="Nafeza item number"><Input value={form.nafezaItemNumber} onChange={(event) => setForm({ ...form, nafezaItemNumber: event.target.value })} maxLength={120} dir="ltr" /></Field>
          <Field label="Recorded status" help="SUBMITTED means submitted manually through your external channel.">
            <Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as AciStatus })}>
              {filing ? <option value={filing.status}>{filing.status} (current)</option> : null}
              {(filing ? nextStatuses : ACI_STATUSES).map((status) => <option key={status} value={status}>{status}</option>)}
            </Select>
          </Field>
          <Field label="Submitted at"><Input type="datetime-local" value={form.submittedAt} onChange={(event) => setForm({ ...form, submittedAt: event.target.value })} /></Field>
          <Field label="Responded at"><Input type="datetime-local" value={form.respondedAt} onChange={(event) => setForm({ ...form, respondedAt: event.target.value })} /></Field>
          <Field label="Response reference"><Input value={form.responseReference} onChange={(event) => setForm({ ...form, responseReference: event.target.value })} maxLength={160} dir="ltr" /></Field>
          <Field label="Payload hash"><Input value={form.payloadHash} onChange={(event) => setForm({ ...form, payloadHash: event.target.value })} maxLength={128} dir="ltr" className="font-mono text-xs" /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={4000} /></Field>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-steel-200 px-5 py-4">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : filing ? 'Save ACI record' : 'Create ACI record'}</Button>
        </div>
      </form>
    </Panel>
  );
}

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function DeclarationCreator({ fileId, fileNumber, fileDirection, declaration, onCancel, onCreated }: { fileId?: string; fileNumber?: string; fileDirection?: Direction; declaration?: DeclarationDetail; onCancel: () => void; onCreated: (declaration: { id: string; number: string }) => void }) {
  const queryClient = useQueryClient();
  const [customsFileId, setCustomsFileId] = useState(fileId ?? declaration?.customsFileId ?? '');
  const [form, setForm] = useState({
    declarationNumber: declaration?.declarationNumber ?? '',
    declarationDate: declaration?.declarationDate ? toLocalDateTime(declaration.declarationDate) : '',
    direction: (declaration ? (fileDirection ?? declaration.direction) : '') as '' | Direction,
    paidAmount: declaration?.paidAmount ?? '0',
  });
  const [lines, setLines] = useState<DeclarationLineForm[]>(() =>
    declaration?.lines.length ? declaration.lines.map(declarationLineForm) : [newDeclarationLine()],
  );
  const [notice, setNotice] = useState<Notice | null>(null);
  const hsQuery = useQuery({
    queryKey: ['erp', 'customs', 'hs-codes', 'declaration-options'],
    queryFn: async () => (await api.get<HsCode[]>('/erp/customs/hs-codes?isActive=true&limit=100')).data,
  });
  const hsCodes = hsQuery.data ?? [];
  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        declarationNumber: declaration ? form.declarationNumber.trim() || null : optionalText(form.declarationNumber),
        declarationDate: declaration ? (form.declarationDate ? new Date(form.declarationDate).toISOString() : null) : optionalDate(form.declarationDate),
        direction: form.direction || undefined,
        paidAmount: form.paidAmount || '0',
        lines: lines.map((line, index) => ({
          lineNumber: index + 1,
          hsCodeId: line.hsCodeId || undefined,
          hsCodeSnapshot: line.hsCodeId ? undefined : line.hsCodeSnapshot.trim().toUpperCase(),
          description: line.description,
          originCountry: line.originCountry,
          quantity: line.quantity,
          quantityUnit: line.quantityUnit,
          weightKg: optionalText(line.weightKg),
          customsValue: line.customsValue,
          currency: line.currency,
          exchangeRate: line.exchangeRate,
          dutyRatePercent: optionalText(line.dutyRatePercent),
          taxRatePercent: optionalText(line.taxRatePercent),
          otherAmount: line.otherAmount || '0',
        })),
      };
      if (declaration) return api.patch<{ id: string; number: string }>(`/erp/customs/declarations/${declaration.id}`, payload);
      return api.post<{ id: string; number: string }>('/erp/customs/declarations', { customsFileId, ...payload });
    },
    onSuccess: async ({ data }) => {
      await queryClient.invalidateQueries({ queryKey: ['erp', 'customs'] });
      onCreated(data);
    },
    onError: (error) => setNotice({ kind: 'error', text: errorMessage(error, declaration ? 'Could not update draft declaration.' : 'Could not create declaration.') }),
  });
  const updateLine = (key: string, patch: Partial<DeclarationLineForm>) => setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  const validLines = lines.every((line) => line.description.trim() && (line.hsCodeId || line.hsCodeSnapshot.trim()) && line.quantity && line.customsValue && line.originCountry.trim() && line.quantityUnit.trim() && line.currency.trim() && line.exchangeRate);
  const canSave = !save.isPending && !!customsFileId && validLines;
  const selectionDate = form.declarationDate ? new Date(form.declarationDate) : new Date();
  const selectableHsCodes = declaration ? hsCodes : hsCodes.filter((code) => hsCodeEffectiveOn(code, selectionDate));

  return (
    <Panel title={declaration ? `Edit draft declaration ${declaration.number}` : fileId ? `Create declaration for ${fileNumber ?? 'customs file'}` : 'Create customs declaration'}>
      <form onSubmit={(event) => { event.preventDefault(); if (canSave) save.mutate(); }}>
        {notice ? <div className="px-5 pt-5"><NoticeBox notice={notice} onDismiss={() => setNotice(null)} /></div> : null}
        <div className="grid gap-4 border-b border-steel-200 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {fileId || declaration ? (
            <Field label="Customs file"><Input value={`${fileNumber ?? declaration?.customsFile.number ?? fileId ?? declaration?.customsFileId}`} readOnly /></Field>
          ) : (
            <LookupSelect<CustomsFileRow>
              label="Customs file"
              value={customsFileId}
              onChange={setCustomsFileId}
              required
              queryKeyPrefix={['erp', 'customs', 'files', 'declaration-source']}
              buildPath={(search) => `/erp/customs/files?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`}
              describe={(file) => `${file.number} — ${file.shipment.trackingNumber} (${file.status})`}
            />
          )}
          <Field label="Declaration number"><Input value={form.declarationNumber} onChange={(event) => setForm({ ...form, declarationNumber: event.target.value })} maxLength={120} dir="ltr" /></Field>
          <Field label="Declaration date"><Input type="datetime-local" value={form.declarationDate} onChange={(event) => setForm({ ...form, declarationDate: event.target.value })} /></Field>
          <Field label="Direction" help={fileDirection ? `The file direction is ${fileDirection}.` : 'Leave blank to use the customs file direction.'}>
            {declaration && fileDirection ? (
              <Select value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value as Direction })}><option value={fileDirection}>{fileDirection}</option></Select>
            ) : (
              <Select value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value as '' | Direction })}><option value="">Use file direction</option>{DIRECTIONS.map((direction) => <option key={direction} value={direction}>{direction}</option>)}</Select>
            )}
          </Field>
          <Field label="Paid amount (EGP)" help="Cumulative amount already paid. Stored as an exact decimal string."><Input inputMode="decimal" value={form.paidAmount} onChange={(event) => setForm({ ...form, paidAmount: event.target.value })} dir="ltr" required /></Field>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-bold text-navy-800">Declaration lines</h3><p className="mt-1 text-xs text-steel-500">Select an HS code active on the declaration date or enter its snapshot. Blank duty/tax rates use the selected code defaults, otherwise 0%.</p></div>
            <Button type="button" variant="onlight" size="sm" icon={<Plus className="h-4 w-4" />} disabled={save.isPending} onClick={() => setLines((current) => [...current, newDeclarationLine()])}>Add line</Button>
          </div>
          {hsQuery.isError ? <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700" role="alert">{errorMessage(hsQuery.error, 'Could not load HS codes.')} You can still enter an HS code snapshot manually.</p> : null}
          {hsQuery.isLoading ? <Spinner label="Loading active HS codes…" /> : null}
          {lines.map((line, index) => {
            const selectedHs = hsCodes.find((code) => code.id === line.hsCodeId);
            return (
              <fieldset key={line.key} className="rounded-xl border border-steel-200 p-4">
                <legend className="px-1 text-sm font-bold text-navy-800">Line {index + 1}</legend>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="HS code">
                    <Select
                      value={line.hsCodeId}
                      onChange={(event) => {
                        const code = hsCodes.find((item) => item.id === event.target.value);
                        updateLine(line.key, {
                          hsCodeId: event.target.value,
                          hsCodeSnapshot: code?.code ?? '',
                          dutyRatePercent: line.dutyRatePercent || code?.defaultDutyRate || '',
                          taxRatePercent: line.taxRatePercent || code?.defaultTaxRate || '',
                        });
                      }}
                    >
                      <option value="">Manual HS snapshot</option>
                      {selectedHs ? <option value={selectedHs.id}>{selectedHs.code} — {selectedHs.descriptionEn}</option> : null}
                      {!selectedHs && line.hsCodeId ? <option value={line.hsCodeId}>{line.hsCodeSnapshot || 'Selected HS code'}</option> : null}
                      {selectableHsCodes.filter((code) => code.id !== selectedHs?.id).map((code) => <option key={code.id} value={code.id}>{code.code} — {code.descriptionEn}</option>)}
                    </Select>
                  </Field>
                  <Field label="HS code snapshot *" help="Required when no HS record is selected."><Input value={line.hsCodeSnapshot} onChange={(event) => updateLine(line.key, { hsCodeSnapshot: event.target.value, hsCodeId: '' })} maxLength={30} dir="ltr" required={!line.hsCodeId} /></Field>
                  <Field label="Description *" className="sm:col-span-2"><Input value={line.description} onChange={(event) => updateLine(line.key, { description: event.target.value })} maxLength={500} required /></Field>
                  <Field label="Origin country *"><Input value={line.originCountry} onChange={(event) => updateLine(line.key, { originCountry: event.target.value.toUpperCase() })} minLength={2} maxLength={2} pattern="[A-Za-z]{2}" dir="ltr" required /></Field>
                  <Field label="Quantity *"><Input inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} dir="ltr" required /></Field>
                  <Field label="Quantity unit *"><Input value={line.quantityUnit} onChange={(event) => updateLine(line.key, { quantityUnit: event.target.value })} maxLength={20} required /></Field>
                  <Field label="Weight (kg)"><Input inputMode="decimal" value={line.weightKg} onChange={(event) => updateLine(line.key, { weightKg: event.target.value })} dir="ltr" /></Field>
                  <Field label="Customs value *"><Input inputMode="decimal" value={line.customsValue} onChange={(event) => updateLine(line.key, { customsValue: event.target.value })} dir="ltr" required /></Field>
                  <Field label="Currency *"><Input value={line.currency} onChange={(event) => updateLine(line.key, { currency: event.target.value.toUpperCase() })} minLength={3} maxLength={3} pattern="[A-Za-z]{3}" dir="ltr" required /></Field>
                  <Field label="Exchange rate to EGP *" help="Greater than zero; up to 8 decimal places."><Input inputMode="decimal" value={line.exchangeRate} onChange={(event) => updateLine(line.key, { exchangeRate: event.target.value })} dir="ltr" required /></Field>
                  <Field label="Duty rate (%)" help="0–100; up to 4 decimal places."><Input inputMode="decimal" value={line.dutyRatePercent} onChange={(event) => updateLine(line.key, { dutyRatePercent: event.target.value })} placeholder={selectedHs?.defaultDutyRate ?? '0'} dir="ltr" /></Field>
                  <Field label="Tax rate (%)" help="0–100; up to 4 decimal places."><Input inputMode="decimal" value={line.taxRatePercent} onChange={(event) => updateLine(line.key, { taxRatePercent: event.target.value })} placeholder={selectedHs?.defaultTaxRate ?? '0'} dir="ltr" /></Field>
                  <Field label="Other amount (EGP)"><Input inputMode="decimal" value={line.otherAmount} onChange={(event) => updateLine(line.key, { otherAmount: event.target.value })} dir="ltr" /></Field>
                  <div className="flex items-end justify-end"><Button type="button" variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} disabled={lines.length === 1 || save.isPending} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}>Remove line</Button></div>
                </div>
              </fieldset>
            );
          })}
          <p className="text-xs leading-5 text-steel-500">The server calculates CIF in EGP, duty, tax, fees, total payable and balance from these exact decimal inputs whenever a draft is saved and again during assessment.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-steel-200 px-5 py-4">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" disabled={!canSave} icon={<ListTree className="h-4 w-4" />}>{save.isPending ? 'Saving…' : declaration ? 'Save draft changes' : 'Create declaration'}</Button>
        </div>
      </form>
    </Panel>
  );
}

function CustomsFileDetail({ fileId, onClose, onOpenDeclaration }: { fileId: string; onClose: () => void; onOpenDeclaration: (id: string) => void }) {
  const queryClient = useQueryClient();
  const detailRef = useRef<HTMLElement>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [showStatusForm, setShowStatusForm] = useState(false);
  const [showMetadataForm, setShowMetadataForm] = useState(false);
  const [statusTarget, setStatusTarget] = useState('');
  const [statusDescription, setStatusDescription] = useState('');
  const [showAciForm, setShowAciForm] = useState(false);
  const [editingAci, setEditingAci] = useState<AciFiling | undefined>();
  const [showDeclarationForm, setShowDeclarationForm] = useState(false);
  const query = useQuery({
    queryKey: ['erp', 'customs', 'file', fileId],
    queryFn: async () => (await api.get<CustomsFileDetail>(`/erp/customs/files/${fileId}`)).data,
  });
  const file = query.data;

  useEffect(() => {
    if (!file) return;
    detailRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    detailRef.current?.focus({ preventScroll: true });
  }, [file?.id]);

  const updateStatus = useMutation({
    mutationFn: async () => api.patch(`/erp/customs/files/${fileId}/status`, { status: statusTarget, description: optionalText(statusDescription) }),
    onSuccess: async () => {
      setShowStatusForm(false);
      setStatusTarget('');
      setStatusDescription('');
      setNotice({ kind: 'success', text: 'Customs file status updated.' });
      await queryClient.invalidateQueries({ queryKey: ['erp', 'customs'] });
    },
    onError: (error) => setNotice({ kind: 'error', text: errorMessage(error, 'Could not update customs file status.') }),
  });

  if (query.isLoading) return <Panel><div className="p-8"><Spinner label="Loading customs file…" /></div></Panel>;
  if (query.isError || !file) return <Panel><QueryError message={errorMessage(query.error, 'Could not load customs file.')} onRetry={() => void query.refetch()} /><div className="border-t border-steel-200 px-5 py-4"><Button variant="ghost" onClick={onClose}>Close details</Button></div></Panel>;

  const activeDeclarations = file.declarations.filter((declaration) => declaration.status !== 'CANCELLED');
  const releaseReady = activeDeclarations.length > 0 && activeDeclarations.every((declaration) =>
    declaration.status === 'RELEASED' && compareDecimals(declaration.paidAmount, declaration.totalPayable) >= 0 && compareDecimals(declaration.balance, '0') === 0,
  );
  const transitions = FILE_TRANSITIONS[file.status];
  const open = fileCanOperate(file.status);
  const metadataEditable = fileMetadataEditable(file);

  return (
    <section ref={detailRef} tabIndex={-1} className="space-y-5 scroll-mt-6" aria-labelledby="customs-file-detail-title">
      <Panel title={file.number} actions={<Button variant="ghost" size="sm" onClick={onClose} icon={<X className="h-4 w-4" />}>Close</Button>}>
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap items-center gap-2"><h2 id="customs-file-detail-title" className="text-xl font-extrabold text-navy-800">{file.number}</h2><StatusPill status={file.status} label={file.status.replace(/_/g, ' ')} /><StatusPill status={file.direction} label={file.direction} /></div>
          {notice ? <NoticeBox notice={notice} onDismiss={() => setNotice(null)} /> : null}
          <div className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <DetailItem label="Shipment" value={`${file.shipment.trackingNumber}${file.shipment.reference ? ` · ${file.shipment.reference}` : ''}`} />
            <DetailItem label="Importer" value={`${file.importer.code} — ${file.importer.nameEn}`} />
            <DetailItem label="Broker" value={file.broker ? `${file.broker.code} — ${file.broker.nameEn}` : 'Not assigned'} />
            <DetailItem label="Port / office" value={`${file.portCode}${file.customsOffice ? ` · ${file.customsOffice}` : ''}`} />
            <DetailItem label="Opened" value={formatDateTime(file.openedAt, 'en')} />
            <DetailItem label="Closed" value={formatDateTime(file.closedAt, 'en')} />
            <DetailItem label="ACI filings" value={String(file.aciFilings.length)} />
            <DetailItem label="Declarations" value={String(file.declarations.length)} />
          </div>
          {file.notes ? <div><p className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-steel-400">Notes</p><p className="mt-1 whitespace-pre-wrap text-sm text-steel-700">{file.notes}</p></div> : null}
          <ManualNotice compact />
          <div className="flex flex-wrap gap-2">
            <Button variant="onlight" size="sm" icon={<Pencil className="h-4 w-4" />} aria-expanded={showMetadataForm} onClick={() => setShowMetadataForm((value) => !value)} disabled={!metadataEditable}>Correct metadata</Button>
            <Button variant="onlight" size="sm" icon={<RefreshCw className="h-4 w-4" />} aria-expanded={showStatusForm} onClick={() => setShowStatusForm((value) => !value)} disabled={!transitions.length || updateStatus.isPending}>Update file status</Button>
            <Button variant="onlight" size="sm" icon={<FileCheck2 className="h-4 w-4" />} aria-expanded={showAciForm} onClick={() => { setEditingAci(undefined); setShowAciForm((value) => !value); }} disabled={!open}>Add ACI record</Button>
            <Button variant="onlight" size="sm" icon={<ListTree className="h-4 w-4" />} aria-expanded={showDeclarationForm} onClick={() => setShowDeclarationForm((value) => !value)} disabled={!open}>Create declaration</Button>
          </div>
        </div>
      </Panel>

      {showMetadataForm ? <CustomsFileMetadataForm file={file} onCancel={() => setShowMetadataForm(false)} onSaved={(message) => { setShowMetadataForm(false); setNotice({ kind: 'success', text: message }); }} /> : null}

      {showStatusForm ? (
        <Panel title="Update customs file status">
          <form onSubmit={(event) => { event.preventDefault(); if (statusTarget && !updateStatus.isPending) updateStatus.mutate(); }}>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Next status *" help="Only transitions allowed by the implemented workflow are listed.">
                <Select value={statusTarget} onChange={(event) => setStatusTarget(event.target.value)} required>
                  <option value="">Select next status</option>
                  {transitions.map((status) => <option key={status} value={status} disabled={status === 'RELEASED' && !releaseReady}>{status.replace(/_/g, ' ')}{status === 'RELEASED' && !releaseReady ? ' — prerequisites not met' : ''}</option>)}
                </Select>
              </Field>
              <Field label="Status description"><Input value={statusDescription} onChange={(event) => setStatusDescription(event.target.value)} maxLength={1000} /></Field>
            </div>
            {transitions.includes('RELEASED') ? <div className="mx-5 mb-5 rounded-lg border border-steel-200 bg-steel-50 p-3 text-xs leading-5 text-steel-600"><strong className="text-steel-700">File release check:</strong> {releaseReady ? 'All active declarations are released and fully paid with zero balance.' : 'Not ready. Every active declaration must be released, fully paid and have zero balance.'}</div> : null}
            <div className="flex flex-wrap justify-end gap-2 border-t border-steel-200 px-5 py-4"><Button type="button" variant="ghost" onClick={() => setShowStatusForm(false)} disabled={updateStatus.isPending}>Cancel</Button><Button type="submit" disabled={!statusTarget || updateStatus.isPending}>{updateStatus.isPending ? 'Updating…' : 'Update status'}</Button></div>
          </form>
        </Panel>
      ) : null}

      {showAciForm ? <AciFilingForm key={editingAci?.id ?? 'new-aci'} fileId={file.id} filing={editingAci} onCancel={() => { setShowAciForm(false); setEditingAci(undefined); }} onSaved={(message) => { setShowAciForm(false); setEditingAci(undefined); setNotice({ kind: 'success', text: message }); }} /> : null}

      {showDeclarationForm ? <DeclarationCreator fileId={file.id} fileNumber={file.number} fileDirection={file.direction} onCancel={() => setShowDeclarationForm(false)} onCreated={(declaration) => { setShowDeclarationForm(false); onOpenDeclaration(declaration.id); }} /> : null}

      <Panel title={`ACI & Nafeza filings (${file.aciFilings.length})`}>
        {file.aciFilings.length ? <div className="divide-y divide-steel-100">{file.aciFilings.map((filing) => (
          <article key={filing.id} className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><StatusPill status={filing.status} label={filing.status} /><span className="text-xs text-steel-400">Recorded {formatDateTime(filing.createdAt, 'en')}</span></div><Button variant="ghost" size="sm" disabled={!open} onClick={() => { setEditingAci(filing); setShowAciForm(true); }}>Edit record</Button></div>
            <div className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <DetailItem label="ACID" value={filing.acidNumber ?? '—'} /><DetailItem label="Nafeza request" value={filing.nafezaRequestNumber ?? '—'} /><DetailItem label="Nafeza item" value={filing.nafezaItemNumber ?? '—'} /><DetailItem label="Response reference" value={filing.responseReference ?? '—'} /><DetailItem label="Submitted at" value={formatDateTime(filing.submittedAt, 'en')} /><DetailItem label="Responded at" value={formatDateTime(filing.respondedAt, 'en')} /><DetailItem label="Payload hash" value={filing.payloadHash ?? '—'} />
            </div>
            {filing.notes ? <p className="whitespace-pre-wrap text-sm text-steel-600">{filing.notes}</p> : null}
          </article>
        ))}</div> : <EmptySection icon={<FileCheck2 className="h-5 w-5" />}>No ACI filing records. Add references after handling ACI/Nafeza manually.</EmptySection>}
      </Panel>

      <Panel title={`Declarations (${file.declarations.length})`}>
        {file.declarations.length ? <Table><thead><tr><Th>Declaration</Th><Th>Direction</Th><Th>Status</Th><Th>Payable (EGP)</Th><Th>Balance (EGP)</Th><Th><span className="sr-only">Actions</span></Th></tr></thead><tbody>{file.declarations.map((declaration) => (
          <tr key={declaration.id}><Td><button type="button" onClick={() => onOpenDeclaration(declaration.id)} className="font-bold text-navy-800 hover:text-brand-700 hover:underline">{declaration.number}</button>{declaration.declarationNumber ? <span className="mt-1 block font-mono text-[0.68rem] text-steel-400">{declaration.declarationNumber}</span> : null}</Td><Td>{declaration.direction}</Td><Td><StatusPill status={declaration.status} label={declaration.status} /></Td><Td className="font-mono text-xs">{declaration.totalPayable}</Td><Td className="font-mono text-xs">{declaration.balance}</Td><Td><Button variant="ghost" size="sm" onClick={() => onOpenDeclaration(declaration.id)}>View</Button></Td></tr>
        ))}</tbody></Table> : <EmptySection icon={<ClipboardList className="h-5 w-5" />}>No declarations created for this file.</EmptySection>}
      </Panel>

      <Panel title={`Status history (${file.events.length})`}>
        {file.events.length ? <ol className="divide-y divide-steel-100">{file.events.map((event) => <li key={event.id} className="px-5 py-4"><div className="flex flex-wrap items-center gap-2"><StatusPill status={event.status} label={event.status.replace(/_/g, ' ')} /><span className="text-xs text-steel-500">{formatDateTime(event.occurredAt, 'en')}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-steel-700">{event.description}</p></li>)}</ol> : <EmptySection icon={<ClipboardList className="h-5 w-5" />}>No status events recorded.</EmptySection>}
      </Panel>
    </section>
  );
}

function DeclarationsWorkspace({ onSelect }: { onSelect: (id: string) => void }) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [direction, setDirection] = useState('');
  const [customsFileId, setCustomsFileId] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (direction) params.set('direction', direction);
  if (customsFileId) params.set('customsFileId', customsFileId);
  const query = useQuery({
    queryKey: ['erp', 'customs', 'declarations', { search, status, direction, customsFileId, page }],
    queryFn: async () => api.get<DeclarationRow[]>(`/erp/customs/declarations?${params.toString()}`),
  });
  const declarations = query.data?.data ?? [];
  const meta = query.data?.meta as PageMeta | undefined;

  return (
    <div className="space-y-5">
      <Panel>
        <form className="grid gap-3 border-b border-steel-200 p-4 sm:grid-cols-2 xl:grid-cols-[1fr_11rem_10rem_14rem_auto]" onSubmit={(event: FormEvent) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()); }}>
          <AdminField label="Search declarations"><Input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Number, shipment, HS code or description" maxLength={160} /></AdminField>
          <AdminField label="Status"><Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{DECLARATION_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}</Select></AdminField>
          <AdminField label="Direction"><Select value={direction} onChange={(event) => { setDirection(event.target.value); setPage(1); }}><option value="">All directions</option>{DIRECTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</Select></AdminField>
          <AdminField label="Customs file ID"><Input value={customsFileId} onChange={(event) => { setCustomsFileId(event.target.value.trim()); setPage(1); }} placeholder="Optional UUID" dir="ltr" /></AdminField>
          <div className="flex items-end gap-2"><Button type="submit" variant="onlight">Search</Button>{(search || status || direction || customsFileId) ? <Button type="button" variant="ghost" onClick={() => { setSearchInput(''); setSearch(''); setStatus(''); setDirection(''); setCustomsFileId(''); setPage(1); }}>Clear</Button> : null}</div>
        </form>
        {query.isLoading ? <div className="p-8"><Spinner label="Loading declarations…" /></div> : query.isError ? <QueryError message={errorMessage(query.error, 'Could not load declarations.')} onRetry={() => void query.refetch()} /> : (
          <>
            <Table><thead><tr><Th>Declaration</Th><Th>File / shipment</Th><Th>Direction</Th><Th>Status</Th><Th>Payable (EGP)</Th><Th>Paid / balance (EGP)</Th><Th>Lines</Th><Th><span className="sr-only">Actions</span></Th></tr></thead><tbody>
              {!declarations.length ? <EmptyRow colSpan={8} message={search || status || direction || customsFileId ? 'No declarations match these filters.' : 'No customs declarations yet.'} /> : declarations.map((declaration) => (
                <tr key={declaration.id}><Td><button type="button" onClick={() => onSelect(declaration.id)} className="text-start font-bold text-navy-800 hover:text-brand-700 hover:underline">{declaration.number}</button>{declaration.declarationNumber ? <span className="mt-1 block font-mono text-[0.68rem] text-steel-400">{declaration.declarationNumber}</span> : null}</Td><Td>{declaration.customsFile.number}<span className="mt-1 block text-[0.68rem] text-steel-400">{declaration.customsFile.shipment.trackingNumber}</span></Td><Td>{declaration.direction}</Td><Td><StatusPill status={declaration.status} label={declaration.status} /></Td><Td className="font-mono text-xs">{declaration.totalPayable}</Td><Td className="font-mono text-xs">{declaration.paidAmount}<span className="mt-1 block text-steel-400">Balance {declaration.balance}</span></Td><Td>{declaration._count.lines}</Td><Td><Button variant="ghost" size="sm" onClick={() => onSelect(declaration.id)}>View</Button></Td></tr>
              ))}
            </tbody></Table>
            <Pagination meta={meta} page={page} onPage={setPage} disabled={query.isFetching} />
          </>
        )}
      </Panel>
      <div className="flex justify-end"><Button variant="onlight" icon={<ListTree className="h-4 w-4" />} aria-expanded={showCreate} onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Close new declaration' : 'New declaration'}</Button></div>
      {showCreate ? <DeclarationCreator onCancel={() => setShowCreate(false)} onCreated={(declaration) => { setShowCreate(false); onSelect(declaration.id); }} /> : null}
    </div>
  );
}

function DeclarationDetail({ declarationId, onClose, onBackToFile }: { declarationId: string; onClose: () => void; onBackToFile: (fileId: string) => void }) {
  const queryClient = useQueryClient();
  const detailRef = useRef<HTMLElement>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [assessForm, setAssessForm] = useState({ declarationNumber: '', declarationDate: '', assessedDate: '' });
  const [releaseForm, setReleaseForm] = useState({ paidAmount: '', paymentReference: '', releasedDate: '' });
  const query = useQuery({
    queryKey: ['erp', 'customs', 'declaration', declarationId],
    queryFn: async () => (await api.get<DeclarationDetail>(`/erp/customs/declarations/${declarationId}`)).data,
  });
  const declaration = query.data;

  useEffect(() => {
    if (declaration) setReleaseForm((current) => ({ ...current, paidAmount: current.paidAmount || declaration.totalPayable }));
  }, [declaration?.id, declaration?.totalPayable]);

  useEffect(() => {
    if (!declaration) return;
    detailRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    detailRef.current?.focus({ preventScroll: true });
  }, [declaration?.id]);

  const assess = useMutation({
    mutationFn: async () => api.post(`/erp/customs/declarations/${declarationId}/assess`, {
      declarationNumber: optionalText(assessForm.declarationNumber),
      declarationDate: optionalDate(assessForm.declarationDate),
      assessedDate: optionalDate(assessForm.assessedDate),
    }),
    onSuccess: async () => {
      setAssessForm({ declarationNumber: '', declarationDate: '', assessedDate: '' });
      setNotice({ kind: 'success', text: 'Declaration assessed. Server-calculated totals were refreshed.' });
      await queryClient.invalidateQueries({ queryKey: ['erp', 'customs'] });
    },
    onError: (error) => setNotice({ kind: 'error', text: errorMessage(error, 'Could not assess declaration.') }),
  });
  const release = useMutation({
    mutationFn: async () => api.post(`/erp/customs/declarations/${declarationId}/release`, {
      paidAmount: releaseForm.paidAmount,
      paymentReference: optionalText(releaseForm.paymentReference),
      releasedDate: optionalDate(releaseForm.releasedDate),
    }),
    onSuccess: async () => {
      setNotice({ kind: 'success', text: 'Declaration released. Related customs file status was refreshed.' });
      await queryClient.invalidateQueries({ queryKey: ['erp', 'customs'] });
    },
    onError: (error) => setNotice({ kind: 'error', text: errorMessage(error, 'Could not release declaration.') }),
  });
  const cancel = useMutation({
    mutationFn: async () => api.post(`/erp/customs/declarations/${declarationId}/cancel`, { reason: optionalText(cancelReason) }),
    onSuccess: async () => {
      setShowCancelForm(false);
      setCancelReason('');
      setNotice({ kind: 'success', text: 'Draft declaration cancelled and retained in history.' });
      await queryClient.invalidateQueries({ queryKey: ['erp', 'customs'] });
    },
    onError: (error) => setNotice({ kind: 'error', text: errorMessage(error, 'Could not cancel declaration.') }),
  });

  const downloadDocument = async (document: DeclarationDocument['document']) => {
    try {
      const response = await fetch(`${API_BASE}/erp/documents/${document.id}/download`, { credentials: 'include' });
      if (!response.ok) throw new Error('Download failed');
      const url = URL.createObjectURL(await response.blob());
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = document.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setNotice({ kind: 'error', text: 'Document download failed. Please try again.' });
    }
  };

  if (query.isLoading) return <Panel><div className="p-8"><Spinner label="Loading declaration…" /></div></Panel>;
  if (query.isError || !declaration) return <Panel><QueryError message={errorMessage(query.error, 'Could not load declaration.')} onRetry={() => void query.refetch()} /><div className="border-t border-steel-200 px-5 py-4"><Button variant="ghost" onClick={onClose}>Close details</Button></div></Panel>;

  const fileOpen = fileCanOperate(declaration.customsFile.status);
  const canEdit = fileOpen && declaration.status === 'DRAFT' && declaration.bills.length === 0;
  const canCancel = canEdit && !declaration.declarationNumber && compareDecimals(declaration.paidAmount, '0') === 0 && !declaration.charges.some((charge) => charge.isPaid);
  const canAssess = fileOpen && (declaration.status === 'DRAFT' || declaration.status === 'SUBMITTED');
  const canRelease = fileOpen && (declaration.status === 'ASSESSED' || declaration.status === 'PAID');

  return (
    <section ref={detailRef} tabIndex={-1} className="space-y-5 scroll-mt-6" aria-labelledby="declaration-detail-title">
      <Panel title={declaration.number} actions={<div className="flex gap-2"><Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => onBackToFile(declaration.customsFile.id)}>File</Button><Button variant="ghost" size="sm" onClick={onClose} icon={<X className="h-4 w-4" />}>Close</Button></div>}>
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap items-center gap-2"><h2 id="declaration-detail-title" className="text-xl font-extrabold text-navy-800">{declaration.number}</h2><StatusPill status={declaration.status} label={declaration.status} /><StatusPill status={declaration.direction} label={declaration.direction} /></div>
          {notice ? <NoticeBox notice={notice} onDismiss={() => setNotice(null)} /> : null}
          <div className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <DetailItem label="Declaration number" value={declaration.declarationNumber ?? '—'} /><DetailItem label="Customs file" value={declaration.customsFile.number} /><DetailItem label="Shipment" value={declaration.customsFile.shipment.trackingNumber} /><DetailItem label="Importer" value={declaration.customsFile.importer.nameEn} /><DetailItem label="Port" value={declaration.customsFile.portCode} /><DetailItem label="Declaration date" value={formatDateTime(declaration.declarationDate, 'en')} /><DetailItem label="Assessed" value={formatDateTime(declaration.assessedDate, 'en')} /><DetailItem label="Released" value={formatDateTime(declaration.releasedDate, 'en')} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Total CIF (EGP)', declaration.totalCifEgp],
              ['Duty (EGP)', declaration.totalDuty],
              ['Tax (EGP)', declaration.totalTax],
              ['Fees (EGP)', declaration.totalFees],
              ['Total payable (EGP)', declaration.totalPayable],
              ['Paid (EGP)', declaration.paidAmount],
              ['Balance (EGP)', declaration.balance],
              ['Lines', String(declaration.lines.length)],
            ].map(([label, value]) => <div key={label} className="rounded-xl border border-steel-200 bg-steel-50/70 p-4"><p className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-steel-400">{label}</p><p className="mt-1 break-all font-mono text-sm font-semibold text-navy-800">{value}</p></div>)}
          </div>
          <ManualNotice compact />
          {canEdit || canCancel ? <div className="flex flex-wrap gap-2">
            <Button variant="onlight" size="sm" icon={<Pencil className="h-4 w-4" />} aria-expanded={showEditor} onClick={() => { setShowEditor((value) => !value); setShowCancelForm(false); }}>Edit draft</Button>
            {canCancel ? <Button variant="ghost" size="sm" icon={<Ban className="h-4 w-4" />} aria-expanded={showCancelForm} onClick={() => { setShowCancelForm((value) => !value); setShowEditor(false); }}>Cancel declaration</Button> : null}
          </div> : null}
        </div>
      </Panel>

      {showEditor ? <DeclarationCreator key={declaration.id} declaration={declaration} fileNumber={declaration.customsFile.number} fileDirection={declaration.customsFile.direction} onCancel={() => setShowEditor(false)} onCreated={() => { setShowEditor(false); setNotice({ kind: 'success', text: 'Draft declaration updated. Version and server-calculated totals were refreshed.' }); }} /> : null}

      {showCancelForm ? (
        <Panel title="Cancel draft declaration">
          <form onSubmit={(event) => { event.preventDefault(); if (!cancel.isPending) cancel.mutate(); }}>
            <div className="space-y-4 p-5">
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">This records an audited DRAFT to CANCELLED transition. The declaration and its lines are retained; nothing is hard-deleted.</p>
              <Field label="Cancellation reason"><Input value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={1000} /></Field>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-steel-200 px-5 py-4"><Button type="button" variant="ghost" onClick={() => setShowCancelForm(false)} disabled={cancel.isPending}>Keep draft</Button><Button type="submit" disabled={cancel.isPending} icon={<Ban className="h-4 w-4" />}>{cancel.isPending ? 'Cancelling…' : 'Cancel declaration'}</Button></div>
          </form>
        </Panel>
      ) : null}

      {canAssess ? (
        <Panel title="Assess declaration">
          <form onSubmit={(event) => { event.preventDefault(); if (!assess.isPending) assess.mutate(); }}>
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              <Field label="Declaration number"><Input value={assessForm.declarationNumber} onChange={(event) => setAssessForm({ ...assessForm, declarationNumber: event.target.value })} maxLength={120} dir="ltr" /></Field>
              <Field label="Declaration date"><Input type="datetime-local" value={assessForm.declarationDate} onChange={(event) => setAssessForm({ ...assessForm, declarationDate: event.target.value })} /></Field>
              <Field label="Assessed date"><Input type="datetime-local" value={assessForm.assessedDate} onChange={(event) => setAssessForm({ ...assessForm, assessedDate: event.target.value })} /></Field>
            </div>
            <p className="px-5 pb-5 text-xs leading-5 text-steel-500">Assessment recalculates duty, tax, fees and balance on the server and records the declaration as ASSESSED. It does not submit or pay anything to a government system.</p>
            <div className="flex justify-end border-t border-steel-200 px-5 py-4"><Button type="submit" disabled={assess.isPending} icon={<Scale className="h-4 w-4" />}>{assess.isPending ? 'Assessing…' : 'Assess declaration'}</Button></div>
          </form>
        </Panel>
      ) : null}

      {canRelease ? (
        <Panel title="Release declaration">
          <form onSubmit={(event) => { event.preventDefault(); if (!release.isPending && releaseForm.paidAmount) release.mutate(); }}>
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              <Field label="Cumulative paid amount (EGP) *" help={`Must be at least ${declaration.totalPayable} and not lower than the recorded ${declaration.paidAmount}.`}><Input inputMode="decimal" value={releaseForm.paidAmount} onChange={(event) => setReleaseForm({ ...releaseForm, paidAmount: event.target.value })} dir="ltr" required /></Field>
              <Field label="Payment reference"><Input value={releaseForm.paymentReference} onChange={(event) => setReleaseForm({ ...releaseForm, paymentReference: event.target.value })} maxLength={160} dir="ltr" /></Field>
              <Field label="Released date"><Input type="datetime-local" value={releaseForm.releasedDate} onChange={(event) => setReleaseForm({ ...releaseForm, releasedDate: event.target.value })} /></Field>
            </div>
            <p className="px-5 pb-5 text-xs leading-5 text-steel-500">Release is available only for an assessed or paid declaration on an open customs file. The server rejects insufficient payment and automatically releases the file only when every active declaration is released and fully paid.</p>
            <div className="flex justify-end border-t border-steel-200 px-5 py-4"><Button type="submit" disabled={release.isPending || !releaseForm.paidAmount} icon={<CheckCircle2 className="h-4 w-4" />}>{release.isPending ? 'Releasing…' : 'Release declaration'}</Button></div>
          </form>
        </Panel>
      ) : (
        <Panel><div className="p-5 text-sm text-steel-600"><strong className="text-navy-800">Release unavailable.</strong> {!fileOpen ? `The customs file is ${declaration.customsFile.status}.` : 'A declaration must be ASSESSED or PAID before it can be released.'}</div></Panel>
      )}

      <Panel title={`Declaration lines (${declaration.lines.length})`}>
        {declaration.lines.length ? <Table><thead><tr><Th>Line / HS</Th><Th>Goods</Th><Th>Quantity</Th><Th>Value / rate</Th><Th>Duty</Th><Th>Tax</Th><Th>Total (EGP)</Th></tr></thead><tbody>{declaration.lines.map((line) => (
          <tr key={line.id}><Td><span className="font-semibold text-navy-800">#{line.lineNumber} · {line.hsCodeSnapshot}</span>{line.hsCode ? <span className="mt-1 block text-[0.68rem] text-steel-400">{line.hsCode.descriptionEn}</span> : null}</Td><Td>{line.description}<span className="mt-1 block text-[0.68rem] text-steel-400">Origin {line.originCountry}{line.weightKg ? ` · ${line.weightKg} kg` : ''}</span></Td><Td className="whitespace-nowrap font-mono text-xs">{line.quantity} {line.quantityUnit}</Td><Td><span className="block font-mono text-xs">{line.customsValue} {line.currency}</span><span className="mt-1 block font-mono text-[0.68rem] text-steel-400">FX {line.exchangeRate} · CIF {line.cifValueEgp}</span></Td><Td><span className="block font-mono text-xs">{line.dutyAmount}</span><span className="mt-1 block text-[0.68rem] text-steel-400">{line.dutyRatePercent}%</span></Td><Td><span className="block font-mono text-xs">{line.taxAmount}</span><span className="mt-1 block text-[0.68rem] text-steel-400">{line.taxRatePercent}%</span></Td><Td className="font-mono text-xs">{line.totalAmount}<span className="mt-1 block text-[0.68rem] text-steel-400">Other {line.otherAmount}</span></Td></tr>
        ))}</tbody></Table> : <EmptySection icon={<ListTree className="h-5 w-5" />}>No declaration lines.</EmptySection>}
      </Panel>

      {declaration.bills.length ? <Panel title={`Linked bills (${declaration.bills.length})`}>
        <Table><thead><tr><Th>Bill</Th><Th>Status</Th></tr></thead><tbody>{declaration.bills.map((bill) => <tr key={bill.id}><Td>{bill.number}</Td><Td><StatusPill status={bill.status} label={bill.status.replace(/_/g, ' ')} /></Td></tr>)}</tbody></Table>
        <p className="px-5 pb-5 text-xs leading-5 text-steel-500">Bill-linked declarations cannot be edited or cancelled.</p>
      </Panel> : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title={`Charges (${declaration.charges.length})`}>
          {declaration.charges.length ? <Table><thead><tr><Th>Charge</Th><Th>Amount</Th><Th>EGP</Th><Th>Paid</Th></tr></thead><tbody>{declaration.charges.map((charge) => <tr key={charge.id}><Td>{charge.label}{charge.chargeItem ? <span className="mt-1 block text-[0.68rem] text-steel-400">{charge.chargeItem.code}</span> : null}</Td><Td className="font-mono text-xs">{charge.amount} {charge.currency}<span className="mt-1 block text-[0.68rem] text-steel-400">FX {charge.exchangeRate}</span></Td><Td className="font-mono text-xs">{charge.amountEgp}</Td><Td>{charge.isPaid ? 'Yes' : 'No'}</Td></tr>)}</tbody></Table> : <EmptySection icon={<ReceiptIcon />}>No separate charges recorded.</EmptySection>}
        </Panel>
        <Panel title={`Documents (${declaration.documents.length})`}>
          {declaration.documents.length ? <Table><thead><tr><Th>Document</Th><Th>Category</Th><Th><span className="sr-only">Download</span></Th></tr></thead><tbody>{declaration.documents.map(({ document }) => <tr key={document.id}><Td>{document.fileName}<span className="mt-1 block text-[0.68rem] text-steel-400">{formatDateTime(document.createdAt, 'en')}</span></Td><Td>{document.category.replace(/_/g, ' ')}</Td><Td><Button variant="ghost" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => void downloadDocument(document)}>Download</Button></Td></tr>)}</tbody></Table> : <EmptySection icon={<Files className="h-5 w-5" />}>No documents linked.</EmptySection>}
        </Panel>
      </div>
    </section>
  );
}

function ReceiptIcon() {
  return <ClipboardList className="h-5 w-5" aria-hidden="true" />;
}

interface HsCodeForm {
  code: string;
  descriptionEn: string;
  descriptionAr: string;
  defaultDutyRate: string;
  defaultTaxRate: string;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string;
}

const EMPTY_HS_CODE_FORM: HsCodeForm = { code: '', descriptionEn: '', descriptionAr: '', defaultDutyRate: '0', defaultTaxRate: '0', isActive: true, effectiveFrom: '', effectiveTo: '' };

function hsCodeForm(code: HsCode): HsCodeForm {
  return {
    code: code.code,
    descriptionEn: code.descriptionEn,
    descriptionAr: code.descriptionAr ?? '',
    defaultDutyRate: code.defaultDutyRate,
    defaultTaxRate: code.defaultTaxRate,
    isActive: code.isActive,
    effectiveFrom: toLocalDate(code.effectiveFrom),
    effectiveTo: code.effectiveTo ? toLocalDate(code.effectiveTo) : '',
  };
}

function hsCodeStatus(code: HsCode): { status: string; label: string } {
  const now = Date.now();
  if (!code.isActive) return { status: 'CANCELLED', label: 'Inactive' };
  if (new Date(code.effectiveFrom).getTime() > now) return { status: 'PENDING', label: 'Scheduled' };
  if (code.effectiveTo && new Date(code.effectiveTo).getTime() <= now) return { status: 'EXPIRED', label: 'Expired' };
  return { status: 'COMPLETED', label: 'Active' };
}

function HsCodesWorkspace() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editingCode, setEditingCode] = useState<HsCode | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [form, setForm] = useState<HsCodeForm>(EMPTY_HS_CODE_FORM);
  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (search) params.set('search', search);
  if (active) params.set('isActive', active);
  const query = useQuery({
    queryKey: ['erp', 'customs', 'hs-codes', 'list', { search, active, page }],
    queryFn: async () => api.get<HsCode[]>(`/erp/customs/hs-codes?${params.toString()}`),
  });
  const codes = query.data?.data ?? [];
  const meta = query.data?.meta as PageMeta | undefined;
  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code,
        descriptionEn: form.descriptionEn,
        descriptionAr: form.descriptionAr.trim() || null,
        defaultDutyRate: form.defaultDutyRate || '0',
        defaultTaxRate: form.defaultTaxRate || '0',
        isActive: form.isActive,
        effectiveFrom: form.effectiveFrom || undefined,
        effectiveTo: form.effectiveTo || null,
      };
      if (editingCode) return api.patch(`/erp/customs/hs-codes/${editingCode.id}`, payload);
      return api.post('/erp/customs/hs-codes', payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['erp', 'customs', 'hs-codes'] });
      setShowCreate(false);
      setEditingCode(null);
      setForm(EMPTY_HS_CODE_FORM);
      setNotice({ kind: 'success', text: editingCode ? 'HS code corrected. Historical declaration snapshots were not changed.' : 'HS code created.' });
    },
    onError: (error) => setNotice({ kind: 'error', text: errorMessage(error, editingCode ? 'Could not update HS code.' : 'Could not create HS code.') }),
  });
  const setActiveState = useMutation({
    mutationFn: async ({ code, isActive }: { code: HsCode; isActive: boolean }) => api.patch(`/erp/customs/hs-codes/${code.id}`, { isActive }),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['erp', 'customs', 'hs-codes'] });
      setNotice({ kind: 'success', text: variables.isActive ? 'HS code restored for eligible declaration dates.' : 'HS code deactivated. Historical declaration snapshots were retained.' });
    },
    onError: (error) => setNotice({ kind: 'error', text: errorMessage(error, 'Could not change HS code availability.') }),
  });
  const datesValid = !form.effectiveFrom || !form.effectiveTo || form.effectiveTo > form.effectiveFrom;
  const canSave = !save.isPending && form.code.trim().length >= 2 && !!form.descriptionEn.trim() && datesValid;
  const closeForm = () => { setShowCreate(false); setEditingCode(null); setForm(EMPTY_HS_CODE_FORM); };
  const editCode = (code: HsCode) => { setShowCreate(false); setEditingCode(code); setForm(hsCodeForm(code)); };

  return (
    <div className="space-y-5">
      {notice ? <NoticeBox notice={notice} onDismiss={() => setNotice(null)} /> : null}
      <Panel>
        <form className="grid gap-3 border-b border-steel-200 p-4 sm:grid-cols-[1fr_10rem_auto]" onSubmit={(event: FormEvent) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()); }}>
          <AdminField label="Search HS codes"><Input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Code or English / Arabic description" maxLength={160} /></AdminField>
          <AdminField label="Active status"><Select value={active} onChange={(event) => { setActive(event.target.value); setPage(1); }}><option value="">Active and inactive</option><option value="true">Active only</option><option value="false">Inactive only</option></Select></AdminField>
          <div className="flex items-end gap-2"><Button type="submit" variant="onlight">Search</Button>{(search || active) ? <Button type="button" variant="ghost" onClick={() => { setSearchInput(''); setSearch(''); setActive(''); setPage(1); }}>Clear</Button> : null}</div>
        </form>
        {query.isLoading ? <div className="p-8"><Spinner label="Loading HS codes…" /></div> : query.isError ? <QueryError message={errorMessage(query.error, 'Could not load HS codes.')} onRetry={() => void query.refetch()} /> : (
          <>
            <Table><thead><tr><Th>HS code</Th><Th>Description</Th><Th>Default duty</Th><Th>Default tax</Th><Th>Status</Th><Th>Effective dates</Th><Th><span className="sr-only">Actions</span></Th></tr></thead><tbody>
              {!codes.length ? <EmptyRow colSpan={7} message={search || active ? 'No HS codes match these filters.' : 'No HS codes found.'} /> : codes.map((code) => {
                const status = hsCodeStatus(code);
                return <tr key={code.id}><Td className="font-mono font-bold text-navy-800">{code.code}</Td><Td>{code.descriptionEn}{code.descriptionAr ? <span className="mt-1 block text-xs text-steel-500" dir="rtl">{code.descriptionAr}</span> : null}</Td><Td className="font-mono text-xs">{code.defaultDutyRate}%</Td><Td className="font-mono text-xs">{code.defaultTaxRate}%</Td><Td><StatusPill status={status.status} label={status.label} /></Td><Td><span className="block">{formatDate(code.effectiveFrom, 'en')}</span><span className="mt-1 block text-[0.68rem] text-steel-400">To {formatDate(code.effectiveTo, 'en')}</span></Td><Td><div className="flex flex-wrap justify-end gap-1"><Button variant="ghost" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => editCode(code)} disabled={save.isPending || setActiveState.isPending}>Edit</Button>{code.isActive ? <Button variant="ghost" size="sm" icon={<Ban className="h-4 w-4" />} onClick={() => setActiveState.mutate({ code, isActive: false })} disabled={save.isPending || setActiveState.isPending}>Deactivate</Button> : <Button variant="ghost" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setActiveState.mutate({ code, isActive: true })} disabled={save.isPending || setActiveState.isPending}>Restore</Button>}</div></Td></tr>;
              })}
            </tbody></Table>
            <Pagination meta={meta} page={page} onPage={setPage} disabled={query.isFetching} />
          </>
        )}
      </Panel>
      <div className="flex justify-end"><Button variant="onlight" icon={<Plus className="h-4 w-4" />} aria-expanded={showCreate} onClick={() => { setEditingCode(null); setForm(EMPTY_HS_CODE_FORM); setShowCreate((value) => !value); }}>{showCreate ? 'Close new HS code' : 'New HS code'}</Button></div>
      {showCreate || editingCode ? (
        <Panel title={editingCode ? `Edit HS code ${editingCode.code}` : 'Create HS code'}>
          <form onSubmit={(event) => { event.preventDefault(); if (canSave) save.mutate(); }}>
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="HS code *" help="2–20 characters; letters, numbers, dots and hyphens."><Input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} minLength={2} maxLength={20} pattern="[A-Za-z0-9][A-Za-z0-9.-]+" dir="ltr" required /></Field>
              <Field label="English description *" className="sm:col-span-2"><Input value={form.descriptionEn} onChange={(event) => setForm({ ...form, descriptionEn: event.target.value })} maxLength={500} required /></Field>
              <Field label="Arabic description" className="sm:col-span-2 lg:col-span-3"><Input value={form.descriptionAr} onChange={(event) => setForm({ ...form, descriptionAr: event.target.value })} maxLength={500} dir="rtl" /></Field>
              <Field label="Default duty rate (%)" help="0–100; up to 4 decimal places."><Input inputMode="decimal" value={form.defaultDutyRate} onChange={(event) => setForm({ ...form, defaultDutyRate: event.target.value })} dir="ltr" /></Field>
              <Field label="Default tax rate (%)" help="0–100; up to 4 decimal places."><Input inputMode="decimal" value={form.defaultTaxRate} onChange={(event) => setForm({ ...form, defaultTaxRate: event.target.value })} dir="ltr" /></Field>
              <label className="flex items-end gap-2 pb-2 text-sm text-steel-700"><Input type="checkbox" className="h-4 w-4" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />Active for declaration selection</label>
              <Field label="Effective from"><Input type="date" value={form.effectiveFrom} onChange={(event) => setForm({ ...form, effectiveFrom: event.target.value })} /></Field>
              <Field label="Effective to" help={!datesValid ? 'End must be after start.' : undefined}><Input type="date" value={form.effectiveTo} onChange={(event) => setForm({ ...form, effectiveTo: event.target.value })} /></Field>
            </div>
            {editingCode ? <p className="px-5 pb-5 text-xs leading-5 text-steel-500">Code, description and default-rate corrections apply to future selections only. Existing declaration line snapshots remain unchanged.</p> : null}
            <div className="flex flex-wrap justify-end gap-2 border-t border-steel-200 px-5 py-4"><Button type="button" variant="ghost" onClick={closeForm} disabled={save.isPending}>Cancel</Button><Button type="submit" disabled={!canSave} icon={<BookOpen className="h-4 w-4" />}>{save.isPending ? 'Saving…' : editingCode ? 'Save HS code correction' : 'Create HS code'}</Button></div>
          </form>
        </Panel>
      ) : null}
    </div>
  );
}

type WorkspaceTab = 'FILES' | 'DECLARATIONS' | 'HS_CODES';

export default function Customs() {
  const [tab, setTab] = useState<WorkspaceTab>('FILES');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedDeclarationId, setSelectedDeclarationId] = useState<string | null>(null);

  const openFile = (id: string) => {
    setSelectedDeclarationId(null);
    setSelectedFileId(id);
  };
  const openDeclaration = (id: string) => {
    setSelectedDeclarationId(id);
    setTab('DECLARATIONS');
  };

  return (
    <AdminPage title="Egyptian customs & ACI" description="Customs files, manual ACI/Nafeza records, declarations, assessment, release and HS code reference data.">
      <ManualNotice />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Customs workspaces">
          {([
            ['FILES', 'Customs files', Files],
            ['DECLARATIONS', 'Declarations', ClipboardList],
            ['HS_CODES', 'HS codes', BookOpen],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              id={`customs-tab-${value}`}
              aria-selected={tab === value}
              aria-controls={`customs-panel-${value}`}
              onClick={() => setTab(value)}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition ${tab === value ? 'border-navy-800 bg-navy-800 text-white' : 'border-steel-200 bg-white text-steel-600 hover:border-brand-300 hover:text-brand-700'}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />{label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-steel-500"><Landmark className="h-4 w-4" aria-hidden="true" />Egyptian customs operations</div>
      </div>

      <div role="tabpanel" id={`customs-panel-${tab}`} aria-labelledby={`customs-tab-${tab}`}>
        {tab === 'FILES' ? <CustomsFilesWorkspace onSelect={openFile} /> : null}
        {tab === 'DECLARATIONS' ? <DeclarationsWorkspace onSelect={openDeclaration} /> : null}
        {tab === 'HS_CODES' ? <HsCodesWorkspace /> : null}
      </div>

      {tab === 'FILES' && selectedFileId ? <CustomsFileDetail fileId={selectedFileId} onClose={() => setSelectedFileId(null)} onOpenDeclaration={openDeclaration} /> : null}
      {tab === 'DECLARATIONS' && selectedDeclarationId ? <DeclarationDetail declarationId={selectedDeclarationId} onClose={() => setSelectedDeclarationId(null)} onBackToFile={(fileId) => { setSelectedDeclarationId(null); setSelectedFileId(fileId); setTab('FILES'); }} /> : null}
      {tab === 'FILES' && !selectedFileId ? <StatePanel icon={<Globe2 className="h-5 w-5" />} title="Select a customs file" body="Open a file to record ACI/Nafeza references, manage declarations and follow the customs status history." /> : null}
      {tab === 'DECLARATIONS' && !selectedDeclarationId ? <StatePanel icon={<Hash className="h-5 w-5" />} title="Select a declaration" body="Open a declaration to review exact decimal calculations, assess it, or release it when payment and status prerequisites are met." /> : null}
    </AdminPage>
  );
}
