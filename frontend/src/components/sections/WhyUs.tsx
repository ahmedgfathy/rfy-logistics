import { useTranslation } from 'react-i18next';
import { SectionHeading } from '../ui/SectionHeading';
import { Reveal } from '../ui/Reveal';
import { Container } from '../ui/Container';

interface Item {
  title: string;
  body: string;
}

export function WhyUs() {
  const { t } = useTranslation();
  const items = t('home.why.items', { returnObjects: true }) as Item[];

  return (
    <section className="relative overflow-hidden bg-[var(--soft)] py-20 sm:py-24" id="why">
      <div className="absolute inset-0 bg-grid opacity-40" aria-hidden="true" />
      <Container className="relative grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <SectionHeading eyebrow={t('home.why.eyebrow')} title={t('home.why.title')} description={t('home.why.description')} />
        </div>
        <div className="lg:col-span-7">
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((item, index) => (
              <Reveal key={item.title} delay={index * 0.05}>
                <div className="h-full rounded-2xl border border-[var(--line)] bg-white p-6 shadow-soft">
                  <span className="text-[0.72rem] font-extrabold tracking-[0.16em] text-[var(--brand-600)]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-3 text-[1rem] font-bold text-[var(--navy-800)]">{item.title}</h3>
                  <p className="mt-2 text-[0.86rem] leading-relaxed text-[var(--steel-500)]">{item.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}