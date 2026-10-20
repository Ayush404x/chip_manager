import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleDollarSign,
  Clock3,
  Coins,
  Crown,
  Eye,
  Gauge,
  History,
  KeyRound,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  UserCheck,
  UserMinus,
  Users,
  Wallet,
  WifiOff,
  X,
} from 'lucide-react';
import type { PublicPlayer, RoomState } from '@chiproom/shared';
import { updateSettingsSchema } from '@chiproom/shared';
import { Modal, ConfirmDialog } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input, Label, FieldHint } from '../ui/Input';
import { Switch } from '../ui/Switch';
import { Avatar, EmptyState, Stat } from '../ui/Feedback';
import { useToast } from '../ui/Toast';
import { cn, formatChips, formatSignedChips, timeAgo } from '../../lib/utils';
import type { RunAction } from '../../lib/roomTypes';

type Tab = 'table' | 'players' | 'settings' | 'audit';

const TABS: Array<{ id: Tab; label: string; icon: typeof Gauge }> = [
  { id: 'table', label: 'Table', icon: Gauge },
  { id: 'players', label: 'Players', icon: Users },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal },
  { id: 'audit', label: 'Audit', icon: History },
];

export function HostPanel({
  open,
  onClose,
  state,
  pending,
  run,
  onOpenSettlement,
  onOpenHistory,
}: {
  open: boolean;
  onClose: () => void;
  state: RoomState;
  pending: boolean;
  run: RunAction;
  onOpenSettlement: () => void;
  onOpenHistory: () => void;
}) {
  const [tab, setTab] = useState<Tab>('table');
  const [startOpen, setStartOpen] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');
  const [kickTarget, setKickTarget] = useState<PublicPlayer | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<PublicPlayer | null>(null);

  const code = state.room.code;
  const hand = state.hand;
  const isClosed = state.room.status === 'closed';
  const seated = state.players.filter((player) => !player.isSpectator);
  const eligible = seated.filter(
    (player) => player.status === 'seated' && player.chips > 0,
  );
  const notReady = eligible.filter((player) => !player.isReady);
  const canStart = eligible.length >= 2 && notReady.length === 0;
  const pendingCount = state.players.filter((player) => player.status === 'pending').length;

  useEffect(() => {
    if (open) {
      setTab('table');
      setResetOpen(false);
      setResetConfirm('');
      setKickTarget(null);
      setAdjustTarget(null);
    }
  }, [open]);

  const act = async (event: string, payload: Record<string, unknown>, message?: string) => {
    const response = await run(event, { code, ...payload }, message);
    return response.ok;
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={
          <span className="inline-flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-emerald-300" /> Host controls
          </span>
        }
        description="Run the table, manage seats, adjust settings, and review every chip movement."
        size="xl"
      >
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/[0.06] bg-black/25 p-1">
          {TABS.map((entry) => {
            const Icon = entry.icon;
            const badge =
              entry.id === 'players' && pendingCount > 0 ? pendingCount : undefined;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={cn(
                  'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                  tab === entry.id
                    ? 'bg-white/[0.08] text-white'
                    : 'text-slate-500 hover:bg-white/[0.03] hover:text-slate-300',
                )}
                aria-current={tab === entry.id ? 'page' : undefined}
              >
                <Icon className="h-3.5 w-3.5" />
                {entry.label}
                {badge ? (
                  <span className="rounded-full bg-amber-400/20 px-1.5 text-[9px] font-bold text-amber-200">
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          {tab === 'table' ? (
            <TableTab
              state={state}
              hand={hand}
              pending={pending}
              canStart={canStart}
              notReady={notReady}
              eligibleCount={eligible.length}
              isClosed={isClosed}
              onStart={() => setStartOpen(true)}
              onResume={() => void act('host:resume', {}, 'Table resumed')}
              onPause={() => void act('host:pause', {}, 'Table paused')}
              onOpenSettlement={() => {
                onOpenSettlement();
                onClose();
              }}
              onAdvance={() => setAdvanceOpen(true)}
              onRecover={() => void act('host:recoverHand', {}, 'Hand state recovered')}
              onCloseRoom={() => setCloseOpen(true)}
              onReset={() => setResetOpen(true)}
              onOpenHistory={onOpenHistory}
            />
          ) : null}

          {tab === 'players' ? (
            <PlayersTab
              state={state}
              pending={pending}
              onApprove={(player) =>
                void act('host:approve', { playerId: player.id }, `${player.nickname} approved`)
              }
              onSitOut={(player, sittingOut) =>
                void act(
                  'host:sitOut',
                  { playerId: player.id, sittingOut },
                  sittingOut ? `${player.nickname} is sitting out` : `${player.nickname} is back in`,
                )
              }
              onAdjust={setAdjustTarget}
              onKick={setKickTarget}
            />
          ) : null}

          {tab === 'settings' ? (
            <SettingsTab state={state} pending={pending} run={run} />
          ) : null}

          {tab === 'audit' ? (
            <AuditTab state={state} onOpenHistory={onOpenHistory} />
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={startOpen}
        onClose={() => setStartOpen(false)}
        onConfirm={() => {
          void act('host:startHand', {}, 'Hand started').then((ok) => {
            if (ok) setStartOpen(false);
          });
        }}
        title={hand?.phase === 'complete' ? 'Start the next hand?' : 'Start the first hand?'}
        description="Blinds will post automatically. The dealer button moves one seat clockwise from the previous hand."
        confirmLabel="Post blinds & start"
        isLoading={pending}
      >
        <div className="space-y-2 text-sm text-slate-400">
          <p>Blinds: {formatChips(state.room.settings.smallBlind)} / {formatChips(state.room.settings.bigBlind)}</p>
          <p>{eligible.length} players with chips will be dealt in. No cards are dealt.</p>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={advanceOpen}
        onClose={() => setAdvanceOpen(false)}
        onConfirm={() => {
          void act('host:advanceHand', {}, 'Hand advanced to payout').then((ok) => {
            if (ok) {
              setAdvanceOpen(false);
              onOpenSettlement();
              onClose();
            }
          });
        }}
        title="Force the hand to showdown?"
        description="Use this only when betting cannot continue — for example a stalled table or a disconnected player who cannot act."
        confirmLabel="Advance hand"
        destructive
        isLoading={pending}
      />

      <ConfirmDialog
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        onConfirm={() => {
          void act('host:close', {}, 'Room closed').then((ok) => {
            if (ok) setCloseOpen(false);
          });
        }}
        title="Close this room?"
        description="No more hands can start and new players cannot join. History and final stacks remain available to everyone."
        confirmLabel="Close room"
        destructive
        isLoading={pending}
      />

      <ConfirmDialog
        open={resetOpen}
        onClose={() => {
          setResetOpen(false);
          setResetConfirm('');
        }}
        onConfirm={() => {
          void act('host:reset', { confirmation: resetConfirm }, 'Room reset to starting stacks').then(
            (ok) => {
              if (ok) {
                setResetOpen(false);
                setResetConfirm('');
              }
            },
          );
        }}
        title="Reset the room?"
        description="Every seated player goes back to the starting stack and the room returns to the lobby. Chip history is preserved with an audit entry."
        confirmLabel="Reset room"
        destructive
        isLoading={pending}
      >
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-slate-400">
            This cannot be undone. Type <span className="font-mono font-semibold text-white">{code}</span> to confirm.
          </p>
          <Input
            value={resetConfirm}
            onChange={(event) => setResetConfirm(event.target.value.toUpperCase())}
            placeholder={code}
            aria-label="Type the room code to confirm reset"
          />
        </div>
      </ConfirmDialog>

      <AdjustChipsDialog
        target={adjustTarget}
        onClose={() => setAdjustTarget(null)}
        code={code}
        pending={pending}
        run={run}
        allowRebuys={state.room.settings.allowRebuys}
        handActive={hand?.phase === 'betting' || hand?.phase === 'awaiting_payout'}
      />

      <ConfirmDialog
        open={Boolean(kickTarget)}
        onClose={() => setKickTarget(null)}
        onConfirm={() => {
          if (!kickTarget) return;
          void act('host:kick', { playerId: kickTarget.id }, `${kickTarget.nickname} removed`).then(
            (ok) => {
              if (ok) setKickTarget(null);
            },
          );
        }}
        title={`Remove ${kickTarget?.nickname ?? 'player'}?`}
        description="Their seat will be released and their remaining chips are removed from the room total. This is recorded in the audit log."
        confirmLabel="Remove player"
        destructive
        isLoading={pending}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Table tab                                                           */
/* ------------------------------------------------------------------ */

function TableTab({
  state,
  hand,
  pending,
  canStart,
  notReady,
  eligibleCount,
  isClosed,
  onStart,
  onResume,
  onPause,
  onOpenSettlement,
  onAdvance,
  onRecover,
  onCloseRoom,
  onReset,
  onOpenHistory,
}: {
  state: RoomState;
  hand: RoomState['hand'];
  pending: boolean;
  canStart: boolean;
  notReady: PublicPlayer[];
  eligibleCount: number;
  isClosed: boolean;
  onStart: () => void;
  onResume: () => void;
  onPause: () => void;
  onOpenSettlement: () => void;
  onAdvance: () => void;
  onRecover: () => void;
  onCloseRoom: () => void;
  onReset: () => void;
  onOpenHistory: () => void;
}) {
  const phase = hand?.phase;
  const betting = phase === 'betting';
  const awaiting = phase === 'awaiting_payout';
  const paused = state.room.status === 'paused';
  const live = state.room.status === 'active';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Room"
          value={
            isClosed ? (
              <Badge variant="red">Closed</Badge>
            ) : paused ? (
              <Badge variant="amber" dot>Paused</Badge>
            ) : live ? (
              <Badge variant="emerald" dot>Running</Badge>
            ) : (
              <Badge variant="slate" dot>Lobby</Badge>
            )
          }
        />
        <Stat
          label="Hand"
          value={hand ? `#${hand.handNumber}` : 'None'}
          hint={hand ? hand.phase.replace('_', ' ') : 'Waiting to start'}
        />
        <Stat label="Pot" value={formatChips(hand?.totalPot ?? 0)} hint={`${hand?.pots.length ?? 0} pots`} />
        <Stat
          label="Chips in play"
          value={formatChips(state.room.totalChips)}
          hint={`${eligibleCount} with chips`}
        />
      </div>

      {isClosed ? (
        <Panel tone="red" icon={<ShieldAlert className="h-4 w-4" />} title="This room is closed">
          <p className="text-xs leading-relaxed text-slate-400">
            Final stacks are frozen and history remains available. Create a new room to keep playing.
          </p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={onOpenHistory}>
            <History className="h-3.5 w-3.5" /> View history
          </Button>
        </Panel>
      ) : awaiting ? (
        <Panel tone="amber" icon={<Trophy className="h-4 w-4" />} title="Select the winners">
          <p className="text-xs leading-relaxed text-slate-400">
            Betting is closed. Choose one or more eligible winners for each of the{' '}
            {hand?.pots.length ?? 0} pots, preview the split, then pay out.
          </p>
          <Button className="mt-3" onClick={onOpenSettlement} disabled={pending}>
            <Coins className="h-4 w-4" /> Settle {formatChips(hand?.totalPot ?? 0)} chips
          </Button>
        </Panel>
      ) : betting ? (
        <Panel tone="emerald" icon={<Play className="h-4 w-4" />} title={`Hand #${hand?.handNumber} in progress`}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
            <span>{hand?.street === 'preflop' ? 'Pre-flop' : hand?.street}</span>
            <span>Current bet {formatChips(hand?.currentBet ?? 0)}</span>
            <span>
              {hand?.turnSeat
                ? `${hand.seats.find((seat) => seat.seat === hand.turnSeat)?.nickname ?? 'Player'} to act`
                : 'No player to act'}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={onRecover} disabled={pending}>
              <RefreshCw className="h-3.5 w-3.5" /> Recover turn
            </Button>
            <Button size="sm" variant="secondary" onClick={onAdvance} disabled={pending}>
              <ArrowRight className="h-3.5 w-3.5" /> Force showdown
            </Button>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
            Recover is safe: it only repairs a stalled or invalid turn. Force showdown skips the rest
            of betting and opens host settlement.
          </p>
        </Panel>
      ) : (
        <Panel tone="slate" icon={<Sparkles className="h-4 w-4" />} title={phase === 'complete' ? 'Between hands' : 'Ready to start'}>
          <p className="text-xs leading-relaxed text-slate-400">
            {phase === 'complete'
              ? 'The previous pot has been paid. Start the next hand when the table is ready; the button moves clockwise.'
              : 'Seat at least two players with chips and have everyone ready. Blinds post automatically.'}
          </p>
          {!canStart ? (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-300/90">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {eligibleCount < 2
                ? 'At least two seated players with chips are needed.'
                : `Waiting for ${notReady.map((player) => player.nickname).join(', ')} to ready up.`}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={onStart} disabled={pending || !canStart || paused}>
              <Play className="h-3.5 w-3.5" /> {phase === 'complete' ? 'Start next hand' : 'Start hand'}
            </Button>
            {paused ? (
              <Button size="sm" variant="secondary" onClick={onResume} disabled={pending}>
                <Play className="h-3.5 w-3.5" /> Resume table
              </Button>
            ) : null}
          </div>
        </Panel>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Clock3 className="h-3.5 w-3.5 text-slate-500" /> Table flow
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Pause stops every bet without folding anyone. Resume returns control to the player whose
            turn it is.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {live ? (
              <Button size="sm" variant="secondary" onClick={onPause} disabled={pending || awaiting} isLoading={pending}>
                <Pause className="h-3.5 w-3.5" /> Pause table
              </Button>
            ) : paused ? (
              <Button size="sm" onClick={onResume} disabled={pending} isLoading={pending}>
                <Play className="h-3.5 w-3.5" /> Resume table
              </Button>
            ) : (
              <span className="text-[11px] text-slate-600">Available once the room is running.</span>
            )}
            <Button size="sm" variant="ghost" onClick={onOpenHistory}>
              <History className="h-3.5 w-3.5" /> History
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-red-400/15 bg-red-400/[0.025] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-red-200/90">
            <ShieldAlert className="h-3.5 w-3.5" /> Dangerous controls
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Close freezes the room. Reset returns every stack to {formatChips(state.room.settings.startingChips)}
            {' '}and reopens the lobby. Both are blocked during an active hand.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="border border-red-400/20 text-red-200/80 hover:bg-red-400/[0.08] hover:text-red-100"
              onClick={onReset}
              disabled={pending || betting || awaiting}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset room
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="border border-red-400/20 text-red-200/80 hover:bg-red-400/[0.08] hover:text-red-100"
              onClick={onCloseRoom}
              disabled={pending || isClosed || betting || awaiting}
            >
              <X className="h-3.5 w-3.5" /> Close room
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[11px] leading-relaxed text-slate-500">
        <span className="font-medium text-slate-300">Chip conservation:</span> every payout is
        checked server-side against the room total. Player stacks plus committed chips must equal{' '}
        <span className="chip-value text-slate-300">{formatChips(state.room.totalChips)}</span> at
        all times.
      </div>
    </div>
  );
}

function Panel({
  tone,
  icon,
  title,
  children,
}: {
  tone: 'emerald' | 'amber' | 'slate' | 'red';
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  const tones = {
    emerald: 'border-emerald-400/20 bg-emerald-400/[0.04] text-emerald-200',
    amber: 'border-amber-300/20 bg-amber-300/[0.04] text-amber-200',
    slate: 'border-white/[0.08] bg-white/[0.025] text-slate-200',
    red: 'border-red-400/20 bg-red-400/[0.04] text-red-200',
  } as const;
  return (
    <div className={cn('rounded-2xl border p-4', tones[tone])}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Players tab                                                         */
/* ------------------------------------------------------------------ */

function PlayersTab({
  state,
  pending,
  onApprove,
  onSitOut,
  onAdjust,
  onKick,
}: {
  state: RoomState;
  pending: boolean;
  onApprove: (player: PublicPlayer) => void;
  onSitOut: (player: PublicPlayer, sittingOut: boolean) => void;
  onAdjust: (player: PublicPlayer) => void;
  onKick: (player: PublicPlayer) => void;
}) {
  const pendingPlayers = state.players.filter((player) => player.status === 'pending');
  const seated = state.players
    .filter((player) => !player.isSpectator && player.status !== 'pending')
    .sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99));
  const spectators = state.players.filter((player) => player.isSpectator);
  const betting = state.hand?.phase === 'betting' || state.hand?.phase === 'awaiting_payout';

  return (
    <div className="space-y-4">
      {pendingPlayers.length > 0 ? (
        <section>
          <SectionTitle icon={<UserCheck className="h-3.5 w-3.5" />} title={`Waiting for approval (${pendingPlayers.length})`} />
          <div className="mt-2 space-y-2">
            {pendingPlayers.map((player) => (
              <div key={player.id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.04] px-3 py-2.5">
                <PlayerIdentity player={player} />
                <div className="flex shrink-0 gap-1.5">
                  <Button size="sm" onClick={() => onApprove(player)} disabled={pending}>
                    <Check className="h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onKick(player)} disabled={pending}>
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionTitle
          icon={<Users className="h-3.5 w-3.5" />}
          title={`Seated players (${seated.length}/${state.room.settings.maxPlayers})`}
        />
        <div className="mt-2 space-y-1.5">
          {seated.length === 0 ? (
            <EmptyState title="No seated players" description="Approve arrivals or share the invite link." />
          ) : (
            seated.map((player) => (
              <div
                key={player.id}
                className="flex flex-col gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-6 shrink-0 text-center font-mono text-[10px] text-slate-600">
                    {player.seat ?? '—'}
                  </span>
                  <PlayerIdentity player={player} showChips />
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 pl-9 sm:pl-0">
                  <Badge variant={player.status === 'sitting_out' ? 'amber' : 'emerald'}>
                    {player.status === 'sitting_out' ? 'Sitting out' : 'Seated'}
                  </Badge>
                  {player.isHost ? <Badge variant="gold">Host</Badge> : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onAdjust(player)}
                    disabled={pending}
                    title="Adjust this player's chips"
                  >
                    <Wallet className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">Chips</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onSitOut(player, player.status !== 'sitting_out')}
                    disabled={pending}
                  >
                    {player.status === 'sitting_out' ? (
                      <>
                        <Play className="h-3.5 w-3.5" />
                        <span className="hidden lg:inline">Seat in</span>
                      </>
                    ) : (
                      <>
                        <Pause className="h-3.5 w-3.5" />
                        <span className="hidden lg:inline">Sit out</span>
                      </>
                    )}
                  </Button>
                  {!player.isHost ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-300/80 hover:bg-red-400/[0.08] hover:text-red-200"
                      onClick={() => onKick(player)}
                      disabled={pending || betting}
                      title={betting ? 'Finish the hand before removing a player' : 'Remove player'}
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                      <span className="hidden lg:inline">Remove</span>
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {spectators.length > 0 ? (
        <section>
          <SectionTitle icon={<Eye className="h-3.5 w-3.5" />} title={`Spectators (${spectators.length})`} />
          <div className="mt-2 space-y-1.5">
            {spectators.map((player) => (
              <div key={player.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <PlayerIdentity player={player} />
                <Button size="sm" variant="ghost" onClick={() => onKick(player)} disabled={pending}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 text-[11px] leading-relaxed text-slate-500">
        <CircleDollarSign className="mt-0.5 h-3.5 w-3.5 shrink-0 text-chip-gold/70" />
        Chip adjustments are only allowed between hands and require a reason. Every adjustment is
        recorded with the amount, host, reason and timestamp.
      </div>
    </div>
  );
}

function PlayerIdentity({ player, showChips }: { player: PublicPlayer; showChips?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar name={player.nickname} size="sm" online={player.isConnected} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs font-semibold text-slate-100">{player.nickname}</span>
          {player.isHost ? <Crown className="h-2.5 w-2.5 shrink-0 text-chip-gold/80" /> : null}
          {!player.isConnected ? <WifiOff className="h-2.5 w-2.5 shrink-0 text-red-300/70" /> : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-slate-500">
          {showChips ? (
            <span className="chip-value">
              {formatChips(player.chips)} chips
            </span>
          ) : null}
          <span>Joined {timeAgo(player.joinedAt)}</span>
          {player.handStatus ? <span className="text-slate-600">{player.handStatus.replace('_', ' ')}</span> : null}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Settings tab                                                        */
/* ------------------------------------------------------------------ */

function SettingsTab({
  state,
  pending,
  run,
}: {
  state: RoomState;
  pending: boolean;
  run: RunAction;
}) {
  const toast = useToast();
  const settings = state.room.settings;
  const [roomName, setRoomName] = useState(state.room.name);
  const [startingChips, setStartingChips] = useState(settings.startingChips);
  const [smallBlind, setSmallBlind] = useState(settings.smallBlind);
  const [bigBlind, setBigBlind] = useState(settings.bigBlind);
  const [maxPlayers, setMaxPlayers] = useState(settings.maxPlayers);
  const [spectatorMode, setSpectatorMode] = useState(settings.spectatorMode);
  const [lateJoin, setLateJoin] = useState(settings.lateJoin);
  const [allowRebuys, setAllowRebuys] = useState(settings.allowRebuys);
  const [requireApproval, setRequireApproval] = useState(settings.requireApproval);
  const [passwordAction, setPasswordAction] = useState<'keep' | 'change' | 'remove'>('keep');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const structural =
    startingChips !== settings.startingChips ||
    smallBlind !== settings.smallBlind ||
    bigBlind !== settings.bigBlind;
  const handActive = state.hand?.phase === 'betting' || state.hand?.phase === 'awaiting_payout';

  const save = async () => {
    setErrors({});
    const payload = {
      roomName,
      startingChips,
      smallBlind,
      bigBlind,
      maxPlayers,
      spectatorMode,
      lateJoin,
      allowRebuys,
      requireApproval,
      ...(passwordAction === 'change' ? { password } : {}),
      ...(passwordAction === 'remove' ? { password: null } : {}),
    };
    const parsed = updateSettingsSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]?.toString() ?? 'form';
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      toast.error('Check the settings', 'A few fields need attention.');
      return;
    }
    if (passwordAction === 'change' && password.trim().length < 4) {
      setErrors({ password: 'Password must be at least 4 characters' });
      return;
    }
    const response = await run('host:settings', { code: state.room.code, settings: parsed.data }, 'Settings saved');
    if (response.ok) {
      setPasswordAction('keep');
      setPassword('');
    }
  };

  const numberValue = (value: string) => {
    const parsed = Number.parseInt(value.replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return (
    <div className="space-y-4">
      {handActive ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-4 py-3 text-[11px] leading-relaxed text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Blinds, stacks and seat count cannot change during an active hand. Other settings can be
          changed now.
        </div>
      ) : null}

      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
        <SectionTitle icon={<SlidersHorizontal className="h-3.5 w-3.5" />} title="Table" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="host-room-name">Room name</Label>
            <Input id="host-room-name" value={roomName} maxLength={60} onChange={(event) => setRoomName(event.target.value)} />
            {errors.roomName ? <p className="mt-1 text-[11px] text-red-300">{errors.roomName}</p> : null}
          </div>
          <div>
            <Label htmlFor="host-max-players">Max players</Label>
            <div className="flex items-center gap-3">
              <input
                id="host-max-players"
                type="range"
                min={2}
                max={10}
                step={1}
                value={maxPlayers}
                onChange={(event) => setMaxPlayers(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-emerald-400"
              />
              <span className="chip-value w-6 text-right text-xs font-semibold text-white">{maxPlayers}</span>
            </div>
            {errors.maxPlayers ? <p className="mt-1 text-[11px] text-red-300">{errors.maxPlayers}</p> : null}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
        <SectionTitle icon={<Coins className="h-3.5 w-3.5" />} title="Stacks & blinds" />
        <p className="mt-1 text-[11px] text-slate-500">
          Starting chips apply to new arrivals and future resets. Current stacks are not changed.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="host-starting">Starting chips</Label>
            <Input
              id="host-starting"
              inputMode="numeric"
              value={startingChips}
              onChange={(event) => setStartingChips(numberValue(event.target.value))}
              className="chip-value"
            />
            {errors.startingChips ? <p className="mt-1 text-[11px] text-red-300">{errors.startingChips}</p> : null}
          </div>
          <div>
            <Label htmlFor="host-sb">Small blind</Label>
            <Input
              id="host-sb"
              inputMode="numeric"
              value={smallBlind}
              onChange={(event) => setSmallBlind(numberValue(event.target.value))}
              className="chip-value"
            />
            {errors.smallBlind ? <p className="mt-1 text-[11px] text-red-300">{errors.smallBlind}</p> : null}
          </div>
          <div>
            <Label htmlFor="host-bb">Big blind</Label>
            <Input
              id="host-bb"
              inputMode="numeric"
              value={bigBlind}
              onChange={(event) => setBigBlind(numberValue(event.target.value))}
              className="chip-value"
            />
            {errors.bigBlind ? <p className="mt-1 text-[11px] text-red-300">{errors.bigBlind}</p> : null}
          </div>
        </div>
        {structural && handActive ? (
          <p className="mt-2 text-[11px] text-amber-300/90">These changes will be rejected until the hand is settled.</p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
        <SectionTitle icon={<KeyRound className="h-3.5 w-3.5" />} title="Access" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant={settings.hasPassword || passwordAction === 'change' ? 'emerald' : 'slate'}>
            {passwordAction === 'remove'
              ? 'Password will be removed'
              : settings.hasPassword || passwordAction === 'change'
                ? 'Password protected'
                : 'No password'}
          </Badge>
          {settings.hasPassword && passwordAction !== 'remove' ? (
            <Button size="sm" variant="ghost" onClick={() => setPasswordAction('remove')} disabled={pending}>
              Remove password
            </Button>
          ) : null}
          {passwordAction === 'remove' ? (
            <Button size="sm" variant="ghost" onClick={() => setPasswordAction('keep')} disabled={pending}>
              Keep password
            </Button>
          ) : passwordAction === 'keep' ? (
            <Button size="sm" variant="ghost" onClick={() => setPasswordAction('change')} disabled={pending}>
              {settings.hasPassword ? 'Change password' : 'Set password'}
            </Button>
          ) : null}
        </div>
        {passwordAction === 'change' ? (
          <div className="mt-3 max-w-sm">
            <Label htmlFor="host-password">New password</Label>
            <Input
              id="host-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 4 characters"
              autoComplete="new-password"
            />
            {errors.password ? <p className="mt-1 text-[11px] text-red-300">{errors.password}</p> : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
        <SectionTitle icon={<ShieldAlert className="h-3.5 w-3.5" />} title="House rules" />
        <div className="mt-1 divide-y divide-white/[0.06]">
          <Switch
            id="host-spectators"
            checked={spectatorMode}
            onCheckedChange={setSpectatorMode}
            label="Allow spectators"
            description="Friends can watch without a seat or chips."
          />
          <Switch
            id="host-late-join"
            checked={lateJoin}
            onCheckedChange={setLateJoin}
            label="Allow late joining"
            description="New players can take an open seat after the first hand."
          />
          <Switch
            id="host-rebuys"
            checked={allowRebuys}
            onCheckedChange={setAllowRebuys}
            label="Allow rebuys and top-ups"
            description="The host can add chips between hands with an audit entry."
          />
          <Switch
            id="host-approval"
            checked={requireApproval}
            onCheckedChange={setRequireApproval}
            label="Require host approval"
            description="New arrivals wait until you approve them."
          />
        </div>
      </section>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.03] px-4 py-3">
        <div className="text-[11px] leading-relaxed text-slate-500">
          Changes are broadcast to every player immediately.
        </div>
        <Button onClick={() => void save()} isLoading={pending} disabled={pending}>
          <Save className="h-4 w-4" /> Save settings
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Audit tab                                                           */
/* ------------------------------------------------------------------ */

function AuditTab({
  state,
  onOpenHistory,
}: {
  state: RoomState;
  onOpenHistory: () => void;
}) {
  const adjustments = state.adjustments ?? [];
  const added = adjustments.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0);
  const removed = adjustments.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Entries" value={adjustments.length} />
        <Stat label="Chips added" value={<span className="text-emerald-300">{formatChips(added)}</span>} />
        <Stat label="Chips removed" value={<span className="text-red-300">{formatChips(Math.abs(removed))}</span>} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <SectionTitle icon={<History className="h-3.5 w-3.5" />} title="Chip adjustment ledger" />
        <Button size="sm" variant="ghost" onClick={onOpenHistory}>
          Hand history <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {adjustments.length === 0 ? (
        <EmptyState
          icon={<History className="h-6 w-6" />}
          title="No chip adjustments yet"
          description="Buy-ins, rebuys, removals and resets will appear here with a reason and timestamp."
        />
      ) : (
        <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
          {adjustments.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <Wallet className="h-3 w-3 text-slate-500" />
                  {entry.nickname}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">{entry.reason}</div>
                <div className="mt-0.5 text-[10px] text-slate-600">
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

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[11px] leading-relaxed text-slate-500">
        The ledger is append-only. Removing these entries is not possible from the UI, so every chip
        that entered or left the room remains traceable.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Adjust chips dialog                                                 */
/* ------------------------------------------------------------------ */

function AdjustChipsDialog({
  target,
  onClose,
  code,
  pending,
  run,
  allowRebuys,
  handActive,
}: {
  target: PublicPlayer | null;
  onClose: () => void;
  code: string;
  pending: boolean;
  run: RunAction;
  allowRebuys: boolean;
  handActive: boolean;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (target) {
      setAmount(0);
      setReason('');
    }
    // Reset when a different player is selected, not when their stack updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id]);

  const resulting = (target?.chips ?? 0) + amount;
  const valid = amount !== 0 && Number.isInteger(amount) && resulting >= 0 && reason.trim().length >= 3;

  const submit = async () => {
    if (!target) return;
    if (!valid) {
      toast.error('Check the adjustment', 'Enter a non-zero whole amount and a reason.');
      return;
    }
    if (amount > 0 && !allowRebuys) {
      toast.error('Rebuys are disabled', 'Enable rebuys in settings or use a negative adjustment.');
      return;
    }
    const response = await run(
      'host:adjustChips',
      { code, playerId: target.id, amount, reason: reason.trim() },
      `${target.nickname}: ${formatSignedChips(amount)} chips`,
    );
    if (response.ok) onClose();
  };

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={`Adjust ${target?.nickname ?? 'player'}'s chips`}
      description="Chip adjustments are host-authorized and written to the audit ledger."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} isLoading={pending} disabled={!valid || handActive}>
            Apply adjustment
          </Button>
        </>
      }
    >
      {handActive ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-3.5 py-2.5 text-[11px] text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Finish and settle the current hand before adjusting chips.
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-2 py-2">
            <div className="text-[9px] uppercase tracking-[0.12em] text-slate-600">Current</div>
            <div className="chip-value mt-0.5 text-sm font-semibold text-white">{formatChips(target?.chips ?? 0)}</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-2 py-2">
            <div className="text-[9px] uppercase tracking-[0.12em] text-slate-600">Change</div>
            <div
              className={cn(
                'chip-value mt-0.5 text-sm font-semibold',
                amount > 0 ? 'text-emerald-300' : amount < 0 ? 'text-red-300' : 'text-slate-400',
              )}
            >
              {formatSignedChips(amount)}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-2 py-2">
            <div className="text-[9px] uppercase tracking-[0.12em] text-slate-600">Result</div>
            <div className={cn('chip-value mt-0.5 text-sm font-semibold', resulting < 0 ? 'text-red-300' : 'text-white')}>
              {formatChips(resulting)}
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="adjust-amount">Amount</Label>
          <div className="flex items-center gap-2">
            <Input
              id="adjust-amount"
              inputMode="numeric"
              value={amount === 0 ? '' : amount}
              placeholder="e.g. 1000 or -500"
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value.replace(/[^0-9-]/g, ''), 10);
                setAmount(Number.isFinite(parsed) ? parsed : 0);
              }}
              className="chip-value"
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[100, 500, 1000, 5000].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAmount(value)}
                className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] px-2 py-1 text-[10px] font-medium text-emerald-200 transition-colors hover:bg-emerald-400/[0.1]"
              >
                <Plus className="mr-0.5 inline h-2.5 w-2.5" />
                {formatChips(value)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAmount(-(target?.chips ?? 0))}
              className="rounded-lg border border-red-400/20 bg-red-400/[0.05] px-2 py-1 text-[10px] font-medium text-red-200 transition-colors hover:bg-red-400/[0.1]"
            >
              Zero out
            </button>
          </div>
        </div>

        <div>
          <Label htmlFor="adjust-reason">Reason</Label>
          <Input
            id="adjust-reason"
            value={reason}
            maxLength={120}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Rebuy, correction, removed chips…"
          />
          <FieldHint>At least 3 characters. This appears in the audit log.</FieldHint>
        </div>

        {!allowRebuys ? (
          <p className="text-[11px] text-amber-300/80">Rebuys are disabled for this room; only negative adjustments are allowed.</p>
        ) : null}
      </div>
    </Modal>
  );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
      {icon}
      {title}
    </div>
  );
}
