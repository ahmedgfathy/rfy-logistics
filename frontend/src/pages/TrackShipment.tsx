import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/layout/PageHeader';
import { Container } from '../components/ui/Container';
import { TrackingPanel } from '../components/tracking/TrackingPanel';
import { useSeo, breadcrumbJsonLd } from '../lib/seo';
import { SITE } from '../lib/site';

export default function TrackShipment() {
  const { t } = useTranslation();

  useSeo({
    title: `${t('trackingPage.title')} | ${SITE.brand}`,
    description: t('trackingPage.description'),
    path: '/tracking',
    jsonLd: breadcrumbJsonLd([{ name: t('nav.tracking'), path: '/tracking' }]),
  });

  return (
    <>
      <PageHeader
        eyebrow={t('trackingPage.eyebrow')}
        title={t('trackingPage.title')}
        description={t('trackingPage.description')}
        crumbs={[{ label: t('nav.tracking') }]}
      />
      <section className="py-14 sm:py-16">
        <Container className="max-w-4xl">
          <TrackingPanel />
        </Container>
      </section>
    </>
  );
}
