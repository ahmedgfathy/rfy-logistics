import { useState } from 'react';
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

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = tracking.trim();
    navigate(value ? `/tracking?number=${encodeURIComponent(value)}` : '/tracking');
  };

  return (
    <section className="relative isolate overflow-hidden border-b border-[var(--line)] bg-white">
      <HeroVideo />

      <Container className="relative grid gap-6 sm:gap-6 sm:py-12 lg:grid-cols-12 lg:items-center lg:gap-14 lg:py-24">
        <div className="min-w-0 lg:col-span-6 lg:col-start-1">
          <p className="inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--brand-200)] bg-white px-3 py-1.5 text-[0.66rem] font-semibold uppercase leading-snug tracking-[0.12em] text-[var(--brand)] shadow-soft sm:text-[0.68rem] sm:tracking-[0.16em]">
            <Ship className="h-3.5 w-3.5" aria-hidden="true" />
            {t('hero.eyebrow')}
          </p>

          <h1 className="mt-5 break-words text-[1.95rem] font-extrabold leading-[1.1] tracking-[-0.03em] text-[var(--navy)] min-[360px]:text-[2.2rem] min-[400px]:text-[2.35rem] sm:mt-6 sm:text-[3.4rem] sm:leading-[1.03] lg:text-[3.7rem]">
            {t('hero.titleLead')}
            <br />
            <span className="text-[var(--brand)]">{t('hero.titleAccent')}</span>
          </h1>

          <p className="mt-5 max-w-xl text-[0.97rem] leading-relaxed text-[var(--steel-600)] sm:mt-6 sm:text-[1.06rem]">
            {t('hero.description')}
          </p>

          <ul className="mt-6 space-y-2.5 sm:mt-7">
            {['feature1', 'feature2', 'feature3'].map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-[0.9rem] text-[var(--steel-700)]">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-50)] text-[var(--brand-600)]">
                  <Check className="h-3 w-3" aria-hidden="true" />
                </span>
                {point}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col gap-3 sm:mt-9 sm:flex-row sm:flex-wrap sm:items-center">
            <ButtonLink to="/quote" size="lg" className="w-full sm:w-auto" iconRight={<ArrowRight className="flip-x h-4 w-4" aria-hidden="true" />}>
              {t('actions.quote')}
            </ButtonLink>
            <ButtonLink to="/services" size="lg" variant="onlight" className="w-full sm:w-auto">
              {t('actions.explore')}
            </ButtonLink>
          </div>
        </div>

        <div className="min-w-0 lg:col-span-6 lg:col-start-7">
          <div className="rounded-2xl border border-[var(--line)] bg-white/95 p-4 shadow-lift backdrop-blur sm:p-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-50)] text-[var(--brand-600)]">
                <PackageSearch className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-bold text-[var(--navy)]">{t('hero.panelTitle')}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--steel-500)]">{t('hero.panelSub')}</p>
              </div>
            </div>

            <form onSubmit={onSubmit} className="mt-4">
              <label htmlFor="hero-tracking" className="sr-only">
                {t('trackingPage.label')}
              </label>
              <div className="flex flex-col gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 focus-within:border-[var(--brand)] sm:flex-row sm:items-center">
                <input
                  id="hero-tracking"
                  value={tracking}
                  onChange={(event) => setTracking(event.target.value)}
                  placeholder={t('trackingPage.placeholder')}
                  className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base text-[var(--navy)] placeholder:text-[var(--steel-400)] focus:outline-none sm:py-2 sm:text-sm"
                  autoComplete="off"
                />
                <button type="submit" className="btn bg-[var(--brand)] px-4 py-2.5 text-[0.85rem] font-bold text-white hover:bg-[var(--ocean)] sm:text-[0.8rem]">
                  {t('actions.track')}
                </button>
              </div>
            </form>

            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--line)] pt-4 text-center">
              {[
                { label: 'FCL · LCL', value: 'Ocean' },
                { label: 'ACI / Nafeza', value: 'Clearance' },
                { label: '8 gateways', value: 'Egypt' },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-[0.7rem] font-bold uppercase tracking-wide text-[var(--brand)]">{item.value}</p>
                  <p className="mt-1 text-[0.68rem] text-[var(--steel-500)]">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}