import { EngineError, type ContributionInput, type PotLayer } from './types.js';

/**
 * Build main/side pots from every player's total contribution to the hand.
 *
 * The algorithm works from contribution *levels*, not from all-in badges:
 * for each ascending level L, the chips between the previous level and L are
 * contributed by everyone who put in at least L. Folded players' chips stay in
 * the pot but folded players are never eligible to win.
 *
 * If a layer has no eligible (non-folded) contributor — for example when the
 * only player who reached that level folded — the dead chips are merged into
 * the next lower pot. This mirrors the standard treatment of dead money and
 * guarantees that every chip is awarded.
 */
export function buildPots(contributions: ContributionInput[]): PotLayer[] {
  const positive = contributions.filter((c) => c.contributed > 0);
  const levels = [...new Set(positive.map((c) => c.contributed))].sort((a, b) => a - b);

  const raw: Array<{ amount: number; eligiblePlayerIds: string[] }> = [];
  let previousLevel = 0;

  for (const level of levels) {
    const contributors = positive.filter((c) => c.contributed >= level);
    const amount = (level - previousLevel) * contributors.length;
    if (amount > 0) {
      const eligible = contributors
        .filter((c) => !c.folded)
        .sort((a, b) => a.seat - b.seat)
        .map((c) => c.playerId);
      raw.push({ amount, eligiblePlayerIds: eligible });
    }
    previousLevel = level;
  }

  const pots: Array<{ amount: number; eligiblePlayerIds: string[] }> = [];
  let carried = 0;

  for (const layer of raw) {
    if (layer.eligiblePlayerIds.length === 0) {
      if (pots.length > 0) {
        pots[pots.length - 1].amount += layer.amount;
      } else {
        carried += layer.amount;
      }
      continue;
    }
    pots.push({
      amount: layer.amount + carried,
      eligiblePlayerIds: layer.eligiblePlayerIds,
    });
    carried = 0;
  }

  // Defensive fallback: in a pathological state every contributor folded.
  // Award the dead money to any remaining live players rather than destroying it.
  if (carried > 0) {
    const live = contributions
      .filter((c) => !c.folded)
      .sort((a, b) => a.seat - b.seat)
      .map((c) => c.playerId);
    if (live.length === 0) {
      throw new EngineError('Cannot build pots: no live players to award dead chips to');
    }
    if (pots.length > 0) {
      pots[pots.length - 1].amount += carried;
    } else {
      pots.push({ amount: carried, eligiblePlayerIds: live });
    }
  }

  const total = pots.reduce((sum, pot) => sum + pot.amount, 0);
  const expected = contributions.reduce((sum, c) => sum + Math.max(0, c.contributed), 0);
  if (total !== expected) {
    throw new EngineError(`Pot total mismatch: built ${total}, expected ${expected}`);
  }

  return pots.map((pot, index) => ({
    index,
    amount: pot.amount,
    eligiblePlayerIds: pot.eligiblePlayerIds,
  }));
}

/** Clockwise distance from the dealer, 1 = first seat to the dealer's left. */
export function clockwiseDistance(seat: number, dealerSeat: number, tableSize: number): number {
  const distance = (((seat - dealerSeat) % tableSize) + tableSize) % tableSize;
  return distance === 0 ? tableSize : distance;
}

/**
 * Split a pot between winners. Odd chips are awarded one at a time in
 * clockwise seat order starting immediately left of the dealer button.
 */
export function splitPot(
  amount: number,
  winners: Array<{ playerId: string; seat: number }>,
  dealerSeat: number,
  tableSize: number,
): Record<string, number> {
  if (winners.length === 0) {
    throw new EngineError('A pot must have at least one winner');
  }
  if (!Number.isInteger(amount) || amount < 0) {
    throw new EngineError('Pot amount must be a non-negative integer');
  }

  const unique = new Set(winners.map((w) => w.playerId));
  if (unique.size !== winners.length) {
    throw new EngineError('Duplicate winners are not allowed');
  }

  const ordered = [...winners].sort(
    (a, b) =>
      clockwiseDistance(a.seat, dealerSeat, tableSize) -
      clockwiseDistance(b.seat, dealerSeat, tableSize),
  );

  const base = Math.floor(amount / ordered.length);
  let remainder = amount % ordered.length;
  const result: Record<string, number> = {};

  for (const winner of ordered) {
    result[winner.playerId] = base;
    if (remainder > 0) {
      result[winner.playerId] += 1;
      remainder -= 1;
    }
  }

  return result;
}
