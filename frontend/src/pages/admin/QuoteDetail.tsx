import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Download, FileText } from 'lucide-react';
import { api, API_BASE, ApiError } from '../../lib/api';
import type { QuoteDetail as QuoteDetailType } from '../../types';
import { AdminField, AdminPage, Panel } from '../../components/admin/ui';
import { Select, Textarea } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Spinner, StatePanel } from '../../components/ui/Spinner';
import { StatusPill } from '../../components/ui/StatusPill';
import { QUOTE_STATUSES } from '../../lib/site';
import { formatDateTime } from '../../lib/utils';

export function QuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('NEW');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const { data: quote, isLoading, isError } = useQuery({
    queryKey: ['admin', 'quote', id],
    enabled: Boolean(id),
    queryFn: async () => (await api.get<QuoteDetailType>(`/quotes/${id}`)).data,
  });

  useEffect(() => {
    if (quote) {
      setStatus(quote.status);
      setNotes(quote.adminNotes ?? '');
    }
  }, [quote]);

  const mutation = useMutation({
    mutationFn: async () => api.patch(`/quotes/${id}/status`, { status, adminNotes: notes }),
    onSuccess: async () => {
      setMessage('Status saved.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'quote', id] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
    onError: (error) => setMessage(error instanceof ApiError ? error.message : 'Could not save the status.'),
  });

  if (isLoading) return <Spinner label="Loading quote request…" />;
  if (isError || !quote) {
    return (
      <StatePanel
        title="Quote request unavailable"
        body="This record could not be loaded."
        action={<Link to="/admin/quotes" className="btn-onlight">Back to list</Link>}
      />
    );
  }

  const rows: [string, string][] = [
    ['Customer', quote.fullName],
    ['Company', quote.companyName ?? '—'],
    ['Email', quote.email],
    ['Phone', quote.phone],
    ['Freight mode', quote.freightMode],
    ['Shipment type', quote.shipmentType],
    ['Origin', `${quote.originCity}, ${quote.originCountry}`],
    ['Destination', `${quote.destinationCity}, ${quote.destinationCountry}`],
    ['Weight (kg)', quote.cargoWeightKg ?? '—'],
    ['Volume (CBM)', quote.cargoVolumeCbm ?? '—'],
    ['Packages', quote.packageCount === null ? '—' : String(quote.packageCount)],
    ['Container', quote.containerType ?? '—'],
    ['Incoterms', quote.incoterms ?? '—'],
    ['Expected ship date', quote.expectedShipDate ? formatDateTime(quote.expectedShipDate, 'en') : '—'],
    ['Language', quote.locale],
    ['Received', formatDateTime(quote.createdAt, 'en')],
  ];

  return (
    <AdminPage
      title={quote.reference}
      description={`Submitted ${formatDateTime(quote.createdAt, 'en')}`}
      actions={<Link to="/admin/quotes" className="btn-onlight px-3 py-2 text-xs">Back to list</Link>}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Shipment details">
            <dl className="grid gap-px bg-steel-100 sm:grid-cols-2">
              {rows.map(([label, value]) => (
                <div key={label} className="bg-white px-5 py-3">
                  <dt className="text-[0.66rem] font-bold uppercase tracking-[0.1em] text-steel-400">{label}</dt>
                  <dd className="mt-0.5 break-words text-[0.85rem] font-semibold text-navy-800">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-steel-200 px-5 py-4">
              <p className="text-[0.66rem] font-bold uppercase tracking-[0.1em] text-steel-400">Cargo description</p>
              <p className="mt-1 whitespace-pre-line text-[0.86rem] leading-relaxed text-steel-700">{quote.cargoDescription}</p>
              {quote.additionalNotes ? (
                <>
                  <p className="mt-4 text-[0.66rem] font-bold uppercase tracking-[0.1em] text-steel-400">Additional requirements</p>
                  <p className="mt-1 whitespace-pre-line text-[0.86rem] leading-relaxed text-steel-700">{quote.additionalNotes}</p>
                </>
              ) : null}
            </div>
          </Panel>

          <Panel title="Attachments">
            {quote.attachments.length === 0 ? (
              <p className="px-5 py-6 text-sm text-steel-400">No documents were attached.</p>
            ) : (
              <ul className="divide-y divide-steel-100">
                {quote.attachments.map((attachment) => (
                  <li key={attachment.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <FileText className="h-4 w-4 shrink-0 text-steel-400" aria-hidden="true" />
                      <span className="truncate text-[0.84rem] font-semibold text-navy-800">{attachment.fileName}</span>
                      <span className="shrink-0 text-[0.7rem] text-steel-400">{(attachment.sizeBytes / 1024).toFixed(0)} KB</span>
                    </span>
                    <a
                      href={`${API_BASE}/quotes/${quote.id}/attachments/${attachment.id}`}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-steel-200 px-2.5 py-1.5 text-[0.72rem] font-semibold text-steel-600 hover:border-brand-300 hover:text-brand-700"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Workflow">
            <div className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-steel-500">Current status</span>
                <StatusPill status={quote.status} label={quote.status.replace(/_/g, ' ')} />
              </div>

              <AdminField label="Set status">
                <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                  {QUOTE_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {value.replace(/_/g, ' ')}
                    </option>
                  ))}
                </Select>
              </AdminField>

              <AdminField label="Internal notes">
                <Textarea rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Rates discussed, customer preferences, follow-up date…" />
              </AdminField>

              {message ? <p className="text-xs font-semibold text-emerald-700">{message}</p> : null}

              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="w-full" icon={<Check className="h-4 w-4" aria-hidden="true" />}>
                {mutation.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </Panel>

          <Panel title="Contact">
            <div className="space-y-3 p-5 text-[0.84rem]">
              <a href={`mailto:${quote.email}`} className="block font-semibold text-brand-700 hover:underline">{quote.email}</a>
              <a href={`tel:${quote.phone}`} className="block text-steel-600" dir="ltr">{quote.phone}</a>
              <p className="text-[0.72rem] leading-relaxed text-steel-400">
                Customer contact details are shown only inside the authenticated dashboard.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </AdminPage>
  );
}
