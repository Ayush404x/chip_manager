import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Coins, Crown, KeyRound, ShieldAlert, Users } from 'lucide-react';
import type { RoomPreview } from '@chiproom/shared';
import { Brand } from '../Brand';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input, Label } from '../ui/Input';
import { Checkbox } from '../ui/Switch';
import { LoadingState } from '../ui/Feedback';
import { useToast } from '../ui/Toast';
import { api } from '../../lib/api';
import { rememberRoom, saveSession } from '../../lib/session';
import { formatChips } from '../../lib/utils';

export function RoomJoinGate({
  code,
  message,
  onJoined,
}: {
  code: string;
  message?: string | null;
  onJoined: () => void;
}) {
  const toast = useToast();
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(message ?? null);
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [spectator, setSpectator] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getPreview(code)
      .then((result) => {
        if (!cancelled) {
          setPreview(result);
          setError(message ?? null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Room not found');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, message]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!preview) return;
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
      onJoined();
    } catch (err) {
      toast.error('Could not join the room', err instanceof Error ? err.message : undefined);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="bg-grid absolute inset-0" />
        <div className="absolute left-1/2 top-1/4 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-emerald-500/[0.06] blur-3xl" />
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

      <main className="relative z-10 mx-auto w-full max-w-lg px-5 pb-16 pt-8">
        {loading ? (
          <div className="surface p-8">
            <LoadingState label="Opening the room" />
          </div>
        ) : error && !preview ? (
          <div className="surface p-8 text-center">
            <ShieldAlert className="mx-auto h-9 w-9 text-red-300/80" />
            <h1 className="mt-4 text-xl font-semibold text-white">Can’t open this table</h1>
            <p className="mt-2 text-sm text-slate-400">{error}</p>
            <div className="mt-6 flex justify-center gap-2">
              <Button variant="secondary" onClick={() => window.location.reload()}>
                Try again
              </Button>
              <Link to="/join">
                <Button variant="primary">Join another room</Button>
              </Link>
            </div>
          </div>
        ) : preview ? (
          <div className="animate-fade-up">
            <div className="mb-5 text-center">
              <Badge variant="emerald" className="mb-3">
                You’re invited
              </Badge>
              <h1 className="text-2xl font-semibold tracking-[-0.03em] text-white">
                {preview.room.name}
              </h1>
              <p className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Crown className="h-3 w-3 text-chip-gold" /> Host {preview.hostNickname ?? '—'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" /> {preview.room.seatedCount}/
                  {preview.room.settings.maxPlayers} seated
                </span>
                <span className="font-mono tracking-[0.14em]">{preview.room.code}</span>
              </p>
            </div>

            {message ? (
              <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-4 py-2.5 text-xs text-amber-200">
                {message}
              </div>
            ) : null}

            <form onSubmit={submit} className="surface p-5 sm:p-6">
              <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2">
                  <div className="text-[9px] uppercase tracking-[0.14em] text-slate-500">Stack</div>
                  <div className="chip-value mt-0.5 text-xs font-semibold text-white">
                    {formatChips(preview.room.settings.startingChips)}
                  </div>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2">
                  <div className="text-[9px] uppercase tracking-[0.14em] text-slate-500">Blinds</div>
                  <div className="chip-value mt-0.5 text-xs font-semibold text-white">
                    {preview.room.settings.smallBlind}/{preview.room.settings.bigBlind}
                  </div>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2">
                  <div className="text-[9px] uppercase tracking-[0.14em] text-slate-500">
                    {preview.room.status === 'lobby' ? 'Status' : 'Table'}
                  </div>
                  <div className="mt-0.5 text-xs font-semibold text-white">
                    {preview.room.status === 'lobby' ? 'Lobby' : 'In play'}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="gate-nickname">Nickname</Label>
                  <Input
                    id="gate-nickname"
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value)}
                    placeholder="How should the table see you?"
                    maxLength={20}
                    autoFocus
                  />
                </div>

                {preview.room.settings.hasPassword ? (
                  <div>
                    <Label htmlFor="gate-password" className="inline-flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5 text-slate-500" /> Room password
                    </Label>
                    <Input
                      id="gate-password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Required for this room"
                      autoComplete="current-password"
                    />
                  </div>
                ) : null}

                {preview.room.settings.spectatorMode ? (
                  <Checkbox
                    checked={spectator}
                    onChange={setSpectator}
                    label={
                      <span>
                        Join as a spectator
                        <span className="block text-[11px] text-slate-500">
                          Watch the table without a seat.
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
                  disabled={
                    preview.room.status === 'closed' ||
                    nickname.trim().length < 2 ||
                    (!preview.room.settings.lateJoin &&
                      preview.room.status !== 'lobby' &&
                      !spectator)
                  }
                >
                  {preview.room.status === 'closed'
                    ? 'Room is closed'
                    : spectator
                      ? 'Join as spectator'
                      : 'Take a seat'}
                </Button>

                {!preview.room.settings.lateJoin &&
                preview.room.status !== 'lobby' &&
                !preview.room.settings.spectatorMode ? (
                  <p className="text-center text-xs text-amber-300/80">
                    This room is in progress and does not accept late joins.
                  </p>
                ) : null}
              </div>

              <div className="mt-5 flex items-start gap-2 border-t border-white/[0.06] pt-4 text-[11px] leading-relaxed text-slate-600">
                <Coins className="mt-0.5 h-3.5 w-3.5 shrink-0 text-chip-gold/70" />
                <span>
                  Chips are virtual and carry no cash value. No cards are dealt — the host picks
                  each pot’s winner when the hand ends.
                </span>
              </div>
            </form>
          </div>
        ) : null}
      </main>
    </div>
  );
}
