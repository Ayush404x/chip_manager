import { Link } from 'react-router-dom';
import { Coins } from 'lucide-react';
import { APP_NAME } from '../lib/brand';
import { cn } from '../lib/utils';

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-300 to-emerald-700 shadow-[0_8px_24px_-10px_rgba(16,185,129,0.9)]',
        className,
      )}
      aria-hidden
    >
      <span className="absolute inset-[3px] rounded-full border border-emerald-950/40" />
      <span className="absolute inset-[7px] rounded-full border border-dashed border-emerald-100/45" />
      <Coins className="h-4 w-4 text-emerald-950" strokeWidth={2.4} />
    </span>
  );
}

export function Brand({ className, to = '/' }: { className?: string; to?: string }) {
  return (
    <Link
      to={to}
      className={cn('group inline-flex items-center gap-2.5 rounded-lg', className)}
      aria-label={`${APP_NAME} home`}
    >
      <BrandMark className="transition-transform duration-300 group-hover:rotate-[18deg]" />
      <span className="text-[17px] font-semibold tracking-[-0.02em] text-white">
        {APP_NAME}
      </span>
    </Link>
  );
}
