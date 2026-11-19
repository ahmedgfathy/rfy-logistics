import { cn } from '../../lib/utils';

const toneByStatus: Record<string, string> = {
  BOOKED: 'bg-steel-100 text-steel-700 border-steel-200',
  ORIGIN_PICKUP: 'bg-brand-50 text-brand-700 border-brand-100',
  DEPARTED_ORIGIN: 'bg-brand-50 text-brand-700 border-brand-100',
  IN_TRANSIT: 'bg-ocean-300/20 text-ocean-600 border-ocean-300/40',
  CUSTOMS_CLEARANCE: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  OUT_FOR_DELIVERY: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  DELIVERED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  DELAYED: 'bg-red-50 text-red-700 border-red-200',
  CANCELLED: 'bg-steel-100 text-steel-500 border-steel-200',
  NEW: 'bg-brand-50 text-brand-700 border-brand-100',
  UNDER_REVIEW: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  QUOTATION_SENT: 'bg-ocean-300/20 text-ocean-600 border-ocean-300/40',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  IN_PROGRESS: 'bg-brand-50 text-brand-700 border-brand-100',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  IN_RESOLVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RESOLVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export function StatusPill({ status, label, className }: { status: string; label: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wide',
        toneByStatus[status] ?? 'bg-steel-100 text-steel-600 border-steel-200',
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}
