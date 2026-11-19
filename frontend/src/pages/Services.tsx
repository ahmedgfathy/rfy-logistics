import { useTranslation } from 'react-i18next';
import { Container } from '../components/ui/Container';
import { PageHeader } from '../components/layout/PageHeader';
import { ServicesGrid } from '../components/sections/ServicesGrid';
import { CtaBanner } from '../components/sections/CtaBanner';
import { useSeo, breadcrumbJsonLd, organizationJsonLd } from '../lib/seo';
import { SITE } from '../lib/site';

export default function Services() {
  const { t } = useTranslation();

  useSeo({
    title: `${t('servicesPage.title')} | ${SITE.brand}`,
    description: t('servicesPage.description'),
    path: '/services',
    jsonLd: [
      organizationJsonLd,
      breadcrumbJsonLd([{ name: t('nav.services'), path: '/services' }]),
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: t('servicesPage.title'),
        itemListElement: [
          'sea-freight',
          'air-freight',
          'road-freight',
          'customs-clearance',
          'freight-forwarding',
          'inland-haulage',
          'packing-handling',
          'documentation-compliance',
          'project-cargo',
        ].map((slug, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `${SITE.url}/services/${slug}`,
        })),
      },
    ],
  });

  return (
    <>
      <PageHeader
        eyebrow={t('servicesPage.eyebrow')}
        title={t('servicesPage.title')}
        description={t('servicesPage.description')}
        crumbs={[{ label: t('nav.services') }]}
      />
      <section className="py-16 sm:py-20">
        <Container>
          <ServicesGrid showAllLink={false} />
        </Container>
      </section>
      <CtaBanner />
    </>
  );
}
