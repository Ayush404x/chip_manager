import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CalendarClock,
  Coins,
  History,
  Layers,
  ListOrdered,
  RefreshCw,
  ScrollText,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import type {
  ActionType,
  HandHistoryDetail,
  RoomHistoryResponse,
  RoomState,
} from '@chiproom/shared';
import { ACTION_LABELS } from '@chiproom/shared';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { EmptyState, LoadingState, Stat } from '../ui/Feedback';
import { cn, formatChips, formatSignedChips, streetLabel, timeAgo } from '../../lib/utils';

type HistoryTab = 'hands' | 'audit';

export function HistoryDialog({
  open,
  onClose,
  state,
  fetchHistory,
}: {
  open: boolean;
  onClose: () => void;
  state: RoomState;
  fetchHistory: () => Promise<RoomHistoryResponse | null>;
}) {
  const [tab, setTab] = useState<HistoryTab>('hands');
  const [data, setData] = useState<RoomHistoryResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchHistory();
      if (result) {
        setData(result);
        setSelectedId((current) => current ?? result.hands[0]?.id ?? null);
      } else {
        setError('Could not load the history. Check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setTab('hands');
    setSelectedId(null);
    void load();
    // Only reload when the dialog opens or the room changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, state.room.id]);

  const selected = useMemo(
    () => data?.hands.find((hand) => hand.id === selectedId) ?? data?.hands[0] ?? null,
    [data, selectedId],
  );
  const adjustments = data?.adjustments ?? state.adjustments ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <History className="h-4 w-4 text-emerald-300" /> Hand history
        </span>
      }
      description={`${state.room.name} · every hand, action, contribution and payout.`}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="secondary" onClick={() => void load()} isLoading={loading}>
            {!loading ? <RefreshCw className="h-4 w-4" /> : null}
            Refresh
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {data ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Hands played" value={data.stats.handsPlayed} />
            <Stat label="Biggest pot" value={formatChips(data.stats.biggestPot)} />
            <Stat label="Chips in play" value={formatChips(data.stats.totalChipsInPlay)} />
            <Stat
              label="Your net"
              value={
                <span
                  className={cn(
                    data.stats.yourNet > 0
                      ? 'text-emerald-300'
                      : data.stats.yourNet < 0
                        ? 'text-red-300'
                        : 'text-slate-300',
                  )}
                >
                  {formatSignedChips(data.stats.yourNet)}
                </span>
              }
              hint="Across completed hands"
            />
          </div>
        ) : null}

        <div className="flex items-center gap-1 rounded-xl border border-white/[0.06] bg-black/25 p-1">
          <TabButton active={tab === 'hands'} onClick={() => setTab('hands')} icon={<ListOrdered className="h-3.5 w-3.5" />}>
            Hands {data ? `(${data.hands.length})` : ''}
          </TabButton>
          <TabButton active={tab === 'audit'} onClick={() => setTab('audit')} icon={<ScrollText className="h-3.5 w-3.5" />}>
            Chip ledger {adjustments.length ? `(${adjustments.length})` : ''}
          </TabButton>
        </div>

        {loading && !data ? (
          <LoadingState label="Loading the hand history" />
        ) : error && !data ? (
          <div className="rounded-xl border border-red-400/20 bg-red-400/[0.05] px-4 py-4 text-center">
            <p className="text-sm text-red-200">{error}</p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : tab === 'hands' ? (
          data && data.hands.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="max-h-[300px] space-y-1.5 overflow-y-auto pr-1 lg:max-h-[520px]">
                {data.hands.map((hand) => (
                  <HandListItem
                    key={hand.id}
                    hand={hand}
                    active={selected?.id === hand.id}
                    onClick={() => setSelectedId(hand.id)}
                  />
                ))}
              </div>
              <div className="min-w-0 rounded-2xl border border-white/[0.07] bg-charcoal-900/50">
                {selected ? <HandDetail hand={selected} /> : null}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<History className="h-6 w-6" />}
              title="No completed hands yet"
              description="Start a hand from the table. The action sequence and payout will appear here as soon as it is settled."
            />
          )
        ) : adjustments.length === 0 ? (
          <EmptyState
            icon={<Wallet className="h-6 w-6" />}
            title="No chip adjustments yet"
            description="Buy-ins, rebuys, removals and reset corrections will be listed here."
          />
        ) : (
          <div className="max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
            {adjustments.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                    <Wallet className="h-3 w-3 text-slate-500" />
                    {entry.nickname}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">{entry.reason}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-600">
                    <CalendarClock className="h-2.5 w-2.5" />
                    {new Date(entry.createdAt).toLocaleString()} · {timeAgo(entry.createdAt)}
                  </div>
                </div>
                <span
                  className={cn(
                    'chip-value shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                    entry.amount >= 0
                      ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
                      : 'border-red-400/25 bg-red-400/10 text-red-300',
                  )}
                >
                  {formatSignedChips(entry.amount)}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === 'audit' ? (
          <p className="text-[10px] leading-relaxed text-slate-600">
            The ledger includes initial buy-ins and host-authorized adjustments. Pot payouts are
            recorded separately against each hand.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
        active ? 'bg-white/[0.08] text-white' : 'text-slate-500 hover:bg-white/[0.03] hover:text-slate-300',
      )}
      aria-current={active ? 'page' : undefined}
    >
      {icon}
      {children}
    </button>
  );
}

function HandListItem({
  hand,
  active,
  onClick,
}: {
  hand: HandHistoryDetail;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-xl border px-3 py-2.5 text-left transition-colors',
        active
          ? 'border-emerald-400/30 bg-emerald-400/[0.06]'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-100">Hand #{hand.handNumber}</span>
        <span className="chip-value text-[11px] font-semibold text-emerald-200">
          {formatChips(hand.totalPot)}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="truncate text-[10px] text-slate-500">
          {hand.winners.length > 0
            ? `Won by ${hand.winners.map((winner) => winner.nickname).join(', ')}`
            : 'No payouts recorded'}
        </span>
        {typeof hand.yourNet === 'number' && hand.yourNet !== 0 ? (
          <span
            className={cn(
              'chip-value shrink-0 text-[10px]',
              hand.yourNet > 0 ? 'text-emerald-300' : 'text-red-300',
            )}
          >
            {formatSignedChips(hand.yourNet)}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-[9px] uppercase tracking-[0.1em] text-slate-600">
        {hand.completedAt ? timeAgo(hand.completedAt) : 'Incomplete'} · {hand.seats.length} players
      </div>
    </button>
  );
}

function HandDetail({ hand }: { hand: HandHistoryDetail }) {
  const seatMap = new Map(hand.seats.map((seat) => [seat.playerId, seat]));
  const winnerTotal = hand.winners.reduce((sum, winner) => sum + winner.amount, 0);

  return (
    <div className="divide-y divide-white/[0.06]">
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-white">Hand #{hand.handNumber}</h3>
              <Badge variant={hand.completedAt ? 'emerald' : 'amber'}>
                {hand.completedAt ? 'Settled' : 'In progress'}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                {new Date(hand.startedAt).toLocaleString()}
              </span>
              <span>Dealer seat {hand.dealerSeat}</span>
              <span>{streetLabel(hand.street)}</span>
              <span>{hand.seats.length} players</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-[0.14em] text-slate-600">Total pot</div>
            <div className="chip-value text-lg font-semibold text-emerald-100">{formatChips(hand.totalPot)}</div>
            <div className="chip-value text-[10px] text-slate-500">{formatChips(winnerTotal)} paid</div>
          </div>
        </div>

        {hand.winners.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {hand.winners.map((winner) => (
              <span
                key={winner.playerId}
                className="inline-flex items-center gap-1.5 rounded-full border border-chip-gold/25 bg-chip-gold/[0.08] px-2.5 py-1 text-[10px] text-chip-gold"
              >
                <Trophy className="h-3 w-3" />
                {winner.nickname}
                <span className="chip-value font-semibold">+{formatChips(winner.amount)}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-slate-600">No winners recorded for this hand.</p>
        )}
      </div>

      <div className="p-4">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          <Users className="h-3 w-3" /> Stacks & contributions
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px] text-left text-[11px]">
            <thead>
              <tr className="text-[9px] uppercase tracking-[0.1em] text-slate-600">
                <th className="pb-1.5 font-medium">Seat</th>
                <th className="pb-1.5 font-medium">Player</th>
                <th className="pb-1.5 text-right font-medium">Start</th>
                <th className="pb-1.5 text-right font-medium">Committed</th>
                <th className="pb-1.5 text-right font-medium">Payout</th>
                <th className="pb-1.5 text-right font-medium">End</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {hand.seats
                .slice()
                .sort((a, b) => a.seat - b.seat)
                .map((seat) => (
                  <tr key={seat.playerId} className={cn(seat.folded && 'text-slate-600', seat.playerId === hand.winners[0]?.playerId && 'text-slate-200')}>
                    <td className="py-1.5 font-mono text-[10px] text-slate-600">{seat.seat}</td>
                    <td className="py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="max-w-[120px] truncate text-slate-300">{seat.nickname}</span>
                        {seat.folded ? <Badge variant="slate">Folded</Badge> : null}
                        {seat.allIn ? <Badge variant="gold">All in</Badge> : null}
                      </span>
                    </td>
                    <td className="chip-value py-1.5 text-right text-slate-500">{formatChips(seat.startingChips)}</td>
                    <td className="chip-value py-1.5 text-right text-slate-400">{formatChips(seat.contributed)}</td>
                    <td className={cn('chip-value py-1.5 text-right', seat.payout > 0 ? 'font-semibold text-emerald-300' : 'text-slate-600')}>
                      {seat.payout > 0 ? `+${formatChips(seat.payout)}` : '—'}
                    </td>
                    <td className="chip-value py-1.5 text-right font-medium text-slate-200">
                      {formatChips(seat.endingChips ?? seat.chips)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-4">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          <Layers className="h-3 w-3" /> Pots & eligibility
        </div>
        <div className="space-y-1.5">
          {hand.pots.length === 0 ? (
            <p className="text-[11px] text-slate-600">No pot rows were recorded.</p>
          ) : (
            hand.pots.map((pot) => (
              <div key={pot.index} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
                    <Coins className="h-3 w-3 text-chip-gold/70" />
                    {pot.index === 0 ? 'Main pot' : `Side pot ${pot.index}`}
                  </span>
                  <span className="chip-value text-[11px] font-semibold text-emerald-200">{formatChips(pot.amount)}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {pot.eligiblePlayerIds.map((playerId) => {
                    const seat = seatMap.get(playerId);
                    const amount = pot.distribution?.[playerId];
                    return (
                      <span
                        key={playerId}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px]',
                          amount
                            ? 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200'
                            : 'border-white/10 bg-white/[0.02] text-slate-500',
                        )}
                      >
                        {seat?.nickname ?? 'Player'}
                        {amount ? <span className="chip-value font-semibold">+{formatChips(amount)}</span> : null}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            <ListOrdered className="h-3 w-3" /> Action sequence
          </div>
          <span className="text-[9px] uppercase tracking-[0.1em] text-slate-600">{hand.actions.length} actions</span>
        </div>
        {hand.actions.length === 0 ? (
          <p className="text-[11px] text-slate-600">No actions recorded.</p>
        ) : (
          <ol className="max-h-[220px] space-y-0.5 overflow-y-auto pr-1">
            {hand.actions.map((action) => (
              <li
                key={action.id}
                className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-[11px] hover:bg-white/[0.03]"
              >
                <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-[9px] text-slate-700">{action.seq}</span>
                <div className="min-w-0 flex-1">
                  <p className="leading-snug">
                    <span className="font-medium text-slate-200">{action.nickname ?? 'Table'}</span>{' '}
                    <span className={actionColor(action.type)}>{actionText(action)}</span>
                  </p>
                  <p className="mt-0.5 text-[9px] uppercase tracking-[0.1em] text-slate-700">
                    {streetLabel(action.street)}
                    {action.note ? ` · ${action.note}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function actionText(action: HandHistoryDetail['actions'][number]): string {
  const amount = formatChips(action.amount);
  switch (action.type) {
    case 'post_sb':
      return `posted small blind ${amount}`;
    case 'post_bb':
      return `posted big blind ${amount}`;
    case 'bet':
      return `bet ${amount}`;
    case 'call':
      return `called ${amount}`;
    case 'raise':
      return `raised to ${amount}`;
    case 'all_in':
      return `went all in for ${amount}`;
    case 'win':
      return `won ${amount}`;
    case 'fold':
      return 'folded';
    case 'check':
      return 'checked';
    default:
      return ACTION_LABELS[action.type];
  }
}

function actionColor(type: ActionType): string {
  switch (type) {
    case 'fold':
      return 'text-red-300/80';
    case 'bet':
      return 'text-sky-300';
    case 'call':
    case 'raise':
      return 'text-emerald-300';
    case 'all_in':
    case 'win':
      return 'text-chip-gold';
    default:
      return 'text-slate-400';
  }
}
