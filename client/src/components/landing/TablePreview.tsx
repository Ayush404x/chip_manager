import { Crown, Wifi } from 'lucide-react';
import { formatChips } from '../../lib/utils';
import { Avatar } from '../ui/Feedback';

const seats = [
  { left: '50%', top: '98%', name: 'Maya', chips: 4820, state: 'active', turn: true, dealer: false },
  { left: '12%', top: '72%', name: 'Theo', chips: 3120, state: 'called', dealer: false },
  { left: '8%', top: '26%', name: 'Priya', chips: 6710, state: 'folded', dealer: true },
  { left: '50%', top: '2%', name: 'Jonah', chips: 2490, state: 'all-in', dealer: false },
  { left: '90%', top: '26%', name: 'Ari', chips: 5240, state: 'called', dealer: false },
  { left: '88%', top: '72%', name: 'Sam', chips: 1080, state: 'active', dealer: false },
];

const stateDot: Record<string, string> = {
  active: 'bg-emerald-400',
  called: 'bg-sky-400',
  folded: 'bg-slate-500',
  'all-in': 'bg-chip-gold',
};

export function TablePreview() {
  return (
    <div className="relative mx-auto w-full max-w-[560px] select-none">
      <div className="absolute -inset-10 rounded-[50%] bg-emerald-500/10 blur-3xl" aria-hidden />
      <div className="relative rounded-[2rem] border border-white/[0.08] bg-charcoal-850/70 p-3 shadow-[0_40px_100px_-40px_rgba(0,0,0,0.9)] backdrop-blur sm:p-4">
        <div className="mb-3 flex items-center justify-between px-1.5 text-[10px] uppercase tracking-[0.16em] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Wifi className="h-3 w-3 text-emerald-400" /> Live table
          </span>
          <span>Private · 6 players</span>
        </div>

        <div className="relative aspect-[16/11] w-full">
          <div className="felt-table absolute inset-x-[5%] inset-y-[8%] rounded-[50%]">
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-emerald-200/50">
                Main pot
              </div>
              <div className="chip-value mt-1 text-3xl font-semibold text-emerald-50 sm:text-4xl">
                {formatChips(2450)}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-emerald-100/50">
                <span>Hand #14</span>
                <span className="h-1 w-1 rounded-full bg-emerald-100/30" />
                <span>Turn</span>
              </div>

              <div className="mt-4 flex items-end gap-1" aria-hidden>
                {[0, 1, 2].map((stack) => (
                  <div key={stack} className="flex flex-col-reverse gap-0.5">
                    {Array.from({ length: 4 - stack }).map((_, chip) => (
                      <span
                        key={chip}
                        className="block h-2 w-7 rounded-full border border-emerald-100/20 bg-gradient-to-b from-emerald-300/70 to-emerald-700 shadow-sm"
                      />
                    ))}
                  </div>
                ))}
              </div>

              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/[0.07] px-3 py-1 text-[10px] font-medium text-amber-200/90">
                <Crown className="h-3 w-3" /> Maya to act
              </div>
            </div>
          </div>

          {seats.map((seat) => (
            <div
              key={seat.name}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left: seat.left, top: seat.top }}
            >
              <div
                className={
                  seat.turn
                    ? 'relative flex w-[104px] items-center gap-2 rounded-xl border border-emerald-400/60 bg-charcoal-800/95 px-2 py-1.5 shadow-glow-emerald'
                    : 'relative flex w-[104px] items-center gap-2 rounded-xl border border-white/[0.08] bg-charcoal-900/95 px-2 py-1.5 shadow-seat'
                }
              >
                <Avatar name={seat.name} size="sm" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="truncate text-[10px] font-semibold text-slate-100">
                      {seat.name}
                    </span>
                    <span className={`h-1 w-1 rounded-full ${stateDot[seat.state]}`} />
                  </div>
                  <div className="chip-value text-[10px] text-emerald-200/80">
                    {formatChips(seat.chips)}
                  </div>
                </div>
                {seat.dealer ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[8px] font-bold text-charcoal-900 shadow">
                    D
                  </span>
                ) : null}
                {seat.turn ? (
                  <span className="absolute -bottom-2 left-1/2 h-1.5 w-8 -translate-x-1/2 rounded-full bg-emerald-400/60 blur-[2px]" />
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2 text-[10px] text-slate-500">
          <span className="chip-value">Blinds 25 / 50</span>
          <span>Current bet 250</span>
          <span className="text-emerald-300/80">Side pot 1,200</span>
        </div>
      </div>
    </div>
  );
}
