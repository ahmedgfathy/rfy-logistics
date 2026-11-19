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
    <section className="bg-[var(--navy-950)] py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow={t('home.process.eyebrow')}
          title={t('home.process.title')}
          description={t('home.process.description')}
        />

        <div className="relative mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="absolute start-[12%] end-[12%] top-6 hidden h-px bg-[var(--line-400)] lg:block" aria-hidden="true" />
          {steps.map((step, index) => (
            <Reveal key={step.title} delay={index * 0.06}>
              <div className="relative h-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-soft transition-colors hover:border-brand-500">
                <span className="relative z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 text-[0.9rem] font-black text-white shadow-md">
                  {index + 1}
                </span>
                <h3 className="mt-5 text-[1rem] font-black text-[var(--navy-800)]">{step.title}</h3>
                <p className="mt-2 text-[0.84rem] leading-[1.8] text-[var(--steel-500)]">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
