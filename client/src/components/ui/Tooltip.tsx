import { useId, type ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Lightweight tooltip. Supports hover and keyboard focus, and is announced to
 * screen readers through aria-describedby.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  className,
}: {
  content: ReactNode;
  children?: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}) {
  const id = useId();
  return (
    <span className={cn('group relative inline-flex items-center', className)}>
      <span tabIndex={0} aria-describedby={id} className="inline-flex cursor-help items-center">
        {children ?? <HelpCircle className="h-3.5 w-3.5 text-slate-500" aria-hidden />}
      </span>
      <span
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 w-56 -translate-x-1/2 rounded-lg border border-white/10 bg-charcoal-950/95 px-3 py-2 text-left text-[11px] font-normal leading-relaxed text-slate-300 opacity-0 shadow-xl backdrop-blur transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
        )}
      >
        {content}
      </span>
    </span>
  );
}
