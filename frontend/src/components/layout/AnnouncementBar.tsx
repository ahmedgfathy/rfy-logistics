import { Link } from 'react-router-dom';
import { Facebook, Instagram, Linkedin, Mail, Phone, Youtube } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SITE } from '../../lib/site';

const socialLinks = [
  { label: 'Facebook', href: SITE.social.facebook, Icon: Facebook },
  { label: 'Instagram', href: SITE.social.instagram, Icon: Instagram },
  { label: 'YouTube', href: SITE.social.youtube, Icon: Youtube },
  { label: 'LinkedIn', href: SITE.social.linkedin, Icon: Linkedin },
];

export function AnnouncementBar({ overlay = false }: { overlay?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={overlay ? 'border-b border-white/10 bg-black/25 text-white backdrop-blur-sm' : 'border-b border-white/10 bg-[#111] text-white'}>
      <div className="container-page flex min-h-9 items-center justify-between gap-4 py-1.5">
        <p className="min-w-0 truncate text-[0.68rem] font-medium text-white/85 sm:text-[0.74rem]">
          <span className="me-2 inline-block h-1.5 w-1.5 rounded-full bg-brand-400 align-middle" aria-hidden="true" />
          {t('announce.text')}
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <a
            href={`tel:${SITE.phoneHref}`}
            dir="ltr"
            className="hidden items-center gap-1.5 text-[0.7rem] text-white/75 transition-colors hover:text-white xl:inline-flex"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            {SITE.phone}
          </a>
          <a
            href={`mailto:${SITE.email}`}
            className="hidden items-center gap-1.5 text-[0.7rem] text-white/75 transition-colors hover:text-white 2xl:inline-flex"
          >
            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
            {SITE.email}
          </a>
          <Link
            to="/quote"
            className="hidden text-[0.7rem] font-bold text-brand-300 transition-colors hover:text-white sm:inline-flex xl:hidden"
          >
            {t('announce.cta')}
          </Link>
          {socialLinks.map(({ label, href, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </a>
          ))}
          <a
            href={SITE.social.x}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="X"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
              <path d="M18.9 2H22l-6.78 7.75L23.2 22h-6.25l-4.9-7.63L5.37 22H2.24l7.25-8.28L1.8 2h6.4l4.43 6.96L18.9 2Zm-1.1 18h1.73L7.28 3.9H5.42L17.8 20Z" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
