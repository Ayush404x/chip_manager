import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn, initials } from '../../lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-slate-400', className)} aria-hidden />;
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-slate-400">
      <Spinner className="h-6 w-6 text-emerald-400" />
      <span>{label}…</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-slate-500">{icon}</div> : null}
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Avatar({
  name,
  size = 'md',
  className,
  online,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  online?: boolean;
}) {
  const sizes = {
    sm: 'h-8 w-8 text-[11px]',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
    xl: 'h-16 w-16 text-lg',
  } as const;
  return (
    <div className={cn('relative shrink-0', className)}>
      <div
        className={cn(
          'flex items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-charcoal-700 to-charcoal-900 font-semibold text-emerald-100 shadow-inner',
          sizes[size],
        )}
        aria-hidden
      >
        {initials(name) || '?'}
      </div>
      {online !== undefined ? (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-charcoal-850',
            online ? 'bg-emerald-400' : 'bg-slate-600',
          )}
        />
      ) : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5', className)}>
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-100">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div> : null}
    </div>
  );
}
