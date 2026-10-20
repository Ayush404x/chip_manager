import { useMemo, useState, type ReactNode } from 'react';
import {
  Check,
  Copy,
  KeyRound,
  Link2,
  LockKeyhole,
  Share2,
  Users,
} from 'lucide-react';
import type { RoomState } from '@chiproom/shared';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { useToast } from '../ui/Toast';
import { APP_NAME } from '../../lib/brand';
import { cn } from '../../lib/utils';

export function InviteDialog({
  open,
  onClose,
  state,
}: {
  open: boolean;
  onClose: () => void;
  state: RoomState;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const inviteUrl = useMemo(() => {
    if (typeof window === 'undefined') return `/room/${state.room.code}`;
    return `${window.location.origin}/room/${state.room.code}`;
  }, [state.room.code]);

  const copy = async (value: string, kind: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      toast.success(kind === 'code' ? 'Room code copied' : 'Invite link copied');
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error('Could not copy', 'Select the text and copy it manually.');
    }
  };

  const share = async () => {
    const data = {
      title: `Join ${state.room.name} on ${APP_NAME}`,
      text: `You are invited to ${state.room.name}. Room code: ${state.room.code}`,
      url: inviteUrl,
    };
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share(data);
        return;
      } catch {
        // The user dismissed the share sheet; fall back to copying.
      }
    }
    await copy(inviteUrl, 'link');
  };

  const seatsLeft = Math.max(
    0,
    state.room.settings.maxPlayers -
      state.players.filter((player) => !player.isSpectator && player.status !== 'pending').length,
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite your table"
      description="Share the room code or send the invite link. No account is required."
      size="md"
    >
      <div className="space-y-5">
        <div className="relative overflow-hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/[0.09] via-charcoal-850 to-charcoal-900 p-5 text-center">
          <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-emerald-400/10 blur-2xl" />
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300/70">
            Room code
          </div>
          <div className="chip-value mt-1.5 text-4xl font-semibold tracking-[0.32em] text-white sm:text-5xl">
            {state.room.code}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" /> {seatsLeft} {seatsLeft === 1 ? 'seat' : 'seats'} open
            </span>
            <span>·</span>
            <span>{state.room.settings.hasPassword ? 'Password required' : 'No password'}</span>
            <span>·</span>
            <span>Blinds {state.room.settings.smallBlind}/{state.room.settings.bigBlind}</span>
          </div>
          <Button className="mt-4" onClick={() => void copy(state.room.code, 'code')}>
            {copied === 'code' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied === 'code' ? 'Copied' : 'Copy code'}
          </Button>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
              <Link2 className="h-3.5 w-3.5 text-slate-500" /> Invite link
            </span>
            <Badge variant="slate">Opens the table directly</Badge>
          </div>
          <div className="flex items-stretch gap-2">
            <div className="flex min-w-0 flex-1 items-center rounded-xl border border-white/[0.08] bg-black/25 px-3">
              <span className="truncate font-mono text-[11px] text-slate-400">{inviteUrl}</span>
            </div>
            <Button
              variant="secondary"
              className="shrink-0"
              onClick={() => void copy(inviteUrl, 'link')}
              aria-label="Copy invite link"
            >
              {copied === 'link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="hidden sm:inline">{copied === 'link' ? 'Copied' : 'Copy'}</span>
            </Button>
            <Button className="shrink-0" onClick={() => void share()} aria-label="Share invite">
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">Share</span>
            </Button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <InfoRow
            icon={state.room.settings.hasPassword ? <KeyRound className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
            label="Access"
            value={state.room.settings.hasPassword ? 'Code + password' : 'Code only'}
          />
          <InfoRow
            icon={<Users className="h-3.5 w-3.5" />}
            label="Seats"
            value={`${state.room.settings.maxPlayers} max · ${state.room.settings.lateJoin ? 'late join on' : 'late join off'}`}
          />
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[11px] leading-relaxed text-slate-500">
          Anyone with the {state.room.settings.hasPassword ? 'code and password' : 'code'} can take an
          open seat. {state.room.settings.requireApproval ? 'You approve every new player before they receive chips. ' : ''}
          Players keep the same session when they refresh or reconnect.
        </div>
      </div>
    </Modal>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className={cn('flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5')}>
      <span className="text-slate-500">{icon}</span>
      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-[0.14em] text-slate-600">{label}</div>
        <div className="mt-0.5 truncate text-[11px] font-medium text-slate-300">{value}</div>
      </div>
    </div>
  );
}
