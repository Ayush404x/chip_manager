import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
  description,
  id,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label: ReactNode;
  description?: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-3', className)}>
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="block cursor-pointer text-sm font-medium text-slate-200"
        >
          {label}
        </label>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === 'string' ? label : undefined}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 disabled:opacity-40',
          checked
            ? 'border-emerald-400/40 bg-emerald-500/90'
            : 'border-white/10 bg-white/[0.08]',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform duration-200',
            checked ? 'translate-x-[21px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  className,
  ...props
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'>) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-2.5 text-sm text-slate-300', className)}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
          checked
            ? 'border-emerald-400 bg-emerald-500 text-emerald-950'
            : 'border-white/15 bg-white/[0.04] hover:border-white/25',
          disabled && 'opacity-40',
        )}
        {...props}
      >
        {checked ? (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
            <path
              d="M3.5 8.2 6.4 11l6-6.2"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </button>
      {label}
    </label>
  );
}
