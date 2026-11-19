import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useTranslation } from 'react-i18next';

/** The client-supplied company logo (root `logo.jpeg`, copied into public/images). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/images/logo.jpeg"
      alt="RFY"
      className={cn(
        'h-10 w-auto max-w-[8.5rem] rounded-md bg-white object-contain p-0.5 shadow-sm',
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
          'transition-transform duration-300 group-hover:-translate-y-0.5',
          tone === 'dark' && 'ring-1 ring-white/25',
        )}
      />
    </Link>
  );
}
