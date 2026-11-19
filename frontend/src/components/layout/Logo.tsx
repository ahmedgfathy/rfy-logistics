import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useTranslation } from 'react-i18next';

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn('h-9 w-9', className)} role="img" aria-label="RFY">
      <rect width="40" height="40" rx="11" fill="#0B1F33" />
      <path d="M8 26.5c4.2 0 5.2-3.2 7.4-3.2s3.2 3.2 7.4 3.2 5.2-3.2 7.4-3.2" stroke="#1677B8" strokeWidth="2.6" strokeLinecap="round" fill="none" opacity="0.9" />
      <path d="M8 31.5c4.2 0 5.2-2.4 7.4-2.4s3.2 2.4 7.4 2.4 5.2-2.4 7.4-2.4" stroke="#155EEF" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.55" />
      <path d="M12.5 21.5V12l7.5 6.4 7.5-6.4v9.5" stroke="#F5A623" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function Logo({ tone = 'light', className }: { tone?: 'light' | 'dark'; className?: string }) {
  const { t } = useTranslation();
  return (
    <Link to="/" className={cn('group inline-flex min-h-[44px] items-center gap-2.5 py-1 sm:gap-3', className)} aria-label={t('brand.name')}>
      <BrandMark className="transition-transform duration-300 group-hover:-translate-y-0.5" />
      <span className="flex flex-col leading-none">
        <span className={cn('text-[0.98rem] font-extrabold tracking-tight sm:text-[1.02rem]', tone === 'dark' ? 'text-white' : 'text-navy-800')}>
          {t('brand.name')}
        </span>
        <span className={cn('mt-1 hidden text-[0.66rem] font-semibold uppercase tracking-[0.12em] min-[380px]:block sm:text-[0.62rem] sm:tracking-[0.14em]', tone === 'dark' ? 'text-steel-300' : 'text-steel-500')}>
          {t('brand.tagline')}
        </span>
      </span>
    </Link>
  );
}
