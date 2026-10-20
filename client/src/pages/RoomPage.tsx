import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';
import type { HandView } from '@chiproom/shared';
import { normalizeRoomCode } from '@chiproom/shared';
import { Brand } from '../components/Brand';
import { Button } from '../components/ui/Button';
import { LoadingState } from '../components/ui/Feedback';
import { useRoom } from '../hooks/useRoom';
import { clearSession, loadSession, rememberRoom, type StoredSession } from '../lib/session';
import { RoomHeader, useCopy } from '../components/room/RoomHeader';
import { RoomJoinGate } from '../components/room/RoomJoinGate';
import { PokerTable, TableLegend } from '../components/room/PokerTable';
import { BettingControls } from '../components/room/BettingControls';
import { LobbyView } from '../components/room/LobbyView';
import { RoomSidebar } from '../components/room/RoomSidebar';
import { InviteDialog } from '../components/room/InviteDialog';
import { SettlementDialog } from '../components/room/SettlementDialog';
import { HistoryDialog } from '../components/room/HistoryDialog';
import { HostPanel } from '../components/room/HostPanel';
import { formatChips } from '../lib/utils';

export function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = normalizeRoomCode(params.code ?? '');
  const { copy } = useCopy();

  const [session, setSession] = useState<StoredSession | null>(() => loadSession(code));
  const [inviteOpen, setInviteOpen] = useState(false);
  const [hostOpen, setHostOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const autoSettlementHand = useRef<string | null>(null);

  const room = useRoom(code, session?.sessionToken ?? null);
  const { state, connection, authError, pending, sendAction, run, fetchHistory } = room;

  useEffect(() => {
    setSession(loadSession(code));
  }, [code]);

  // The host should not miss the settlement moment; open it once per hand.
  useEffect(() => {
    const hand = state?.hand;
    if (!hand || !state?.me?.isHost) return;
    if (hand.phase === 'awaiting_payout' && autoSettlementHand.current !== hand.id) {
      autoSettlementHand.current = hand.id;
      setSettlementOpen(true);
    }
  }, [state?.hand, state?.me?.isHost]);

  const joined = useCallback(() => {
    rememberRoom(code);
    setSession(loadSession(code));
  }, [code]);

  const rejoin = () => {
    clearSession(code);
    room.setAuthError(null);
    setSession(null);
    setSettlementOpen(false);
    setHostOpen(false);
  };

  const copyCode = () => void copy(code, 'Room code copied');

  const isHost = state?.me?.isHost ?? false;
  const showTable = Boolean(state?.hand && state.room.status !== 'lobby');
  const hand: HandView | null = state?.hand ?? null;

  if (!session) {
    return <RoomJoinGate code={code} message={authError} onJoined={joined} />;
  }

  if (authError) {
    return (
      <div className="relative flex min-h-screen flex-col">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="bg-grid absolute inset-0" />
          <div className="absolute left-1/2 top-1/4 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-red-500/[0.05] blur-3xl" />
        </div>
        <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
          <Brand />
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-slate-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Home
          </Link>
        </header>
        <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-16">
          <div className="surface p-7 text-center">
            <ShieldAlert className="mx-auto h-9 w-9 text-red-300/80" />
            <h1 className="mt-3 text-xl font-semibold text-white">Session ended</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{authError}</p>
            <p className="mt-1 text-xs text-slate-600">
              You can join again with the room code if the room is still open.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="secondary" onClick={rejoin}>
                <RefreshCw className="h-4 w-4" /> Rejoin room
              </Button>
              <Link to="/join">
                <Button variant="ghost">Join another room</Button>
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="relative flex min-h-screen flex-col">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="bg-grid absolute inset-0" />
          <div className="absolute left-1/2 top-1/4 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-emerald-500/[0.05] blur-3xl" />
        </div>
        <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
          <Brand />
          <span className="font-mono text-xs tracking-[0.16em] text-slate-600">{code}</span>
        </header>
        <main className="relative z-10 mx-auto w-full max-w-md flex-1 px-5 pb-16 pt-16">
          <div className="surface p-8">
            <LoadingState label={connection === 'connecting' ? 'Connecting to the table' : 'Loading the room'} />
            {connection === 'disconnected' ? (
              <div className="mt-4 text-center">
                <p className="text-xs text-slate-500">The server is not responding yet.</p>
                <Button variant="secondary" size="sm" className="mt-3" onClick={() => void room.refresh()}>
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </Button>
              </div>
            ) : null}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <RoomHeader
        state={state}
        connection={connection}
        onOpenHost={() => setHostOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenInvite={() => setInviteOpen(true)}
        onCopyCode={copyCode}
      />

      {connection === 'disconnected' ? (
        <div className="border-b border-amber-300/15 bg-amber-300/[0.05]">
          <div className="mx-auto flex w-full max-w-[1400px] items-center gap-2 px-3 py-2 text-[11px] text-amber-200 sm:px-5">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            Connection lost. ChipRoom is reconnecting automatically — your stack and seat are safe.
          </div>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-[1400px] px-3 pb-24 pt-3 sm:px-5 sm:pt-4">
        {state.room.status === 'closed' ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.05] px-4 py-2.5">
            <span className="text-xs text-red-200">This room is closed. Final stacks and history are frozen.</span>
            <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}>
              View history
            </Button>
          </div>
        ) : null}

        {showTable && hand ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0">
              <PokerTable
                hand={hand}
                meId={state.me?.id ?? null}
                paused={state.room.status === 'paused'}
                closed={state.room.status === 'closed'}
                onOpenInvite={() => setInviteOpen(true)}
              />
              <div className="mt-2 hidden items-center justify-between gap-3 px-1 md:flex">
                <TableLegend />
                <span className="chip-value text-[10px] text-slate-600">
                  Pot {formatChips(hand.totalPot)} · {state.players.filter((player) => !player.isSpectator).length}{' '}
                  seated
                </span>
              </div>

              <BettingControls
                state={state}
                hand={hand}
                pending={pending}
                paused={state.room.status === 'paused'}
                closed={state.room.status === 'closed'}
                onAction={sendAction}
                onOpenSettlement={() => setSettlementOpen(true)}
                onStartNextHand={() => void run('host:startHand', { code }, 'Hand started')}
                onUndo={() => run('room:undoAction', { code }, 'Last action undone')}
              />

              {isHost && hand.phase === 'awaiting_payout' ? (
                <button
                  type="button"
                  onClick={() => setSettlementOpen(true)}
                  className="mt-2 w-full rounded-xl border border-dashed border-amber-300/25 bg-amber-300/[0.03] px-3 py-2 text-[11px] text-amber-200/80 transition-colors hover:bg-amber-300/[0.06] md:hidden"
                >
                  Tap to settle the pot
                </button>
              ) : null}
            </div>

            <div className="xl:sticky xl:top-[84px] xl:self-start">
              <RoomSidebar state={state} hand={hand} onOpenHistory={() => setHistoryOpen(true)} />
            </div>
          </div>
        ) : (
          <LobbyView
            state={state}
            pending={pending}
            run={run}
            onOpenInvite={() => setInviteOpen(true)}
            onOpenHost={() => setHostOpen(true)}
            onOpenHistory={() => setHistoryOpen(true)}
          />
        )}

        <footer className="mx-auto mt-10 flex w-full max-w-3xl flex-col items-center gap-1 text-center text-[10px] leading-relaxed text-slate-700">
          <span>
            Chips are virtual and carry no cash value. No cards are dealt — the host selects pot
            winners manually.
          </span>
          <span>
            {state.room.code} · {state.room.name} · {formatChips(state.room.totalChips)} chips in play
          </span>
        </footer>
      </main>

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} state={state} />

      <SettlementDialog
        open={settlementOpen}
        onClose={() => setSettlementOpen(false)}
        code={code}
        hand={hand}
        pending={pending}
        run={run}
      />

      <HistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        state={state}
        fetchHistory={fetchHistory}
      />

      {isHost ? (
        <HostPanel
          open={hostOpen}
          onClose={() => setHostOpen(false)}
          state={state}
          pending={pending}
          run={run}
          onOpenSettlement={() => setSettlementOpen(true)}
          onOpenHistory={() => {
            setHostOpen(false);
            setHistoryOpen(true);
          }}
        />
      ) : null}
    </div>
  );
}
