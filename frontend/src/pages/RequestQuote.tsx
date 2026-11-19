import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, Lock, Mail } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Container } from '../components/ui/Container';
import { QuoteForm } from '../components/forms/QuoteForm';
import { useSeo, breadcrumbJsonLd } from '../lib/seo';
import { SITE } from '../lib/site';

export default function RequestQuote() {
  const { t } = useTranslation();
  const aside = t('quotePage.aside', { returnObjects: true }) as string[];

  useSeo({
    title: `${t('quotePage.eyebrow')} | ${SITE.brand}`,
    description: t('quotePage.description'),
    path: '/quote',
    jsonLd: breadcrumbJsonLd([{ name: t('nav.quote'), path: '/quote' }]),
  });

  return (
    <>
      <PageHeader
        eyebrow={t('quotePage.eyebrow')}
        title={t('quotePage.title')}
        description={t('quotePage.description')}
        crumbs={[{ label: t('nav.quote') }]}
      />

      <section className="py-14 sm:py-16">
        <Container className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <QuoteForm />
          </div>

          <aside className="lg:col-span-4">
            <div className="sticky top-28 space-y-4">
              <div className="rounded-2xl border border-steel-200 bg-white p-6 shadow-soft">
                <h2 className="text-[1rem] font-bold text-navy-800">{t('quotePage.asideTitle')}</h2>
                <ul className="mt-4 space-y-3">
                  {aside.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[0.85rem] leading-relaxed text-steel-600">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="mt-6 space-y-3 border-t border-steel-200 pt-5 text-[0.82rem] text-steel-600">
                  <p className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-brand-600" aria-hidden="true" />
                    {t('quotePage.form.responseTime')}
                  </p>
                  <p className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-brand-600" aria-hidden="true" />
                    {t('legal.privacy.title')}
                  </p>
                  <a href={`mailto:${SITE.email}`} className="flex items-center gap-2 hover:text-brand-700">
                    <Mail className="h-4 w-4 text-brand-600" aria-hidden="true" />
                    {SITE.email}
                  </a>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <p className="text-[0.8rem] font-bold text-amber-800">{t('footer.hours')}</p>
                <p className="mt-1 text-[0.82rem] text-amber-700">{SITE.hoursEn}</p>
                <p className="mt-2 text-[0.82rem] text-amber-700" dir="ltr">{SITE.phone}</p>
              </div>
            </div>
          </aside>
        </Container>
      </section>
    </>
  );
}
