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
    <footer className="border-t border-steel-200 bg-white text-[var(--navy)]">
      <Container className="grid gap-6 py-8 sm:gap-8 sm:py-10 md:grid-cols-2 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Logo className="h-12 w-auto mb-4" />
          <p className="max-w-sm text-sm leading-relaxed text-[var(--steel)]">{t('footer.blurb')}</p>
          <div className="mt-4 flex items-center gap-3">
            <a
              href={SITE.social.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-[var(--steel)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
              aria-label="LinkedIn"
            >
              <Linkedin className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="lg:col-span-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--steel)] mb-3">{t('footer.servicesTitle')}</h2>
          <ul className="space-y-1 text-sm">
            {(services ?? []).slice(0, 7).map((service) => (
              <li key={service.slug}>
                <Link to={`/services/${service.slug}`} className="transition-colors hover:text-[var(--brand)]">
                  {isArabic ? service.titleAr : service.titleEn}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/services" className="font-semibold text-[var(--brand)] transition-colors hover:text-[var(--brand-100)]">
                {t('actions.viewAll')}
              </Link>
            </li>
          </ul>
        </div>

        <div className="lg:col-span-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--steel)] mb-3">{t('footer.companyTitle')}</h2>
          <ul className="space-y-1 text-sm">
            <li>
              <Link to="/about" className="transition-colors hover:text-[var(--brand)]">
                {t('nav.about')}
              </Link>
            </li>
            <li>
              <Link to="/quote" className="transition-colors hover:text-[var(--brand)]">
                {t('nav.quote')}
              </Link>
            </li>
            <li>
              <Link to="/tracking" className="transition-colors hover:text-[var(--brand)]">
                {t('nav.tracking')}
              </Link>
            </li>
            <li>
              <Link to="/careers" className="transition-colors hover:text-[var(--brand)]">
                {t('nav.careers')}
              </Link>
            </li>
            <li>
              <Link to="/faq" className="transition-colors hover:text-[var(--brand)]">
                {t('nav.faq')}
              </Link>
            </li>
          </ul>
        </div>

        <div className="lg:col-span-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--steel)] mb-3">{t('footer.contactTitle')}</h2>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-2.5">
              <Phone
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]"
                aria-hidden="true"
              />
              <a
                href={`tel:${SITE.phoneHref}`}
                dir="ltr"
                className="transition-colors hover:text-[var(--brand)]"
              >
                {SITE.phone}
              </a>
            </li>
            <li className="flex items-start gap-2.5">
              <Mail
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]"
                aria-hidden="true"
              />
              <a
                href={`mailto:${SITE.email}`}
                className="transition-colors hover:text-[var(--brand)]"
              >
                {SITE.email}
              </a>
            </li>
            <li className="flex items-start gap-2.5">
              <MapPin
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]"
                aria-hidden="true"
              />
              <span>
                {isArabic ? SITE.addressAr : SITE.addressEn}
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <Clock
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]"
                aria-hidden="true"
              />
              <span>
                {isArabic ? SITE.hoursAr : SITE.hoursEn}
              </span>
            </li>
          </ul>
        </div>
      </Container>

      <div className="border-t border-steel-200 mt-6">
        <Container
          className="flex flex-col gap-2 py-4 text-xs text-[var(--steel)] sm:flex-row sm:items-center sm:justify-between"
        >
          <p>© {year} {t('brand.name')}. {t('footer.rights')}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              to="/privacy"
              className="inline-flex min-h-[38px] items-center transition-colors hover:text-[var(--brand)]"
            >
              {t('legal.privacy.title')}
            </Link>
            <Link
              to="/terms"
              className="inline-flex min-h-[38px] items-center transition-colors hover:text-[var(--brand)]"
            >
              {t('legal.terms.title')}
            </Link>
            <Link
              to="/admin/login"
              className="inline-flex min-h-[38px] items-center transition-colors hover:text-[var(--brand)]"
            >
              {t('nav.admin')}
            </Link>
          </div>
        </Container>
        <Container className="pb-4">
          <p className="text-[0.72rem] leading-relaxed text-[var(--steel-400)]">
            {t('footer.placeholderNote')}
          </p>
        </Container>
      </div>
    </footer>
  );
}