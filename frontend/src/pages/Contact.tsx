import { useTranslation } from 'react-i18next';
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Container } from '../components/ui/Container';
import { ContactForm } from '../components/forms/ContactForm';
import { useSeo, breadcrumbJsonLd, organizationJsonLd } from '../lib/seo';
import { SITE } from '../lib/site';

export default function Contact() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';

  useSeo({
    title: `${t('contactPage.title')} | ${SITE.brand}`,
    description: t('contactPage.description'),
    path: '/contact',
    jsonLd: [organizationJsonLd, breadcrumbJsonLd([{ name: t('nav.contact'), path: '/contact' }])],
  });

  const channels = [
    { icon: Phone, label: t('contactPage.phoneLabel'), value: SITE.phone, href: `tel:${SITE.phoneHref}`, ltr: true },
    { icon: Mail, label: t('contactPage.emailLabel'), value: SITE.email, href: `mailto:${SITE.email}` },
    {
      icon: MessageCircle,
      label: t('contactPage.whatsappLabel'),
      value: SITE.phone,
      href: `https://wa.me/${SITE.whatsapp.replace(/[^\d]/g, '')}`,
      ltr: true,
      external: true,
    },
    { icon: Clock, label: t('contactPage.hoursLabel'), value: isArabic ? SITE.hoursAr : SITE.hoursEn },
  ];

  return (
    <>
      <PageHeader
        eyebrow={t('contactPage.eyebrow')}
        title={t('contactPage.title')}
        description={t('contactPage.description')}
        crumbs={[{ label: t('nav.contact') }]}
      />

      <section className="py-14 sm:py-16">
        <Container className="grid gap-8 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-7">
            <ContactForm />
          </div>

          <aside className="min-w-0 space-y-4 lg:col-span-5">
            <div className="rounded-2xl border border-steel-200 bg-white p-5 shadow-soft sm:p-6">
              <h2 className="text-[1rem] font-bold text-navy-800">{t('contactPage.detailsTitle')}</h2>
              <ul className="mt-4 space-y-4">
                {channels.map((channel) => {
                  const content = (
                    <>
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                        <channel.icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[0.7rem] font-bold uppercase tracking-[0.1em] text-steel-400">
                          {channel.label}
                        </span>
                        <span className="mt-0.5 block truncate text-[0.88rem] font-semibold text-navy-800" dir={channel.ltr ? 'ltr' : undefined}>
                          {channel.value}
                        </span>
                      </span>
                    </>
                  );
                  return (
                    <li key={channel.label}>
                      {channel.href ? (
                        <a
                          href={channel.href}
                          className="flex min-h-[44px] items-center gap-3 rounded-xl p-2 transition-colors hover:bg-steel-50"
                          {...(channel.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                        >
                          {content}
                        </a>
                      ) : (
                        <div className="flex min-h-[44px] items-center gap-3 p-2">{content}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="rounded-2xl border border-steel-200 bg-white p-6 shadow-soft">
              <h2 className="text-[1rem] font-bold text-navy-800">{t('contactPage.officesTitle')}</h2>
              <ul className="mt-4 space-y-3">
                {SITE.offices.map((office) => (
                  <li key={office.en} className="flex items-start gap-2.5 text-[0.86rem] text-steel-600">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                    {isArabic ? office.ar : office.en}
                  </li>
                ))}
              </ul>
              <p className="mt-4 rounded-lg bg-steel-50 px-3 py-2 text-[0.72rem] leading-relaxed text-steel-500">
                {t('contactPage.locationsNote')}
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-steel-200 bg-white">
              <div className="relative flex h-44 items-center justify-center bg-steel-100">
                <div className="absolute inset-0 bg-grid opacity-60" aria-hidden="true" />
                <div className="relative text-center">
                  <MapPin className="mx-auto h-6 w-6 text-brand-600" aria-hidden="true" />
                  <p className="mt-2 text-[0.82rem] font-bold text-navy-800">{t('contactPage.mapTitle')}</p>
                </div>
              </div>
              <p className="px-5 py-4 text-[0.76rem] leading-relaxed text-steel-500">{t('contactPage.mapNote')}</p>
            </div>
          </aside>
        </Container>
      </section>
    </>
  );
}
