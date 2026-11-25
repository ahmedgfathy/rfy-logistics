import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowRight, Globe2, UserRound } from 'lucide-react';
import { AnnouncementBar } from './AnnouncementBar';
import { Logo } from './Logo';
import { ButtonLink } from '../ui/Button';
import { useServices } from '../../lib/queries';
import { cn } from '../../lib/utils';

interface NavItem {
  to: string;
  key: string;
  end?: boolean;
  hasMenu?: boolean;
}

const navItems: NavItem[] = [
  { to: '/', key: 'nav.home', end: true },
  { to: '/about', key: 'nav.about' },
  { to: '/services', key: 'nav.services', hasMenu: true },
  { to: '/tracking', key: 'nav.tracking' },
  { to: '/contact', key: 'nav.contact' },
];

const compactItems: NavItem[] = [
  ...navItems,
  { to: '/careers', key: 'nav.careers' },
  { to: '/faq', key: 'nav.faq' },
];

export function Header() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const { data: services } = useServices();
  const isHome = location.pathname === '/';
  const overHero = isHome && !scrolled;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const nextLanguage = i18n.language === 'ar' ? 'en' : 'ar';

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'relative inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-2 text-[0.82rem] font-bold transition-colors after:absolute after:inset-x-2 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-brand-500 after:opacity-0 after:transition-opacity xl:text-[0.86rem]',
      isActive
        ? 'text-brand-400 after:opacity-100'
        : overHero
          ? 'text-white/90 hover:text-white hover:after:opacity-100'
          : 'text-navy-700 hover:text-brand-600 hover:after:opacity-100',
    );

  return (
    <div className={cn(isHome ? 'fixed inset-x-0 top-0' : 'sticky top-0', 'z-50')}>
      {!(isHome && scrolled) ? <AnnouncementBar overlay={overHero} /> : null}
      <header
        className={cn(
          'border-b transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300',
          overHero
            ? 'border-white/10 bg-transparent'
            : 'border-steel-200 bg-white/95 shadow-[0_8px_24px_-18px_rgba(11,31,51,0.4)] backdrop-blur',
        )}
      >
        <div className="container-page flex h-[72px] flex-nowrap items-center gap-3 sm:h-[80px] sm:gap-5">
          <Logo tone={overHero ? 'dark' : 'light'} className="shrink-0" />

          <nav className="hidden min-w-0 items-center gap-3 lg:flex xl:ms-auto xl:gap-6" aria-label={t('nav.menu')}>
            {navItems.map((item) => {
              if (item.hasMenu) {
                return (
                  <div key={item.to} className="group relative">
                    <NavLink to={item.to} className={linkClass} aria-haspopup="true" end={item.end}>
                      {t(item.key)}
                      <ArrowDown
                        className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-180"
                        aria-hidden="true"
                      />
                    </NavLink>
                    <div className="invisible absolute start-0 top-full z-50 w-[23rem] overflow-hidden rounded-xl border border-steel-200 bg-white opacity-0 shadow-lift transition-all duration-200 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                      <div className="h-1 bg-brand-500" aria-hidden="true" />
                      <div className="grid gap-0.5 p-2">
                        {(services ?? []).slice(0, 7).map((service) => (
                          <Link
                            key={service.slug}
                            to={`/services/${service.slug}`}
                            className="group/item flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-brand-50"
                          >
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[0.84rem] font-bold text-navy-800 transition-colors group-hover/item:text-brand-700">
                                {i18n.language === 'ar' ? service.titleAr : service.titleEn}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-steel-500">
                                {i18n.language === 'ar' ? service.excerptAr : service.excerptEn}
                              </span>
                            </span>
                            <ArrowRight
                              className="flip-x mt-1 h-3.5 w-3.5 shrink-0 text-steel-300 transition-colors group-hover/item:text-brand-600"
                              aria-hidden="true"
                            />
                          </Link>
                        ))}
                        {services?.length ? null : (
                          <span className="px-3 py-2 text-xs text-steel-500">{t('states.loading')}</span>
                        )}
                      </div>
                      <Link
                        to="/services"
                        className="flex items-center justify-between border-t border-steel-100 bg-steel-50 px-4 py-3 text-[0.82rem] font-bold text-brand-700 transition-colors hover:bg-brand-50"
                      >
                        {t('actions.viewAll')}
                        <ArrowRight className="flip-x h-4 w-4" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                );
              }
              return (
                <NavLink key={item.to} to={item.to} className={linkClass} end={item.end}>
                  {t(item.key)}
                </NavLink>
              );
            })}
          </nav>

          <nav
            className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto lg:hidden"
            aria-label={t('nav.menu')}
          >
            {compactItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'shrink-0 whitespace-nowrap rounded-lg px-2 py-2 text-[0.76rem] font-semibold transition-colors',
                    isActive
                      ? overHero
                        ? 'bg-white/15 text-white'
                        : 'bg-brand-500 text-white shadow-sm'
                      : overHero
                        ? 'text-white/90 hover:bg-white/10 hover:text-white'
                        : 'text-navy-700 hover:bg-brand-50 hover:text-brand-700',
                  )
                }
              >
                {t(item.key)}
              </NavLink>
            ))}
          </nav>
          <div className="ms-auto flex shrink-0 items-center gap-2 lg:ms-0">
            <Link
              to="/admin/login"
              aria-label={t('nav.employeeLogin')}
              title={t('nav.employeeLogin')}
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors sm:h-10 sm:w-10',
                overHero
                  ? 'border-white/30 bg-white/10 text-white hover:bg-white/20'
                  : 'border-[var(--line)] bg-[var(--surface)] text-[var(--navy-800)] hover:border-[var(--brand-500)] hover:text-[var(--brand-500)]',
              )}
            >
              <UserRound className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{t('nav.employeeLogin')}</span>
            </Link>

            <button
              type="button"
              onClick={() => void i18n.changeLanguage(nextLanguage)}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-[0.72rem] font-extrabold transition-all duration-300 sm:h-10 sm:px-3 sm:text-[0.74rem]',
                overHero
                  ? 'border-white/30 bg-white/10 text-white hover:bg-white/20'
                  : 'border-[var(--line)] bg-[var(--surface)] text-[var(--navy-800)] hover:border-[var(--brand-500)] hover:text-[var(--brand-500)]',
              )}
              aria-label={nextLanguage === 'ar' ? 'التبديل إلى العربية' : 'Switch to English'}
              title={nextLanguage === 'ar' ? 'العربية' : 'English'}
            >
              <Globe2 className="h-4 w-4 text-brand-500" aria-hidden="true" />
              <span>{nextLanguage === 'ar' ? 'AR' : 'EN'}</span>
            </button>

            <ButtonLink
              to="/quote"
              className="hidden shrink-0 sm:inline-flex"
              size="sm"
              iconRight={<ArrowRight className="flip-x h-4 w-4" aria-hidden="true" />}
            >
              {t('actions.quote')}
            </ButtonLink>
          </div>
        </div>
      </header>
    </div>
  );
}
