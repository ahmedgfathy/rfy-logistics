import { useTranslation } from 'react-i18next';
import { Container } from '../components/ui/Container';
import { SectionHeading } from '../components/ui/SectionHeading';
import { Hero } from '../components/sections/Hero';
import { ServicesGrid } from '../components/sections/ServicesGrid';
import { WhyUs } from '../components/sections/WhyUs';
import { Coverage } from '../components/sections/Coverage';
import { Industries } from '../components/sections/Industries';
import { Process } from '../components/sections/Process';
import { CtaBanner } from '../components/sections/CtaBanner';
import { useSeo, organizationJsonLd } from '../lib/seo';
import { SITE } from '../lib/site';

export default function Home() {
  const { t } = useTranslation();

  useSeo({
    title: `${SITE.brand} — Freight Forwarding & Customs Clearance in Egypt`,
    description: t('hero.description'),
    path: '/',
    jsonLd: [
      organizationJsonLd,
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: SITE.brand,
        url: SITE.url,
      },
    ],
  });

  return (
    <>
      <Hero />

      <section className="py-20 sm:py-24">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading
              eyebrow={t('home.services.eyebrow')}
              title={t('home.services.title')}
              description={t('home.services.description')}
            />
          </div>
          <div className="mt-10">
            <ServicesGrid limit={5} />
          </div>
        </Container>
      </section>

      <WhyUs />
      <Coverage />
      <Industries />
      <Process />
      <CtaBanner />
    </>
  );
}
