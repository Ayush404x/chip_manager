import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Check,
  ChevronUp,
  CircleDollarSign,
  Coins,
  Eye,
  Hand,
  Loader2,
  Lock,
  Play,
  RotateCcw,
  X,
} from 'lucide-react';
import type { BettingActionInput, HandView, LegalActions, RoomState } from '@chiproom/shared';
import { Button } from '../ui/Button';
import { Modal, ConfirmDialog } from '../ui/Modal';
import { Input, Label } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Avatar } from '../ui/Feedback';
import { cn, clamp, formatChips } from '../../lib/utils';

export function BettingControls({
  state,
  hand,
  pending,
  paused,
  closed,
  onAction,
  onOpenSettlement,
  onStartNextHand,
  onUndo,
}: {
  state: RoomState;
  hand: HandView;
  pending: boolean;
  paused: boolean;
  closed: boolean;
  onAction: (action: Omit<BettingActionInput, 'actionId'>) => Promise<{ ok: boolean }>;
  onOpenSettlement: () => void;
  onStartNextHand?: () => void;
  onUndo?: () => Promise<{ ok: boolean }>;
}) {
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [allInOpen, setAllInOpen] = useState(false);
  const [foldOpen, setFoldOpen] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);

  const me = state.me;
  const mySeat = hand.seats.find((seat) => seat.playerId === me?.id) ?? null;
  const legal = hand.legalActions;
  const isTurn = Boolean(
    mySeat && hand.turnSeat === mySeat.seat && hand.phase === 'betting' && !paused,
  );
  const turnSeat = hand.seats.find((seat) => seat.seat === hand.turnSeat);
  const canUndo = Boolean(
    onUndo &&
      me &&
      hand.phase === 'betting' &&
      !paused &&
      !closed &&
      hand.undoablePlayerId === me.id,
  );

  const act = async (action: Omit<BettingActionInput, 'actionId'>) => {
    const response = await onAction(action);
    if (response.ok) {
      setRaiseOpen(false);
      setAllInOpen(false);
      setFoldOpen(false);
    }
  };

  if (!me || me.status === 'pending') return null;

  let body: ReactNode;

  if (me.isSpectator) {
    body = (
      <ControlNotice
        icon={<Eye className="h-4 w-4" />}
        title="You are watching as a spectator"
        detail="Only seated players can bet. The table updates live."
      />
    );
  } else if (closed) {
    body = <ControlNotice icon={<Lock className="h-4 w-4" />} title="Room closed" />;
  } else if (hand.phase === 'complete') {
    body = (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ControlNotice
          icon={<Check className="h-4 w-4" />}
          title="Hand complete"
          detail={
            me.isHost
              ? 'The pot is paid. Start the next hand whenever the table is ready.'
              : 'Waiting for the host to start the next hand.'
          }
        />
        {me.isHost && onStartNextHand && !closed ? (
          <Button onClick={onStartNextHand} isLoading={pending} className="w-full sm:w-auto">
            <Play className="h-4 w-4" /> Start next hand
          </Button>
        ) : null}
      </div>
    );
  } else if (hand.phase === 'awaiting_payout') {
    body = (
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/10 text-amber-200">
            <Coins className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">Pot ready to settle</p>
            <p className="text-xs text-slate-500">
              {formatChips(hand.totalPot)} chips across {hand.pots.length}{' '}
              {hand.pots.length === 1 ? 'pot' : 'pots'}. Winners are chosen by the host.
            </p>
          </div>
        </div>
        {me.isHost ? (
          <Button onClick={onOpenSettlement} className="w-full sm:w-auto">
            Select winners
          </Button>
        ) : (
          <Badge variant="amber" dot>
            Waiting for host
          </Badge>
        )}
      </div>
    );
  } else if (paused) {
    body = (
      <ControlNotice
        icon={<span className="text-base">⏸</span>}
        title="Table paused"
        detail="The host has paused betting. All actions are locked until play resumes."
      />
    );
  } else if (!mySeat) {
    body = (
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <ControlNotice
          icon={<CircleDollarSign className="h-4 w-4" />}
          title="You are waiting for the next hand"
          detail="You joined mid-hand or are sitting out. You will be dealt in when the host starts the next hand."
          compact
        />
        {me.isHost ? <Badge variant="slate">Host controls available</Badge> : null}
      </div>
    );
  } else if (mySeat.folded) {
    body = (
      <ControlNotice
        icon={<X className="h-4 w-4" />}
        title="You folded this hand"
        detail="Your chips stay in the pot. You will be dealt in next hand."
      />
    );
  } else if (mySeat.allIn) {
    body = (
      <ControlNotice
        icon={<ChevronUp className="h-4 w-4" />}
        title={`You are all in for ${formatChips(mySeat.contributed)}`}
        detail="No more decisions this hand. Watch the pot build."
      />
    );
  } else if (!isTurn) {
    body = (
      <ControlNotice
        icon={<Loader2 className="h-4 w-4 animate-spin" />}
        title={turnSeat ? `Waiting for ${turnSeat.nickname}` : 'Waiting for the next action'}
        detail="Only the player whose turn it is can act. Your controls unlock automatically."
      />
    );
  } else if (legal?.canAct) {
    const betOrRaise = legal.canBet ? 'Bet' : 'Raise';
    const minTarget = legal.canBet ? legal.minBet : legal.minRaiseTo;
    const targetLabel = legal.canBet ? 'bet' : 'raise';
    body = (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Avatar name={me.nickname} size="sm" online />
            <div>
              <p className="text-sm font-semibold text-white">Your action</p>
              <p className="chip-value text-[11px] text-slate-500">
                {formatChips(mySeat.chips)} chips behind · {formatChips(mySeat.committed)} in this
                round
              </p>
            </div>
          </div>
          {legal.toCall > 0 ? (
            <Badge variant="gold" className="chip-value">
              To call {formatChips(legal.callAmount)}
            </Badge>
          ) : (
            <Badge variant="emerald">Check available</Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button
            variant="ghost"
            onClick={() => setFoldOpen(true)}
            disabled={pending}
            className="border border-white/[0.08] text-slate-300 hover:border-red-400/25 hover:bg-red-400/[0.07] hover:text-red-200"
          >
            <Hand className="h-4 w-4" /> Fold
          </Button>
          <Button
            variant="secondary"
            onClick={() => void act({ type: 'check' })}
            disabled={pending || !legal.canCheck}
            title={!legal.canCheck ? `You must call ${formatChips(legal.callAmount)} first` : undefined}
          >
            <Check className="h-4 w-4" /> Check
          </Button>
          <Button
            variant="secondary"
            onClick={() => void act({ type: 'call' })}
            disabled={pending || !legal.canCall}
            className={cn(legal.canCall && 'border-sky-400/25 bg-sky-400/[0.08] text-sky-100')}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
            {legal.canCall ? `Call ${formatChips(legal.callAmount)}` : 'Call'}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (legal.isAllInOnly) {
                setAllInOpen(true);
              } else {
                setRaiseOpen(true);
              }
            }}
            disabled={pending || (!legal.canBet && !legal.canRaise)}
            title={
              legal.isAllInOnly
                ? 'Your stack only allows a short all-in'
                : `Minimum ${targetLabel} target ${formatChips(minTarget)}`
            }
          >
            <ChevronUp className="h-4 w-4" />
            {legal.isAllInOnly ? 'All-in raise' : betOrRaise}
          </Button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] leading-relaxed text-slate-500">
            {legal.canBet
              ? `Minimum bet ${formatChips(legal.minBet)}.`
              : `Minimum raise to ${formatChips(legal.minRaiseTo)}; maximum ${formatChips(legal.maxRaiseTo)}.`}{' '}
            {legal.isAllInOnly
              ? 'Your remaining stack is below a full raise, so only all-in is available.'
              : 'Raise targets are the total for this betting round.'}
          </p>
          <Button
            variant="gold"
            size="sm"
            onClick={() => setAllInOpen(true)}
            disabled={
              pending || (!legal.canBet && !legal.canRaise && mySeat.chips > legal.toCall)
            }
            title={
              !legal.canBet && !legal.canRaise && mySeat.chips > legal.toCall
                ? 'No other player can call an all-in raise; call or fold instead'
                : undefined
            }
            className="shrink-0"
          >
            All in · {formatChips(mySeat.chips)}
          </Button>
        </div>
      </div>
    );
  } else {
    body = (
      <ControlNotice
        icon={<Lock className="h-4 w-4" />}
        title="No actions available"
        detail="This hand is not waiting on you."
      />
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-charcoal-900/95 p-3.5 shadow-2xl backdrop-blur-xl sm:p-4 md:mt-4">
      {body}

      {canUndo ? (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-2.5">
          <p className="text-[10px] leading-snug text-slate-600">
            No one has acted since. Undo restores the chips and turn.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setUndoOpen(true)}
            disabled={pending}
            className="shrink-0 text-slate-400"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Undo
          </Button>
        </div>
      ) : null}

      {mySeat && legal?.canAct ? (
        <>
          <RaiseDialog
            open={raiseOpen}
            onClose={() => setRaiseOpen(false)}
            hand={hand}
            legal={legal}
            seatChips={mySeat.chips}
            seatCommitted={mySeat.committed}
            pending={pending}
            onConfirm={(amount) =>
              void act({ type: hand.currentBet === 0 ? 'bet' : 'raise', amount })
            }
          />
          <ConfirmDialog
            open={allInOpen}
            onClose={() => setAllInOpen(false)}
            onConfirm={() => void act({ type: 'all_in' })}
            title="Push all in?"
            description={`You will commit all ${formatChips(mySeat.chips)} remaining chips to this pot.`}
            confirmLabel="Go all in"
            destructive
            isLoading={pending}
          />
          <ConfirmDialog
            open={foldOpen}
            onClose={() => setFoldOpen(false)}
            onConfirm={() => void act({ type: 'fold' })}
            title="Fold this hand?"
            description="Your chips already in the pot stay there. You cannot win this hand after folding."
            confirmLabel="Fold hand"
            destructive
            isLoading={pending}
          />
        </>
      ) : null}

      <ConfirmDialog
        open={undoOpen}
        onClose={() => setUndoOpen(false)}
        onConfirm={() => {
          if (!onUndo) return;
          void onUndo().then((response) => {
            if (response.ok) setUndoOpen(false);
          });
        }}
        title="Undo your last action?"
        description="Only your most recent action is reverted, before anyone else acts. The server restores the exact chips and turn."
        confirmLabel="Undo action"
        isLoading={pending}
      />
    </div>
  );
}

function ControlNotice({
  icon,
  title,
  detail,
  compact,
}: {
  icon: ReactNode;
  title: string;
  detail?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex items-center gap-3', compact && 'gap-2')}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-slate-400">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{title}</p>
        {detail ? <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{detail}</p> : null}
      </div>
    </div>
  );
}

function RaiseDialog({
  open,
  onClose,
  hand,
  legal,
  seatChips,
  seatCommitted,
  pending,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  hand: HandView;
  legal: LegalActions;
  seatChips: number;
  seatCommitted: number;
  pending: boolean;
  onConfirm: (amount: number) => void;
}) {
  const isBet = hand.currentBet === 0;
  const minTarget = Math.max(1, isBet ? legal.minBet : legal.minRaiseTo);
  const maxTarget = Math.max(minTarget, legal.maxRaiseTo);
  const [target, setTarget] = useState(minTarget);
  const [raw, setRaw] = useState(String(minTarget));

  useEffect(() => {
    if (open) {
      const initial = legal.isAllInOnly ? maxTarget : minTarget;
      setTarget(initial);
      setRaw(String(initial));
    }
  }, [open, minTarget, maxTarget, legal.isAllInOnly]);

  const effective = useMemo(() => clamp(Math.round(target), minTarget, maxTarget), [target, minTarget, maxTarget]);
  const additional = Math.max(0, effective - seatCommitted);
  const remaining = Math.max(0, seatChips - additional);
  const potAfter = hand.totalPot + additional;
  const isAllIn = effective === maxTarget && remaining === 0;
  const validFullRaise = isBet || isAllIn || effective >= hand.currentBet + hand.minRaise;

  const quickTargets = useMemo(() => {
    const base = isBet ? 0 : hand.currentBet;
    const pot = hand.totalPot;
    const candidates = [
      { label: 'Min', value: minTarget },
      { label: '½ pot', value: base + Math.max(minTarget, Math.round(pot / 2)) },
      { label: 'Pot', value: base + Math.max(minTarget, pot) },
      { label: 'All in', value: maxTarget },
    ];
    const seen = new Set<number>();
    return candidates
      .map((candidate) => ({
        ...candidate,
        value: clamp(candidate.value, minTarget, maxTarget),
      }))
      .filter((candidate) => {
        if (seen.has(candidate.value)) return false;
        seen.add(candidate.value);
        return true;
      });
  }, [isBet, hand.currentBet, hand.totalPot, minTarget, maxTarget]);

  const setValue = (value: number) => {
    const next = clamp(Math.round(value), minTarget, maxTarget);
    setTarget(next);
    setRaw(String(next));
  };

  const handleRaw = (value: string) => {
    setRaw(value);
    const parsed = Number.parseInt(value.replace(/[^0-9]/g, ''), 10);
    if (Number.isFinite(parsed)) setTarget(parsed);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isBet ? 'Place your bet' : 'Make a raise'}
      description={
        isBet
          ? 'Enter the total you want to put in for this betting round.'
          : 'Enter your total target bet for this round — not the extra amount on top.'
      }
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(effective)}
            isLoading={pending}
            disabled={!validFullRaise || effective < minTarget}
          >
            {isBet ? 'Bet' : 'Raise to'} {formatChips(effective)}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3">
          <Label htmlFor="raise-total" className="text-[11px] uppercase tracking-[0.14em]">
            Your total bet this round
          </Label>
          <div className="mt-1 flex items-center gap-2">
            <Input
              id="raise-total"
              type="text"
              inputMode="numeric"
              value={raw}
              onChange={(event) => handleRaw(event.target.value)}
              onBlur={() => setValue(target)}
              className="chip-value h-12 border-0 bg-transparent px-0 text-3xl font-semibold focus:border-0"
              aria-describedby="raise-help"
            />
            <span className="text-xs uppercase tracking-wide text-slate-600">chips</span>
          </div>
          <input
            type="range"
            min={minTarget}
            max={maxTarget}
            step={1}
            value={effective}
            onChange={(event) => setValue(Number(event.target.value))}
            className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-emerald-400"
            aria-label="Raise amount"
          />
          <div className="mt-1.5 flex justify-between text-[10px] text-slate-600">
            <span>Min {formatChips(minTarget)}</span>
            <span>Max {formatChips(maxTarget)}</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {quickTargets.map((quick) => (
            <button
              key={quick.label}
              type="button"
              onClick={() => setValue(quick.value)}
              className={cn(
                'rounded-lg border px-2 py-2 text-[11px] font-medium transition-colors',
                effective === quick.value
                  ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
                  : 'border-white/[0.08] bg-white/[0.02] text-slate-400 hover:border-white/20',
              )}
            >
              {quick.label}
            </button>
          ))}
        </div>

        <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs">
          <Row label="Chips added now" value={formatChips(additional)} />
          <Row label="Pot after your action" value={formatChips(potAfter)} />
          <Row label="Stack remaining" value={formatChips(remaining)} accent={remaining === 0} />
          {!isBet ? (
            <Row
              label="Minimum full raise to"
              value={formatChips(hand.currentBet + hand.minRaise)}
            />
          ) : null}
        </div>

        <p id="raise-help" className="text-[11px] leading-relaxed text-slate-500">
          {isBet
            ? `The minimum bet is ${formatChips(legal.minBet)}.`
            : `The current bet is ${formatChips(hand.currentBet)}. A full raise adds at least ${formatChips(hand.minRaise)} on top.`}{' '}
          {isAllIn
            ? 'This puts you all in.'
            : 'Your target is the total contribution for this street.'}
        </p>
      </div>
    </Modal>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span
        className={cn(
          'chip-value font-semibold text-slate-200',
          accent && 'text-chip-gold',
        )}
      >
        {value}
      </span>
    </div>
  );
}
