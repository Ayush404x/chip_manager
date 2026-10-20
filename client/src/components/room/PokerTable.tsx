import type { HandView, PlayerSeatView, SpotStatus } from '@chiproom/shared';
import { Clock3, Coins, Eye, Lock, PauseCircle, Trophy } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Tooltip } from '../ui/Tooltip';
import { cn, formatChips, streetLabel } from '../../lib/utils';
import { PlayerSeatCard } from './PlayerSeatCard';

const STREET_ORDER = ['preflop', 'flop', 'turn', 'river'] as const;

export function TableCenter({
  hand,
  paused,
  compact,
}: {
  hand: HandView;
  paused: boolean;
  compact?: boolean;
}) {
  const mainPot = hand.pots[0];
  const sidePots = hand.pots.slice(1);
  const turnSeat = hand.seats.find((seat) => seat.seat === hand.turnSeat);
  const winners = hand.pots
    .flatMap((pot) =>
      Object.entries(pot.distribution ?? {}).map(([playerId, amount]) => ({
        playerId,
        amount,
        nickname: hand.seats.find((seat) => seat.playerId === playerId)?.nickname ?? 'Player',
      })),
    )
    .reduce<Array<{ playerId: string; nickname: string; amount: number }>>((list, winner) => {
      const existing = list.find((entry) => entry.playerId === winner.playerId);
      if (existing) existing.amount += winner.amount;
      else list.push({ ...winner });
      return list;
    }, []);

  return (
    <div
      className={cn(
        'absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center',
        compact && 'relative inset-auto px-4 py-6',
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-full border border-emerald-100/15 bg-emerald-950/40 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-200/70">
          {streetLabel(hand.street)}
        </span>
        <span className="text-[9px] uppercase tracking-[0.18em] text-emerald-100/35">
          Hand #{hand.handNumber}
        </span>
      </div>

      <div className="text-[9px] font-medium uppercase tracking-[0.24em] text-emerald-100/45">
        {mainPot ? 'Main pot' : 'Pot'}
      </div>
      <div className="chip-value mt-0.5 text-4xl font-semibold tracking-[-0.03em] text-emerald-50 sm:text-5xl">
        {formatChips(hand.totalPot)}
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
        {sidePots.map((pot) => (
          <span
            key={pot.index}
            className="chip-value rounded-full border border-chip-gold/20 bg-chip-gold/[0.08] px-2 py-0.5 text-[9px] text-chip-gold/90"
          >
            Side {pot.index} · {formatChips(pot.amount)}
          </span>
        ))}
        {hand.pots.length === 0 ? (
          <span className="text-[10px] text-emerald-100/40">No chips committed yet</span>
        ) : null}
      </div>

      <div className="mt-4 flex items-stretch gap-2">
        <CenterStat label="Current bet" value={formatChips(hand.currentBet)} />
        <CenterStat
          label="Min raise"
          value={formatChips(hand.minRaise)}
          tooltip="The minimum raise increment over the current bet."
        />
      </div>

      <div className="mt-4 hidden items-center gap-1 sm:flex" aria-label="Betting street">
        {STREET_ORDER.map((street) => {
          const currentIndex = STREET_ORDER.indexOf(hand.street);
          const index = STREET_ORDER.indexOf(street);
          return (
            <span
              key={street}
              className={cn(
                'h-1 w-7 rounded-full transition-colors',
                index < currentIndex
                  ? 'bg-emerald-400/40'
                  : index === currentIndex
                    ? 'bg-emerald-300'
                    : 'bg-emerald-100/10',
              )}
            />
          );
        })}
      </div>

      <div className="mt-3 min-h-[20px]">
        {hand.phase === 'complete' ? (
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-200">
              <Trophy className="h-3.5 w-3.5 text-chip-gold" /> Hand complete
              {hand.autoSettled ? (
                <span className="text-[9px] font-normal text-emerald-200/50">· auto-awarded</span>
              ) : null}
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {winners.map((winner) => (
                <span
                  key={winner.playerId}
                  className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[10px] text-emerald-100"
                >
                  {winner.nickname} +{formatChips(winner.amount)}
                </span>
              ))}
            </div>
          </div>
        ) : hand.phase === 'awaiting_payout' ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-3 py-1 text-[10px] font-medium text-amber-200">
            <Clock3 className="h-3 w-3" /> Awaiting host payout
          </span>
        ) : paused ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-3 py-1 text-[10px] font-medium text-amber-200">
            <PauseCircle className="h-3 w-3" /> Table paused
          </span>
        ) : turnSeat ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-3 py-1 text-[10px] font-medium text-emerald-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
            {turnSeat.nickname} to act
          </span>
        ) : (
          <span className="text-[10px] text-emerald-100/40">Waiting for the next action</span>
        )}
      </div>
    </div>
  );
}

function CenterStat({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: string;
  tooltip?: string;
}) {
  return (
    <div className="min-w-[86px] rounded-lg border border-emerald-100/10 bg-emerald-950/30 px-2.5 py-1.5">
      <div className="flex items-center justify-center gap-1 text-[8px] uppercase tracking-[0.14em] text-emerald-100/40">
        {label}
        {tooltip ? (
          <Tooltip content={tooltip}>
            <span className="text-emerald-100/30">?</span>
          </Tooltip>
        ) : null}
      </div>
      <div className="chip-value mt-0.5 text-[12px] font-semibold text-emerald-50">{value}</div>
    </div>
  );
}

function seatPosition(index: number, count: number) {
  const angle = Math.PI / 2 + (index / Math.max(1, count)) * Math.PI * 2;
  return {
    left: `${50 + Math.cos(angle) * 44.5}%`,
    top: `${50 + Math.sin(angle) * 40}%`,
  };
}

function lastActionFor(hand: HandView) {
  const map = new Map<string, HandView['actions'][number]>();
  for (const action of hand.actions) {
    if (action.playerId) map.set(action.playerId, action);
  }
  return map;
}

export function PokerTable({
  hand,
  meId,
  paused,
  closed,
  onOpenInvite,
}: {
  hand: HandView;
  meId: string | null;
  paused: boolean;
  closed: boolean;
  onOpenInvite: () => void;
}) {
  const seats = [...hand.seats].sort((a, b) => a.seat - b.seat);
  const lastActions = lastActionFor(hand);
  const blindFor = (seat: PlayerSeatView): 'SB' | 'BB' | null => {
    if (seat.seat === hand.sbSeat) return 'SB';
    if (seat.seat === hand.bbSeat) return 'BB';
    return null;
  };

  return (
    <div className="relative">
      {/* Desktop / tablet oval table */}
      <div className="relative mx-auto hidden h-[520px] w-full max-w-[1120px] md:block lg:h-[600px]">
        <div className="felt-table absolute inset-[9%_8%] rounded-[50%]">
          <TableCenter hand={hand} paused={paused} />
        </div>

        {seats.map((seat, index) => {
          const position = seatPosition(index, seats.length);
          return (
            <div
              key={seat.playerId}
              className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
              style={position}
            >
              <PlayerSeatCard
                seat={seat}
                isMe={seat.playerId === meId}
                isTurn={hand.turnSeat === seat.seat && hand.phase === 'betting'}
                isDealer={seat.seat === hand.dealerSeat}
                blind={blindFor(seat)}
                lastAction={lastActions.get(seat.playerId)}
                paused={paused}
              />
            </div>
          );
        })}

        <div className="absolute bottom-[3%] left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 text-[9px] uppercase tracking-[0.16em] text-slate-600">
          <Lock className="h-2.5 w-2.5" /> Private table
          <button
            type="button"
            onClick={onOpenInvite}
            className="text-emerald-300/60 transition-colors hover:text-emerald-300"
          >
            Invite
          </button>
        </div>

        {closed ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center rounded-[50%] bg-charcoal-950/55 backdrop-blur-[2px]">
            <div className="rounded-xl border border-white/10 bg-charcoal-900/95 px-5 py-4 text-center">
              <Lock className="mx-auto h-5 w-5 text-slate-400" />
              <p className="mt-2 text-sm font-semibold text-white">Room closed</p>
              <p className="text-xs text-slate-500">History remains available.</p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Mobile table summary */}
      <div className="md:hidden">
        <div className="felt-table relative overflow-hidden rounded-2xl">
          <TableCenter hand={hand} paused={paused} compact />
          {closed ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-charcoal-950/60 backdrop-blur-[2px]">
              <Badge variant="red">Room closed</Badge>
            </div>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {seats.map((seat) => (
            <PlayerSeatCard
              key={seat.playerId}
              seat={seat}
              isMe={seat.playerId === meId}
              isTurn={hand.turnSeat === seat.seat && hand.phase === 'betting'}
              isDealer={seat.seat === hand.dealerSeat}
              blind={blindFor(seat)}
              lastAction={lastActions.get(seat.playerId)}
              paused={paused}
              compact
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function PlayerStatusBadge({ status }: { status: SpotStatus }) {
  const map = {
    active: { label: 'Active', variant: 'emerald' as const },
    folded: { label: 'Folded', variant: 'slate' as const },
    all_in: { label: 'All in', variant: 'gold' as const },
    sitting_out: { label: 'Sitting out', variant: 'amber' as const },
    disconnected: { label: 'Offline', variant: 'red' as const },
  };
  const config = map[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function TableLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[9px] text-slate-600">
      <span className="inline-flex items-center gap-1">
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-[7px] font-bold text-charcoal-950">
          D
        </span>
        Dealer
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sky-500/90 text-[6px] font-bold text-sky-950">
          SB
        </span>
        Small blind
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sky-500/90 text-[6px] font-bold text-sky-950">
          BB
        </span>
        Big blind
      </span>
      <span className="inline-flex items-center gap-1">
        <Coins className="h-3 w-3 text-chip-gold/60" /> Bet this round
      </span>
      <span className="inline-flex items-center gap-1">
        <Eye className="h-3 w-3" /> No cards are dealt
      </span>
    </div>
  );
}
