import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Container } from '../ui/Container';
import { cn } from '../../lib/utils';

interface Crumb {
  label: string;
  to?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  crumbs,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  crumbs?: Crumb[];
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('relative isolate overflow-hidden border-b border-steel-200 bg-steel-50 pb-10 pt-7 sm:pb-16 sm:pt-12', className)}>
      <div className="absolute inset-0 bg-grid opacity-50" aria-hidden="true" />
      <div className="absolute -end-32 -top-24 h-72 w-72 rounded-full bg-brand-100/60 blur-3xl" aria-hidden="true" />
      <Container className="relative">
        {crumbs?.length ? (
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5 text-[0.72rem] text-steel-500">
              <li>
                <Link to="/" className="inline-flex min-h-[36px] items-center py-1 transition-colors hover:text-brand-700">Home</Link>
              </li>
              {crumbs.map((crumb) => (
                <li key={crumb.label} className="flex items-center gap-1.5">
                  <ChevronRight className="h-3 w-3 rtl:rotate-180" aria-hidden="true" />
                  {crumb.to ? (
                    <Link to={crumb.to} className="inline-flex min-h-[36px] items-center py-1 transition-colors hover:text-brand-700">{crumb.label}</Link>
                  ) : (
                    <span className="font-semibold text-navy-800">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <div className="mt-4 grid gap-6 sm:mt-6 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h1 className="mt-2.5 text-balance text-[1.75rem] font-extrabold leading-[1.1] tracking-tight text-navy-800 sm:mt-3 sm:text-[2.7rem] sm:leading-[1.06]">
              {title}
            </h1>
            {description ? (
              <p className="mt-3 max-w-2xl text-[0.92rem] leading-relaxed text-steel-600 sm:mt-4 sm:text-[0.95rem]">{description}</p>
            ) : null}
          </div>
          {children ? <div className="lg:col-span-4 lg:justify-self-end">{children}</div> : null}
        </div>
      </Container>
    </section>
  );
}
