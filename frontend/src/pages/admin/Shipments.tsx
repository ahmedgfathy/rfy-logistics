import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { AdminShipment, TrackingEvent } from '../../types';
import { AdminField, AdminPage, Panel, Table, Td, Th, EmptyRow } from '../../components/admin/ui';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { StatusPill } from '../../components/ui/StatusPill';
import { FREIGHT_MODES, SHIPMENT_STATUSES } from '../../lib/site';
import { formatDateTime } from '../../lib/utils';

const emptyShipment = {
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

export function Shipments() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...emptyShipment });
  const [feedback, setFeedback] = useState<string | null>(null);

  const [event, setEvent] = useState({ status: 'IN_TRANSIT', location: '', description: '', occurredAt: '', updateShipmentStatus: 'true' });

  const listQuery = useQuery({
    queryKey: ['admin', 'shipments', search],
    queryFn: async () => (await api.get<AdminShipment[]>(`/admin/shipments?limit=50&search=${encodeURIComponent(search)}`)).data,
  });

  const detailQuery = useQuery({
    queryKey: ['admin', 'shipment', selected],
    enabled: Boolean(selected),
    queryFn: async () => (await api.get<AdminShipment>(`/admin/shipments/${selected}`)).data,
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      api.post('/admin/shipments', {
        ...form,
        pieces: form.pieces ? Number(form.pieces) : undefined,
        weightKg: form.weightKg ? Number(form.weightKg) : undefined,
        etd: form.etd ? new Date(`${form.etd}T00:00:00Z`).toISOString() : undefined,
        eta: form.eta ? new Date(`${form.eta}T00:00:00Z`).toISOString() : undefined,
        isDemo: true,
      }),
    onSuccess: async () => {
      setFeedback('Shipment created. It is marked as demonstration data until you disable the demo flag in the database.');
      setForm({ ...emptyShipment });
      setShowCreate(false);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'shipments'] });
    },
    onError: (error) => setFeedback(error instanceof ApiError ? error.message : 'Could not create the shipment.'),
  });

  const eventMutation = useMutation({
    mutationFn: async () =>
      api.post(`/admin/shipments/${selected}/events`, {
        status: event.status,
        location: event.location || undefined,
        description: event.description,
        occurredAt: event.occurredAt ? new Date(event.occurredAt).toISOString() : undefined,
        updateShipmentStatus: event.updateShipmentStatus === 'true',
      }),
    onSuccess: async () => {
      setFeedback('Milestone added.');
      setEvent({ status: 'IN_TRANSIT', location: '', description: '', occurredAt: '', updateShipmentStatus: 'true' });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'shipment', selected] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'shipments'] });
    },
    onError: (error) => setFeedback(error instanceof ApiError ? error.message : 'Could not add the milestone.'),
  });

  const detail = detailQuery.data;

  return (
    <AdminPage
      title="Shipments"
      description="Records shown on the public tracking page. Add only verified milestones."
      actions={
        <Button variant="onlight" onClick={() => setShowCreate((open) => !open)} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
          New shipment
        </Button>
      }
    >
      {feedback ? (
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800" role="status">
          {feedback}
        </div>
      ) : null}

      {showCreate ? (
        <Panel title="Create shipment">
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <AdminField label="Tracking number *">
              <Input value={form.trackingNumber} onChange={(event) => setForm({ ...form, trackingNumber: event.target.value.toUpperCase() })} dir="ltr" placeholder="DEMO-SEA-1004" />
            </AdminField>
            <AdminField label="Booking reference">
              <Input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} dir="ltr" />
            </AdminField>
            <AdminField label="Status">
              <Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                {SHIPMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
                ))}
              </Select>
            </AdminField>
            <AdminField label="Mode">
              <Select value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value })}>
                {FREIGHT_MODES.map((mode) => (
                  <option key={mode} value={mode}>{mode}</option>
                ))}
              </Select>
            </AdminField>
            <AdminField label="Origin port *">
              <Input value={form.originPort} onChange={(event) => setForm({ ...form, originPort: event.target.value })} placeholder="Shanghai, CN" />
            </AdminField>
            <AdminField label="Destination port *">
              <Input value={form.destinationPort} onChange={(event) => setForm({ ...form, destinationPort: event.target.value })} placeholder="Alexandria, EG" />
            </AdminField>
            <AdminField label="Carrier">
              <Input value={form.carrier} onChange={(event) => setForm({ ...form, carrier: event.target.value })} />
            </AdminField>
            <AdminField label="Vessel / flight">
              <Input value={form.vesselOrFlight} onChange={(event) => setForm({ ...form, vesselOrFlight: event.target.value })} />
            </AdminField>
            <AdminField label="Container / equipment">
              <Input value={form.containerType} onChange={(event) => setForm({ ...form, containerType: event.target.value })} />
            </AdminField>
            <AdminField label="Pieces">
              <Input value={form.pieces} onChange={(event) => setForm({ ...form, pieces: event.target.value })} inputMode="numeric" dir="ltr" />
            </AdminField>
            <AdminField label="Weight (kg)">
              <Input value={form.weightKg} onChange={(event) => setForm({ ...form, weightKg: event.target.value })} inputMode="decimal" dir="ltr" />
            </AdminField>
            <AdminField label="Last location">
              <Input value={form.lastLocation} onChange={(event) => setForm({ ...form, lastLocation: event.target.value })} />
            </AdminField>
            <AdminField label="ETD">
              <Input type="date" value={form.etd} onChange={(event) => setForm({ ...form, etd: event.target.value })} dir="ltr" />
            </AdminField>
            <AdminField label="ETA">
              <Input type="date" value={form.eta} onChange={(event) => setForm({ ...form, eta: event.target.value })} dir="ltr" />
            </AdminField>
          </div>
          <div className="flex justify-end gap-2 border-t border-steel-200 px-5 py-4">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !form.trackingNumber || !form.originPort || !form.destinationPort}
            >
              {createMutation.isPending ? 'Creating…' : 'Create shipment'}
            </Button>
          </div>
        </Panel>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-400" aria-hidden="true" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tracking number or port…" className="ps-9" aria-label="Search shipments" />
        </div>
        <span className="text-xs font-semibold text-steel-500">{listQuery.data?.length ?? 0} records</span>
      </div>

      <Panel>
        {listQuery.isLoading ? (
          <div className="p-8"><Spinner label="Loading shipments…" /></div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Tracking</Th>
                <Th>Route</Th>
                <Th>Mode</Th>
                <Th>ETA</Th>
                <Th>Status</Th>
                <Th><span className="sr-only">Open</span></Th>
              </tr>
            </thead>
            <tbody>
              {!listQuery.data?.length ? (
                <EmptyRow colSpan={6} message="No shipments found." />
              ) : (
                listQuery.data.map((shipment) => (
                  <tr key={shipment.id} className={shipment.id === selected ? 'bg-brand-50/40' : 'hover:bg-steel-50/60'}>
                    <Td>
                      <span className="font-mono text-[0.8rem] font-bold text-navy-800">{shipment.trackingNumber}</span>
                      {shipment.isDemo ? <span className="ms-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[0.62rem] font-bold uppercase text-amber-700">demo</span> : null}
                    </Td>
                    <Td className="text-[0.8rem]">{shipment.originPort} → {shipment.destinationPort}</Td>
                    <Td>{shipment.mode}</Td>
                    <Td className="whitespace-nowrap text-[0.75rem]">{formatDateTime(shipment.eta, 'en')}</Td>
                    <Td><StatusPill status={shipment.status} label={shipment.status.replace(/_/g, ' ')} /></Td>
                    <Td>
                      <button type="button" onClick={() => setSelected(shipment.id)} className="text-[0.75rem] font-bold text-brand-700 hover:underline">
                        Manage
                      </button>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        )}
      </Panel>

      {selected ? (
        <Panel
          title={`Milestones · ${detail?.trackingNumber ?? ''}`}
          actions={
            <button type="button" onClick={() => setSelected(null)} className="text-xs font-semibold text-steel-500 hover:text-navy-800">
              Close
            </button>
          }
        >
          {detailQuery.isLoading || !detail ? (
            <div className="p-6"><Spinner label="Loading shipment…" /></div>
          ) : (
            <div className="grid gap-0 lg:grid-cols-2">
              <div className="border-b border-steel-200 p-5 lg:border-b-0 lg:border-e">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-steel-400">Recorded milestones</p>
                <ol className="mt-4 space-y-4">
                  {(detail.events ?? []).map((item: TrackingEvent, index) => (
                    <li key={`${item.occurredAt}-${index}`} className="border-s-2 border-steel-200 ps-4">
                      <p className="text-[0.82rem] font-bold text-navy-800">{item.status.replace(/_/g, ' ')}</p>
                      <p className="mt-0.5 text-[0.78rem] text-steel-600">{item.description}</p>
                      <p className="mt-1 text-[0.7rem] text-steel-400">
                        {formatDateTime(item.occurredAt, 'en')}{item.location ? ` · ${item.location}` : ''}
                      </p>
                    </li>
                  ))}
                  {!detail.events?.length ? <li className="text-sm text-steel-400">No milestones recorded.</li> : null}
                </ol>
              </div>

              <div className="space-y-4 p-5">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-steel-400">Add milestone</p>
                <AdminField label="Status">
                  <Select value={event.status} onChange={(changeEvent) => setEvent({ ...event, status: changeEvent.target.value })}>
                    {SHIPMENT_STATUSES.map((status) => (
                      <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
                    ))}
                  </Select>
                </AdminField>
                <AdminField label="Location">
                  <Input value={event.location} onChange={(changeEvent) => setEvent({ ...event, location: changeEvent.target.value })} />
                </AdminField>
                <AdminField label="Description *">
                  <Textarea rows={3} value={event.description} onChange={(changeEvent) => setEvent({ ...event, description: changeEvent.target.value })} placeholder="Vessel departed from origin terminal" />
                </AdminField>
                <AdminField label="Occurred at">
                  <Input type="datetime-local" value={event.occurredAt} onChange={(changeEvent) => setEvent({ ...event, occurredAt: changeEvent.target.value })} dir="ltr" />
                </AdminField>
                <label className="flex items-center gap-2 text-[0.82rem] text-steel-600">
                  <input
                    type="checkbox"
                    checked={event.updateShipmentStatus === 'true'}
                    onChange={(changeEvent) => setEvent({ ...event, updateShipmentStatus: changeEvent.target.checked ? 'true' : 'false' })}
                    className="h-4 w-4 rounded border-steel-400 text-brand-600"
                  />
                  Update the shipment’s current status
                </label>
                <Button onClick={() => eventMutation.mutate()} disabled={eventMutation.isPending || !event.description.trim()} className="w-full">
                  {eventMutation.isPending ? 'Adding…' : 'Add milestone'}
                </Button>
              </div>
            </div>
          )}
        </Panel>
      ) : null}
    </AdminPage>
  );
}
