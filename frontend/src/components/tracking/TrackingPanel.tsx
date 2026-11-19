import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarClock,
  CheckCircle2,
  MapPin,
  PackageSearch,
  Route,
  Scale,
  Ship,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { TrackingResult } from '../../types';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Field';
import { Spinner, StatePanel } from '../ui/Spinner';
import { StatusPill } from '../ui/StatusPill';
import { formatDateTime, formatNumber } from '../../lib/utils';

export function TrackingPanel() {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialNumber = searchParams.get('number') ?? '';
  const [value, setValue] = useState(initialNumber);
  const started = useRef(false);

  const mutation = useMutation({
    mutationFn: async (trackingNumber: string) =>
      (await api.get<TrackingResult>(`/tracking/${encodeURIComponent(trackingNumber.trim())}`)).data,
  });

  useEffect(() => {
    if (initialNumber && !started.current) {
      started.current = true;
      mutation.mutate(initialNumber);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNumber]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setSearchParams({ number: trimmed });
    mutation.mutate(trimmed);
  };

  const result = mutation.data;
  const error = mutation.error;

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="surface p-5 sm:p-6">
        <Field label={t('trackingPage.label')} htmlFor="tracking-number">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="tracking-number"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={t('trackingPage.placeholder')}
              dir="ltr"
              autoComplete="off"
              className="font-mono uppercase tracking-wide"
            />
            <Button type="submit" disabled={mutation.isPending || !value.trim()} className="shrink-0" icon={<PackageSearch className="h-4 w-4" aria-hidden="true" />}>
              {mutation.isPending ? t('actions.searching') : t('trackingPage.button')}
            </Button>
          </div>
        </Field>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-steel-500">
          <button
            type="button"
            onClick={() => {
              setValue('DEMO-SEA-1001');
              setSearchParams({ number: 'DEMO-SEA-1001' });
              mutation.mutate('DEMO-SEA-1001');
            }}
            className="inline-flex min-h-[36px] items-center rounded-md bg-amber-500/10 px-2.5 py-1.5 font-semibold text-amber-700 transition-colors hover:bg-amber-500/20"
          >
            {t('trackingPage.demoHint')}: DEMO-SEA-1001
          </button>
          <span>{t('trackingPage.privacyNote')}</span>
        </div>
      </form>

      {mutation.isPending ? (
        <div className="surface flex items-center justify-center gap-3 p-10">
          <Spinner label={t('actions.searching')} />
        </div>
      ) : null}

      {error && !mutation.isPending ? (
        <StatePanel
          title={t('trackingPage.notFoundTitle')}
          body={error instanceof ApiError && error.status !== 404 ? error.message : t('trackingPage.notFoundBody')}
          icon={<PackageSearch className="h-5 w-5" aria-hidden="true" />}
        />
      ) : null}

      {!result && !error && !mutation.isPending ? (
        <StatePanel title={t('trackingPage.emptyTitle')} body={t('trackingPage.emptyBody')} icon={<Route className="h-5 w-5" aria-hidden="true" />} />
      ) : null}

      {result ? (
        <div className="space-y-5">
          {result.isDemo ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5" role="note">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold text-amber-800">{t('states.demoTitle')}</p>
                <p className="mt-0.5 text-[0.82rem] leading-relaxed text-amber-700">{t('states.demoBody')}</p>
              </div>
            </div>
          ) : null}

          <div className="surface overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-steel-200 bg-steel-50 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5">
              <div>
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-steel-500">{t('trackingPage.resultTitle')}</p>
                <p className="mt-1 break-all font-mono text-base font-bold tracking-wide text-navy-800 sm:text-lg">{result.trackingNumber}</p>
              </div>
              <StatusPill status={result.status} label={t(`status.${result.status}`)} />
            </div>

            <div className="grid gap-px bg-steel-200 sm:grid-cols-2">
              <Detail icon={<Ship className="h-4 w-4" />} label={t('trackingPage.origin')} value={result.originPort} />
              <Detail icon={<MapPin className="h-4 w-4" />} label={t('trackingPage.destination')} value={result.destinationPort} />
              <Detail icon={<Route className="h-4 w-4" />} label={t('trackingPage.etd')} value={formatDateTime(result.etd, i18n.language)} />
              <Detail
                icon={<CalendarClock className="h-4 w-4" />}
                label={result.deliveredAt ? t('trackingPage.delivered') : t('trackingPage.eta')}
                value={formatDateTime(result.deliveredAt ?? result.eta, i18n.language)}
              />
              <Detail icon={<Boxes className="h-4 w-4" />} label={t('trackingPage.pieces')} value={result.pieces === null ? '—' : formatNumber(result.pieces, i18n.language)} />
              <Detail icon={<Scale className="h-4 w-4" />} label={t('trackingPage.weight')} value={result.weightKg === null ? '—' : formatNumber(result.weightKg, i18n.language)} />
              <Detail label={t('trackingPage.carrier')} value={result.carrier ?? '—'} />
              <Detail label={t('trackingPage.vessel')} value={result.vesselOrFlight ?? '—'} />
              <Detail label={t('trackingPage.container')} value={result.containerType ?? '—'} />
              <Detail label={t('trackingPage.reference')} value={result.reference ?? '—'} />
              <Detail label={t('trackingPage.lastLocation')} value={result.lastLocation ?? '—'} />
              <Detail label={t('trackingPage.lastUpdate')} value={formatDateTime(result.updatedAt, i18n.language)} />
            </div>
          </div>

          <div className="surface p-6">
            <h2 className="flex items-center gap-2 text-[1rem] font-bold text-navy-800">
              <Route className="h-4 w-4 text-brand-600" aria-hidden="true" />
              {t('trackingPage.timeline')}
            </h2>

            {result.events.length === 0 ? (
              <p className="mt-3 text-sm text-steel-500">{t('trackingPage.noEvents')}</p>
            ) : (
              <ol className="mt-6 space-y-0">
                {result.events.map((event, index) => (
                  <li key={`${event.occurredAt}-${index}`} className="relative flex gap-4 pb-7 last:pb-0">
                    {index < result.events.length - 1 ? (
                      <span className="absolute start-[11px] top-5 h-full w-px bg-steel-200" aria-hidden="true" />
                    ) : null}
                    <span
                      className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                        index === 0 ? 'border-brand-600 bg-brand-600 text-white' : 'border-steel-300 bg-white text-steel-400'
                      }`}
                    >
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-bold text-navy-800">{t(`status.${event.status}`)}</p>
                        <p className="text-xs text-steel-400">{formatDateTime(event.occurredAt, i18n.language)}</p>
                      </div>
                      <p className="mt-1 text-[0.86rem] leading-relaxed text-steel-600">{event.description}</p>
                      {event.location ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs text-steel-500">
                          <MapPin className="h-3 w-3" aria-hidden="true" />
                          {event.location}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-steel-200 bg-steel-50/70 px-5 py-4">
        <div>
          <p className="text-sm font-bold text-navy-800">{t('trackingPage.helpTitle')}</p>
          <p className="mt-0.5 text-xs text-steel-500">{t('trackingPage.helpBody')}</p>
        </div>
        <a
          href="mailto:operations@rfy-demo.local"
          className="inline-flex min-h-[40px] items-center gap-1.5 py-1 text-sm font-bold text-brand-700 hover:text-brand-800"
        >
          {t('trackingPage.helpCta')}
          <ArrowRight className="flip-x h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

function Detail({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-white px-4 py-3.5 sm:px-6 sm:py-4">
      <p className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-steel-400">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-[0.9rem] font-semibold text-navy-800">{value}</p>
    </div>
  );
}
