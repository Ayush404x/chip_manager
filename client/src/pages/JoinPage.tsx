import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Coins,
  Crown,
  Eye,
  KeyRound,
  RefreshCw,
  Users,
} from 'lucide-react';
import { isRoomCode, normalizeRoomCode, type RoomPreview } from '@chiproom/shared';
import { Brand } from '../components/Brand';
import { Button } from '../components/ui/Button';
import { Input, Label, FieldHint } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Checkbox } from '../components/ui/Switch';
import { LoadingState } from '../components/ui/Feedback';
import { useToast } from '../components/ui/Toast';
import { api } from '../lib/api';
import { loadSession, rememberRoom, saveSession } from '../lib/session';
import { cn, formatChips } from '../lib/utils';

export function JoinPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  const [looking, setLooking] = useState(false);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [spectator, setSpectator] = useState(false);
  const [joining, setJoining] = useState(false);

  const lookup = async (value: string) => {
    if (!isRoomCode(value)) return;
    setLooking(true);
    setNotFound(null);
    setPreview(null);
    try {
      const result = await api.getPreview(value);
      setPreview(result);
      setPassword('');
      setSpectator(false);
    } catch (error) {
      setNotFound(error instanceof Error ? error.message : 'Room not found');
    } finally {
      setLooking(false);
    }
  };

  useEffect(() => {
    if (isRoomCode(code)) {
      const timer = window.setTimeout(() => void lookup(code), 350);
      return () => window.clearTimeout(timer);
    }
    setPreview(null);
    setNotFound(null);
    return undefined;
  }, [code]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!preview) {
      toast.error('Find a room first', 'Enter a valid 6-character room code.');
      return;
    }
    if (nickname.trim().length < 2) {
      toast.error('Pick a nickname', 'At least 2 characters, please.');
      return;
    }
    setJoining(true);
    try {
      const auth = await api.joinRoom(code, {
        nickname: nickname.trim(),
        password: password || undefined,
        spectator,
      });
      saveSession(auth.roomCode, auth);
      rememberRoom(auth.roomCode);
      navigate(`/room/${auth.roomCode}`);
    } catch (error) {
      toast.error('Could not join the room', error instanceof Error ? error.message : undefined);
    } finally {
      setJoining(false);
    }
  };

  const existingSession = preview ? loadSession(preview.room.code) : null;
  const closed = preview?.room.status === 'closed';

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden" aria-hidden>
        <div className="bg-grid absolute inset-0" />
        <div className="absolute left-1/2 top-[-260px] h-[560px] w-[760px] -translate-x-1/2 rounded-full bg-emerald-500/[0.07] blur-3xl" />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <Brand />
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-slate-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Home
        </Link>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-5xl gap-8 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <div>
          <Badge variant="emerald" className="mb-4">
            Join a table
          </Badge>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
            Take your seat.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">
            Enter the code your host shared. You will get a seat, a stack of virtual chips, and a
            real-time view of the table.
          </p>

          <div className="surface mt-7 p-5">
            <Label htmlFor="room-code">Room code</Label>
            <div className="flex gap-2">
              <Input
                id="room-code"
                value={code}
                onChange={(event) => setCode(normalizeRoomCode(event.target.value))}
                placeholder="ABC123"
                maxLength={6}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                className="chip-value h-12 text-center text-lg uppercase tracking-[0.3em]"
              />
              <Button
                type="button"
                variant="secondary"
                className="h-12 shrink-0"
                onClick={() => void lookup(code)}
                disabled={!isRoomCode(code) || looking}
                isLoading={looking}
                aria-label="Find room"
              >
                {looking ? null : <RefreshCw className="h-4 w-4" />}
                <span className="hidden sm:inline">Find</span>
              </Button>
            </div>
            <FieldHint>Six characters, for example ABC123.</FieldHint>

            <div className="mt-5 min-h-[120px]">
              {looking ? (
                <LoadingState label="Looking for the room" />
              ) : notFound ? (
                <div className="rounded-xl border border-red-400/20 bg-red-400/[0.05] px-4 py-3 text-sm text-red-200">
                  {notFound}
                </div>
              ) : preview ? (
                <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4 animate-fade-in">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-base font-semibold text-white">
                          {preview.room.name}
                        </h2>
                        {closed ? (
                          <Badge variant="red">Closed</Badge>
                        ) : preview.room.status === 'lobby' ? (
                          <Badge variant="amber">Lobby</Badge>
                        ) : (
                          <Badge variant="emerald" dot>
                            Live
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Crown className="h-3 w-3 text-chip-gold" />
                          {preview.hostNickname ?? 'Host'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {preview.room.seatedCount}/{preview.room.settings.maxPlayers} seated
                        </span>
                        {preview.room.settings.spectatorMode ? (
                          <span className="inline-flex items-center gap-1">
                            <Eye className="h-3 w-3" /> Spectators
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <span className="chip-value rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs tracking-[0.12em] text-slate-300">
                      {preview.room.code}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2">
                      <div className="text-[9px] uppercase tracking-[0.14em] text-slate-500">
                        Stack
                      </div>
                      <div className="chip-value mt-0.5 text-xs font-semibold text-white">
                        {formatChips(preview.room.settings.startingChips)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2">
                      <div className="text-[9px] uppercase tracking-[0.14em] text-slate-500">
                        Blinds
                      </div>
                      <div className="chip-value mt-0.5 text-xs font-semibold text-white">
                        {formatChips(preview.room.settings.smallBlind)}/
                        {formatChips(preview.room.settings.bigBlind)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2">
                      <div className="text-[9px] uppercase tracking-[0.14em] text-slate-500">
                        Password
                      </div>
                      <div className="mt-0.5 text-xs font-semibold text-white">
                        {preview.room.settings.hasPassword ? 'Yes' : 'No'}
                      </div>
                    </div>
                  </div>

                  {preview.players.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {preview.players.slice(0, 8).map((player) => (
                        <span
                          key={player.nickname}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]',
                            player.isHost
                              ? 'border-chip-gold/20 bg-chip-gold/[0.06] text-chip-gold'
                              : 'border-white/10 bg-white/[0.03] text-slate-400',
                          )}
                        >
                          {player.nickname}
                          {player.isSpectator ? ' · spec' : ''}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-slate-600">
                  Enter a room code to preview the table.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="surface-raised p-5 sm:p-6 lg:mt-[72px]">
          <h2 className="text-base font-semibold text-white">Your seat</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            No account needed. Your session stays on this device so you can refresh or reconnect.
          </p>

          {defaultSessionNotice(existingSession, preview?.room.code, navigate)}

          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <Label htmlFor="join-nickname">Nickname</Label>
              <Input
                id="join-nickname"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="How should the table see you?"
                maxLength={20}
                disabled={!preview || closed}
                autoComplete="nickname"
              />
            </div>

            {preview?.room.settings.hasPassword ? (
              <div>
                <Label htmlFor="join-password" className="inline-flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-slate-500" /> Room password
                </Label>
                <Input
                  id="join-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Required for this room"
                  autoComplete="current-password"
                  disabled={!preview || closed}
                />
              </div>
            ) : null}

            {preview?.room.settings.spectatorMode ? (
              <Checkbox
                checked={spectator}
                onChange={setSpectator}
                label={
                  <span>
                    Join as a spectator
                    <span className="block text-[11px] text-slate-500">
                      Watch the table without chips or a seat.
                    </span>
                  </span>
                }
              />
            ) : null}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              isLoading={joining}
              disabled={!preview || closed || nickname.trim().length < 2}
            >
              {closed ? 'Room closed' : spectator ? 'Join as spectator' : 'Join the table'}
              {!closed ? <ArrowRight className="h-4 w-4" /> : null}
            </Button>

            {preview && !preview.room.settings.lateJoin && preview.room.status !== 'lobby' ? (
              <p className="text-center text-xs text-amber-300/80">
                This room does not accept late joins.
              </p>
            ) : null}
          </form>

          <div className="mt-5 flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] leading-relaxed text-slate-500">
            <Coins className="mt-0.5 h-3.5 w-3.5 shrink-0 text-chip-gold/80" />
            Chips are virtual and have no cash value. {preview?.hostNickname ?? 'The host'} approves
            all pot results manually.
          </div>
        </div>
      </main>
    </div>
  );
}

function defaultSessionNotice(
  session: ReturnType<typeof loadSession>,
  code: string | undefined,
  navigate: ReturnType<typeof useNavigate>,
) {
  if (!session || !code) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] px-3.5 py-2.5 text-xs text-emerald-100">
      <span>You already have a seat in this room on this device.</span>
      <button
        type="button"
        onClick={() => navigate(`/room/${code}`)}
        className="shrink-0 rounded-lg border border-emerald-400/30 px-2 py-1 font-medium text-emerald-200 transition-colors hover:bg-emerald-400/10"
      >
        Resume
      </button>
    </div>
  );
}
