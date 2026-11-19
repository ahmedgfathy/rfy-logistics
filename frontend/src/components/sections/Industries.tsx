import { useTranslation } from 'react-i18next';
import { Container } from '../ui/Container';
import { SectionHeading } from '../ui/SectionHeading';
import { Reveal } from '../ui/Reveal';

const visuals = [
  '/images/hero-terminal.jpg',
  '/images/operations.jpg',
  '/images/hero-road.jpg',
  '/images/hero-air.jpg',
];

export function Industries() {
  const { t } = useTranslation();
  const items = t('home.industries.items', { returnObjects: true }) as string[];

  return (
    <section className="border-y border-[var(--line)] bg-[var(--surface-2)] py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow={t('home.industries.eyebrow')}
          title={t('home.industries.title')}
          description={t('home.industries.description')}
        />

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <Reveal key={item} delay={index * 0.03}>
              <div className="group relative h-56 overflow-hidden rounded-xl border border-[var(--line)]">
                <img
                  src={visuals[index % visuals.length]}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-40 transition-all duration-500 group-hover:scale-110 group-hover:opacity-55"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--navy-950)] via-[var(--navy-950)]/75 to-transparent" aria-hidden="true" />
                <div className="relative flex h-full flex-col justify-end p-6">
                  <span className="text-[0.7rem] font-black tracking-[0.16em] text-brand-400">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-2 text-[1.02rem] font-black leading-snug text-white">{item}</h3>
                  <span className="mt-4 h-0.5 w-10 bg-brand-500 transition-all duration-300 group-hover:w-full" aria-hidden="true" />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
