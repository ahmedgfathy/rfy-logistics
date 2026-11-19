import { cn } from '../../lib/utils';

interface Props {
  eyebrow?: string;
  title: string;
  description?: string;
  tone?: 'light' | 'dark';
  align?: 'start' | 'center';
  className?: string;
  as?: 'h1' | 'h2' | 'h3';
}

export function SectionHeading({ eyebrow, title, description, tone = 'light', align = 'start', className, as = 'h2' }: Props) {
  const Tag = as;
  return (
    <div
      className={cn(
        'max-w-2xl',
        align === 'center' && 'mx-auto text-center',
        className,
      )}
    >
      {eyebrow ? (
        <p className={cn('eyebrow mb-3', tone === 'dark' && 'text-amber-400')}>{eyebrow}</p>
      ) : null}
      <Tag
        className={cn(
          'text-balance text-[1.55rem] font-extrabold leading-[1.18] tracking-tight sm:text-[2.1rem] sm:leading-[1.15]',
          tone === 'dark' ? 'text-white' : 'text-navy-800',
        )}
      >
        {title}
      </Tag>
      {description ? (
        <p
          className={cn(
            'mt-3 text-[0.95rem] leading-relaxed sm:mt-4 sm:text-[0.98rem]',
            tone === 'dark' ? 'text-steel-200/85' : 'text-steel-600',
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
