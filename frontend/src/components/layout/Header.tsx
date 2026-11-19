import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Languages, Globe, ArrowDown, ArrowRight } from 'lucide-react';
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

/** Every navigation target, shown in the single-line strip on small screens. */
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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const nextLanguage = i18n.language === 'ar' ? 'en' : 'ar';

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'relative inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-2 text-[0.82rem] font-semibold transition-colors xl:text-[0.86rem]',
      isActive ? 'text-brand-700' : 'text-navy-700 hover:text-brand-600',
    );

  return (
    <div className="sticky top-0 z-50">
      <AnnouncementBar />
      <header
        className={cn(
          'border-b bg-white/95 backdrop-blur transition-shadow duration-300',
          scrolled ? 'border-steel-200 shadow-[0_8px_24px_-18px_rgba(11,31,51,0.4)]' : 'border-steel-100',
        )}
      >
        <div className="container-page flex h-[64px] flex-nowrap items-center justify-between gap-3 sm:h-[72px] sm:gap-6">
          <Logo className="shrink-0" />

          <nav className="hidden min-w-0 items-center gap-3 lg:flex xl:gap-6" aria-label={t('nav.menu')}>
            {navItems.map((item) => {
              const isMenu = item.hasMenu;
              if (isMenu) {
                return (
                  <div key={item.to} className="group relative">
                    <NavLink
                      to={item.to}
                      className={linkClass}
                      aria-haspopup="true"
                      end={item.end}
                    >
                      {t(item.key)}
                      <ArrowDown
                        className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-180"
                        aria-hidden="true"
                      />
                    </NavLink>
                    <div
                      className="invisible absolute start-0 top-full z-50 w-[22rem] rounded-2xl border border-steel-200 bg-white p-2 opacity-0 shadow transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100"
                    >
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
                        {services?.length ? null : (
                          <span className="px-3 py-2 text-xs text-steel-500">
                            {t('states.loading')}
                          </span>
                        )}
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
                );
              }
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={linkClass}
                  end={item.end}
                >
                  {t(item.key)}
                </NavLink>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void i18n.changeLanguage(nextLanguage)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-steel-200 text-navy-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
              aria-label={nextLanguage === 'ar' ? 'التبديل إلى العربية' : 'Switch to English'}
              title={nextLanguage === 'ar' ? 'العربية' : 'English'}
            >
              <Languages className="h-[17px] w-[17px]" aria-hidden="true" />
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

        {/* One-line navigation strip for phones and tablets. */}
        <div className="border-t border-steel-100 lg:hidden">
          <nav
            className="container-page no-scrollbar flex flex-nowrap items-center gap-1 overflow-x-auto py-1"
            aria-label={t('nav.menu')}
          >
            {compactItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'shrink-0 whitespace-nowrap rounded-lg px-2.5 py-2 text-[0.78rem] font-semibold transition-colors min-[400px]:text-[0.8rem]',
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-navy-700 hover:bg-steel-50',
                  )
                }
              >
                {t(item.key)}
              </NavLink>
            ))}
            <Link
              to="/quote"
              className="ms-auto inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-[0.78rem] font-bold text-white sm:hidden"
            >
              {t('actions.quote')}
            </Link>
          </nav>
        </div>
      </header>
    </div>
  );
}