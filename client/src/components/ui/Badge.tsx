import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

type BadgeVariant =
  | 'default'
  | 'emerald'
  | 'amber'
  | 'red'
  | 'blue'
  | 'slate'
  | 'gold'
  | 'purple';

const variants: Record<BadgeVariant, string> = {
  default: 'border-white/10 bg-white/[0.06] text-slate-300',
  emerald: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  amber: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
  red: 'border-red-400/25 bg-red-400/10 text-red-300',
  blue: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
  slate: 'border-slate-400/20 bg-slate-400/10 text-slate-300',
  gold: 'border-chip-gold/30 bg-chip-gold/10 text-chip-gold',
  purple: 'border-violet-400/25 bg-violet-400/10 text-violet-300',
};

export function Badge({
  children,
  variant = 'default',
  className,
  dot,
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide',
        variants[variant],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
