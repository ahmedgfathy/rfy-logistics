import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm text-steel-500', className)} role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label ? <span>{label}</span> : null}
    </span>
  );
}

export function StatePanel({
  title,
  body,
  action,
  icon,
  className,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-2xl border border-dashed border-steel-300 bg-steel-50/60 px-6 py-10 text-center', className)}>
      {icon ? <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-steel-500 shadow-soft">{icon}</div> : null}
      <p className="font-semibold text-navy-800">{title}</p>
      {body ? <p className="mx-auto mt-1.5 max-w-md text-sm text-steel-500">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
