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

export function SectionHeading({
  eyebrow,
  title,
  description,
  tone = 'light',
  align = 'center',
  className,
  as = 'h2',
}: Props) {
  const Tag = as;
  return (
    <div
      className={cn(
        'max-w-3xl',
        align === 'center' ? 'mx-auto text-center' : 'text-start',
        className,
      )}
    >
      {eyebrow ? (
        <p className={cn('eyebrow mb-3 font-bold uppercase tracking-[0.16em]', tone === 'dark' && 'text-brand-400')}>
          {eyebrow}
        </p>
      ) : null}
      <Tag
        className={cn(
          'text-[1.65rem] font-black leading-[1.18] tracking-tight sm:text-[2.2rem]',
          tone === 'dark' ? 'text-white' : 'text-[var(--navy-800)]',
        )}
      >
        {title}
      </Tag>
      <span className="section-divider" aria-hidden="true">
        <span className="h-2 w-2 rotate-45 bg-[var(--brand-500)]" />
      </span>
      {description ? (
        <p
          className={cn(
            'mx-auto mt-5 max-w-2xl text-[0.95rem] leading-[1.85] sm:text-[1rem]',
            tone === 'dark' ? 'text-white/70' : 'text-[var(--steel-500)]',
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
