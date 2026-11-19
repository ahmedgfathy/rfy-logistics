import { useTranslation } from 'react-i18next';
import { BadgeCheck, Info, Target, Eye, Compass, Users } from 'lucide-react';
import { Container } from '../components/ui/Container';
import { PageHeader } from '../components/layout/PageHeader';
import { SectionHeading } from '../components/ui/SectionHeading';
import { Reveal } from '../components/ui/Reveal';
import { CtaBanner } from '../components/sections/CtaBanner';
import { useSeo, breadcrumbJsonLd, organizationJsonLd } from '../lib/seo';
import { SITE } from '../lib/site';

interface ValueItem {
  title: string;
  body: string;
}

interface CapabilityItem {
  title: string;
  body: string;
}

export default function About() {
  const { t } = useTranslation();
  const values = t('about.values.items', { returnObjects: true }) as ValueItem[];
  const capabilities = t('about.capabilities.items', { returnObjects: true }) as CapabilityItem[];

  useSeo({
    title: `${t('about.title')} | ${SITE.brand}`,
    description: t('about.lede'),
    path: '/about',
    jsonLd: [organizationJsonLd, breadcrumbJsonLd([{ name: t('nav.about'), path: '/about' }])],
  });

  return (
    <>
      <PageHeader
        eyebrow={t('about.eyebrow')}
        title={t('about.title')}
        description={t('about.lede')}
        crumbs={[{ label: t('nav.about') }]}
      />

      <section className="py-16 sm:py-20">
        <Container className="grid gap-12 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-6">
            <SectionHeading eyebrow={t('about.story.title')} title={t('about.story.title')} className="max-w-none" />
            <div className="prose-copy mt-5">
              <p>{t('about.story.p1')}</p>
              <p>{t('about.story.p2')}</p>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {SITE.ports.slice(0, 3).map((port) => (
                <div key={port} className="rounded-xl border border-steel-200 bg-steel-50 px-4 py-3">
                  <p className="text-[0.7rem] font-bold uppercase tracking-wide text-steel-400">Gateway</p>
                  <p className="mt-1 text-sm font-semibold text-navy-800">{port}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="overflow-hidden rounded-3xl border border-steel-200 shadow-lift">
              <img
                src="/images/operations.jpg"
                alt="Logistics coordinator reviewing shipment documents beside palletised cargo"
                className="h-full w-full object-cover"
                loading="lazy"
                width={1184}
                height={880}
              />
            </div>
          </div>
        </Container>
      </section>

      <section className="bg-mist py-16 sm:py-20">
        <Container className="grid gap-4 md:grid-cols-3">
          {[
            { icon: Target, title: t('about.mission.title'), body: t('about.mission.body') },
            { icon: Eye, title: t('about.vision.title'), body: t('about.vision.body') },
            { icon: Compass, title: t('home.process.eyebrow'), body: t('home.process.description') },
          ].map((card, index) => (
            <Reveal key={card.title} delay={index * 0.05}>
              <div className="h-full rounded-2xl border border-steel-200 bg-white p-6 shadow-soft">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <card.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className="mt-4 text-[1.05rem] font-bold text-navy-800">{card.title}</h2>
                <p className="mt-2 text-[0.88rem] leading-relaxed text-steel-600">{card.body}</p>
              </div>
            </Reveal>
          ))}
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <SectionHeading eyebrow={t('about.values.title')} title={t('about.values.title')} align="center" />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((value, index) => (
              <Reveal key={value.title} delay={index * 0.04}>
                <div className="h-full rounded-2xl border border-steel-200 bg-white p-6 shadow-soft">
                  <span className="text-[0.72rem] font-extrabold tracking-[0.16em] text-amber-600">{String(index + 1).padStart(2, '0')}</span>
                  <h3 className="mt-3 text-[0.98rem] font-bold text-navy-800">{value.title}</h3>
                  <p className="mt-2 text-[0.85rem] leading-relaxed text-steel-500">{value.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-y border-steel-200 bg-steel-50 py-16 sm:py-20">
        <Container className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionHeading
              eyebrow={t('about.capabilities.title')}
              title={t('about.capabilities.title')}
              description={t('about.capabilities.intro')}
            />
            <div className="mt-8 space-y-4">
              <div className="rounded-2xl border border-steel-200 bg-white p-5 shadow-soft">
                <p className="flex items-center gap-2 text-sm font-bold text-navy-800">
                  <Users className="h-4 w-4 text-brand-600" aria-hidden="true" />
                  {t('about.leadership.title')}
                </p>
                <p className="mt-2 text-[0.86rem] leading-relaxed text-steel-600">{t('about.leadership.body')}</p>
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[0.68rem] font-semibold text-amber-700">
                  <Info className="h-3 w-3" aria-hidden="true" />
                  {t('about.leadership.note')}
                </p>
              </div>
              <div className="rounded-2xl border border-steel-200 bg-white p-5 shadow-soft">
                <p className="flex items-center gap-2 text-sm font-bold text-navy-800">
                  <BadgeCheck className="h-4 w-4 text-brand-600" aria-hidden="true" />
                  {t('about.memberships.title')}
                </p>
                <p className="mt-2 text-[0.86rem] leading-relaxed text-steel-600">{t('about.memberships.body')}</p>
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[0.68rem] font-semibold text-amber-700">
                  <Info className="h-3 w-3" aria-hidden="true" />
                  {t('about.memberships.note')}
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="grid gap-3 sm:grid-cols-2">
              {capabilities.map((item) => (
                <div key={item.title} className="rounded-2xl border border-steel-200 bg-white p-6 shadow-soft">
                  <p className="text-sm font-bold text-navy-800">{item.title}</p>
                  <p className="mt-1.5 text-[0.85rem] leading-relaxed text-steel-600">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <div className="pt-20 sm:pt-24">
        <CtaBanner />
      </div>
    </>
  );
}
