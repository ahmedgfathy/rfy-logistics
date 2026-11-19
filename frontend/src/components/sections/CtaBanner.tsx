import { useTranslation } from 'react-i18next';
import { ArrowRight, Phone } from 'lucide-react';
import { Container } from '../ui/Container';
import { ButtonLink } from '../ui/Button';
import { SITE } from '../../lib/site';

export function CtaBanner() {
  const { t } = useTranslation();

  return (
    <section className="pb-20 sm:pb-24">
      <Container>
        <div className="relative isolate overflow-hidden rounded-3xl border border-brand-100 bg-brand-50/70 px-7 py-12 shadow-soft sm:px-12 sm:py-14">
          <div className="absolute inset-0 bg-grid opacity-40" aria-hidden="true" />
          <div className="absolute -end-24 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" aria-hidden="true" />
          <div className="absolute -bottom-28 start-1/3 h-64 w-64 rounded-full bg-amber-300/25 blur-3xl" aria-hidden="true" />

          <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <p className="eyebrow">{t('home.cta.eyebrow')}</p>
              <h2 className="mt-3 text-balance text-[1.8rem] font-extrabold leading-tight text-navy-800 sm:text-[2.2rem]">
                {t('home.cta.title')}
              </h2>
              <p className="mt-3 max-w-xl text-[0.95rem] leading-relaxed text-steel-600">{t('home.cta.description')}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <ButtonLink to="/quote" size="lg" iconRight={<ArrowRight className="flip-x h-4 w-4" aria-hidden="true" />}>
                {t('home.cta.primary')}
              </ButtonLink>
              <ButtonLink
                href={`tel:${SITE.phoneHref}`}
                variant="onlight"
                size="lg"
                icon={<Phone className="h-4 w-4" aria-hidden="true" />}
              >
                {t('home.cta.secondary')}
              </ButtonLink>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
