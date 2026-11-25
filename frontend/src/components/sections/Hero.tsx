import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, PackageSearch, Ship } from 'lucide-react';
import { ButtonLink } from '../ui/Button';
import { Container } from '../ui/Container';
import { HeroVideo } from './HeroVideo';

export function Hero() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tracking, setTracking] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const value = tracking.trim();
    navigate(value ? `/tracking?number=${encodeURIComponent(value)}` : '/tracking');
  };

  const points = t('hero.points', { returnObjects: true }) as string[];

  return (
    <section className="relative isolate overflow-hidden border-b-4 border-brand-500 bg-[var(--navy-950)] text-white">
      <HeroVideo />

      <Container className="relative flex min-h-[700px] flex-col justify-center pb-20 pt-32 sm:min-h-[740px] sm:pb-24 sm:pt-36 lg:min-h-[780px] lg:pb-24 lg:pt-40">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-12">
          <div className="min-w-0 lg:col-span-7">
            <p className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-[0.68rem] font-bold uppercase leading-snug tracking-[0.12em] text-white backdrop-blur-sm sm:text-[0.72rem] sm:tracking-[0.16em]">
              <Ship className="h-4 w-4 text-[var(--brand-400)]" aria-hidden="true" />
              {t('hero.eyebrow')}
            </p>

            <h1 className="mt-6 break-words text-[2.35rem] font-black leading-[1.1] tracking-tight text-white min-[400px]:text-[2.75rem] sm:text-[3.6rem] lg:text-[4.25rem]">
              {t('hero.titleLead')}
              <br />
              <span className="text-[var(--brand-400)]">{t('hero.titleAccent')}</span>
            </h1>

            <p className="mt-6 max-w-2xl text-[0.98rem] leading-[1.85] text-white/80 sm:text-[1.08rem]">
              {t('hero.description')}
            </p>

            <ul className="mt-7 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {points.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-[0.86rem] leading-relaxed text-white/85">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
                    <Check className="h-3 w-3" aria-hidden="true" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <ButtonLink
                to="/quote"
                size="lg"
                className="w-full sm:w-auto"
                iconRight={<ArrowRight className="flip-x h-4 w-4" aria-hidden="true" />}
              >
                {t('actions.quote')}
              </ButtonLink>
              <ButtonLink
                to="/services"
                size="lg"
                variant="onlight"
                className="w-full border-white/60 bg-transparent text-white hover:bg-white hover:text-[var(--navy-900)] sm:w-auto"
              >
                {t('actions.explore')}
              </ButtonLink>
            </div>
          </div>

          <div className="min-w-0 lg:col-span-5">
            <div className="on-white rounded-2xl border border-white/15 bg-white p-5 text-[var(--navy-800)] shadow-lift sm:p-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <PackageSearch className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-bold">{t('hero.panelTitle')}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-steel-500">{t('hero.panelSub')}</p>
                </div>
              </div>

              <form onSubmit={onSubmit} className="mt-5">
                <label htmlFor="hero-tracking" className="sr-only">
                  {t('trackingPage.label')}
                </label>
                <div className="flex flex-col gap-2 rounded-lg border border-steel-200 bg-white px-3 py-2 focus-within:border-brand-500 sm:flex-row sm:items-center">
                  <input
                    id="hero-tracking"
                    value={tracking}
                    onChange={(event) => setTracking(event.target.value)}
                    placeholder={t('trackingPage.placeholder')}
                    className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base text-[var(--navy-800)] placeholder:text-steel-400 focus:outline-none sm:py-2 sm:text-sm"
                    autoComplete="off"
                  />
                  <button type="submit" className="btn btn-primary px-5 text-[0.85rem]">
                    {t('actions.track')}
                  </button>
                </div>
              </form>

              <div className="mt-5 grid grid-cols-3 gap-3 border-t border-steel-100 pt-5 text-center">
                {[
                  { value: 'Ocean', label: 'FCL · LCL' },
                  { value: 'Clearance', label: 'ACI / Nafeza' },
                  { value: 'Egypt', label: '8 gateways' },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-[0.72rem] font-extrabold uppercase tracking-wide text-brand-600">{item.value}</p>
                    <p className="mt-1 text-[0.68rem] text-steel-500">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
