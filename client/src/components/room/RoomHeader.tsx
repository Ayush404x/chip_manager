import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CircleDot,
  Copy,
  History,
  Link2,
  Settings2,
  Users,
  WifiOff,
} from 'lucide-react';
import type { RoomState } from '@chiproom/shared';
import { Brand } from '../Brand';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { useToast } from '../ui/Toast';
import { cn } from '../../lib/utils';
import type { ConnectionStatus } from '../../hooks/useRoom';

export function RoomHeader({
  state,
  connection,
  onOpenHost,
  onOpenHistory,
  onOpenInvite,
  onCopyCode,
}: {
  state: RoomState;
  connection: ConnectionStatus;
  onOpenHost: () => void;
  onOpenHistory: () => void;
  onOpenInvite: () => void;
  onCopyCode: () => void;
}) {
  const isHost = state.me?.isHost ?? false;
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-charcoal-950/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3 px-3 py-3 sm:px-5">
        <Link to="/" className="shrink-0" aria-label="Back to ChipRoom home">
          <Brand className="hidden sm:inline-flex" />
          <span className="sm:hidden">
            <BrandMarkOnly />
          </span>
        </Link>

        <div className="hidden h-7 w-px bg-white/[0.08] sm:block" />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-semibold tracking-tight text-white sm:text-[15px]">
              {state.room.name}
            </h1>
            <StatusPill state={state} />
          </div>
          <div className="mt-0.5 flex items-center gap-2.5 text-[11px] text-slate-500">
            <button
              type="button"
              onClick={onCopyCode}
              className="inline-flex items-center gap-1 rounded font-mono tracking-[0.16em] text-slate-400 transition-colors hover:text-emerald-300"
              aria-label="Copy room code"
            >
              {state.room.code}
              <Copy className="h-2.5 w-2.5" />
            </button>
            <span className="hidden items-center gap-1 sm:inline-flex">
              <Users className="h-3 w-3" /> {state.players.filter((p) => !p.isSpectator).length}/
              {state.room.settings.maxPlayers}
            </span>
            <span className="hidden items-center gap-1 md:inline-flex">
              Blinds {state.room.settings.smallBlind}/{state.room.settings.bigBlind}
            </span>
            {state.hand ? (
              <span className="hidden lg:inline">Hand #{state.hand.handNumber}</span>
            ) : null}
          </div>
        </div>

        <ConnectionBadge connection={connection} />

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onOpenInvite} aria-label="Invite players">
            <Link2 className="h-4 w-4" />
            <span className="hidden lg:inline">Invite</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenHistory} aria-label="Hand history">
            <History className="h-4 w-4" />
            <span className="hidden lg:inline">History</span>
          </Button>
          {isHost ? (
            <Button
              variant={state.hand?.phase === 'awaiting_payout' ? 'primary' : 'secondary'}
              size="sm"
              onClick={onOpenHost}
              aria-label="Host controls"
            >
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">Host</span>
              {state.hand?.phase === 'awaiting_payout' ? (
                <span className="ml-0.5 hidden text-[10px] font-bold uppercase tracking-wide md:inline">
                  Settle
                </span>
              ) : null}
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function BrandMarkOnly() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-300 to-emerald-700">
      <CircleDot className="h-4 w-4 text-emerald-950" strokeWidth={2.5} />
    </span>
  );
}

function StatusPill({ state }: { state: RoomState }) {
  if (state.room.status === 'closed') return <Badge variant="red">Closed</Badge>;
  if (state.room.status === 'paused') return <Badge variant="amber" dot>Paused</Badge>;
  if (state.hand?.phase === 'awaiting_payout') return <Badge variant="gold" dot>Settle pot</Badge>;
  if (state.hand?.phase === 'complete') return <Badge variant="blue">Hand complete</Badge>;
  if (state.hand?.phase === 'betting') return <Badge variant="emerald" dot>Live</Badge>;
  return <Badge variant="slate" dot>Lobby</Badge>;
}

function ConnectionBadge({ connection }: { connection: ConnectionStatus }) {
  const config = {
    connected: { label: 'Live', className: 'text-emerald-300', icon: CircleDot },
    connecting: { label: 'Connecting', className: 'text-amber-300', icon: CircleDot },
    disconnected: { label: 'Offline', className: 'text-red-300', icon: WifiOff },
  }[connection];
  const Icon = config.icon;
  return (
    <Tooltip
      content={
        connection === 'connected'
          ? 'Connected in real time. Every action is synced automatically.'
          : connection === 'connecting'
            ? 'Connecting to the table…'
            : 'You are offline. ChipRoom will reconnect automatically.'
      }
    >
      <span
        className={cn(
          'hidden items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-medium sm:inline-flex',
          config.className,
        )}
      >
        <Icon
          className={cn(
            'h-2.5 w-2.5',
            connection === 'connecting' && 'animate-pulse',
            connection === 'connected' && 'fill-current',
          )}
        />
        {config.label}
      </span>
    </Tooltip>
  );
}

export function useCopy() {
  const toast = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (value: string, label = 'Copied') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      toast.success(label, value.length > 40 ? undefined : value);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error('Could not copy', 'Your browser blocked clipboard access.');
    }
  };

  return { copy, copied };
}
