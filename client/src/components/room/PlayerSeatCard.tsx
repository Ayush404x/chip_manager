import { Crown, WifiOff } from 'lucide-react';
import type { ActionView, PlayerSeatView } from '@chiproom/shared';
import { Avatar } from '../ui/Feedback';
import { Tooltip } from '../ui/Tooltip';
import { cn, formatChips } from '../../lib/utils';

const ACTION_SHORT: Record<ActionView['type'], string> = {
  post_sb: 'Small blind',
  post_bb: 'Big blind',
  check: 'Checked',
  bet: 'Bet',
  call: 'Called',
  raise: 'Raised to',
  fold: 'Folded',
  all_in: 'All in',
  win: 'Won',
};

export function PlayerSeatCard({
  seat,
  isMe,
  isTurn,
  isDealer,
  blind,
  lastAction,
  paused,
  compact,
}: {
  seat: PlayerSeatView;
  isMe: boolean;
  isTurn: boolean;
  isDealer: boolean;
  blind: 'SB' | 'BB' | null;
  lastAction?: ActionView;
  paused: boolean;
  compact?: boolean;
}) {
  const status = seat.folded
    ? 'Folded'
    : seat.allIn
      ? 'All in'
      : !seat.isConnected
        ? 'Offline'
        : seat.sittingOut
          ? 'Sitting out'
          : isTurn && !paused
            ? 'To act'
            : 'Active';

  const statusTone = seat.folded
    ? 'text-slate-500'
    : seat.allIn
      ? 'text-chip-gold'
      : !seat.isConnected
        ? 'text-red-300/80'
        : isTurn && !paused
          ? 'text-emerald-300'
          : 'text-slate-500';

  const actionLabel = lastAction
    ? `${ACTION_SHORT[lastAction.type]}${lastAction.type === 'raise' || lastAction.type === 'bet' ? ` ${formatChips(lastAction.amount)}` : lastAction.type === 'all_in' ? ` ${formatChips(lastAction.amount)}` : ''}`
    : null;

  return (
    <div className={cn('relative w-[142px]', compact && 'w-full')}>
      {isTurn && !paused ? (
        <span className="absolute -top-2.5 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full border border-emerald-400/40 bg-emerald-500 px-2 py-[2px] text-[8px] font-bold uppercase tracking-[0.12em] text-emerald-950 shadow">
          To act
        </span>
      ) : null}

      <div
        className={cn(
          'relative rounded-xl border px-2.5 py-2 shadow-seat transition-all duration-200',
          'bg-charcoal-900/95 backdrop-blur',
          isTurn && !paused
            ? 'border-emerald-400/70 shadow-glow-emerald'
            : seat.allIn
              ? 'border-chip-gold/35'
              : isMe
                ? 'border-white/25'
                : 'border-white/[0.08]',
          seat.folded && 'opacity-45 saturate-50',
          !seat.isConnected && !seat.folded && 'border-red-400/20',
        )}
        aria-label={`${seat.nickname}, ${formatChips(seat.chips)} chips, ${status}`}
      >
        <div className="flex items-center gap-2">
          <Avatar name={seat.nickname} size="sm" online={seat.isConnected} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span
                className={cn(
                  'truncate text-[11px] font-semibold',
                  isMe ? 'text-emerald-200' : 'text-slate-100',
                )}
              >
                {seat.nickname}
              </span>
              {seat.isHost ? (
                <Crown className="h-2.5 w-2.5 shrink-0 text-chip-gold/80" aria-label="Host" />
              ) : null}
            </div>
            <div className="flex items-baseline gap-1">
              <span className="chip-value text-[12px] font-semibold text-slate-200">
                {formatChips(seat.chips)}
              </span>
              <span className="text-[8px] uppercase tracking-wide text-slate-600">chips</span>
            </div>
          </div>
          {!seat.isConnected ? (
            <WifiOff className="h-2.5 w-2.5 shrink-0 text-red-300/70" aria-label="Disconnected" />
          ) : null}
        </div>

        <div className="mt-1 flex items-center justify-between gap-1">
          <span className={cn('truncate text-[9px] font-medium', statusTone)}>
            {seat.folded
              ? 'Folded'
              : seat.allIn
                ? 'All in'
                : paused
                  ? 'Paused'
                  : actionLabel ?? status}
          </span>
          {seat.committed > 0 ? (
            <span className="chip-value shrink-0 rounded-full border border-chip-gold/25 bg-chip-gold/10 px-1.5 py-[1px] text-[9px] font-semibold text-chip-gold">
              {formatChips(seat.committed)}
            </span>
          ) : null}
        </div>

        <div className="absolute -right-1.5 -top-1.5 flex gap-1">
          {isDealer ? (
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full border border-white/40 bg-white text-[8px] font-bold text-charcoal-950 shadow"
              aria-label="Dealer button"
            >
              D
            </span>
          ) : null}
          {blind ? (
            <Tooltip
              content={
                blind === 'SB'
                  ? 'Small blind — posted before the hand'
                  : 'Big blind — posted before the hand and sets the minimum bet'
              }
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full border border-sky-300/30 bg-sky-500/90 text-[7px] font-bold text-sky-950 shadow">
                {blind}
              </span>
            </Tooltip>
          ) : null}
        </div>

        {seat.contributed > 0 && !seat.folded ? (
          <div className="mt-1 border-t border-white/[0.05] pt-1 text-[8px] text-slate-600">
            Hand total <span className="chip-value text-slate-400">{formatChips(seat.contributed)}</span>
          </div>
        ) : null}
      </div>

      {seat.payout > 0 ? (
        <span className="absolute -bottom-2.5 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full border border-emerald-400/30 bg-emerald-500 px-2 py-[2px] text-[8px] font-bold text-emerald-950 shadow">
          +{formatChips(seat.payout)} won
        </span>
      ) : null}
    </div>
  );
}
