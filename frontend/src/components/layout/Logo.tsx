import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useTranslation } from 'react-i18next';

/** Transparent vector wordmark for the RFY brand. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/images/rfy-logo.svg"
      alt="RFY"
      className={cn(
        'h-11 w-auto max-w-[8.5rem] object-contain',
        className,
      )}
    />
  );
}

export function Logo({ tone = 'light', className }: { tone?: 'light' | 'dark'; className?: string }) {
  const { t } = useTranslation();
  return (
    <Link
      to="/"
      className={cn('group inline-flex min-h-[44px] items-center py-1', className)}
      aria-label={t('brand.name')}
    >
      <BrandMark
        className={cn(
          'transition-[filter,transform] duration-300 group-hover:-translate-y-0.5',
          tone === 'dark' && 'brightness-0 invert',
        )}
      />
    </Link>
  );
}
