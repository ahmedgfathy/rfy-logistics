import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Container } from '../components/ui/Container';
import { CtaBanner } from '../components/sections/CtaBanner';
import { useSeo, breadcrumbJsonLd } from '../lib/seo';
import { SITE } from '../lib/site';

interface FaqItem {
  q: string;
  a: string;
}

export default function Faq() {
  const { t } = useTranslation();
  const items = t('faqPage.items', { returnObjects: true }) as FaqItem[];

  useSeo({
    title: `${t('faqPage.title')} | ${SITE.brand}`,
    description: t('faqPage.description'),
    path: '/faq',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
      breadcrumbJsonLd([{ name: t('nav.faq'), path: '/faq' }]),
    ],
  });

  return (
    <>
      <PageHeader
        eyebrow={t('faqPage.eyebrow')}
        title={t('faqPage.title')}
        description={t('faqPage.description')}
        crumbs={[{ label: t('nav.faq') }]}
      />
      <section className="py-14 sm:py-16">
        <Container className="max-w-3xl">
          <div className="divide-y divide-steel-200 overflow-hidden rounded-2xl border border-steel-200 bg-white">
            {items.map((item, index) => (
              <details key={item.q} className="group" open={index === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5">
                  <span className="text-[0.95rem] font-bold text-navy-800">{item.q}</span>
                  <Plus className="h-4 w-4 shrink-0 text-steel-400 transition-transform duration-300 group-open:rotate-45" aria-hidden="true" />
                </summary>
                <div className="px-6 pb-5 text-[0.88rem] leading-relaxed text-steel-600">{item.a}</div>
              </details>
            ))}
          </div>
        </Container>
      </section>
      <CtaBanner />
    </>
  );
}
