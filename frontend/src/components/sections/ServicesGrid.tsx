import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Boxes,
  FileCheck2,
  Forklift,
  Globe2,
  Package,
  Plane,
  Ship,
  ShieldCheck,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { useServices } from '../../lib/queries';
import { Reveal } from '../ui/Reveal';
import { StatePanel } from '../ui/Spinner';

const iconMap: Record<string, LucideIcon> = {
  Ship,
  Plane,
  Truck,
  ShieldCheck,
  Globe2,
  Package,
  FileCheck2,
  Forklift,
  Boxes,
};

export function ServiceIcon({ name, className }: { name: string; className?: string }) {
  const Icon = iconMap[name] ?? Ship;
  return <Icon className={className} aria-hidden="true" />;
}

export function ServicesGrid({ limit, showAllLink = true }: { limit?: number; showAllLink?: boolean }) {
  const { t, i18n } = useTranslation();
  const { data: services, isLoading, isError } = useServices();
  const isArabic = i18n.language === 'ar';
  const visible = (services ?? []).slice(0, limit ?? undefined);

  if (isLoading) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((key) => (
          <div key={key} className="h-64 animate-pulse rounded-xl border border-[var(--line)] bg-[var(--surface)]" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <StatePanel title={t('states.error')} body={t('states.errorBody')} />;
  }

  if (!visible.length) {
    return <StatePanel title={t('states.empty')} body={t('states.errorBody')} />;
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((service, index) => (
        <Reveal key={service.slug} delay={index * 0.04}>
          <Link
            to={`/services/${service.slug}`}
            className="flip-scene group block h-64 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500"
            aria-label={isArabic ? service.titleAr : service.titleEn}
          >
            <div className="flip-inner">
              <div className="flip-face flex flex-col rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-soft transition-colors group-hover:border-brand-500">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-brand-500 text-white shadow-sm">
                  <ServiceIcon name={service.icon} className="h-6 w-6" />
                </span>
                <h3 className="mt-5 text-[1.15rem] font-black leading-snug text-[var(--navy-800)]">
                  {isArabic ? service.titleAr : service.titleEn}
                </h3>
                <span className="mt-auto inline-flex items-center gap-1.5 text-[0.78rem] font-bold text-brand-500">
                  {t('actions.learnMore')}
                  <ArrowRight className="flip-x h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </div>

              <div className="flip-face flip-back flex flex-col justify-between rounded-xl bg-brand-500 p-6 text-white shadow-lift">
                <div>
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/15">
                    <ServiceIcon name={service.icon} className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-[1.05rem] font-black">{isArabic ? service.titleAr : service.titleEn}</h3>
                  <p className="mt-2 line-clamp-4 text-[0.84rem] leading-relaxed text-white/85">
                    {isArabic ? service.excerptAr : service.excerptEn}
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 text-[0.8rem] font-extrabold uppercase tracking-wide">
                  {t('actions.learnMore')}
                  <ArrowRight className="flip-x h-4 w-4" aria-hidden="true" />
                </span>
              </div>
            </div>
          </Link>
        </Reveal>
      ))}

      {showAllLink ? (
        <Reveal delay={0.2}>
          <Link
            to="/services"
            className="group flex h-64 flex-col justify-between rounded-xl border border-dashed border-[var(--line-400)] bg-[var(--surface)] p-6 transition-all duration-300 hover:border-brand-500 hover:bg-brand-500/5"
          >
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--surface-2)] text-brand-500 transition-colors group-hover:bg-brand-500 group-hover:text-white">
              <Boxes className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[1.1rem] font-black text-[var(--navy-800)]">{t('actions.viewAll')}</p>
              <p className="mt-2 line-clamp-3 text-[0.84rem] leading-relaxed text-[var(--steel-500)]">
                {t('home.services.description')}
              </p>
            </div>
            <ArrowRight className="flip-x h-5 w-5 text-brand-500" aria-hidden="true" />
          </Link>
        </Reveal>
      ) : null}
    </div>
  );
}
