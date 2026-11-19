import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Boxes,
  Container,
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
import { cn } from '../../lib/utils';

const iconMap: Record<string, LucideIcon> = {
  Ship,
  Plane,
  Truck,
  ShieldCheck,
  Globe2,
  Container,
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((key) => (
          <div key={key} className="h-52 animate-pulse rounded-2xl border border-steel-200 bg-steel-50" />
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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((service, index) => (
        <Reveal key={service.slug} delay={index * 0.04}>
          <Link
            to={`/services/${service.slug}`}
            className={cn(
              'group flex h-full flex-col rounded-2xl border border-steel-200 bg-white p-6 shadow-soft transition-all duration-300 ease-premium hover:-translate-y-1 hover:border-brand-200 hover:shadow-lift',
            )}
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 transition-colors duration-300 group-hover:bg-brand-600 group-hover:text-white">
              <ServiceIcon name={service.icon} className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-[1.05rem] font-bold text-navy-800">
              {isArabic ? service.titleAr : service.titleEn}
            </h3>
            <p className="mt-2 flex-1 text-[0.86rem] leading-relaxed text-steel-500">
              {isArabic ? service.excerptAr : service.excerptEn}
            </p>
            <span className="mt-5 inline-flex items-center gap-1.5 text-[0.8rem] font-bold text-brand-700">
              {t('actions.learnMore')}
              <ArrowRight className="flip-x h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </Link>
        </Reveal>
      ))}
      {showAllLink ? (
        <Reveal delay={0.2} className="sm:col-span-2 lg:col-span-1">
          <Link
            to="/services"
            className="flex h-full min-h-[13rem] flex-col justify-between rounded-2xl border border-dashed border-steel-300 bg-steel-50/70 p-6 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white text-navy-700 shadow-soft">
              <Boxes className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[1.05rem] font-bold text-navy-800">{t('actions.viewAll')}</p>
              <p className="mt-1 text-[0.86rem] text-steel-500">{t('home.services.description')}</p>
            </div>
            <ArrowRight className="flip-x h-5 w-5 text-brand-600" aria-hidden="true" />
          </Link>
        </Reveal>
      ) : null}
    </div>
  );
}
