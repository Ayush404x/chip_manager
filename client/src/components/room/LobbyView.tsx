import type { ReactElement } from 'react';
import {
  ArrowRight,
  Check,
  Clock3,
  Coins,
  Copy,
  Crown,
  Eye,
  Hourglass,
  Link2,
  LockKeyhole,
  Play,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  Wallet,
  WifiOff,
  X,
} from 'lucide-react';
import type { PublicPlayer, RoomState } from '@chiproom/shared';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Avatar, EmptyState } from '../ui/Feedback';
import { Tooltip } from '../ui/Tooltip';
import { useToast } from '../ui/Toast';
import { cn, formatChips, timeAgo } from '../../lib/utils';
import type { RunAction } from '../../lib/roomTypes';

export function LobbyView({
  state,
  pending,
  run,
  onOpenInvite,
  onOpenHost,
  onOpenHistory,
}: {
  state: RoomState;
  pending: boolean;
  run: RunAction;
  onOpenInvite: () => void;
  onOpenHost: () => void;
  onOpenHistory: () => void;
}) {
  const toast = useToast();
  const code = state.room.code;
  const isHost = state.me?.isHost ?? false;
  const me = state.me;
  const isClosed = state.room.status === 'closed';
  const seated = state.players.filter(
    (player) => !player.isSpectator && player.status === 'seated',
  );
  const sittingOut = state.players.filter(
    (player) => !player.isSpectator && player.status === 'sitting_out',
  );
  const pendingPlayers = state.players.filter((player) => player.status === 'pending');
  const spectators = state.players.filter((player) => player.isSpectator);
  const eligible = seated.filter((player) => player.chips > 0);
  const notReady = eligible.filter((player) => !player.isReady);
  const canStart = eligible.length >= 2 && notReady.length === 0;

  const start = async () => {
    const response = await run('host:startHand', { code }, 'Hand started — good luck');
    if (!response.ok) return;
  };

  const toggleReady = async () => {
    if (!me) return;
    await run(
      'room:ready',
      { code, ready: !me.isReady },
      me.isReady ? 'Marked as not ready' : 'Ready for the next hand',
    );
  };

  const approve = async (player: PublicPlayer) => {
    await run('host:approve', { code, playerId: player.id }, `${player.nickname} approved`);
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Room code copied', code);
    } catch {
      toast.error('Could not copy', 'Select the code and copy it manually.');
    }
  };

  return (
    <div className="animate-fade-up">
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-charcoal-800/80 via-charcoal-850 to-charcoal-900/90 p-5 shadow-panel sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-emerald-400/[0.08] blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={isClosed ? 'red' : state.room.status === 'paused' ? 'amber' : 'emerald'}
                dot
              >
                {isClosed ? 'Room closed' : state.room.status === 'paused' ? 'Table paused' : 'Room open'}
              </Badge>
              <span className="text-[11px] uppercase tracking-[0.14em] text-slate-600">
                {state.hand?.phase === 'complete'
                  ? `Hand #${state.hand.handNumber} complete`
                  : 'Waiting to begin'}
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-white sm:text-[2rem]">
              {state.hand?.phase === 'complete' ? 'Ready for the next hand?' : 'Your table is set.'}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
              {state.hand?.phase === 'complete'
                ? 'The last pot is paid. Everyone keeps their stack, the button moves, and blinds post again when the host starts.'
                : 'Seats fill from the lobby. When everyone is ready, the host starts the first hand and blinds post automatically.'}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {!isClosed && isHost ? (
                <Tooltip
                  content={
                    canStart
                      ? 'Post blinds and open pre-flop betting.'
                      : eligible.length < 2
                        ? 'At least two seated players with chips are needed.'
                        : `Waiting for ${notReady.map((player) => player.nickname).join(', ')} to ready up.`
                  }
                >
                  <span>
                    <Button
                      onClick={() => void start()}
                      isLoading={pending}
                      disabled={!canStart || state.room.status === 'paused'}
                    >
                      <Play className="h-4 w-4" />
                      {state.hand?.phase === 'complete' ? 'Start next hand' : 'Start first hand'}
                    </Button>
                  </span>
                </Tooltip>
              ) : null}
              {!isClosed && !isHost && me && !me.isSpectator && me.status === 'seated' ? (
                <Button
                  variant={me.isReady ? 'secondary' : 'primary'}
                  onClick={() => void toggleReady()}
                  isLoading={pending}
                >
                  {me.isReady ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  {me.isReady ? 'Not ready' : 'Ready up'}
                </Button>
              ) : null}
              {!isClosed ? (
                <Button variant="secondary" onClick={onOpenInvite}>
                  <Link2 className="h-4 w-4" /> Invite players
                </Button>
              ) : null}
              {isHost ? (
                <Button variant="ghost" onClick={onOpenHost}>
                  <Settings2 className="h-4 w-4" /> Host settings
                </Button>
              ) : null}
              <Button variant="ghost" onClick={onOpenHistory}>
                Last hands
              </Button>
            </div>
          </div>

          <div className="w-full shrink-0 rounded-2xl border border-white/[0.08] bg-black/25 p-4 lg:w-[290px]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Share this room
              </span>
              <button
                type="button"
                onClick={() => void copyCode()}
                className="rounded-md p-1 text-slate-500 transition-colors hover:text-white"
                aria-label="Copy room code"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => void copyCode()}
              className="chip-value mt-2 w-full rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] py-3 text-center text-3xl font-semibold tracking-[0.28em] text-white transition-colors hover:border-emerald-400/40"
            >
              {code}
            </button>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <MiniStat label="Seated" value={`${seated.length}/${state.room.settings.maxPlayers}`} />
              <MiniStat label="Chips in play" value={formatChips(state.room.totalChips)} />
            </div>
            <div className="mt-3 flex items-center justify-center gap-3 text-[10px] text-slate-600">
              <span className="inline-flex items-center gap-1">
                <LockKeyhole className="h-3 w-3" />
                {state.room.settings.hasPassword ? 'Password' : 'Private code'}
              </span>
              <span className="inline-flex items-center gap-1">
                {state.room.settings.lateJoin ? <Hourglass className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
                {state.room.settings.lateJoin ? 'Late join on' : 'No late join'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {state.room.status === 'paused' ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-4 py-3 text-xs text-amber-200">
          <Clock3 className="h-4 w-4 shrink-0" />
          The host has paused the table. {isHost ? 'Resume from the host panel to start the next hand.' : 'Betting will unlock when play resumes.'}
        </div>
      ) : null}

      {pendingPlayers.length > 0 ? (
        <section className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[0.04] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
            <UserCheck className="h-4 w-4" />
            {pendingPlayers.length} {pendingPlayers.length === 1 ? 'player is' : 'players are'} waiting for approval
          </div>
          <div className="mt-3 space-y-2">
            {pendingPlayers.map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={player.nickname} size="sm" online={player.isConnected} />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-slate-100">{player.nickname}</div>
                    <div className="text-[10px] text-slate-500">Requested {timeAgo(player.joinedAt)}</div>
                  </div>
                </div>
                {isHost ? (
                  <Button size="sm" onClick={() => void approve(player)} isLoading={pending}>
                    <Check className="h-3.5 w-3.5" /> Approve
                  </Button>
                ) : (
                  <Badge variant="amber">Waiting</Badge>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {me?.status === 'pending' ? (
        <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-4 py-3 text-xs text-amber-200">
          You are in the waiting room. The host needs to approve your seat before you receive chips.
        </div>
      ) : null}

      {me?.isSpectator ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-sky-400/20 bg-sky-400/[0.05] px-4 py-3 text-xs text-sky-200">
          <Eye className="h-4 w-4 shrink-0" /> You are watching as a spectator. The table updates live, but you cannot take a seat or bet.
        </div>
      ) : null}

      <section className="mt-5">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">The table</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              One seat per player. Empty seats stay open until the room fills.
            </p>
          </div>
          <span className="text-[10px] uppercase tracking-[0.14em] text-slate-600">
            {seated.length} ready to play · {sittingOut.length} sitting out
          </span>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: state.room.settings.maxPlayers }, (_, index) => index + 1).map((seatNumber) => {
            const player = state.players.find(
              (entry) => !entry.isSpectator && entry.seat === seatNumber,
            );
            return (
              <SeatTile
                key={seatNumber}
                seatNumber={seatNumber}
                player={player}
                isMe={player?.id === me?.id}
                onInvite={onOpenInvite}
              />
            );
          })}
        </div>
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="surface p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-300/80" />
            <h3 className="text-sm font-semibold text-white">House rules</h3>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Rule icon={<Coins />} label="Starting stack" value={formatChips(state.room.settings.startingChips)} />
            <Rule
              icon={<Sparkles />}
              label="Blinds"
              value={`${formatChips(state.room.settings.smallBlind)} / ${formatChips(state.room.settings.bigBlind)}`}
            />
            <Rule icon={<Users />} label="Seats" value={`${state.room.settings.maxPlayers} max`} />
            <Rule
              icon={<UserCheck />}
              label="Approval"
              value={state.room.settings.requireApproval ? 'Host approves' : 'Automatic'}
            />
            <Rule
              icon={<Wallet />}
              label="Rebuys"
              value={state.room.settings.allowRebuys ? 'Allowed by host' : 'Off'}
            />
            <Rule
              icon={<Eye />}
              label="Spectators"
              value={state.room.settings.spectatorMode ? 'Allowed' : 'Not allowed'}
            />
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 text-[11px] leading-relaxed text-slate-500">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/70" />
            Chips are virtual and have no cash value. There are no cards or hand rankings — the host
            selects each pot's winner when betting ends.
          </div>
        </section>

        <section className="surface p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-chip-gold" />
            <h3 className="text-sm font-semibold text-white">How the first hand runs</h3>
          </div>
          <ol className="mt-4 space-y-3">
            {[
              ['Ready up', 'Every seated player taps Ready. The host can then start the hand.'],
              ['Blinds post', 'The button rotates, small and big blinds are deducted, and pre-flop opens.'],
              ['Bet, then settle', 'Players act clockwise. At the end the host picks winners and the pot is split.'],
            ].map(([title, body], index) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] font-mono text-[10px] text-emerald-300">
                  {index + 1}
                </span>
                <div>
                  <div className="text-xs font-semibold text-slate-200">{title}</div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{body}</div>
                </div>
              </li>
            ))}
          </ol>
          {!isHost ? (
            <p className="mt-4 text-[11px] text-slate-600">
              The host is the only one who can start hands and settle pots.
            </p>
          ) : null}
        </section>
      </div>

      {spectators.length > 0 ? (
        <section className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            <Eye className="h-3 w-3" /> Spectators
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {spectators.map((spectator) => (
              <span
                key={spectator.id}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px]',
                  spectator.isConnected
                    ? 'border-white/10 bg-white/[0.03] text-slate-400'
                    : 'border-red-400/15 text-red-300/60',
                )}
              >
                {!spectator.isConnected ? <WifiOff className="h-2.5 w-2.5" /> : null}
                {spectator.nickname}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {seated.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No one has taken a seat yet"
            description="Share the room code or invite link to get your table together."
            action={
              <Button onClick={onOpenInvite}>
                <Link2 className="h-4 w-4" /> Invite players
              </Button>
            }
          />
        </div>
      ) : null}
    </div>
  );
}

function SeatTile({
  seatNumber,
  player,
  isMe,
  onInvite,
}: {
  seatNumber: number;
  player: PublicPlayer | undefined;
  isMe: boolean;
  onInvite: () => void;
}) {
  if (!player) {
    return (
      <button
        type="button"
        onClick={onInvite}
        className="group flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/[0.09] bg-white/[0.01] px-3 py-4 text-center transition-colors hover:border-emerald-400/30 hover:bg-emerald-400/[0.03]"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-slate-600 transition-colors group-hover:text-emerald-300">
          <ArrowRight className="h-3.5 w-3.5 -rotate-45" />
        </span>
        <span className="text-[11px] text-slate-600">Seat {seatNumber} · open</span>
        <span className="text-[10px] text-emerald-400/0 transition-colors group-hover:text-emerald-400/70">
          Invite someone
        </span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        'relative flex min-h-[92px] items-center gap-3 rounded-2xl border px-3.5 py-3',
        isMe
          ? 'border-emerald-400/35 bg-emerald-400/[0.05]'
          : 'border-white/[0.08] bg-charcoal-850/70',
      )}
    >
      <span className="absolute right-2.5 top-2 text-[9px] font-mono text-slate-700">
        #{seatNumber}
      </span>
      <Avatar name={player.nickname} size="md" online={player.isConnected} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-semibold text-slate-100">{player.nickname}</span>
          {player.isHost ? <Crown className="h-3 w-3 shrink-0 text-chip-gold/80" /> : null}
          {isMe ? <span className="text-[9px] font-medium text-emerald-400">you</span> : null}
        </div>
        <div className="chip-value mt-0.5 text-[11px] text-slate-400">
          {formatChips(player.chips)} <span className="text-[9px] text-slate-600">chips</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {player.status === 'sitting_out' ? (
            <Badge variant="amber">Sitting out</Badge>
          ) : player.isReady ? (
            <Badge variant="emerald">Ready</Badge>
          ) : (
            <Badge variant="slate">Not ready</Badge>
          )}
          {!player.isConnected ? <Badge variant="red">Offline</Badge> : null}
          {player.chips === 0 ? <Badge variant="gold">Out of chips</Badge> : null}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
      <div className="text-[8px] uppercase tracking-[0.14em] text-slate-600">{label}</div>
      <div className="chip-value mt-0.5 truncate text-[11px] font-semibold text-slate-200">{value}</div>
    </div>
  );
}

function Rule({
  icon,
  label,
  value,
}: {
  icon: ReactElement;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-slate-600">
        <span className="text-slate-500 [&>svg]:h-3 [&>svg]:w-3">{icon}</span>
        {label}
      </div>
      <div className="chip-value mt-1 text-[11px] font-semibold text-slate-200">{value}</div>
    </div>
  );
}
