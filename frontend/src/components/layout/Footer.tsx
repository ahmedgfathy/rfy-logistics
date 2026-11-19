import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Linkedin, Mail, MapPin, Phone, Clock } from 'lucide-react';
import { Logo } from './Logo';
import { Container } from '../ui/Container';
import { useServices } from '../../lib/queries';
import { SITE } from '../../lib/site';

export function Footer() {
  const { t, i18n } = useTranslation();
  const { data: services } = useServices();
  const isArabic = i18n.language === 'ar';
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--line)] bg-[#0b0b0b] text-white">
      <Container className="grid gap-8 py-12 sm:py-14 md:grid-cols-2 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Logo tone="dark" className="mb-5" />
          <p className="max-w-sm text-sm leading-[1.85] text-white/60">{t('footer.blurb')}</p>
          <div className="mt-5 flex items-center gap-3">
            <a
              href={SITE.social.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/70 transition-colors hover:border-brand-500 hover:text-brand-400"
              aria-label="LinkedIn"
            >
              <Linkedin className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="lg:col-span-3">
          <h2 className="mb-4 text-[0.7rem] font-black uppercase tracking-[0.16em] text-white/45">{t('footer.servicesTitle')}</h2>
          <ul className="space-y-2 text-sm">
            {(services ?? []).slice(0, 7).map((service) => (
              <li key={service.slug}>
                <Link to={`/services/${service.slug}`} className="text-white/70 transition-colors hover:text-brand-400">
                  {isArabic ? service.titleAr : service.titleEn}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/services" className="font-bold text-brand-400 transition-colors hover:text-brand-500">
                {t('actions.viewAll')}
              </Link>
            </li>
          </ul>
        </div>

        <div className="lg:col-span-2">
          <h2 className="mb-4 text-[0.7rem] font-black uppercase tracking-[0.16em] text-white/45">{t('footer.companyTitle')}</h2>
          <ul className="space-y-2 text-sm">
            {[
              { to: '/about', label: t('nav.about') },
              { to: '/quote', label: t('nav.quote') },
              { to: '/tracking', label: t('nav.tracking') },
              { to: '/careers', label: t('nav.careers') },
              { to: '/faq', label: t('nav.faq') },
            ].map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-white/70 transition-colors hover:text-brand-400">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-3">
          <h2 className="mb-4 text-[0.7rem] font-black uppercase tracking-[0.16em] text-white/45">{t('footer.contactTitle')}</h2>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-2.5">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
              <a href={`tel:${SITE.phoneHref}`} dir="ltr" className="text-white/70 transition-colors hover:text-brand-400">
                {SITE.phone}
              </a>
            </li>
            <li className="flex items-start gap-2.5">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
              <a href={`mailto:${SITE.email}`} className="break-all text-white/70 transition-colors hover:text-brand-400">
                {SITE.email}
              </a>
            </li>
            <li className="flex items-start gap-2.5 text-white/70">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
              <span>{isArabic ? SITE.addressAr : SITE.addressEn}</span>
            </li>
            <li className="flex items-start gap-2.5 text-white/70">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
              <span>{isArabic ? SITE.hoursAr : SITE.hoursEn}</span>
            </li>
          </ul>
        </div>
      </Container>

      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-2 py-5 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {t('brand.name')}. {t('footer.rights')}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link to="/privacy" className="inline-flex min-h-[38px] items-center transition-colors hover:text-brand-400">
              {t('legal.privacy.title')}
            </Link>
            <Link to="/terms" className="inline-flex min-h-[38px] items-center transition-colors hover:text-brand-400">
              {t('legal.terms.title')}
            </Link>
            <Link to="/admin/login" className="inline-flex min-h-[38px] items-center transition-colors hover:text-brand-400">
              {t('nav.admin')}
            </Link>
          </div>
        </Container>
        <Container className="pb-5">
          <p className="text-[0.72rem] leading-relaxed text-white/35">{t('footer.placeholderNote')}</p>
        </Container>
      </div>
    </footer>
  );
}
