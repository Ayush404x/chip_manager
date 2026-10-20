import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Coins,
  Crown,
  Eye,
  Hourglass,
  KeyRound,
  ShieldCheck,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { createRoomSchema } from '@chiproom/shared';
import { Brand } from '../components/Brand';
import { Button } from '../components/ui/Button';
import { Input, Label, FieldHint } from '../components/ui/Input';
import { Switch } from '../components/ui/Switch';
import { Badge } from '../components/ui/Badge';
import { Tooltip } from '../components/ui/Tooltip';
import { useToast } from '../components/ui/Toast';
import { api } from '../lib/api';
import { rememberRoom, saveSession } from '../lib/session';
import { cn, formatChips } from '../lib/utils';
import { APP_NAME } from '../lib/brand';

const stackPresets = [1000, 5000, 10000];
const blindPresets = [
  { label: '5 / 10', sb: 5, bb: 10 },
  { label: '10 / 20', sb: 10, bb: 20 },
  { label: '25 / 50', sb: 25, bb: 50 },
  { label: '50 / 100', sb: 50, bb: 100 },
];

interface FormState {
  roomName: string;
  hostNickname: string;
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  password: string;
  usePassword: boolean;
  spectatorMode: boolean;
  lateJoin: boolean;
  allowRebuys: boolean;
  requireApproval: boolean;
}

const initialForm: FormState = {
  roomName: '',
  hostNickname: '',
  startingChips: 5000,
  smallBlind: 25,
  bigBlind: 50,
  maxPlayers: 6,
  password: '',
  usePassword: false,
  spectatorMode: false,
  lateJoin: true,
  allowRebuys: true,
  requireApproval: false,
};

function toInt(value: string): number {
  const parsed = Number.parseInt(value.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function CreateRoomPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const summary = useMemo(() => {
    const starting = form.startingChips;
    return {
      starting,
      bigBlindDepth: starting > 0 ? Math.floor(starting / Math.max(1, form.bigBlind)) : 0,
    };
  }, [form.startingChips, form.bigBlind]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});

    const payload = {
      ...form,
      password: form.usePassword ? form.password : undefined,
      requireApproval: form.requireApproval,
    };
    const parsed = createRoomSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]?.toString() ?? 'form';
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      toast.error('Check the room settings', 'A few fields need attention.');
      return;
    }

    setSubmitting(true);
    try {
      const auth = await api.createRoom(parsed.data);
      saveSession(auth.roomCode, auth);
      rememberRoom(auth.roomCode);
      toast.success('Room created', `Code ${auth.roomCode} — invite your table.`);
      navigate(`/room/${auth.roomCode}`);
    } catch (error) {
      toast.error('Could not create the room', error instanceof Error ? error.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden" aria-hidden>
        <div className="bg-grid absolute inset-0" />
        <div className="absolute left-1/3 top-[-220px] h-[520px] w-[700px] rounded-full bg-emerald-500/[0.07] blur-3xl" />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Brand />
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-slate-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Home
        </Link>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-16 pt-4 sm:px-8">
        <div className="max-w-2xl">
          <Badge variant="emerald" className="mb-4">
            New table
          </Badge>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
            Set up your private room
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
            Choose the stacks, blinds and house rules. You can adjust most settings later between
            hands.
          </p>
        </div>

        <form onSubmit={submit} className="mt-9 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-5">
            <section className="surface p-5 sm:p-6">
              <div className="mb-5 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300">
                  <Crown className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">The table</h2>
                  <p className="text-xs text-slate-500">Name it and claim your seat.</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="room-name">Room name</Label>
                  <Input
                    id="room-name"
                    value={form.roomName}
                    onChange={(event) => update('roomName', event.target.value)}
                    placeholder="Friday night game"
                    maxLength={60}
                    autoFocus
                    aria-invalid={Boolean(errors.roomName)}
                  />
                  {errors.roomName ? (
                    <p className="mt-1.5 text-xs text-red-300">{errors.roomName}</p>
                  ) : (
                    <FieldHint>Visible to everyone in the room.</FieldHint>
                  )}
                </div>
                <div>
                  <Label htmlFor="host-nickname">Your nickname</Label>
                  <Input
                    id="host-nickname"
                    value={form.hostNickname}
                    onChange={(event) => update('hostNickname', event.target.value)}
                    placeholder="e.g. Maya"
                    maxLength={20}
                    aria-invalid={Boolean(errors.hostNickname)}
                  />
                  {errors.hostNickname ? (
                    <p className="mt-1.5 text-xs text-red-300">{errors.hostNickname}</p>
                  ) : (
                    <FieldHint>You will be the host of this room.</FieldHint>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <Label htmlFor="max-players">Seats at the table</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="max-players"
                    type="range"
                    min={2}
                    max={10}
                    step={1}
                    value={form.maxPlayers}
                    onChange={(event) => update('maxPlayers', Number(event.target.value))}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-emerald-400"
                  />
                  <span className="chip-value w-10 shrink-0 text-right text-sm font-semibold text-white">
                    {form.maxPlayers}
                  </span>
                </div>
                <div className="mt-2.5 flex gap-1" aria-hidden>
                  {Array.from({ length: 10 }).map((_, index) => (
                    <span
                      key={index}
                      className={cn(
                        'h-1.5 flex-1 rounded-full transition-colors',
                        index < form.maxPlayers ? 'bg-emerald-400/70' : 'bg-white/[0.06]',
                      )}
                    />
                  ))}
                </div>
                <FieldHint>2 to 10 players. One seat is yours.</FieldHint>
              </div>
            </section>

            <section className="surface p-5 sm:p-6">
              <div className="mb-5 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-chip-gold/20 bg-chip-gold/[0.07] text-chip-gold">
                  <Coins className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">Stacks & blinds</h2>
                  <p className="text-xs text-slate-500">All values are whole virtual chips.</p>
                </div>
              </div>

              <Label htmlFor="starting-chips">Starting chips per player</Label>
              <div className="flex flex-wrap gap-2">
                {stackPresets.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => update('startingChips', value)}
                    className={cn(
                      'chip-value rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors',
                      form.startingChips === value
                        ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200'
                        : 'border-white/[0.08] bg-white/[0.02] text-slate-300 hover:border-white/20',
                    )}
                  >
                    {formatChips(value)}
                  </button>
                ))}
                <div className="relative">
                  <Input
                    id="starting-chips"
                    type="text"
                    inputMode="numeric"
                    value={form.startingChips}
                    onChange={(event) => update('startingChips', toInt(event.target.value))}
                    className="chip-value w-[130px]"
                    aria-label="Custom starting chips"
                  />
                </div>
              </div>
              {errors.startingChips ? (
                <p className="mt-1.5 text-xs text-red-300">{errors.startingChips}</p>
              ) : null}

              <div className="mt-5">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Label className="mb-0">Blinds</Label>
                  <Tooltip content="The small and big blind are forced bets posted before each hand. The big blind is also the minimum bet." />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {blindPresets.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        update('smallBlind', preset.sb);
                        update('bigBlind', preset.bb);
                      }}
                      className={cn(
                        'chip-value rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                        form.smallBlind === preset.sb && form.bigBlind === preset.bb
                          ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200'
                          : 'border-white/[0.08] bg-white/[0.02] text-slate-300 hover:border-white/20',
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="small-blind" className="text-xs">
                      Small blind
                    </Label>
                    <Input
                      id="small-blind"
                      type="text"
                      inputMode="numeric"
                      value={form.smallBlind}
                      onChange={(event) => update('smallBlind', toInt(event.target.value))}
                      className="chip-value h-10"
                    />
                    {errors.smallBlind ? (
                      <p className="mt-1 text-xs text-red-300">{errors.smallBlind}</p>
                    ) : null}
                  </div>
                  <div>
                    <Label htmlFor="big-blind" className="text-xs">
                      Big blind
                    </Label>
                    <Input
                      id="big-blind"
                      type="text"
                      inputMode="numeric"
                      value={form.bigBlind}
                      onChange={(event) => update('bigBlind', toInt(event.target.value))}
                      className="chip-value h-10"
                    />
                    {errors.bigBlind ? (
                      <p className="mt-1 text-xs text-red-300">{errors.bigBlind}</p>
                    ) : null}
                  </div>
                </div>
                <FieldHint>
                  The big blind must be larger than the small blind and smaller than the starting
                  stack.
                </FieldHint>
              </div>
            </section>

            <section className="surface p-5 sm:p-6">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">House rules</h2>
                  <p className="text-xs text-slate-500">Private-room controls you can change later.</p>
                </div>
              </div>

              <div className="divide-y divide-white/[0.06]">
                <Switch
                  id="password-protection"
                  checked={form.usePassword}
                  onCheckedChange={(checked) => update('usePassword', checked)}
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5 text-slate-500" /> Password protect this room
                    </span>
                  }
                  description="Players need the password in addition to the room code."
                />
                {form.usePassword ? (
                  <div className="py-3">
                    <Label htmlFor="room-password">Room password</Label>
                    <Input
                      id="room-password"
                      type="password"
                      value={form.password}
                      onChange={(event) => update('password', event.target.value)}
                      placeholder="At least 4 characters"
                      autoComplete="new-password"
                      aria-invalid={Boolean(errors.password)}
                    />
                    {errors.password ? (
                      <p className="mt-1.5 text-xs text-red-300">{errors.password}</p>
                    ) : null}
                  </div>
                ) : null}
                <Switch
                  id="require-approval"
                  checked={form.requireApproval}
                  onCheckedChange={(checked) => update('requireApproval', checked)}
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <UserCheck className="h-3.5 w-3.5 text-slate-500" /> Approve new players
                    </span>
                  }
                  description="New arrivals wait in the lobby until you approve their seat."
                />
                <Switch
                  id="late-join"
                  checked={form.lateJoin}
                  onCheckedChange={(checked) => update('lateJoin', checked)}
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <Hourglass className="h-3.5 w-3.5 text-slate-500" /> Allow late joining
                    </span>
                  }
                  description="Players can join after the first hand and wait for the next one."
                />
                <Switch
                  id="allow-rebuys"
                  checked={form.allowRebuys}
                  onCheckedChange={(checked) => update('allowRebuys', checked)}
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <Wallet className="h-3.5 w-3.5 text-slate-500" /> Rebuys & chip top-ups
                    </span>
                  }
                  description="Lets the host add chips between hands, with an audit entry."
                />
                <Switch
                  id="spectator-mode"
                  checked={form.spectatorMode}
                  onCheckedChange={(checked) => update('spectatorMode', checked)}
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5 text-slate-500" /> Allow spectators
                    </span>
                  }
                  description="Friends can watch the table without taking a seat or receiving chips."
                />
              </div>
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="surface-raised overflow-hidden">
              <div className="border-b border-white/[0.07] bg-black/20 px-5 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Room preview
                  </span>
                  <Badge variant="emerald" dot>
                    Private
                  </Badge>
                </div>
                <h3 className="mt-2 truncate text-lg font-semibold tracking-tight text-white">
                  {form.roomName.trim() || 'Your poker room'}
                </h3>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                  <Users className="h-3.5 w-3.5" /> Up to {form.maxPlayers} players
                  {form.spectatorMode ? <span>· spectators allowed</span> : null}
                </div>
              </div>

              <div className="space-y-3 px-5 py-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Starting stack</span>
                  <span className="chip-value font-semibold text-white">
                    {formatChips(form.startingChips)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Blinds</span>
                  <span className="chip-value font-semibold text-white">
                    {formatChips(form.smallBlind)} / {formatChips(form.bigBlind)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Big blind depth</span>
                  <span className="text-slate-300">~{summary.bigBlindDepth} BB stacks</span>
                </div>
                <div className="divider" />
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Chips in play</span>
                  <span className="chip-value font-semibold text-emerald-300">
                    {formatChips(form.startingChips * form.maxPlayers)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Password</span>
                  <span className="text-slate-300">{form.usePassword ? 'Required' : 'None'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Approval</span>
                  <span className="text-slate-300">
                    {form.requireApproval ? 'Host approves' : 'Automatic'}
                  </span>
                </div>
              </div>

              <div className="border-t border-white/[0.07] bg-black/20 px-5 py-4">
                <Button type="submit" className="w-full" size="lg" isLoading={submitting}>
                  Create private room
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <div className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-slate-600">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500/80" />
                  <span>
                    {APP_NAME} is for casual play. Chips are virtual, carry no cash value, and never
                    involve real-money wagering.
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs leading-relaxed text-slate-500">
              <span className="font-medium text-slate-300">No cards, no problem.</span> This room
              only manages chips and betting. When the hand ends, you pick the winner and the pot is
              split automatically.
            </div>
          </aside>
        </form>
      </main>
    </div>
  );
}
