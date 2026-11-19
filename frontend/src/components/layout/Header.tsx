import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Languages, Menu, X, PackageSearch, ArrowRight } from 'lucide-react';
import { AnnouncementBar } from './AnnouncementBar';
import { Logo } from './Logo';
import { ButtonLink } from '../ui/Button';
import { useServices } from '../../lib/queries';
import { cn } from '../../lib/utils';

const navItems = [
  { to: '/', key: 'nav.home' },
  { to: '/about', key: 'nav.about' },
  { to: '/services', key: 'nav.services', hasMenu: true },
  { to: '/tracking', key: 'nav.tracking' },
  { to: '/contact', key: 'nav.contact' },
];

export function Header() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { data: services } = useServices();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const nextLanguage = i18n.language === 'ar' ? 'en' : 'ar';

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'relative inline-flex items-center gap-1 rounded-md px-1 py-2 text-[0.86rem] font-semibold transition-colors',
      isActive ? 'text-brand-700' : 'text-navy-700 hover:text-brand-600',
    );

  return (
    <div className="sticky top-0 z-50">
      <AnnouncementBar />
      <header
        className={cn(
          'border-b bg-white/95 backdrop-blur transition-shadow duration-300',
          scrolled ? 'border-steel-200 shadow-[0_8px_24px_-18px_rgba(11,31,51,0.4)]' : 'border-transparent',
        )}
      >
        <div className="container-page flex h-[64px] items-center justify-between gap-3 sm:h-[74px] sm:gap-6">
          <Logo />

          <nav className="hidden items-center gap-6 lg:flex" aria-label={t('nav.menu')}>
            {navItems.map((item) =>
              item.hasMenu ? (
                <div key={item.to} className="group relative">
                  <NavLink to={item.to} className={linkClass} aria-haspopup="true">
                    {t(item.key)}
                    <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-180" aria-hidden="true" />
                  </NavLink>
                  <div className="invisible absolute start-0 top-full z-50 w-[22rem] translate-y-1 rounded-2xl border border-steel-200 bg-white p-2 opacity-0 shadow-lift transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                    <div className="grid gap-0.5">
                      {(services ?? []).slice(0, 7).map((service) => (
                        <Link
                          key={service.slug}
                          to={`/services/${service.slug}`}
                          className="rounded-xl px-3 py-2.5 transition-colors hover:bg-steel-50"
                        >
                          <span className="block text-[0.84rem] font-semibold text-navy-800">
                            {i18n.language === 'ar' ? service.titleAr : service.titleEn}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-steel-500">
                            {i18n.language === 'ar' ? service.excerptAr : service.excerptEn}
                          </span>
                        </Link>
                      ))}
                      {!services?.length ? (
                        <span className="px-3 py-2 text-xs text-steel-500">{t('states.loading')}</span>
                      ) : null}
                    </div>
                    <Link
                      to="/services"
                      className="mt-1 flex items-center justify-between rounded-xl bg-steel-50 px-3 py-2.5 text-[0.82rem] font-bold text-brand-700 transition-colors hover:bg-brand-50"
                    >
                      {t('actions.viewAll')}
                      <ArrowRight className="flip-x h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              ) : (
                <NavLink key={item.to} to={item.to} className={linkClass}>
                  {t(item.key)}
                </NavLink>
              ),
            )}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void i18n.changeLanguage(nextLanguage)}
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-steel-200 px-2.5 text-[0.76rem] font-bold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-700 sm:px-3"
              aria-label={nextLanguage === 'ar' ? 'التبديل إلى العربية' : 'Switch to English'}
            >
              <Languages className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{nextLanguage === 'ar' ? 'العربية' : 'EN'}</span>
            </button>

            <ButtonLink to="/quote" className="hidden sm:inline-flex" size="sm" iconRight={<ArrowRight className="flip-x h-4 w-4" aria-hidden="true" />}>
              {t('actions.quote')}
            </ButtonLink>

            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-steel-200 text-navy-800 lg:hidden"
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              aria-label={mobileOpen ? t('nav.close') : t('nav.menu')}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {mobileOpen ? (
        <div id="mobile-menu" className="fixed inset-x-0 bottom-0 top-[calc(64px+36px)] z-40 overflow-y-auto bg-white sm:top-[calc(74px+41px)] lg:hidden">
          <div className="container-page py-5 pb-10">
            <nav className="flex flex-col divide-y divide-steel-100" aria-label={t('nav.menu')}>
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn('flex min-h-[48px] items-center py-3 text-base font-semibold', isActive ? 'text-brand-700' : 'text-navy-800')
                  }
                >
                  {t(item.key)}
                </NavLink>
              ))}
              <NavLink to="/careers" className="flex min-h-[48px] items-center py-3 text-base font-semibold text-navy-800">
                {t('nav.careers')}
              </NavLink>
              <NavLink to="/faq" className="flex min-h-[48px] items-center py-3 text-base font-semibold text-navy-800">
                {t('nav.faq')}
              </NavLink>
            </nav>

            {services?.length ? (
              <div className="mt-6 rounded-2xl bg-steel-50 p-4">
                <p className="eyebrow mb-2">{t('home.services.eyebrow')}</p>
                <div className="grid gap-1">
                  {services.slice(0, 5).map((service) => (
                    <Link key={service.slug} to={`/services/${service.slug}`} className="flex min-h-[40px] items-center py-1.5 text-sm font-medium text-steel-700">
                      {i18n.language === 'ar' ? service.titleAr : service.titleEn}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-6 grid gap-3">
              <ButtonLink to="/quote" size="lg" iconRight={<ArrowRight className="flip-x h-4 w-4" aria-hidden="true" />}>
                {t('actions.quote')}
              </ButtonLink>
              <ButtonLink to="/tracking" variant="onlight" size="lg" icon={<PackageSearch className="h-4 w-4" aria-hidden="true" />}>
                {t('nav.tracking')}
              </ButtonLink>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
