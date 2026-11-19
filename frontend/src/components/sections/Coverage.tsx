import { useTranslation } from 'react-i18next';
import { Anchor, ArrowRight, Plane, Ship, Truck } from 'lucide-react';
import { Container } from '../ui/Container';
import { SectionHeading } from '../ui/SectionHeading';
import { SITE } from '../../lib/site';

interface ModeItem {
  label: string;
  detail: string;
}

const laneRows = [
  { from: 'Asia', to: 'Alexandria', mode: 'Sea', days: 'Direct / 1 transhipment' },
  { from: 'Europe', to: 'Damietta', mode: 'Sea', days: 'Weekly sailings' },
  { from: 'Gulf', to: 'Sokhna', mode: 'Sea / Road', days: 'Short-sea + land' },
  { from: 'Worldwide', to: 'Cairo', mode: 'Air', days: 'Direct & consolidated' },
];

export function Coverage() {
  const { t } = useTranslation();
  const modes = t('home.coverage.modes', { returnObjects: true }) as ModeItem[];
  const modeIcons = [Ship, Ship, Plane, Truck];

  return (
    <section className="relative overflow-hidden border-y border-[var(--line)] bg-[var(--soft)] py-20 sm:py-24">
      <div className="absolute inset-0 bg-grid opacity-40" aria-hidden="true" />
      <div
        className="absolute -end-40 top-1/3 h-[28rem] w-[28rem] rounded-full bg-[var(--brand-100)]/50 blur-3xl"
        aria-hidden="true"
      />
      <Container className="relative">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionHeading
              eyebrow={t('home.coverage.eyebrow')}
              title={t('home.coverage.title')}
              description={t('home.coverage.description')}
            />

            <div className="mt-8">
              <p className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-[var(--steel-500)]">
                {t('home.coverage.portsLabel')}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {SITE.ports.map((port) => (
                  <span
                    key={port}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--steel-700)]"
                  >
                    <Anchor className="h-3 w-3 text-[var(--brand-600)]" aria-hidden="true" />
                    {port}
                  </span>
                ))}
              </div>
            </div>

            <p className="mt-6 text-xs leading-relaxed text-[var(--steel-500)]">{t('home.coverage.mapCaption')}</p>
          </div>

          <div className="lg:col-span-7">
            <div className="grid gap-3 sm:grid-cols-2">
              {modes.map((mode, index) => {
                const Icon = modeIcons[index] ?? Ship;
                return (
                  <div
                    key={mode.label}
                    className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-soft"
                  >
                    <Icon className="h-5 w-5 text-[var(--brand-600)]" aria-hidden="true" />
                    <p className="mt-3 text-sm font-bold text-[var(--navy-800)]">{mode.label}</p>
                    <p className="mt-1 text-[0.8rem] leading-relaxed text-[var(--steel-500)]">{mode.detail}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-[var(--line)] bg-[var(--soft-100)] px-5 py-3 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-[var(--steel-500)]">
                <span>Origin</span>
                <span />
                <span className="text-end">Egypt gateway</span>
              </div>
              {laneRows.map((lane) => (
                <div
                  key={`${lane.from}-${lane.to}`}
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-[var(--line-light)] px-5 py-3.5 last:border-0"
                >
                  <div>
                    <p className="text-sm font-semibold text-[var(--navy-800)]">{lane.from}</p>
                    <p className="text-[0.7rem] text-[var(--steel-500)]">{lane.mode}</p>
                  </div>
                  <div className="flex w-16 items-center gap-1 sm:w-24">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-500)]" />
                    <span className="h-px flex-1 bg-gradient-to-r from-[var(--brand-400)]/70 to-[var(--amber-400)]/70" />
                    <ArrowRight className="flip-x h-3 w-3 text-[var(--amber-500)]" aria-hidden="true" />
                  </div>
                  <div className="text-end">
                    <p className="text-sm font-semibold text-[var(--navy-800)]">{lane.to}</p>
                    <p className="text-[0.7rem] text-[var(--steel-500)]">{lane.days}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}