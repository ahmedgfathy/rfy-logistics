import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/layout/PageHeader';
import { Container } from '../components/ui/Container';
import { useSeo, breadcrumbJsonLd } from '../lib/seo';
import { SITE } from '../lib/site';

interface LegalSection {
  h: string;
  p: string[];
}

export function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const { t } = useTranslation();
  const title = t(`legal.${kind}.title`);
  const intro = t(`legal.${kind}.intro`);
  const updated = t(`legal.${kind}.updated`);
  const sections = t(`legal.${kind}.sections`, { returnObjects: true }) as LegalSection[];
  const path = `/${kind}`;

  useSeo({
    title: `${title} | ${SITE.brand}`,
    description: intro,
    path,
    jsonLd: breadcrumbJsonLd([{ name: title, path }]),
  });

  return (
    <>
      <PageHeader eyebrow={t('footer.legalTitle')} title={title} description={updated} crumbs={[{ label: title }]} />
      <section className="py-14 sm:py-16">
        <Container className="max-w-3xl">
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[0.82rem] leading-relaxed text-amber-800">
            {intro}
          </p>

          <div className="mt-8 space-y-8">
            {sections.map((section, index) => (
              <div key={section.h}>
                <h2 className="text-[1.1rem] font-bold text-navy-800">
                  <span className="me-2 text-brand-600">{index + 1}.</span>
                  {section.h}
                </h2>
                <div className="prose-copy mt-3">
                  {section.p.map((paragraph) => (
                    <p key={paragraph.slice(0, 40)}>{paragraph}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}

export function PrivacyPage() {
  return <LegalPage kind="privacy" />;
}

export function TermsPage() {
  return <LegalPage kind="terms" />;
}
