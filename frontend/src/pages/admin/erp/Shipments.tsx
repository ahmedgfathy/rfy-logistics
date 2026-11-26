import { cloneElement, isValidElement, useEffect, useRef, useState, useId, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Ban,
  Box,
  Clipboard,
  Container,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Package,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Save,
  Ship,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { API_BASE, api, ApiError } from '../../../lib/api';
import { AdminField, AdminPage, EmptyRow, Panel, Table, Td, Th } from '../../../components/admin/ui';
import { Button } from '../../../components/ui/Button';
import { Field as UIField, Input, Select, Textarea } from '../../../components/ui/Field';
import { Spinner, StatePanel } from '../../../components/ui/Spinner';
import { StatusPill } from '../../../components/ui/StatusPill';
import { formatDate, formatDateTime } from '../../../lib/utils';

const SHIPMENT_STATUSES = [
  'BOOKED',
  'ORIGIN_PICKUP',
  'DEPARTED_ORIGIN',
  'IN_TRANSIT',
  'CUSTOMS_CLEARANCE',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELAYED',
  'CANCELLED',
] as const;
const FREIGHT_MODES = ['SEA', 'AIR', 'ROAD', 'RAIL', 'MULTIMODAL'] as const;
const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  BOOKED: ['ORIGIN_PICKUP', 'DEPARTED_ORIGIN', 'IN_TRANSIT', 'DELAYED', 'CANCELLED'],
  ORIGIN_PICKUP: ['DEPARTED_ORIGIN', 'IN_TRANSIT', 'DELAYED', 'CANCELLED'],
  DEPARTED_ORIGIN: ['IN_TRANSIT', 'CUSTOMS_CLEARANCE', 'DELAYED', 'CANCELLED'],
  IN_TRANSIT: ['CUSTOMS_CLEARANCE', 'OUT_FOR_DELIVERY', 'DELAYED', 'CANCELLED'],
  CUSTOMS_CLEARANCE: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELAYED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'DELAYED', 'CANCELLED'],
  DELIVERED: [],
  DELAYED: ['ORIGIN_PICKUP', 'DEPARTED_ORIGIN', 'IN_TRANSIT', 'CUSTOMS_CLEARANCE', 'OUT_FOR_DELIVERY', 'CANCELLED'],
  CANCELLED: [],
};
const PAGE_SIZE = 25;

type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];
type FreightMode = (typeof FREIGHT_MODES)[number];

function isTerminalStatus(status: ShipmentStatus): boolean {
  return status === 'DELIVERED' || status === 'CANCELLED';
}

function eventStatuses(status: ShipmentStatus): ShipmentStatus[] {
  return [...new Set<ShipmentStatus>([status, ...SHIPMENT_TRANSITIONS[status]])];
}

interface PageMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface Partner {
  id: string;
  code: string;
  nameEn: string;
  nameAr?: string | null;
  type: 'CUSTOMER' | 'VENDOR' | 'BOTH';
  status: 'ACTIVE' | 'INACTIVE';
}

interface Booking {
  id: string;
  number: string;
  status: string;
  origin: string;
  destination: string;
  customer?: { id: string; nameEn: string } | null;
}

interface ShipmentRow {
  id: string;
  version: number;
  trackingNumber: string;
  reference: string | null;
  status: ShipmentStatus;
  mode: FreightMode;
  carrier: string | null;
  vesselOrFlight: string | null;
  originPort: string;
  destinationPort: string;
  etd: string | null;
  eta: string | null;
  lastLocation: string | null;
  updatedAt: string;
  customer: { id: string; code: string; nameEn: string } | null;
  booking: { id: string; number: string } | null;
  _count: { events: number; customsFiles: number; documents: number };
}

interface ShipmentEvent {
  id: string;
  status: ShipmentStatus;
  location: string | null;
  description: string;
  occurredAt: string;
}

interface CargoPackage {
  id: string;
  packageNumber: string;
  description: string;
  packageType: string | null;
  quantity: number;
  lengthCm: string | null;
  widthCm: string | null;
  heightCm: string | null;
  weightKg: string | null;
}

interface ShipmentContainer {
  id: string;
  containerNumber: string;
  equipmentType: string | null;
  sealNumber: string | null;
  volumeCbm: string | null;
  weightKg: string | null;
}

interface VendorCost {
  id: string;
  service: string;
  amount: string;
  currency: string;
  status: string;
  reference: string | null;
  notes: string | null;
  isReferenced: boolean;
  vendor: { id: string; code: string; nameEn: string };
}

interface ShipmentCustomsFile {
  id: string;
  number: string;
  direction: 'IMPORT' | 'EXPORT' | 'TRANSIT';
  status: string;
  declarations: Array<{ id: string; number: string; status: string }>;
  aciFilings: Array<{ id: string; status: string }>;
}

interface ShipmentDocument {
  document: {
    id: string;
    category: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
  };
}

interface FinancialRecord {
  id: string;
  number: string;
  status: string;
  total: string;
  balance: string;
  vendorId?: string;
}

interface ShipmentTask {
  id: string;
  title: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'CANCELLED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate: string | null;
  assignedTo: { id: string; name: string } | null;
}

interface ShipmentDetail extends Omit<ShipmentRow, '_count'> {
  pieces: number | null;
  weightKg: string | null;
  containerType: string | null;
  deliveredAt: string | null;
  isPublic: boolean;
  publicTrackingToken: string | null;
  events: ShipmentEvent[];
  packages: CargoPackage[];
  containers: ShipmentContainer[];
  vendors: VendorCost[];
  customsFiles: ShipmentCustomsFile[];
  documents: ShipmentDocument[];
  invoices: FinancialRecord[];
  bills: FinancialRecord[];
  tasks: ShipmentTask[];
}

interface ShipmentForm {
  trackingNumber: string;
  reference: string;
  status: ShipmentStatus;
  mode: FreightMode;
  carrier: string;
  vesselOrFlight: string;
  containerType: string;
  originPort: string;
  destinationPort: string;
  pieces: string;
  weightKg: string;
  etd: string;
  eta: string;
  lastLocation: string;
}

const EMPTY_SHIPMENT_FORM: ShipmentForm = {
  trackingNumber: '',
  reference: '',
  status: 'BOOKED',
  mode: 'SEA',
  carrier: '',
  vesselOrFlight: '',
  containerType: '',
  originPort: '',
  destinationPort: '',
  pieces: '',
  weightKg: '',
  etd: '',
  eta: '',
  lastLocation: '',
};

interface PackageForm {
  packageNumber: string;
  description: string;
  packageType: string;
  quantity: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  weightKg: string;
}

interface ContainerForm {
  containerNumber: string;
  equipmentType: string;
  sealNumber: string;
  volumeCbm: string;
  weightKg: string;
}

interface VendorForm {
  vendorId: string;
  service: string;
  amount: string;
  currency: string;
  reference: string;
  notes: string;
}

const EMPTY_PACKAGE_FORM: PackageForm = {
  packageNumber: '',
  description: '',
  packageType: '',
  quantity: '1',
  lengthCm: '',
  widthCm: '',
  heightCm: '',
  weightKg: '',
};
const EMPTY_CONTAINER_FORM: ContainerForm = {
  containerNumber: '',
  equipmentType: '',
  sealNumber: '',
  volumeCbm: '',
  weightKg: '',
};
const EMPTY_VENDOR_FORM: VendorForm = {
  vendorId: '',
  service: '',
  amount: '',
  currency: 'EGP',
  reference: '',
  notes: '',
};

interface Notice {
  kind: 'success' | 'error';
  text: string;
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
    const detail = Object.values((error.details ?? {}) as Record<string, unknown>)[0];
    const text = Array.isArray(detail) ? detail[0] : detail;
    return typeof text === 'string' || typeof text === 'number' ? `${error.message} ${text}` : error.message;
  }
  return fallback;
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

function optionalText(value: string): string | undefined {
  return value.trim() ? value.trim() : undefined;
}

function optionalPatchText(value: string): string | null {
  return value.trim() ? value.trim() : null;
}

function optionalDate(value: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

function optionalPatchDate(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function dateTimeLocal(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function shipmentForm(shipment: ShipmentDetail): ShipmentForm {
  return {
    trackingNumber: shipment.trackingNumber,
    reference: shipment.reference ?? '',
    status: shipment.status,
    mode: shipment.mode,
    carrier: shipment.carrier ?? '',
    vesselOrFlight: shipment.vesselOrFlight ?? '',
    containerType: shipment.containerType ?? '',
    originPort: shipment.originPort,
    destinationPort: shipment.destinationPort,
    pieces: shipment.pieces?.toString() ?? '',
    weightKg: shipment.weightKg ?? '',
    etd: dateTimeLocal(shipment.etd),
    eta: dateTimeLocal(shipment.eta),
    lastLocation: shipment.lastLocation ?? '',
  };
}

function packageForm(item?: CargoPackage): PackageForm {
  return item ? {
    packageNumber: item.packageNumber,
    description: item.description,
    packageType: item.packageType ?? '',
    quantity: String(item.quantity),
    lengthCm: item.lengthCm ?? '',
    widthCm: item.widthCm ?? '',
    heightCm: item.heightCm ?? '',
    weightKg: item.weightKg ?? '',
  } : { ...EMPTY_PACKAGE_FORM };
}

function containerForm(item?: ShipmentContainer): ContainerForm {
  return item ? {
    containerNumber: item.containerNumber,
    equipmentType: item.equipmentType ?? '',
    sealNumber: item.sealNumber ?? '',
    volumeCbm: item.volumeCbm ?? '',
    weightKg: item.weightKg ?? '',
  } : { ...EMPTY_CONTAINER_FORM };
}

function vendorForm(item?: VendorCost): VendorForm {
  return item ? {
    vendorId: item.vendor.id,
    service: item.service,
    amount: item.amount,
    currency: item.currency,
    reference: item.reference ?? '',
    notes: item.notes ?? '',
  } : { ...EMPTY_VENDOR_FORM };
}

function NoticeBox({ notice, onDismiss }: { notice: Notice; onDismiss?: () => void }) {
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
        notice.kind === 'error'
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-brand-200 bg-brand-50 text-brand-800'
      }`}
      role={notice.kind === 'error' ? 'alert' : 'status'}
    >
      <span>{notice.text}</span>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="shrink-0 rounded p-0.5 hover:bg-black/5" aria-label="Dismiss message">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function QueryError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="p-5" role="alert">
      <p className="text-sm font-semibold text-red-700">{message}</p>
      <Button variant="ghost" size="sm" className="mt-3" icon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function Pagination({
  meta,
  page,
  onPage,
  disabled = false,
}: {
  meta?: PageMeta;
  page: number;
  onPage: (page: number) => void;
  disabled?: boolean;
}) {
  const pages = meta?.pages ?? 1;
  const total = meta?.total ?? 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-steel-200 px-4 py-3">
      <p className="text-xs text-steel-500">
        {total} {total === 1 ? 'record' : 'records'} · Page {page} of {pages}
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => onPage(page - 1)} disabled={disabled || page <= 1}>
          Previous
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onPage(page + 1)} disabled={disabled || page >= pages}>
          Next
        </Button>
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
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Record UUID"
          aria-label={label}
          dir="ltr"
          required={required}
        />
      ) : (
        <div className="space-y-2">
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${label.toLowerCase()}`}
            aria-label={`Search ${label.toLowerCase()}`}
          />
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
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {describe(item)}
              </option>
            ))}
          </Select>
          {query.isLoading ? <Spinner label="Loading matching records…" /> : null}
          {query.isError ? (
            <p className="text-xs text-red-700" role="alert">
              {errorMessage(query.error, 'Could not load records.')} You can enter a UUID manually instead.
            </p>
          ) : null}
          {!query.isLoading && !query.isError && (query.data?.length ?? 0) >= 100 ? (
            <p className="text-xs text-steel-500">Showing the first 100 matches. Refine your search if a record is missing.</p>
          ) : null}
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2"
        onClick={() => {
          setManual((current) => !current);
          onChange('');
          setSelectedLabel('');
        }}
      >
        {manual ? 'Choose from records' : 'Enter UUID manually'}
      </Button>
    </Field>
  );
}

function ShipmentCreateForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (shipment: { id: string; trackingNumber: string }) => void;
}) {
  const queryClient = useQueryClient();
  const operationKey = useOperationKey();
  const [source, setSource] = useState<'CUSTOMER' | 'BOOKING'>('CUSTOMER');
  const [customerId, setCustomerId] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [form, setForm] = useState<ShipmentForm>(EMPTY_SHIPMENT_FORM);
  const [notice, setNotice] = useState<Notice | null>(null);
  const update = <K extends keyof ShipmentForm>(key: K, value: ShipmentForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const create = useMutation({
    mutationFn: async () => {
      const body = {
        ...(source === 'CUSTOMER' ? { customerId } : { bookingId }),
        trackingNumber: optionalText(form.trackingNumber)?.toUpperCase(),
        reference: optionalText(form.reference),
        status: form.status,
        mode: form.mode,
        carrier: optionalText(form.carrier),
        vesselOrFlight: optionalText(form.vesselOrFlight),
        containerType: optionalText(form.containerType),
        originPort: form.originPort,
        destinationPort: form.destinationPort,
        pieces: form.pieces ? Number(form.pieces) : undefined,
        weightKg: optionalText(form.weightKg),
        etd: optionalDate(form.etd),
        eta: optionalDate(form.eta),
        lastLocation: optionalText(form.lastLocation),
      };
      return api.post<{ id: string; trackingNumber: string }>('/erp/shipments', body, { 'Idempotency-Key': operationKey.keyFor(body) });
    },
    onSuccess: async ({ data }) => {
      operationKey.reset();
      await queryClient.invalidateQueries({ queryKey: ['erp', 'shipments'] });
      setNotice({ kind: 'success', text: `Shipment ${data.trackingNumber} created.` });
      onCreated(data);
    },
    onError: (error) => setNotice({ kind: 'error', text: errorMessage(error, 'Could not create shipment.') }),
  });

  const missingRequirement = source === 'CUSTOMER' ? !customerId : !bookingId;
  const canCreate =
    !create.isPending &&
    !missingRequirement &&
    !!form.originPort.trim() &&
    !!form.destinationPort.trim() &&
    (!form.trackingNumber || form.trackingNumber.trim().length >= 3);

  return (
    <Panel title="Create operational shipment" className="scroll-mt-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canCreate) create.mutate();
        }}
      >
        {notice ? <div className="px-5 pt-5"><NoticeBox notice={notice} onDismiss={() => setNotice(null)} /></div> : null}
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <fieldset className="sm:col-span-2 lg:col-span-4">
            <legend className="field-label">Shipment owner *</legend>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-sm text-steel-700">
                <Input type="radio" className="h-4 w-4" name="shipment-source" value="CUSTOMER" checked={source === 'CUSTOMER'} onChange={() => setSource('CUSTOMER')} />
                Existing customer
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-steel-700">
                <Input type="radio" className="h-4 w-4" name="shipment-source" value="BOOKING" checked={source === 'BOOKING'} onChange={() => setSource('BOOKING')} />
                Sales booking (customer inferred)
              </label>
            </div>
          </fieldset>

          {source === 'CUSTOMER' ? (
            <LookupSelect<Partner>
              label="Customer"
              value={customerId}
              onChange={setCustomerId}
              required
              queryKeyPrefix={['erp', 'partners', 'shipment-customer']}
              buildPath={(search) => `/erp/partners?status=ACTIVE&limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`}
              describe={(partner) => `${partner.code} — ${partner.nameEn} (${partner.type})`}
              filter={(partner) => partner.type === 'CUSTOMER' || partner.type === 'BOTH'}
              help="Active customer records. A booking can supply the customer automatically."
            />
          ) : (
            <LookupSelect<Booking>
              label="Booking"
              value={bookingId}
              onChange={setBookingId}
              required
              queryKeyPrefix={['erp', 'bookings', 'shipment-source']}
              buildPath={(search) => `/erp/bookings?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`}
              describe={(booking) => `${booking.number} — ${booking.origin} → ${booking.destination}`}
              help="The booking must belong to this company; its customer is used for the shipment."
            />
          )}

          <Field label="Tracking number" help="Leave blank to generate a TRK number automatically.">
            <Input value={form.trackingNumber} onChange={(event) => update('trackingNumber', event.target.value)} maxLength={80} dir="ltr" />
          </Field>
          <Field label="Reference">
            <Input value={form.reference} onChange={(event) => update('reference', event.target.value)} maxLength={120} />
          </Field>
          <Field label="Initial status">
            <Select value={form.status} onChange={(event) => update('status', event.target.value as ShipmentStatus)}>
              {SHIPMENT_STATUSES.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
            </Select>
          </Field>
          <Field label="Freight mode">
            <Select value={form.mode} onChange={(event) => update('mode', event.target.value as FreightMode)}>
              {FREIGHT_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
            </Select>
          </Field>
          <Field label="Carrier">
            <Input value={form.carrier} onChange={(event) => update('carrier', event.target.value)} maxLength={160} />
          </Field>
          <Field label="Vessel or flight">
            <Input value={form.vesselOrFlight} onChange={(event) => update('vesselOrFlight', event.target.value)} maxLength={160} />
          </Field>
          <Field label="Container type">
            <Input value={form.containerType} onChange={(event) => update('containerType', event.target.value)} maxLength={80} />
          </Field>
          <Field label="Origin port *">
            <Input value={form.originPort} onChange={(event) => update('originPort', event.target.value)} maxLength={180} required />
          </Field>
          <Field label="Destination port *">
            <Input value={form.destinationPort} onChange={(event) => update('destinationPort', event.target.value)} maxLength={180} required />
          </Field>
          <Field label="Pieces">
            <Input type="number" min={1} step={1} value={form.pieces} onChange={(event) => update('pieces', event.target.value)} />
          </Field>
          <Field label="Weight (kg)" help="Enter a non-negative decimal; the exact string is preserved.">
            <Input inputMode="decimal" value={form.weightKg} onChange={(event) => update('weightKg', event.target.value)} placeholder="0.00" dir="ltr" />
          </Field>
          <Field label="ETD">
            <Input type="datetime-local" value={form.etd} onChange={(event) => update('etd', event.target.value)} />
          </Field>
          <Field label="ETA">
            <Input type="datetime-local" value={form.eta} onChange={(event) => update('eta', event.target.value)} />
          </Field>
          <Field label="Last location" className="sm:col-span-2">
            <Input value={form.lastLocation} onChange={(event) => update('lastLocation', event.target.value)} maxLength={180} />
          </Field>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-steel-200 px-5 py-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button type="submit" disabled={!canCreate} icon={<Ship className="h-4 w-4" />}>
            {create.isPending ? 'Creating…' : 'Create shipment'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function DetailLoading() {
  return <div className="p-8"><Spinner label="Loading shipment details…" /></div>;
}

function EmptySection({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <div className="flex items-center gap-3 px-4 py-6 text-sm text-steel-500">{icon}<span>{children}</span></div>;
}

type DetailAction = 'HEADER' | 'EVENT' | 'PACKAGE' | 'CONTAINER' | 'VENDOR';

interface ChildWrite {
  id?: string;
  body: Record<string, unknown>;
}

function ShipmentDetailView({ shipmentId, onClose }: { shipmentId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const operationKey = useOperationKey();
  const detailRef = useRef<HTMLElement>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [activeAction, setActiveAction] = useState<DetailAction | null>(null);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [editingContainerId, setEditingContainerId] = useState<string | null>(null);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [headerDraft, setHeaderDraft] = useState<ShipmentForm>(EMPTY_SHIPMENT_FORM);
  const [eventForm, setEventForm] = useState({ status: 'BOOKED' as ShipmentStatus, location: '', description: '', occurredAt: '', updateShipmentStatus: true });
  const [packageDraft, setPackageDraft] = useState<PackageForm>(EMPTY_PACKAGE_FORM);
  const [containerDraft, setContainerDraft] = useState<ContainerForm>(EMPTY_CONTAINER_FORM);
  const [vendorDraft, setVendorDraft] = useState<VendorForm>(EMPTY_VENDOR_FORM);

  const query = useQuery({
    queryKey: ['erp', 'shipment', shipmentId],
    queryFn: async () => (await api.get<ShipmentDetail>(`/erp/shipments/${shipmentId}`)).data,
  });
  const shipment = query.data;
  const terminal = shipment ? isTerminalStatus(shipment.status) : false;
  const linked = !!shipment && (shipment.customsFiles.length > 0 || shipment.invoices.length > 0 || shipment.bills.length > 0);
  const cargoLocked = terminal || linked;

  useEffect(() => {
    if (!shipment) return;
    detailRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    detailRef.current?.focus({ preventScroll: true });
  }, [shipment?.id]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['erp', 'shipments'] }),
      queryClient.invalidateQueries({ queryKey: ['erp', 'shipment', shipmentId] }),
    ]);
  };

  const handleWriteError = (error: unknown, fallback: string) => {
    setNotice({ kind: 'error', text: errorMessage(error, fallback) });
    if (error instanceof ApiError && (error.code === 'VERSION_CONFLICT' || error.code === 'STATUS_CONFLICT')) void invalidate();
  };

  const closeAction = () => {
    setActiveAction(null);
    setEditingPackageId(null);
    setEditingContainerId(null);
    setEditingVendorId(null);
  };

  const openHeaderEditor = () => {
    if (!shipment) return;
    setHeaderDraft(shipmentForm(shipment));
    setActiveAction('HEADER');
  };

  const openPackageEditor = (item?: CargoPackage) => {
    setPackageDraft(packageForm(item));
    setEditingPackageId(item?.id ?? null);
    setActiveAction('PACKAGE');
  };

  const openContainerEditor = (item?: ShipmentContainer) => {
    setContainerDraft(containerForm(item));
    setEditingContainerId(item?.id ?? null);
    setActiveAction('CONTAINER');
  };

  const openVendorEditor = (item?: VendorCost) => {
    setVendorDraft(vendorForm(item));
    setEditingVendorId(item?.id ?? null);
    setActiveAction('VENDOR');
  };

  const addEvent = useMutation({
    mutationFn: async () => {
      const body = {
        status: eventForm.status,
        location: optionalText(eventForm.location),
        description: eventForm.description,
        occurredAt: optionalDate(eventForm.occurredAt),
        updateShipmentStatus: eventForm.updateShipmentStatus,
        version: shipment?.version,
        expectedStatus: shipment?.status,
      };
      return api.post(`/erp/shipments/${shipmentId}/events`, body, { 'Idempotency-Key': operationKey.keyFor(body) });
    },
    onSuccess: async () => {
      operationKey.reset();
      closeAction();
      setEventForm({ status: shipment?.status ?? 'BOOKED', location: '', description: '', occurredAt: '', updateShipmentStatus: true });
      setNotice({ kind: 'success', text: 'Shipment event added.' });
      await invalidate();
    },
    onError: (error) => handleWriteError(error, 'Could not add shipment event.'),
  });

  const cancelShipment = useMutation({
    mutationFn: async () => {
      const body = {
        status: 'CANCELLED',
        description: 'Shipment cancelled from shipment operations.',
        updateShipmentStatus: true,
        version: shipment?.version,
        expectedStatus: shipment?.status,
      };
      return api.post(`/erp/shipments/${shipmentId}/events`, body, { 'Idempotency-Key': operationKey.keyFor(body) });
    },
    onSuccess: async () => {
      operationKey.reset();
      closeAction();
      setNotice({ kind: 'success', text: 'Shipment cancelled.' });
      await invalidate();
    },
    onError: (error) => handleWriteError(error, 'Could not cancel shipment.'),
  });

  const savePackage = useMutation({
    mutationFn: async (variables: ChildWrite) => {
      const path = `/erp/shipments/${shipmentId}/packages${variables.id ? `/${variables.id}` : ''}`;
      const headers = { 'Idempotency-Key': operationKey.keyFor(variables.body) };
      return variables.id ? api.patch(path, variables.body, headers) : api.post(path, variables.body, headers);
    },
    onSuccess: async (_data, variables) => {
      operationKey.reset();
      closeAction();
      setPackageDraft({ ...EMPTY_PACKAGE_FORM });
      setNotice({ kind: 'success', text: variables.id ? 'Cargo package updated.' : 'Cargo package added.' });
      await invalidate();
    },
    onError: (error) => handleWriteError(error, 'Could not save cargo package.'),
  });

  const removePackage = useMutation({
    mutationFn: async (variables: { id: string; version: number }) => api.delete(`/erp/shipments/${shipmentId}/packages/${variables.id}?version=${variables.version}`, { 'Idempotency-Key': operationKey.keyFor(variables) }),
    onSuccess: async () => {
      operationKey.reset();
      setNotice({ kind: 'success', text: 'Cargo package removed.' });
      await invalidate();
    },
    onError: (error) => handleWriteError(error, 'Could not remove cargo package.'),
  });

  const saveContainer = useMutation({
    mutationFn: async (variables: ChildWrite) => {
      const path = `/erp/shipments/${shipmentId}/containers${variables.id ? `/${variables.id}` : ''}`;
      const headers = { 'Idempotency-Key': operationKey.keyFor(variables.body) };
      return variables.id ? api.patch(path, variables.body, headers) : api.post(path, variables.body, headers);
    },
    onSuccess: async (_data, variables) => {
      operationKey.reset();
      closeAction();
      setContainerDraft({ ...EMPTY_CONTAINER_FORM });
      setNotice({ kind: 'success', text: variables.id ? 'Container updated.' : 'Container added.' });
      await invalidate();
    },
    onError: (error) => handleWriteError(error, 'Could not save container.'),
  });

  const removeContainer = useMutation({
    mutationFn: async (variables: { id: string; version: number }) => api.delete(`/erp/shipments/${shipmentId}/containers/${variables.id}?version=${variables.version}`, { 'Idempotency-Key': operationKey.keyFor(variables) }),
    onSuccess: async () => {
      operationKey.reset();
      setNotice({ kind: 'success', text: 'Container removed.' });
      await invalidate();
    },
    onError: (error) => handleWriteError(error, 'Could not remove container.'),
  });

  const saveVendor = useMutation({
    mutationFn: async (variables: ChildWrite) => {
      const path = `/erp/shipments/${shipmentId}/vendors${variables.id ? `/${variables.id}` : ''}`;
      const headers = { 'Idempotency-Key': operationKey.keyFor(variables.body) };
      return variables.id ? api.patch(path, variables.body, headers) : api.post(path, variables.body, headers);
    },
    onSuccess: async (_data, variables) => {
      operationKey.reset();
      closeAction();
      setVendorDraft({ ...EMPTY_VENDOR_FORM });
      setNotice({ kind: 'success', text: variables.id ? 'Vendor cost updated.' : 'Vendor cost added.' });
      await invalidate();
    },
    onError: (error) => handleWriteError(error, 'Could not save vendor cost.'),
  });

  const cancelVendor = useMutation({
    mutationFn: async (variables: { id: string; version: number }) => {
      const body = { version: variables.version, reason: 'Cancelled from shipment operations.' };
      return api.post(`/erp/shipments/${shipmentId}/vendors/${variables.id}/cancel`, body, { 'Idempotency-Key': operationKey.keyFor(body) });
    },
    onSuccess: async () => {
      operationKey.reset();
      closeAction();
      setNotice({ kind: 'success', text: 'Vendor cost cancelled.' });
      await invalidate();
    },
    onError: (error) => handleWriteError(error, 'Could not cancel vendor cost.'),
  });

  const updateHeader = useMutation({
    mutationFn: async (body: Record<string, unknown>) => api.patch(`/erp/shipments/${shipmentId}`, body, { 'Idempotency-Key': operationKey.keyFor(body) }),
    onSuccess: async () => {
      operationKey.reset();
      closeAction();
      setNotice({ kind: 'success', text: 'Shipment header updated.' });
      await invalidate();
    },
    onError: (error) => handleWriteError(error, 'Could not update shipment header.'),
  });

  const publication = useMutation({
    mutationFn: (variables: { isPublic: boolean; version: number }) => api.patch<{ isPublic: boolean }>(`/erp/shipments/${shipmentId}/publication`, variables, { 'Idempotency-Key': operationKey.keyFor(variables) }),
    onSuccess: async ({ data }) => {
      operationKey.reset();
      setNotice({ kind: 'success', text: data.isPublic ? 'Public tracking publication enabled.' : 'Public tracking publication disabled.' });
      await invalidate();
    },
    onError: (error) => handleWriteError(error, 'Could not update tracking publication.'),
  });

  const writePending = addEvent.isPending || cancelShipment.isPending || savePackage.isPending || removePackage.isPending || saveContainer.isPending || removeContainer.isPending || saveVendor.isPending || cancelVendor.isPending || updateHeader.isPending || publication.isPending;

  const downloadDocument = async (document: ShipmentDocument['document']) => {
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

  const copyToken = async () => {
    if (!shipment?.publicTrackingToken) return;
    try {
      await navigator.clipboard.writeText(shipment.publicTrackingToken);
      setNotice({ kind: 'success', text: 'Public tracking token copied.' });
    } catch {
      setNotice({ kind: 'error', text: 'Could not copy automatically. Select the token and copy it manually.' });
    }
  };

  if (query.isLoading) return <Panel className="scroll-mt-6"><DetailLoading /></Panel>;
  if (query.isError || !shipment) {
    return (
      <Panel className="scroll-mt-6">
        <QueryError message={errorMessage(query.error, 'Could not load shipment details.')} onRetry={() => void query.refetch()} />
        <div className="border-t border-steel-200 px-5 py-4"><Button variant="ghost" onClick={onClose}>Close details</Button></div>
      </Panel>
    );
  }

  const headerDateError = !!headerDraft.etd && !!headerDraft.eta && new Date(headerDraft.eta).getTime() < new Date(headerDraft.etd).getTime();
  const canSaveHeader = !updateHeader.isPending && !!headerDraft.trackingNumber.trim() && !!headerDraft.originPort.trim() && !!headerDraft.destinationPort.trim() && !headerDateError;

  return (
    <section ref={detailRef} tabIndex={-1} className="space-y-5 scroll-mt-6" aria-labelledby="shipment-detail-title">
      <Panel
        title={shipment.trackingNumber}
        actions={<Button variant="ghost" size="sm" onClick={onClose} icon={<X className="h-4 w-4" />}>Close</Button>}
      >
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="shipment-detail-title" className="text-xl font-extrabold text-navy-800">{shipment.trackingNumber}</h2>
            <StatusPill status={shipment.status} label={shipment.status.replace(/_/g, ' ')} />
            <StatusPill status={shipment.mode} label={shipment.mode} />
            {shipment.isPublic ? <StatusPill status="DELIVERED" label="Public tracking on" /> : null}
          </div>
          {notice ? <NoticeBox notice={notice} onDismiss={() => setNotice(null)} /> : null}
          <div className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <DetailItem label="Customer" value={shipment.customer ? `${shipment.customer.code} — ${shipment.customer.nameEn}` : '—'} />
            <DetailItem label="Booking" value={shipment.booking?.number ?? '—'} />
            <DetailItem label="Reference" value={shipment.reference ?? '—'} />
            <DetailItem label="Carrier / voyage" value={[shipment.carrier, shipment.vesselOrFlight].filter(Boolean).join(' · ') || '—'} />
            <DetailItem label="Route" value={`${shipment.originPort} → ${shipment.destinationPort}`} />
            <DetailItem label="ETD" value={formatDate(shipment.etd, 'en')} />
            <DetailItem label="ETA" value={formatDate(shipment.eta, 'en')} />
            <DetailItem label="Last location" value={shipment.lastLocation ?? '—'} />
            <DetailItem label="Cargo" value={[shipment.pieces ? `${shipment.pieces} pieces` : '', shipment.weightKg ? `${shipment.weightKg} kg` : '', shipment.containerType].filter(Boolean).join(' · ') || '—'} />
            <DetailItem label="Last updated" value={formatDateTime(shipment.updatedAt, 'en')} />
          </div>

          <div className="rounded-xl border border-steel-200 bg-steel-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-navy-800">Public tracking publication</h3>
                <p className="mt-1 text-xs text-steel-500">
                  {shipment.isPublic
                    ? 'Published. The token is visible only while public tracking is enabled.'
                    : 'Private. The public token is hidden and public tracking is disabled.'}
                </p>
              </div>
              <Button
                variant={shipment.isPublic ? 'ghost' : 'onlight'}
                size="sm"
                onClick={() => publication.mutate({ isPublic: !shipment.isPublic, version: shipment.version })}
                disabled={publication.isPending}
                icon={shipment.isPublic ? <X className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
              >
                {publication.isPending ? 'Updating…' : shipment.isPublic ? 'Disable publication' : 'Publish tracking'}
              </Button>
            </div>
            {shipment.isPublic && shipment.publicTrackingToken ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                <Field label="Public tracking token" help="For an authorized token-based tracking integration. The current public tracking page searches by tracking number and does not consume this token.">
                  <Input readOnly value={shipment.publicTrackingToken} dir="ltr" className="font-mono text-xs" onFocus={(event) => event.target.select()} />
                </Field>
                <div className="flex items-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => void copyToken()} icon={<Copy className="h-4 w-4" />}>Copy token</Button>
                  <a href="/tracking" target="_blank" rel="noreferrer" className="btn-secondary px-4 py-2 text-[0.8rem]">Tracking page</a>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2" aria-label="Shipment actions">
            <Button variant="onlight" size="sm" icon={<Pencil className="h-4 w-4" />} aria-expanded={activeAction === 'HEADER'} aria-controls="shipment-header-form" onClick={() => activeAction === 'HEADER' ? closeAction() : openHeaderEditor()} disabled={terminal || linked || writePending}>Edit header</Button>
            <Button variant="onlight" size="sm" icon={<Plus className="h-4 w-4" />} aria-expanded={activeAction === 'EVENT'} aria-controls="shipment-event-form" onClick={() => { setEventForm((current) => ({ ...current, status: shipment.status })); setActiveAction(activeAction === 'EVENT' ? null : 'EVENT'); }} disabled={terminal || writePending}>Add event</Button>
            <Button variant="onlight" size="sm" icon={<Package className="h-4 w-4" />} aria-expanded={activeAction === 'PACKAGE'} aria-controls="shipment-package-form" onClick={() => activeAction === 'PACKAGE' ? closeAction() : openPackageEditor()} disabled={cargoLocked || writePending}>Add package</Button>
            <Button variant="onlight" size="sm" icon={<Container className="h-4 w-4" />} aria-expanded={activeAction === 'CONTAINER'} aria-controls="shipment-container-form" onClick={() => activeAction === 'CONTAINER' ? closeAction() : openContainerEditor()} disabled={cargoLocked || writePending}>Add container</Button>
            <Button variant="onlight" size="sm" icon={<ReceiptText className="h-4 w-4" />} aria-expanded={activeAction === 'VENDOR'} aria-controls="shipment-vendor-form" onClick={() => activeAction === 'VENDOR' ? closeAction() : openVendorEditor()} disabled={terminal || writePending}>Add vendor cost</Button>
            <Button variant="ghost" size="sm" icon={<Ban className="h-4 w-4" />} onClick={() => { if (window.confirm(`Cancel shipment ${shipment.trackingNumber}? This cannot be undone.`)) cancelShipment.mutate(); }} disabled={terminal || writePending}>Cancel shipment</Button>
          </div>
          {terminal ? <p className="text-xs text-steel-500">This shipment is {shipment.status.toLowerCase()}. Header, event status, cargo and vendor changes are locked.</p> : null}
          {linked ? <p className="text-xs text-steel-500">Customs or financial records lock header and cargo editing. Operational events and vendor-cost cancellation remain available.</p> : null}
        </div>
      </Panel>

      {activeAction === 'HEADER' ? (
        <Panel title="Edit shipment header">
          <form id="shipment-header-form" onSubmit={(event) => {
            event.preventDefault();
            if (!canSaveHeader) return;
            const { status, ...fields } = headerDraft;
            updateHeader.mutate({
              ...fields,
              trackingNumber: fields.trackingNumber.trim().toUpperCase(),
              reference: optionalPatchText(fields.reference),
              carrier: optionalPatchText(fields.carrier),
              vesselOrFlight: optionalPatchText(fields.vesselOrFlight),
              containerType: optionalPatchText(fields.containerType),
              pieces: fields.pieces ? Number(fields.pieces) : null,
              weightKg: optionalPatchText(fields.weightKg),
              etd: optionalPatchDate(fields.etd),
              eta: optionalPatchDate(fields.eta),
              lastLocation: optionalPatchText(fields.lastLocation),
              version: shipment.version,
              expectedStatus: shipment.status,
            });
          }}>
            {notice ? <div className="px-5 pt-5"><NoticeBox notice={notice} /></div> : null}
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Tracking number *"><Input value={headerDraft.trackingNumber} onChange={(change) => setHeaderDraft({ ...headerDraft, trackingNumber: change.target.value })} maxLength={80} required dir="ltr" /></Field>
              <Field label="Reference"><Input value={headerDraft.reference} onChange={(change) => setHeaderDraft({ ...headerDraft, reference: change.target.value })} maxLength={120} /></Field>
              <Field label="Freight mode"><Select value={headerDraft.mode} onChange={(change) => setHeaderDraft({ ...headerDraft, mode: change.target.value as FreightMode })}>{FREIGHT_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</Select></Field>
              <Field label="Carrier"><Input value={headerDraft.carrier} onChange={(change) => setHeaderDraft({ ...headerDraft, carrier: change.target.value })} maxLength={160} /></Field>
              <Field label="Vessel or flight"><Input value={headerDraft.vesselOrFlight} onChange={(change) => setHeaderDraft({ ...headerDraft, vesselOrFlight: change.target.value })} maxLength={160} /></Field>
              <Field label="Container type"><Input value={headerDraft.containerType} onChange={(change) => setHeaderDraft({ ...headerDraft, containerType: change.target.value })} maxLength={80} /></Field>
              <Field label="Origin port *"><Input value={headerDraft.originPort} onChange={(change) => setHeaderDraft({ ...headerDraft, originPort: change.target.value })} maxLength={180} required /></Field>
              <Field label="Destination port *"><Input value={headerDraft.destinationPort} onChange={(change) => setHeaderDraft({ ...headerDraft, destinationPort: change.target.value })} maxLength={180} required /></Field>
              <Field label="Pieces"><Input type="number" min={1} step={1} value={headerDraft.pieces} onChange={(change) => setHeaderDraft({ ...headerDraft, pieces: change.target.value })} /></Field>
              <Field label="Weight (kg)"><Input inputMode="decimal" value={headerDraft.weightKg} onChange={(change) => setHeaderDraft({ ...headerDraft, weightKg: change.target.value })} dir="ltr" /></Field>
              <Field label="ETD"><Input type="datetime-local" value={headerDraft.etd} onChange={(change) => setHeaderDraft({ ...headerDraft, etd: change.target.value })} /></Field>
              <Field label="ETA" help={headerDateError ? 'ETA cannot be earlier than ETD.' : undefined}><Input type="datetime-local" value={headerDraft.eta} onChange={(change) => setHeaderDraft({ ...headerDraft, eta: change.target.value })} aria-invalid={headerDateError} /></Field>
              <Field label="Last location"><Input value={headerDraft.lastLocation} onChange={(change) => setHeaderDraft({ ...headerDraft, lastLocation: change.target.value })} maxLength={180} /></Field>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-steel-200 px-5 py-4">
              <Button type="button" variant="ghost" onClick={closeAction} disabled={updateHeader.isPending}>Cancel</Button>
              <Button type="submit" disabled={!canSaveHeader} icon={<Save className="h-4 w-4" />}>{updateHeader.isPending ? 'Saving…' : 'Save header'}</Button>
            </div>
          </form>
        </Panel>
      ) : null}

      {activeAction === 'EVENT' ? (
        <Panel title="Add shipment event">
          <form id="shipment-event-form" onSubmit={(event) => { event.preventDefault(); if (!addEvent.isPending && eventForm.description.trim()) addEvent.mutate(); }}>
            {notice ? <div className="px-5 pt-5"><NoticeBox notice={notice} /></div> : null}
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Event status *" help="Only valid transitions from the current shipment status are available.">
                <Select value={eventForm.status} onChange={(change) => setEventForm({ ...eventForm, status: change.target.value as ShipmentStatus })}>
                  {eventStatuses(shipment.status).map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
                </Select>
              </Field>
              <Field label="Location">
                <Input value={eventForm.location} onChange={(change) => setEventForm({ ...eventForm, location: change.target.value })} maxLength={180} />
              </Field>
              <Field label="Occurred at" help="Leave blank to use the current time.">
                <Input type="datetime-local" value={eventForm.occurredAt} onChange={(change) => setEventForm({ ...eventForm, occurredAt: change.target.value })} />
              </Field>
              <label className="flex items-end gap-2 pb-2 text-sm text-steel-700">
                <Input type="checkbox" className="h-4 w-4" checked={eventForm.updateShipmentStatus} onChange={(change) => setEventForm({ ...eventForm, updateShipmentStatus: change.target.checked })} />
                Update shipment status and last location
              </label>
              <Field label="Description *" className="sm:col-span-2 lg:col-span-4">
                <Textarea value={eventForm.description} onChange={(change) => setEventForm({ ...eventForm, description: change.target.value })} maxLength={1000} required />
              </Field>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-steel-200 px-5 py-4">
              <Button type="button" variant="ghost" onClick={() => setActiveAction(null)} disabled={addEvent.isPending}>Cancel</Button>
              <Button type="submit" disabled={addEvent.isPending || !eventForm.description.trim()}>{addEvent.isPending ? 'Adding…' : 'Add event'}</Button>
            </div>
          </form>
        </Panel>
      ) : null}

      {activeAction === 'PACKAGE' ? (
        <Panel title={editingPackageId ? 'Edit cargo package' : 'Add cargo package'}>
          <form id="shipment-package-form" onSubmit={(event) => {
            event.preventDefault();
            if (savePackage.isPending || !packageDraft.packageNumber.trim() || !packageDraft.description.trim()) return;
            savePackage.mutate({
              id: editingPackageId ?? undefined,
              body: {
                packageNumber: packageDraft.packageNumber.trim(),
                description: packageDraft.description.trim(),
                packageType: optionalPatchText(packageDraft.packageType),
                quantity: Number(packageDraft.quantity),
                lengthCm: optionalPatchText(packageDraft.lengthCm),
                widthCm: optionalPatchText(packageDraft.widthCm),
                heightCm: optionalPatchText(packageDraft.heightCm),
                weightKg: optionalPatchText(packageDraft.weightKg),
                version: shipment.version,
              },
            });
          }}>
            {notice ? <div className="px-5 pt-5"><NoticeBox notice={notice} /></div> : null}
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Package number *"><Input value={packageDraft.packageNumber} onChange={(change) => setPackageDraft({ ...packageDraft, packageNumber: change.target.value })} maxLength={80} required /></Field>
              <Field label="Package type"><Input value={packageDraft.packageType} onChange={(change) => setPackageDraft({ ...packageDraft, packageType: change.target.value })} maxLength={80} /></Field>
              <Field label="Quantity *"><Input type="number" min={1} step={1} value={packageDraft.quantity} onChange={(change) => setPackageDraft({ ...packageDraft, quantity: change.target.value })} required /></Field>
              <Field label="Weight (kg)"><Input inputMode="decimal" value={packageDraft.weightKg} onChange={(change) => setPackageDraft({ ...packageDraft, weightKg: change.target.value })} dir="ltr" /></Field>
              <Field label="Length (cm)"><Input inputMode="decimal" value={packageDraft.lengthCm} onChange={(change) => setPackageDraft({ ...packageDraft, lengthCm: change.target.value })} dir="ltr" /></Field>
              <Field label="Width (cm)"><Input inputMode="decimal" value={packageDraft.widthCm} onChange={(change) => setPackageDraft({ ...packageDraft, widthCm: change.target.value })} dir="ltr" /></Field>
              <Field label="Height (cm)"><Input inputMode="decimal" value={packageDraft.heightCm} onChange={(change) => setPackageDraft({ ...packageDraft, heightCm: change.target.value })} dir="ltr" /></Field>
              <Field label="Description *" className="sm:col-span-2"><Textarea rows={3} value={packageDraft.description} onChange={(change) => setPackageDraft({ ...packageDraft, description: change.target.value })} maxLength={500} required /></Field>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-steel-200 px-5 py-4">
              <Button type="button" variant="ghost" onClick={closeAction} disabled={savePackage.isPending}>Cancel</Button>
              <Button type="submit" disabled={savePackage.isPending || !packageDraft.packageNumber.trim() || !packageDraft.description.trim()} icon={<Save className="h-4 w-4" />}>{savePackage.isPending ? 'Saving…' : editingPackageId ? 'Save package' : 'Add package'}</Button>
            </div>
          </form>
        </Panel>
      ) : null}

      {activeAction === 'CONTAINER' ? (
        <Panel title={editingContainerId ? 'Edit container' : 'Add container'}>
          <form id="shipment-container-form" onSubmit={(event) => {
            event.preventDefault();
            if (saveContainer.isPending || containerDraft.containerNumber.trim().length < 3) return;
            saveContainer.mutate({
              id: editingContainerId ?? undefined,
              body: {
                containerNumber: containerDraft.containerNumber.trim().toUpperCase(),
                equipmentType: optionalPatchText(containerDraft.equipmentType),
                sealNumber: optionalPatchText(containerDraft.sealNumber),
                volumeCbm: optionalPatchText(containerDraft.volumeCbm),
                weightKg: optionalPatchText(containerDraft.weightKg),
                version: shipment.version,
              },
            });
          }}>
            {notice ? <div className="px-5 pt-5"><NoticeBox notice={notice} /></div> : null}
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Container number *"><Input value={containerDraft.containerNumber} onChange={(change) => setContainerDraft({ ...containerDraft, containerNumber: change.target.value })} maxLength={40} required dir="ltr" /></Field>
              <Field label="Equipment type"><Input value={containerDraft.equipmentType} onChange={(change) => setContainerDraft({ ...containerDraft, equipmentType: change.target.value })} maxLength={80} /></Field>
              <Field label="Seal number"><Input value={containerDraft.sealNumber} onChange={(change) => setContainerDraft({ ...containerDraft, sealNumber: change.target.value })} maxLength={80} dir="ltr" /></Field>
              <Field label="Volume (CBM)"><Input inputMode="decimal" value={containerDraft.volumeCbm} onChange={(change) => setContainerDraft({ ...containerDraft, volumeCbm: change.target.value })} dir="ltr" /></Field>
              <Field label="Weight (kg)"><Input inputMode="decimal" value={containerDraft.weightKg} onChange={(change) => setContainerDraft({ ...containerDraft, weightKg: change.target.value })} dir="ltr" /></Field>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-steel-200 px-5 py-4">
              <Button type="button" variant="ghost" onClick={closeAction} disabled={saveContainer.isPending}>Cancel</Button>
              <Button type="submit" disabled={saveContainer.isPending || containerDraft.containerNumber.trim().length < 3} icon={<Save className="h-4 w-4" />}>{saveContainer.isPending ? 'Saving…' : editingContainerId ? 'Save container' : 'Add container'}</Button>
            </div>
          </form>
        </Panel>
      ) : null}

      {activeAction === 'VENDOR' ? (
        <Panel title={editingVendorId ? 'Edit vendor cost' : 'Add vendor cost'}>
          <form id="shipment-vendor-form" onSubmit={(event) => {
            event.preventDefault();
            if (saveVendor.isPending || !vendorDraft.vendorId || !vendorDraft.service.trim() || !vendorDraft.amount) return;
            saveVendor.mutate({
              id: editingVendorId ?? undefined,
              body: {
                vendorId: vendorDraft.vendorId,
                service: vendorDraft.service.trim(),
                amount: vendorDraft.amount,
                currency: vendorDraft.currency,
                reference: optionalPatchText(vendorDraft.reference),
                notes: optionalPatchText(vendorDraft.notes),
                version: shipment.version,
              },
            });
          }}>
            {notice ? <div className="px-5 pt-5"><NoticeBox notice={notice} /></div> : null}
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
              <LookupSelect<Partner>
                label="Vendor"
                value={vendorDraft.vendorId}
                onChange={(vendorId) => setVendorDraft({ ...vendorDraft, vendorId })}
                required
                queryKeyPrefix={['erp', 'partners', 'shipment-vendor']}
                buildPath={(search) => `/erp/partners?status=ACTIVE&limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`}
                describe={(partner) => `${partner.code} — ${partner.nameEn} (${partner.type})`}
                filter={(partner) => partner.type === 'VENDOR' || partner.type === 'BOTH'}
              />
              <Field label="Service *"><Input value={vendorDraft.service} onChange={(change) => setVendorDraft({ ...vendorDraft, service: change.target.value })} maxLength={180} required /></Field>
              <Field label="Amount *" help="Exact decimal string; no currency conversion or floating-point totals."><Input inputMode="decimal" value={vendorDraft.amount} onChange={(change) => setVendorDraft({ ...vendorDraft, amount: change.target.value })} dir="ltr" required /></Field>
              <Field label="Currency *"><Input value={vendorDraft.currency} onChange={(change) => setVendorDraft({ ...vendorDraft, currency: change.target.value.toUpperCase() })} minLength={3} maxLength={3} pattern="[A-Za-z]{3}" dir="ltr" required /></Field>
              <Field label="Reference"><Input value={vendorDraft.reference} onChange={(change) => setVendorDraft({ ...vendorDraft, reference: change.target.value })} maxLength={120} /></Field>
              <Field label="Notes"><Textarea rows={3} value={vendorDraft.notes} onChange={(change) => setVendorDraft({ ...vendorDraft, notes: change.target.value })} maxLength={1000} /></Field>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-steel-200 px-5 py-4">
              <Button type="button" variant="ghost" onClick={closeAction} disabled={saveVendor.isPending}>Cancel</Button>
              <Button type="submit" disabled={saveVendor.isPending || !vendorDraft.vendorId || !vendorDraft.service.trim() || !vendorDraft.amount} icon={<Save className="h-4 w-4" />}>{saveVendor.isPending ? 'Saving…' : editingVendorId ? 'Save vendor cost' : 'Add vendor cost'}</Button>
            </div>
          </form>
        </Panel>
      ) : null}

      <Panel title={`Events (${shipment.events.length})`}>
        {shipment.events.length ? (
          <ol className="divide-y divide-steel-100">
            {shipment.events.map((event) => (
              <li key={event.id} className="flex gap-4 px-5 py-4">
                <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={event.status} label={event.status.replace(/_/g, ' ')} />
                    <span className="text-xs text-steel-500">{formatDateTime(event.occurredAt, 'en')}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-steel-700">{event.description}</p>
                  {event.location ? <p className="mt-1 text-xs text-steel-500">{event.location}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        ) : <EmptySection icon={<Clipboard className="h-5 w-5" />}>No shipment events recorded.</EmptySection>}
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title={`Cargo packages (${shipment.packages.length})`}>
          {shipment.packages.length ? (
            <Table>
              <thead><tr><Th>Package</Th><Th>Qty</Th><Th>Dimensions / weight</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
              <tbody>{shipment.packages.map((item) => (
                <tr key={item.id}>
                  <Td><span className="font-semibold text-navy-800">{item.packageNumber}</span><span className="mt-1 block text-xs text-steel-500">{item.description}</span>{item.packageType ? <span className="mt-1 block text-[0.68rem] text-steel-400">{item.packageType}</span> : null}</Td>
                  <Td>{item.quantity}</Td>
                  <Td><span className="block font-mono text-xs">{[item.lengthCm, item.widthCm, item.heightCm].every(Boolean) ? `${item.lengthCm} × ${item.widthCm} × ${item.heightCm} cm` : '—'}</span><span className="mt-1 block text-xs text-steel-500">{item.weightKg ? `${item.weightKg} kg` : 'Weight not recorded'}</span></Td>
                  <Td><div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => openPackageEditor(item)} disabled={cargoLocked || writePending} aria-label={`Edit package ${item.packageNumber}`}>Edit</Button>
                    <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => { if (window.confirm(`Remove package ${item.packageNumber}? This cannot be undone.`)) removePackage.mutate({ id: item.id, version: shipment.version }); }} disabled={cargoLocked || writePending} aria-label={`Remove package ${item.packageNumber}`}>Remove</Button>
                  </div></Td>
                </tr>
              ))}</tbody>
            </Table>
          ) : <EmptySection icon={<Package className="h-5 w-5" />}>No cargo packages added.</EmptySection>}
        </Panel>

        <Panel title={`Containers (${shipment.containers.length})`}>
          {shipment.containers.length ? (
            <Table>
              <thead><tr><Th>Container</Th><Th>Seal</Th><Th>Volume / weight</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
              <tbody>{shipment.containers.map((item) => (
                <tr key={item.id}>
                  <Td><span className="font-mono font-semibold text-navy-800">{item.containerNumber}</span>{item.equipmentType ? <span className="mt-1 block text-xs text-steel-500">{item.equipmentType}</span> : null}</Td>
                  <Td className="font-mono text-xs">{item.sealNumber ?? '—'}</Td>
                  <Td><span className="block font-mono text-xs">{item.volumeCbm ? `${item.volumeCbm} CBM` : '—'}</span><span className="mt-1 block text-xs text-steel-500">{item.weightKg ? `${item.weightKg} kg` : '—'}</span></Td>
                  <Td><div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => openContainerEditor(item)} disabled={cargoLocked || writePending} aria-label={`Edit container ${item.containerNumber}`}>Edit</Button>
                    <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => { if (window.confirm(`Remove container ${item.containerNumber}? This cannot be undone.`)) removeContainer.mutate({ id: item.id, version: shipment.version }); }} disabled={cargoLocked || writePending} aria-label={`Remove container ${item.containerNumber}`}>Remove</Button>
                  </div></Td>
                </tr>
              ))}</tbody>
            </Table>
          ) : <EmptySection icon={<Container className="h-5 w-5" />}>No containers linked.</EmptySection>}
        </Panel>
      </div>

      <Panel title={`Vendor costs (${shipment.vendors.length})`}>
        {shipment.vendors.length ? (
          <Table>
            <thead><tr><Th>Vendor</Th><Th>Service</Th><Th>Amount</Th><Th>Status</Th><Th>Reference / notes</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>{shipment.vendors.map((cost) => (
              <tr key={cost.id}>
                <Td><span className="font-semibold text-navy-800">{cost.vendor.nameEn}</span><span className="mt-1 block text-[0.68rem] text-steel-400">{cost.vendor.code}</span></Td>
                <Td>{cost.service}</Td>
                <Td className="whitespace-nowrap font-mono text-xs">{cost.amount} {cost.currency}</Td>
                <Td><StatusPill status={cost.status} label={cost.status} />{cost.isReferenced ? <span className="mt-1 block text-[0.68rem] text-steel-500">Bill-linked; edit locked</span> : null}</Td>
                <Td>{cost.reference ?? '—'}{cost.notes ? <span className="mt-1 block whitespace-pre-wrap text-xs text-steel-500">{cost.notes}</span> : null}</Td>
                <Td><div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => openVendorEditor(cost)} disabled={terminal || cost.status === 'CANCELLED' || cost.isReferenced || writePending} title={cost.isReferenced ? 'This cost is referenced by a bill and cannot be edited.' : undefined} aria-label={`Edit vendor cost ${cost.service}`}>Edit</Button>
                  <Button variant="ghost" size="sm" icon={<Ban className="h-4 w-4" />} onClick={() => { if (window.confirm(`Cancel vendor cost “${cost.service}”? The record will be retained for audit.`)) cancelVendor.mutate({ id: cost.id, version: shipment.version }); }} disabled={terminal || cost.status === 'CANCELLED' || writePending} aria-label={`Cancel vendor cost ${cost.service}`}>Cancel</Button>
                </div></Td>
              </tr>
            ))}</tbody>
          </Table>
        ) : <EmptySection icon={<ReceiptText className="h-5 w-5" />}>No vendor costs recorded.</EmptySection>}
      </Panel>

      <Panel title={`Customs files (${shipment.customsFiles.length})`}>
        {shipment.customsFiles.length ? (
          <Table>
            <thead><tr><Th>File</Th><Th>Direction</Th><Th>Status</Th><Th>ACI</Th><Th>Declarations</Th></tr></thead>
            <tbody>{shipment.customsFiles.map((file) => (
              <tr key={file.id}>
                <Td className="font-semibold text-navy-800">{file.number}</Td>
                <Td>{file.direction}</Td>
                <Td><StatusPill status={file.status} label={file.status.replace(/_/g, ' ')} /></Td>
                <Td>{file.aciFilings.length}</Td>
                <Td>{file.declarations.length}</Td>
              </tr>
            ))}</tbody>
          </Table>
        ) : <EmptySection icon={<FileText className="h-5 w-5" />}>No customs files linked to this shipment.</EmptySection>}
      </Panel>

      <Panel title={`Documents (${shipment.documents.length})`}>
        {shipment.documents.length ? (
          <Table>
            <thead><tr><Th>Document</Th><Th>Category</Th><Th>Uploaded</Th><Th><span className="sr-only">Download</span></Th></tr></thead>
            <tbody>{shipment.documents.map(({ document }) => (
              <tr key={document.id}>
                <Td><span className="font-semibold text-navy-800">{document.fileName}</span><span className="mt-1 block text-[0.68rem] text-steel-400">{Math.ceil(document.sizeBytes / 1024)} KB · {document.mimeType}</span></Td>
                <Td>{document.category.replace(/_/g, ' ')}</Td>
                <Td>{formatDateTime(document.createdAt, 'en')}</Td>
                <Td><Button variant="ghost" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => void downloadDocument(document)}>Download</Button></Td>
              </tr>
            ))}</tbody>
          </Table>
        ) : <EmptySection icon={<FileText className="h-5 w-5" />}>No documents linked to this shipment.</EmptySection>}
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title={`Invoices (${shipment.invoices.length})`}>
          {shipment.invoices.length ? (
            <Table><thead><tr><Th>Invoice</Th><Th>Status</Th><Th>Total</Th><Th>Balance</Th></tr></thead><tbody>
              {shipment.invoices.map((invoice) => <tr key={invoice.id}><Td className="font-semibold text-navy-800">{invoice.number}</Td><Td><StatusPill status={invoice.status} label={invoice.status.replace(/_/g, ' ')} /></Td><Td className="font-mono text-xs">{invoice.total}</Td><Td className="font-mono text-xs">{invoice.balance}</Td></tr>)}
            </tbody></Table>
          ) : <EmptySection icon={<ReceiptText className="h-5 w-5" />}>No invoices linked.</EmptySection>}
        </Panel>
        <Panel title={`Bills (${shipment.bills.length})`}>
          {shipment.bills.length ? (
            <Table><thead><tr><Th>Bill</Th><Th>Status</Th><Th>Total</Th><Th>Balance</Th></tr></thead><tbody>
              {shipment.bills.map((bill) => <tr key={bill.id}><Td className="font-semibold text-navy-800">{bill.number}</Td><Td><StatusPill status={bill.status} label={bill.status.replace(/_/g, ' ')} /></Td><Td className="font-mono text-xs">{bill.total}</Td><Td className="font-mono text-xs">{bill.balance}</Td></tr>)}
            </tbody></Table>
          ) : <EmptySection icon={<ReceiptText className="h-5 w-5" />}>No bills linked.</EmptySection>}
        </Panel>
      </div>

      <Panel title={`Tasks (${shipment.tasks.length})`}>
        {shipment.tasks.length ? (
          <Table><thead><tr><Th>Task</Th><Th>Priority</Th><Th>Status</Th><Th>Due</Th><Th>Assigned to</Th></tr></thead><tbody>
            {shipment.tasks.map((task) => <tr key={task.id}><Td className="font-semibold text-navy-800">{task.title}</Td><Td><StatusPill status={task.priority} label={task.priority} /></Td><Td><StatusPill status={task.status} label={task.status.replace(/_/g, ' ')} /></Td><Td>{formatDate(task.dueDate, 'en')}</Td><Td>{task.assignedTo?.name ?? 'Unassigned'}</Td></tr>)}
          </tbody></Table>
        ) : <EmptySection icon={<Users className="h-5 w-5" />}>No tasks linked to this shipment.</EmptySection>}
      </Panel>
    </section>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-steel-400">{label}</p><p className="mt-1 break-words text-steel-700">{value}</p></div>;
}

export default function Shipments() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('selected'));
  const [notice, setNotice] = useState<Notice | null>(null);

  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  const query = useQuery({
    queryKey: ['erp', 'shipments', { search, status, page }],
    queryFn: async () => api.get<ShipmentRow[]>(`/erp/shipments?${params.toString()}`),
  });
  const shipments = query.data?.data ?? [];
  const meta = query.data?.meta as PageMeta | undefined;

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  return (
    <AdminPage
      title="Shipment operations"
      description="Create operational shipments, record milestones and cargo, and control public tracking publication."
      actions={<Button variant="onlight" icon={<Plus className="h-4 w-4" />} aria-expanded={showCreate} aria-controls="new-shipment-panel" onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Close new shipment' : 'New shipment'}</Button>}
    >
      {notice ? <NoticeBox notice={notice} onDismiss={() => setNotice(null)} /> : null}
      {showCreate ? (
        <div id="new-shipment-panel">
          <ShipmentCreateForm
            onClose={() => setShowCreate(false)}
            onCreated={(shipment) => {
              setShowCreate(false);
              setSelectedId(shipment.id);
              setNotice({ kind: 'success', text: `Shipment ${shipment.trackingNumber} created.` });
            }}
          />
        </div>
      ) : null}

      <Panel>
        <form className="grid gap-3 border-b border-steel-200 p-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end" onSubmit={applyFilters}>
          <AdminField label="Search shipments">
            <Input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Tracking, reference, origin or destination" maxLength={120} />
          </AdminField>
          <AdminField label="Status">
            <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              {SHIPMENT_STATUSES.map((item) => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}
            </Select>
          </AdminField>
          <div className="flex gap-2">
            <Button type="submit" variant="onlight">Search</Button>
            {(search || status) ? <Button type="button" variant="ghost" onClick={() => { setSearchInput(''); setSearch(''); setStatus(''); setPage(1); }}>Clear</Button> : null}
          </div>
        </form>
        {query.isLoading ? (
          <div className="p-8"><Spinner label="Loading shipments…" /></div>
        ) : query.isError ? (
          <QueryError message={errorMessage(query.error, 'Could not load shipments.')} onRetry={() => void query.refetch()} />
        ) : (
          <>
            <Table>
              <thead><tr><Th>Shipment</Th><Th>Customer / booking</Th><Th>Route</Th><Th>Schedule</Th><Th>Status</Th><Th>Linked</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
              <tbody>
                {!shipments.length ? <EmptyRow colSpan={7} message={search || status ? 'No shipments match these filters.' : 'No operational shipments yet.'} /> : shipments.map((shipment) => (
                  <tr key={shipment.id} className={selectedId === shipment.id ? 'bg-brand-50/50' : ''}>
                    <Td><button type="button" onClick={() => setSelectedId(shipment.id)} className="text-start font-bold text-navy-800 hover:text-brand-700 hover:underline">{shipment.trackingNumber}</button><span className="mt-1 block text-[0.68rem] text-steel-400">{shipment.mode}{shipment.reference ? ` · ${shipment.reference}` : ''}</span></Td>
                    <Td>{shipment.customer?.nameEn ?? '—'}{shipment.booking ? <span className="mt-1 block text-[0.68rem] text-steel-400">Booking {shipment.booking.number}</span> : null}</Td>
                    <Td><span className="block">{shipment.originPort}</span><span className="block text-steel-400">→ {shipment.destinationPort}</span></Td>
                    <Td><span className="block">ETD {formatDate(shipment.etd, 'en')}</span><span className="block text-steel-400">ETA {formatDate(shipment.eta, 'en')}</span></Td>
                    <Td><StatusPill status={shipment.status} label={shipment.status.replace(/_/g, ' ')} /></Td>
                    <Td className="whitespace-nowrap text-xs">{shipment._count.events} events<span className="block text-steel-400">{shipment._count.customsFiles} customs · {shipment._count.documents} docs</span></Td>
                    <Td><Button variant="ghost" size="sm" onClick={() => setSelectedId(shipment.id)}>View</Button></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination meta={meta} page={page} onPage={setPage} disabled={query.isFetching} />
          </>
        )}
      </Panel>

      {selectedId ? <ShipmentDetailView shipmentId={selectedId} onClose={() => { setSelectedId(null); setSearchParams((current) => { current.delete('selected'); return current; }, { replace: true }); }} /> : (
        <StatePanel
          icon={<Box className="h-5 w-5" />}
          title="Select a shipment"
          body="Open a shipment to manage events, cargo packages, vendor costs, linked customs files, documents, finance records and tasks."
        />
      )}
    </AdminPage>
  );
}
