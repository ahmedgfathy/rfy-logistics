import { useTranslation } from 'react-i18next';
import { ArrowRight, Compass } from 'lucide-react';
import { Container } from '../components/ui/Container';
import { ButtonLink } from '../components/ui/Button';
import { useSeo } from '../lib/seo';

export default function NotFound() {
  const { t } = useTranslation();
  useSeo({ title: `${t('states.notFoundTitle')} | ${t('brand.name')}`, description: t('states.notFoundBody'), path: '/404', noIndex: true });

  return (
    <section className="relative overflow-hidden border-b border-steel-200 bg-steel-50 py-24 sm:py-32">
      <div className="absolute inset-0 bg-grid opacity-50" aria-hidden="true" />
      <div className="absolute -end-32 top-0 h-72 w-72 rounded-full bg-brand-100/60 blur-3xl" aria-hidden="true" />
      <Container className="relative max-w-2xl text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-200 bg-white text-brand-600 shadow-soft">
          <Compass className="h-7 w-7" aria-hidden="true" />
        </span>
        <p className="mt-6 text-[0.72rem] font-bold uppercase tracking-[0.2em] text-brand-700">{t('notFound.eyebrow')}</p>
        <h1 className="mt-3 text-[2.2rem] font-extrabold leading-tight text-navy-800 sm:text-[2.8rem]">{t('notFound.title')}</h1>
        <p className="mx-auto mt-4 max-w-md text-[0.95rem] leading-relaxed text-steel-600">{t('notFound.body')}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink to="/" iconRight={<ArrowRight className="flip-x h-4 w-4" aria-hidden="true" />}>
            {t('notFound.cta')}
          </ButtonLink>
          <ButtonLink to="/services" variant="onlight">
            {t('notFound.secondary')}
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
