import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, CheckCircle2, ArrowRight } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Container } from '../components/ui/Container';
import { ButtonLink } from '../components/ui/Button';
import { StatePanel, Spinner } from '../components/ui/Spinner';
import { ServiceIcon } from '../components/sections/ServicesGrid';
import { CtaBanner } from '../components/sections/CtaBanner';
import { useService, useServices } from '../lib/queries';
import { useSeo, breadcrumbJsonLd } from '../lib/seo';
import { SITE } from '../lib/site';

interface Step {
  title: string;
  body: string;
}

export default function ServiceDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';
  const { data: service, isLoading, isError } = useService(slug);
  const { data: allServices } = useServices();
  const steps = t('home.process.steps', { returnObjects: true }) as Step[];

  const title = service ? (isArabic ? service.titleAr : service.titleEn) : t('states.loading');
  const description = service ? (isArabic ? service.excerptAr : service.excerptEn) : '';

  useSeo({
    title: `${title} | ${SITE.brand}`,
    description: description || t('servicesPage.description'),
    path: `/services/${slug ?? ''}`,
    jsonLd: service
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'Service',
            name: title,
            description,
            serviceType: service.slug,
            provider: {
              '@type': 'Organization',
              name: SITE.brand,
              url: SITE.url,
            },
            areaServed: 'Egypt',
          },
          breadcrumbJsonLd([
            { name: t('nav.services'), path: '/services' },
            { name: title, path: `/services/${service.slug}` },
          ]),
        ]
      : undefined,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner label={t('states.loading')} />
      </div>
    );
  }

  if (isError || !service) {
    return (
      <Container className="py-24">
        <StatePanel
          title={t('servicesPage.notFound')}
          body={t('states.notFoundBody')}
          action={<ButtonLink to="/services" variant="onlight">{t('actions.viewAll')}</ButtonLink>}
        />
      </Container>
    );
  }

  const body = (isArabic ? service.bodyAr : service.bodyEn) ?? '';
  const features = (isArabic ? service.featuresAr : service.featuresEn) ?? [];
  const related = (allServices ?? []).filter((item) => item.slug !== service.slug).slice(0, 3);

  return (
    <>
      <PageHeader
        eyebrow={t('servicesPage.eyebrow')}
        title={title}
        description={description}
        crumbs={[{ label: t('nav.services'), to: '/services' }, { label: title }]}
      >
        <div className="flex items-center gap-3 rounded-2xl border border-steel-200 bg-white p-4 shadow-soft">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <ServiceIcon name={service.icon} className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-steel-500">{t('quotePage.form.freightMode')}</p>
            <p className="mt-0.5 text-sm font-semibold text-navy-800">{service.titleEn}</p>
          </div>
        </div>
      </PageHeader>

      <section className="py-16 sm:py-20">
        <Container className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className="prose-copy">
              {body.split('\n\n').map((paragraph) => (
                <p key={paragraph.slice(0, 40)}>{paragraph}</p>
              ))}
            </div>

            <h2 className="mt-10 text-[1.15rem] font-bold text-navy-800">{t('servicesPage.included')}</h2>
            <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 rounded-xl border border-steel-200 bg-white px-4 py-3 text-[0.86rem] text-steel-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>

            <div className="mt-10 rounded-2xl border border-steel-200 bg-steel-50/70 p-6">
              <h2 className="text-[1.05rem] font-bold text-navy-800">{t('serviceDetail.pathwayTitle')}</h2>
              <p className="mt-1 text-xs text-steel-500">{t('serviceDetail.pathwayNote')}</p>
              <ol className="mt-5 grid gap-4 sm:grid-cols-2">
                {steps.map((step, index) => (
                  <li key={step.title} className="flex gap-3">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[0.7rem] font-extrabold text-white">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-[0.88rem] font-bold text-navy-800">{step.title}</p>
                      <p className="mt-0.5 text-[0.8rem] leading-relaxed text-steel-500">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <Link to="/services" className="mt-8 inline-flex items-center gap-1.5 text-sm font-bold text-brand-700 hover:text-brand-800">
              <ArrowLeft className="flip-x h-4 w-4 rtl:rotate-180" aria-hidden="true" />
              {t('actions.viewAll')}
            </Link>
          </div>

          <aside className="lg:col-span-5">
            <div className="space-y-4 lg:sticky lg:top-28">
              <div className="rounded-2xl border border-brand-100 bg-brand-50/70 p-6 shadow-soft">
                <h2 className="text-[1.05rem] font-bold text-navy-800">{t('serviceDetail.ctaTitle')}</h2>
                <p className="mt-2 text-[0.86rem] leading-relaxed text-steel-600">{t('serviceDetail.ctaBody')}</p>
                <ButtonLink
                  to={`/quote?service=${service.slug}`}
                  className="mt-5 w-full"
                  iconRight={<ArrowRight className="flip-x h-4 w-4" aria-hidden="true" />}
                >
                  {t('actions.quote')}
                </ButtonLink>
                <ButtonLink href={`tel:${SITE.phoneHref}`} variant="onlight" className="mt-2 w-full">
                  {t('actions.call')}
                </ButtonLink>
              </div>

              {related.length ? (
                <div className="rounded-2xl border border-steel-200 bg-white p-6 shadow-soft">
                  <h2 className="text-[0.95rem] font-bold text-navy-800">{t('serviceDetail.related')}</h2>
                  <ul className="mt-4 space-y-2.5">
                    {related.map((item) => (
                      <li key={item.slug}>
                        <Link
                          to={`/services/${item.slug}`}
                          className="group flex items-center justify-between gap-3 rounded-xl border border-steel-100 px-3.5 py-3 transition-colors hover:border-brand-200 hover:bg-brand-50/40"
                        >
                          <span className="flex items-center gap-2.5 text-[0.86rem] font-semibold text-navy-800">
                            <ServiceIcon name={item.icon} className="h-4 w-4 text-brand-600" />
                            {isArabic ? item.titleAr : item.titleEn}
                          </span>
                          <CheckCircle2 className="h-4 w-4 text-steel-300 group-hover:text-brand-600" aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </aside>
        </Container>
      </section>

      <CtaBanner />
    </>
  );
}
