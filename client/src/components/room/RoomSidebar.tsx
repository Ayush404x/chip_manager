import type { ReactNode } from 'react';
import {
  Coins,
  Crown,
  Eye,
  History,
  Layers,
  LockKeyhole,
  Radio,
  Users,
  Wallet,
} from 'lucide-react';
import type { HandView, RoomState } from '@chiproom/shared';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Feedback';
import { ActionFeed } from './ActionFeed';
import { cn, formatChips } from '../../lib/utils';

export function RoomSidebar({
  state,
  hand,
  onOpenHistory,
}: {
  state: RoomState;
  hand: HandView | null;
  onOpenHistory: () => void;
}) {
  return (
    <aside className="space-y-3">
      {hand ? <PotBreakdown hand={hand} /> : <LobbySnapshot state={state} />}
      <ActionFeed actions={hand?.actions ?? []} limit={12} />
      <TableDetails state={state} onOpenHistory={onOpenHistory} />
    </aside>
  );
}

function PotBreakdown({ hand }: { hand: HandView }) {
  const seatMap = new Map(hand.seats.map((seat) => [seat.playerId, seat]));

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-charcoal-900/60">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <Layers className="h-3.5 w-3.5 text-chip-gold/80" /> Pots
        </div>
        <span className="chip-value text-[11px] font-semibold text-emerald-200">
          {formatChips(hand.totalPot)}
        </span>
      </div>
      <div className="space-y-2 px-3 py-3">
        {hand.pots.length === 0 ? (
          <p className="px-1 py-2 text-center text-[11px] text-slate-600">No chips committed yet.</p>
        ) : (
          hand.pots.map((pot) => {
            const eligible = pot.eligiblePlayerIds
              .map((playerId) => seatMap.get(playerId))
              .filter((seat): seat is NonNullable<typeof seat> => Boolean(seat));
            return (
              <div key={pot.index} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={pot.index === 0 ? 'emerald' : 'gold'}>
                    {pot.index === 0 ? 'Main' : `Side ${pot.index}`}
                  </Badge>
                  <span className="chip-value text-xs font-semibold text-slate-100">
                    {formatChips(pot.amount)}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {eligible.map((seat) => {
                    const amount = pot.distribution?.[seat.playerId];
                    return (
                      <span
                        key={seat.playerId}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px]',
                          amount
                            ? 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200'
                            : seat.folded
                              ? 'border-white/[0.05] text-slate-600 line-through'
                              : 'border-white/10 bg-white/[0.02] text-slate-500',
                        )}
                      >
                        {seat.nickname}
                        {amount ? <span className="chip-value font-semibold">+{formatChips(amount)}</span> : null}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="border-t border-white/[0.06] px-4 py-2 text-[10px] leading-relaxed text-slate-600">
        Layers are built from each player's total contribution. Folded chips stay in the pot but
        folded players cannot win.
      </div>
    </div>
  );
}

function LobbySnapshot({ state }: { state: RoomState }) {
  const seated = state.players.filter(
    (player) => !player.isSpectator && player.status === 'seated',
  );
  const pending = state.players.filter((player) => player.status === 'pending');
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-charcoal-900/60">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <Users className="h-3.5 w-3.5 text-slate-500" /> Players
        </div>
        <span className="text-[10px] text-slate-500">
          {seated.length}/{state.room.settings.maxPlayers} seated
        </span>
      </div>
      <div className="max-h-[340px] space-y-1 overflow-y-auto p-2">
        {state.players.filter((player) => !player.isSpectator).length === 0 ? (
          <p className="px-2 py-4 text-center text-[11px] text-slate-600">No players yet.</p>
        ) : (
          state.players
            .filter((player) => !player.isSpectator)
            .sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99))
            .map((player) => (
              <div key={player.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
                <Avatar name={player.nickname} size="sm" online={player.isConnected} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="truncate text-[11px] font-medium text-slate-200">{player.nickname}</span>
                    {player.isHost ? <Crown className="h-2.5 w-2.5 text-chip-gold/80" /> : null}
                  </div>
                  <div className="text-[9px] text-slate-600">
                    {player.status === 'pending'
                      ? 'Awaiting approval'
                      : player.status === 'sitting_out'
                        ? 'Sitting out'
                        : `Seat ${player.seat ?? '—'} · ${formatChips(player.chips)} chips`}
                  </div>
                </div>
                {player.status === 'pending' ? <Badge variant="amber">Pending</Badge> : null}
              </div>
            ))
        )}
      </div>
      {pending.length > 0 ? (
        <div className="border-t border-white/[0.06] px-4 py-2 text-[10px] text-amber-300/80">
          {pending.length} waiting for the host.
        </div>
      ) : null}
    </div>
  );
}

function TableDetails({ state, onOpenHistory }: { state: RoomState; onOpenHistory: () => void }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-charcoal-900/60">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <Radio className="h-3.5 w-3.5 text-slate-500" /> Table details
        </div>
        <Badge variant="slate">No cards</Badge>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-4 py-3 text-[11px]">
        <Detail icon={<Wallet className="h-3 w-3" />} label="Chips in play" value={formatChips(state.room.totalChips)} />
        <Detail
          icon={<Coins className="h-3 w-3" />}
          label="Blinds"
          value={`${formatChips(state.room.settings.smallBlind)} / ${formatChips(state.room.settings.bigBlind)}`}
        />
        <Detail icon={<Users className="h-3 w-3" />} label="Max seats" value={String(state.room.settings.maxPlayers)} />
        <Detail
          icon={state.room.settings.hasPassword ? <LockKeyhole className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          label="Access"
          value={state.room.settings.hasPassword ? 'Password' : 'Code only'}
        />
      </div>
      <div className="border-t border-white/[0.06] px-4 py-2.5">
        <Button variant="ghost" size="sm" className="w-full justify-start text-[11px]" onClick={onOpenHistory}>
          <History className="h-3.5 w-3.5" /> Open full hand history
        </Button>
      </div>
    </div>
  );
}

function Detail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-[0.1em] text-slate-600">
        {icon}
        {label}
      </div>
      <div className="chip-value mt-0.5 truncate font-medium text-slate-300">{value}</div>
    </div>
  );
}
