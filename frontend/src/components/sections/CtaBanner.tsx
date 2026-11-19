import { useTranslation } from 'react-i18next';
import { ArrowRight, Mail, Phone } from 'lucide-react';
import { Container } from '../ui/Container';
import { ButtonLink } from '../ui/Button';
import { SITE } from '../../lib/site';

export function CtaBanner() {
  const { t } = useTranslation();

  return (
    <section className="relative isolate overflow-hidden border-t-4 border-brand-500 bg-[var(--navy-950)] py-16 sm:py-20">
      <div className="absolute inset-0 bg-grid opacity-30" aria-hidden="true" />
      <div className="absolute -start-32 -top-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" aria-hidden="true" />
      <div className="absolute -bottom-40 end-0 h-96 w-96 rounded-full bg-brand-500/10 blur-3xl" aria-hidden="true" />

      <Container className="relative grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-16">
        <div className="lg:col-span-7">
          <p className="text-[0.72rem] font-black uppercase tracking-[0.18em] text-brand-400">{t('home.cta.eyebrow')}</p>
          <h2 className="mt-3 text-[2rem] font-black leading-tight text-white sm:text-[2.8rem]">
            {t('home.cta.title')}
          </h2>
          <p className="mt-4 max-w-2xl text-[0.98rem] leading-[1.85] text-white/70">{t('home.cta.description')}</p>
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-xl border border-white/15 bg-white/[0.04] p-6 shadow-lift backdrop-blur-sm">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.16em] text-white/60">{t('footer.contactTitle')}</p>
            <a
              href={`tel:${SITE.phoneHref}`}
              dir="ltr"
              className="mt-3 flex items-center gap-3 text-[1.55rem] font-black text-white transition-colors hover:text-brand-400"
            >
              <Phone className="h-5 w-5 shrink-0 text-brand-500" aria-hidden="true" />
              {SITE.phone}
            </a>
            <a
              href={`mailto:${SITE.email}`}
              className="mt-2 flex items-center gap-3 break-all text-sm text-white/70 transition-colors hover:text-brand-400"
            >
              <Mail className="h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
              {SITE.email}
            </a>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <ButtonLink
                to="/quote"
                className="flex-1"
                iconRight={<ArrowRight className="flip-x h-4 w-4" aria-hidden="true" />}
              >
                {t('home.cta.primary')}
              </ButtonLink>
              <ButtonLink
                href={`tel:${SITE.phoneHref}`}
                variant="onlight"
                className="flex-1 border-white/50 bg-transparent text-white hover:bg-white hover:text-[var(--navy-900)]"
              >
                {t('home.cta.secondary')}
              </ButtonLink>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
