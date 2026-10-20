import { useEffect, useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  AlertTriangle,
  Check,
  Coins,
  Crown,
  Equal,
  Loader2,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import type { HandView, SettlementPreview } from '@chiproom/shared';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Avatar } from '../ui/Feedback';
import { useToast } from '../ui/Toast';
import { cn, formatChips } from '../../lib/utils';
import type { RunAction } from '../../lib/roomTypes';

type SelectionMap = Record<number, string[]>;

export function SettlementDialog({
  open,
  onClose,
  code,
  hand,
  pending,
  run,
}: {
  open: boolean;
  onClose: () => void;
  code: string;
  hand: HandView | null;
  pending: boolean;
  run: RunAction;
}) {
  const toast = useToast();
  const [selections, setSelections] = useState<SelectionMap>({});
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (!open || !hand) return;
    const next: SelectionMap = {};
    for (const pot of hand.pots) {
      // A pot with a single eligible player has only one possible winner.
      next[pot.index] = pot.eligiblePlayerIds.length === 1 ? [pot.eligiblePlayerIds[0]] : [];
    }
    setSelections(next);
    setPreview(null);
    // Reset only when the dialog opens or the hand changes, not on every
    // personalized state broadcast that keeps the same hand id/phase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hand?.id, hand?.phase]);

  const seatMap = useMemo(
    () => new Map((hand?.seats ?? []).map((seat) => [seat.playerId, seat])),
    [hand?.seats],
  );

  const ready = Boolean(hand && hand.pots.length > 0 && hand.pots.every((pot) => (selections[pot.index]?.length ?? 0) > 0));

  const payload = useMemo(() => {
    if (!hand) return [];
    return hand.pots.map((pot) => ({
      potIndex: pot.index,
      winnerIds: selections[pot.index] ?? [],
    }));
  }, [hand, selections]);

  const toggleWinner = (potIndex: number, playerId: string) => {
    setPreview(null);
    setSelections((current) => {
      const selected = current[potIndex] ?? [];
      return {
        ...current,
        [potIndex]: selected.includes(playerId)
          ? selected.filter((id) => id !== playerId)
          : [...selected, playerId],
      };
    });
  };

  const handlePreview = async () => {
    if (!ready) {
      toast.error('Select a winner for every pot', 'Every pot needs at least one eligible winner.');
      return;
    }
    setPreviewing(true);
    const response = await run('host:previewSettlement', { code, selections: payload });
    setPreviewing(false);
    if (response.ok && response.preview) setPreview(response.preview);
  };

  const handleSettle = async () => {
    if (!ready) return;
    const response = await run('host:settle', { code, selections: payload });
    if (!response.ok) return;
    const payout = response.preview as SettlementPreview | undefined;
    toast.success(
      'Pot paid out',
      payout ? `${formatChips(payout.totalDistributed)} chips distributed.` : 'Winners have been paid.',
    );
    void confetti({
      particleCount: 110,
      spread: 75,
      startVelocity: 38,
      origin: { y: 0.72 },
      colors: ['#34d399', '#6ee7b7', '#e7bf6a', '#f8fafc'],
      disableForReducedMotion: true,
    });
    setPreview(null);
    onClose();
  };

  if (!hand) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <Trophy className="h-4 w-4 text-chip-gold" /> Settle hand #{hand.handNumber}
        </span>
      }
      description="Choose the winner of each pot. Ties are allowed — select every player who shares the pot."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => void handlePreview()} isLoading={previewing} disabled={pending || !ready}>
            {!previewing ? <Equal className="h-4 w-4" /> : null}
            Preview split
          </Button>
          <Button onClick={() => void handleSettle()} isLoading={pending} disabled={!ready || !preview}>
            <Coins className="h-4 w-4" />
            Confirm & pay {preview ? formatChips(preview.totalDistributed) : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            Folded players and players outside a pot cannot be selected.
          </div>
          <span className="chip-value text-xs font-semibold text-amber-100">
            {formatChips(hand.totalPot)} chips · {hand.pots.length} {hand.pots.length === 1 ? 'pot' : 'pots'}
          </span>
        </div>

        {hand.pots.map((pot) => {
          const selected = selections[pot.index] ?? [];
          const eligible = pot.eligiblePlayerIds
            .map((id) => seatMap.get(id))
            .filter((seat): seat is NonNullable<typeof seat> => Boolean(seat));
          const payout = preview?.pots.find((entry) => entry.potIndex === pot.index);

          return (
            <div key={pot.index} className="overflow-hidden rounded-2xl border border-white/[0.08] bg-charcoal-900/60">
              <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] bg-black/20 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Badge variant={pot.index === 0 ? 'emerald' : 'gold'}>
                    {pot.index === 0 ? 'Main pot' : `Side pot ${pot.index}`}
                  </Badge>
                  <span className="text-[11px] text-slate-500">
                    {eligible.length} eligible {eligible.length === 1 ? 'player' : 'players'}
                  </span>
                </div>
                <span className="chip-value text-sm font-semibold text-emerald-100">
                  {formatChips(pot.amount)}
                </span>
              </div>

              <div className="grid gap-2 p-3 sm:grid-cols-2">
                {eligible.length === 0 ? (
                  <p className="col-span-full px-2 py-3 text-center text-xs text-slate-600">
                    No eligible players for this pot.
                  </p>
                ) : (
                  eligible.map((seat) => {
                    const isSelected = selected.includes(seat.playerId);
                    const split = payout?.winners.find((winner) => winner.playerId === seat.playerId);
                    return (
                      <button
                        key={seat.playerId}
                        type="button"
                        onClick={() => toggleWinner(pot.index, seat.playerId)}
                        aria-pressed={isSelected}
                        className={cn(
                          'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                          isSelected
                            ? 'border-emerald-400/50 bg-emerald-400/[0.09]'
                            : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
                        )}
                      >
                        <Avatar name={seat.nickname} size="sm" online={seat.isConnected} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-semibold text-slate-100">
                              {seat.nickname}
                            </span>
                            {seat.isHost ? <Crown className="h-2.5 w-2.5 text-chip-gold/80" /> : null}
                          </span>
                          <span className="chip-value mt-0.5 block text-[10px] text-slate-500">
                            {formatChips(seat.chips)} behind · {formatChips(seat.contributed)} in hand
                          </span>
                        </span>
                        {split ? (
                          <span className="chip-value shrink-0 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                            +{formatChips(split.amount)}
                          </span>
                        ) : (
                          <span
                            className={cn(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                              isSelected
                                ? 'border-emerald-300 bg-emerald-400 text-emerald-950'
                                : 'border-white/20 bg-white/[0.04]',
                            )}
                          >
                            {isSelected ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {selected.length > 1 ? (
                <div className="flex items-center gap-1.5 border-t border-white/[0.06] px-4 py-2 text-[10px] text-slate-500">
                  <Users className="h-3 w-3" /> {selected.length}-way tie · equal split, odd chip goes
                  clockwise from the dealer.
                </div>
              ) : null}
            </div>
          );
        })}

        {preview ? (
          <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.05] p-4 animate-fade-up">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                <Sparkles className="h-3.5 w-3.5" /> Server payout preview
              </span>
              <span className="chip-value text-sm font-semibold text-emerald-100">
                {formatChips(preview.totalDistributed)} chips
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {preview.pots.map((pot) => (
                <div key={pot.potIndex} className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-slate-500">
                    <span>{pot.potIndex === 0 ? 'Main pot' : `Side pot ${pot.potIndex}`}</span>
                    <span className="chip-value">{formatChips(pot.amount)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {pot.winners.map((winner) => (
                      <span
                        key={winner.playerId}
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[10px] text-emerald-100"
                      >
                        {winner.nickname}
                        <span className="chip-value font-semibold">+{formatChips(winner.amount)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[11px] leading-relaxed text-slate-500">
            {previewing ? (
              <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-emerald-300" />
            ) : (
              <Coins className="mt-0.5 h-3.5 w-3.5 shrink-0 text-chip-gold/70" />
            )}
            <span>
              Split amounts are calculated by the server before anything is paid. Preview the split,
              then confirm. Payouts are recorded and cannot be paid twice.
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
