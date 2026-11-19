import { useTranslation } from 'react-i18next';
import { Container } from '../ui/Container';
import { SectionHeading } from '../ui/SectionHeading';
import { Reveal } from '../ui/Reveal';

interface Step {
  title: string;
  body: string;
}

export function Process() {
  const { t } = useTranslation();
  const steps = t('home.process.steps', { returnObjects: true }) as Step[];

  return (
    <section className="bg-[var(--soft)] py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow={t('home.process.eyebrow')}
          title={t('home.process.title')}
          description={t('home.process.description')}
          align="center"
        />

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <Reveal key={step.title} delay={index * 0.06}>
              <div className="relative h-full rounded-2xl border border-[var(--line)] bg-white p-6 shadow-soft">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-600)] text-[0.8rem] font-extrabold text-white">
                    {index + 1}
                  </span>
                  <span className="h-px flex-1 bg-gradient-to-r from-[var(--steel-200)] to-transparent" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-[0.98rem] font-bold text-[var(--navy-800)]">{step.title}</h3>
                <p className="mt-2 text-[0.85rem] leading-relaxed text-[var(--steel-500)]">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}