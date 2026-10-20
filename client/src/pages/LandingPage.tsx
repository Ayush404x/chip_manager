import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Coins,
  History,
  Layers,
  LockKeyhole,
  Radio,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { isRoomCode, normalizeRoomCode } from '@chiproom/shared';
import { Brand } from '../components/Brand';
import { TablePreview } from '../components/landing/TablePreview';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { APP_DESCRIPTION, APP_NAME } from '../lib/brand';
import { cn } from '../lib/utils';

const features = [
  {
    icon: Radio,
    title: 'Real-time, server-authoritative',
    body: 'Every bet, fold and raise is validated on the server and pushed to every seat instantly. No refresh, no drift.',
  },
  {
    icon: Layers,
    title: 'Main pots and side pots',
    body: 'Contributions are layered by level, so every all-in builds the right side pots — folded chips stay dead, and winners are always eligible.',
  },
  {
    icon: Coins,
    title: 'Chip accounting that adds up',
    body: 'Whole-chip integers, transactional payouts, and an auditable ledger. Chips in player stacks plus chips in the pot always reconcile.',
  },
  {
    icon: ShieldCheck,
    title: 'Host in control',
    body: 'Approve players, pause the table, rotate the button, settle pots manually, and recover an interrupted hand.',
  },
  {
    icon: History,
    title: 'Every hand on record',
    body: 'Action history, contributions, pot eligibility, winners and before/after stacks — all saved for the table to review.',
  },
  {
    icon: LockKeyhole,
    title: 'Private by default',
    body: 'Six-character room codes, optional passwords, host approval, and session tokens that survive a refresh.',
  },
];

const steps = [
  {
    number: '01',
    title: 'Create the room',
    body: 'Set stacks, blinds, seats and house rules. Share the code or invite link with your table.',
  },
  {
    number: '02',
    title: 'Run the betting',
    body: 'Blinds post automatically. Players check, bet, call, raise, fold or shove — with full side-pot math.',
  },
  {
    number: '03',
    title: 'Pick the winner',
    body: 'At showdown the host selects winners per pot. ChipRoom splits ties, handles odd chips, and pays out.',
  },
];

export function LandingPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const join = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeRoomCode(code);
    if (!isRoomCode(normalized)) {
      setError('Enter the 6-character room code');
      return;
    }
    setError(null);
    navigate(`/room/${normalized}`);
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[720px] overflow-hidden" aria-hidden>
        <div className="bg-grid absolute inset-0" />
        <div className="absolute left-1/2 top-[-260px] h-[700px] w-[900px] -translate-x-1/2 rounded-full bg-emerald-500/[0.07] blur-3xl" />
      </div>

      <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Brand />
        <nav className="hidden items-center gap-7 text-[13px] text-slate-400 md:flex" aria-label="Main">
          <a href="#features" className="transition-colors hover:text-white">
            Features
          </a>
          <a href="#how-it-works" className="transition-colors hover:text-white">
            How it works
          </a>
          <a href="#fair-play" className="transition-colors hover:text-white">
            Fair play
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/join')}>
            Join room
          </Button>
          <Button size="sm" onClick={() => navigate('/create')}>
            Create room
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-14 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:pb-24 lg:pt-16">
          <div className="max-w-2xl animate-fade-up">
            <Badge variant="emerald" className="mb-5 px-3 py-1 text-[11px]" dot>
              Private tables · Virtual chips only
            </Badge>
            <h1 className="text-balance text-[2.8rem] font-semibold leading-[0.98] tracking-[-0.045em] text-white sm:text-6xl lg:text-[4.2rem]">
              Chip nights,
              <br />
              <span className="text-gradient-emerald">minus the spreadsheet.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-slate-400 sm:text-base">
              {APP_NAME} is a real-time virtual chip manager for private poker nights. Create a
              room, stack your friends, and run proper no-limit betting with automatic side pots.
              No cards are dealt — you choose the winner when the hand ends.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={() => navigate('/create')}>
                Create a private room
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="secondary" onClick={() => navigate('/join')}>
                I have a room code
              </Button>
            </div>

            <form onSubmit={join} className="mt-5 max-w-md">
              <label htmlFor="landing-code" className="sr-only">
                Room code
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    id="landing-code"
                    value={code}
                    onChange={(event) => {
                      setCode(normalizeRoomCode(event.target.value));
                      setError(null);
                    }}
                    placeholder="Enter room code · ABC123"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={6}
                    aria-invalid={Boolean(error)}
                    className="h-11 w-full rounded-xl border border-white/[0.09] bg-charcoal-900/70 px-4 font-mono text-sm uppercase tracking-[0.18em] text-slate-100 placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-500 transition-colors focus:border-emerald-400/60 focus:outline-none"
                  />
                </div>
                <Button type="submit" variant="outline">
                  Join
                </Button>
              </div>
              {error ? (
                <p className="mt-2 text-xs text-red-300" role="alert">
                  {error}
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-600">
                  Join instantly with a nickname. No account required.
                </p>
              )}
            </form>

            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-400" /> No real-money value
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-400" /> 2–10 players
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-400" /> Reconnect safe
              </span>
            </div>
          </div>

          <div className="relative animate-fade-in [animation-delay:120ms]">
            <div className="absolute -right-6 top-8 hidden rotate-6 items-center gap-2 rounded-xl border border-white/10 bg-charcoal-850/90 px-3 py-2 text-[11px] text-slate-300 shadow-2xl backdrop-blur lg:flex">
              <Sparkles className="h-3.5 w-3.5 text-chip-gold" />
              Side pots calculated automatically
            </div>
            <TablePreview />
            <div className="absolute -bottom-5 -left-4 hidden -rotate-3 items-center gap-2 rounded-xl border border-white/10 bg-charcoal-850/95 px-3.5 py-2.5 text-[11px] shadow-2xl backdrop-blur sm:flex">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span className="text-slate-300">
                Chips conserved <span className="text-emerald-300">to the last chip</span>
              </span>
            </div>
          </div>
        </section>

        <section className="border-y border-white/[0.06] bg-black/20">
          <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-px px-5 py-6 sm:px-8 md:grid-cols-4">
            {[
              ['2–10', 'players per table'],
              ['4', 'betting streets'],
              ['100%', 'server-validated'],
              ['0', 'cards or real money'],
            ].map(([value, label]) => (
              <div key={label} className="px-2 py-3 text-center md:px-6">
                <div className="text-2xl font-semibold tracking-tight text-white">{value}</div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/80">
              Built for the home game
            </span>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
              A table that keeps its own books
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-400 sm:text-[15px]">
              You bring the friends and the chips. {APP_NAME} handles the betting order, the pot
              layers, the payout split, and the paper trail.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.035] to-transparent p-5 transition-colors hover:border-emerald-400/20 hover:from-emerald-400/[0.04]"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="text-[15px] font-semibold tracking-tight text-slate-100">
                  {feature.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="relative border-y border-white/[0.06] bg-black/20">
          <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/80">
                  Three steps
                </span>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
                  From invite to settled pot
                </h2>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">
                  No account, no app store, no cards. A room code gets everyone to the same table in
                  seconds.
                </p>
                <div className="mt-7 flex items-center gap-2 text-xs text-slate-500">
                  <Users className="h-4 w-4 text-emerald-400" />
                  Works on phones, tablets and desktops
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {steps.map((step) => (
                  <div
                    key={step.number}
                    className="rounded-2xl border border-white/[0.07] bg-charcoal-850/60 p-5"
                  >
                    <div className="font-mono text-xs text-emerald-400/70">{step.number}</div>
                    <h3 className="mt-4 text-[15px] font-semibold text-white">{step.title}</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{step.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="fair-play" className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-emerald-400/15 bg-gradient-to-br from-emerald-500/[0.09] via-charcoal-850 to-charcoal-900 px-6 py-12 sm:px-12">
            <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
              <div>
                <Badge variant="gold" className="mb-4">
                  House rules
                </Badge>
                <h2 className="max-w-xl text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl">
                  A chip manager — not a card game.
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-400">
                  {APP_DESCRIPTION} There are no decks, hole cards or hand rankings. Players see
                  their stacks, make betting actions, and the host manually selects the winner of
                  each pot at the end of the hand.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {[
                    'No real-money value',
                    'Integer chip accounting',
                    'Server-side validation',
                    'Manual winner selection',
                  ].map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] text-slate-300"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-start gap-3 rounded-2xl border border-white/10 bg-black/25 p-5 lg:items-end">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <Sparkles className="h-4 w-4 text-chip-gold" />
                  Ready to deal the chips?
                </div>
                <p className="text-xs leading-relaxed text-slate-500 lg:text-right">
                  Spin up a room in under a minute. Invite by code or link.
                </p>
                <Button className="w-full lg:w-auto" onClick={() => navigate('/create')}>
                  Create your room
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start justify-between gap-4 px-5 py-8 text-xs text-slate-600 sm:flex-row sm:items-center sm:px-8">
          <div className="flex items-center gap-3">
            <Brand />
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">Virtual chips only. For fun with friends.</span>
          </div>
          <div className={cn('flex items-center gap-4')}>
            <span>© {new Date().getFullYear()} {APP_NAME}</span>
            <Link to="/create" className="transition-colors hover:text-slate-300">
              Create room
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
