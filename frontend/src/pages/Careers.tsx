import { useTranslation } from 'react-i18next';
import { Briefcase } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Container } from '../components/ui/Container';
import { StatePanel } from '../components/ui/Spinner';
import { ApplicationForm } from '../components/forms/ApplicationForm';
import { useSeo, breadcrumbJsonLd } from '../lib/seo';
import { SITE } from '../lib/site';

export default function Careers() {
  const { t } = useTranslation();

  useSeo({
    title: `${t('careersPage.title')} | ${SITE.brand}`,
    description: t('careersPage.description'),
    path: '/careers',
    jsonLd: breadcrumbJsonLd([{ name: t('nav.careers'), path: '/careers' }]),
  });

  return (
    <>
      <PageHeader
        eyebrow={t('careersPage.eyebrow')}
        title={t('careersPage.title')}
        description={t('careersPage.description')}
        crumbs={[{ label: t('nav.careers') }]}
      />

      <section className="py-14 sm:py-16">
        <Container className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <h2 className="text-[1.1rem] font-bold text-navy-800">{t('careersPage.openingsTitle')}</h2>
            <div className="mt-4">
              <StatePanel
                title={t('careersPage.openingsEmpty')}
                body={t('careersPage.openingsEmptyBody')}
                icon={<Briefcase className="h-5 w-5" aria-hidden="true" />}
              />
            </div>
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[0.8rem] leading-relaxed text-amber-800">
              {t('careersPage.note')}
            </p>
          </div>

          <div className="lg:col-span-8">
            <ApplicationForm />
          </div>
        </Container>
      </section>
    </>
  );
}
