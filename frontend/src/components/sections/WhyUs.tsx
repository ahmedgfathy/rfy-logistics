import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
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
    <section className="relative overflow-hidden border-y border-[var(--line)] bg-[var(--navy-950)] py-20 sm:py-24" id="why">
      <div className="absolute inset-0 bg-grid opacity-30" aria-hidden="true" />
      <div className="absolute -start-40 top-1/4 h-96 w-96 rounded-full bg-brand-500/10 blur-3xl" aria-hidden="true" />
      <Container className="relative">
        <SectionHeading
          eyebrow={t('home.why.eyebrow')}
          title={t('home.why.title')}
          description={t('home.why.description')}
        />

        <div className="mt-14 grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <div className="relative">
              <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-xl bg-brand-500/20" aria-hidden="true" />
              <img
                src="/images/operations.jpg"
                alt={t('hero.imageAlt')}
                className="relative aspect-[4/3] w-full rounded-xl border border-[var(--line)] object-cover shadow-lift"
                loading="lazy"
              />
              <div className="absolute bottom-5 end-5 rounded-lg bg-brand-500 px-5 py-4 text-white shadow-lift">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-white/75">{t('home.why.eyebrow')}</p>
                <p className="mt-1 text-sm font-extrabold">{t('brand.tagline')}</p>
              </div>
            </div>
          </Reveal>

          <div className="grid gap-3">
            {items.map((item, index) => (
              <Reveal key={item.title} delay={index * 0.05}>
                <div className="group flex gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-soft transition-colors hover:border-brand-500">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500 transition-colors group-hover:bg-brand-500 group-hover:text-white">
                    <Check className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-[0.98rem] font-black text-[var(--navy-800)]">{item.title}</h3>
                    <p className="mt-1.5 text-[0.85rem] leading-relaxed text-[var(--steel-500)]">{item.body}</p>
                  </div>
                  <span className="ms-auto hidden text-[0.72rem] font-black text-[var(--line-400)] sm:block">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
