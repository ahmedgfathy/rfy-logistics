import { useTranslation } from 'react-i18next';
import { Container } from '../ui/Container';
import { SectionHeading } from '../ui/SectionHeading';
import { Reveal } from '../ui/Reveal';
import { Factory } from 'lucide-react';

export function Industries() {
  const { t } = useTranslation();
  const items = t('home.industries.items', { returnObjects: true }) as string[];

  return (
    <section className="py-20 sm:py-24">
      <Container>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            eyebrow={t('home.industries.eyebrow')}
            title={t('home.industries.title')}
            description={t('home.industries.description')}
          />
        </div>

        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-[var(--line)] bg-white sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <Reveal key={item} delay={index * 0.03}>
              <div className="flex h-full items-center gap-4 bg-white px-6 py-7 transition-colors hover:bg-[var(--soft-100)]">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--navy-800)]/5 text-[var(--navy-700)]">
                  <Factory className="h-4 w-4" aria-hidden="true" />
                </span>
                <p className="text-[0.92rem] font-semibold text-[var(--navy-800)]">{item}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}