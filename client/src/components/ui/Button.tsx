import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'gold';
type Size = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-emerald-500 text-emerald-950 shadow-[0_10px_30px_-12px_rgba(16,185,129,0.8)] hover:bg-emerald-400 active:bg-emerald-500',
  secondary:
    'bg-white/[0.06] text-slate-100 border border-white/[0.08] hover:bg-white/[0.1] active:bg-white/[0.08]',
  outline:
    'border border-emerald-400/30 bg-emerald-400/[0.04] text-emerald-200 hover:bg-emerald-400/[0.09] hover:border-emerald-400/50',
  ghost: 'text-slate-300 hover:bg-white/[0.06] hover:text-white',
  danger:
    'bg-red-500/90 text-white shadow-[0_10px_30px_-12px_rgba(239,68,68,0.7)] hover:bg-red-500',
  gold: 'bg-chip-gold text-[#2a1d05] shadow-[0_10px_30px_-12px_rgba(231,191,106,0.7)] hover:bg-amber-300',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-11 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2 rounded-xl',
  icon: 'h-10 w-10 rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', isLoading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'relative inline-flex select-none items-center justify-center font-semibold tracking-[-0.01em] transition-all duration-150 disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
