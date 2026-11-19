import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function AdminPage({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-800">{title}</h1>
          {description ? <p className="mt-1 text-sm text-steel-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function Panel({ title, actions, children, className }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-steel-200 bg-white shadow-soft', className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-steel-200 px-5 py-4">
          {title ? <h2 className="text-[0.95rem] font-bold text-navy-800">{title}</h2> : null}
          {actions}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th className={cn('border-b border-steel-200 bg-steel-50/70 px-4 py-3 text-start text-[0.68rem] font-bold uppercase tracking-[0.1em] text-steel-500', className)}>
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('border-b border-steel-100 px-4 py-3 align-top text-[0.83rem] text-steel-700', className)}>{children}</td>;
}

export function AdminField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-steel-400">
        {message}
      </td>
    </tr>
  );
}
