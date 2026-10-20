import type { ActionView } from '@chiproom/shared';
import { Coins, History } from 'lucide-react';
import { formatChips, streetLabel } from '../../lib/utils';

const ACTION_TEXT: Record<
  ActionView['type'],
  (action: ActionView) => string
> = {
  post_sb: (a) => `posted small blind ${formatChips(a.amount)}`,
  post_bb: (a) => `posted big blind ${formatChips(a.amount)}`,
  check: () => 'checked',
  bet: (a) => `bet ${formatChips(a.amount)}`,
  call: (a) => `called ${formatChips(a.amount)}`,
  raise: (a) => `raised to ${formatChips(a.amount)}`,
  fold: () => 'folded',
  all_in: (a) => `went all in for ${formatChips(a.amount)}`,
  win: (a) => `won ${formatChips(a.amount)}`,
};

const ACTION_COLOR: Record<ActionView['type'], string> = {
  post_sb: 'text-slate-500',
  post_bb: 'text-slate-500',
  check: 'text-slate-300',
  bet: 'text-sky-300',
  call: 'text-emerald-300',
  raise: 'text-emerald-300',
  fold: 'text-red-300/80',
  all_in: 'text-chip-gold',
  win: 'text-chip-gold',
};

export function ActionFeed({ actions, limit = 9 }: { actions: ActionView[]; limit?: number }) {
  const recent = [...actions].reverse().slice(0, limit);
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-charcoal-900/60">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <History className="h-3.5 w-3.5 text-slate-500" /> Action feed
        </div>
        <span className="text-[10px] uppercase tracking-[0.12em] text-slate-600">
          {actions.length} actions
        </span>
      </div>
      <div className="max-h-[320px] overflow-y-auto px-2 py-2">
        {recent.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-slate-600">
            Actions will appear here as the hand plays.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {recent.map((action) => (
              <li
                key={action.id}
                className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-[11px] transition-colors hover:bg-white/[0.03]"
              >
                <span className="mt-0.5 w-4 shrink-0 text-right font-mono text-[9px] text-slate-700">
                  {action.seq}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="leading-snug">
                    <span className="font-medium text-slate-200">
                      {action.nickname ?? 'Table'}
                    </span>{' '}
                    <span className={ACTION_COLOR[action.type]}>
                      {ACTION_TEXT[action.type](action)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[9px] uppercase tracking-[0.1em] text-slate-700">
                    {streetLabel(action.street)}
                    {action.note ? ` · ${action.note}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-white/[0.06] px-4 py-2 text-[10px] text-slate-600">
        <span className="inline-flex items-center gap-1">
          <Coins className="h-3 w-3" /> Server-validated · newest first
        </span>
      </div>
    </div>
  );
}
