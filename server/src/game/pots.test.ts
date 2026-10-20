import { describe, expect, it } from 'vitest';
import { buildPots, clockwiseDistance, splitPot } from './pots.js';
import type { ContributionInput } from './types.js';

function contribution(
  playerId: string,
  seat: number,
  contributed: number,
  folded = false,
): ContributionInput {
  return { playerId, seat, contributed, folded };
}

describe('pots — contribution tiers', () => {
  it('builds one main pot when every player contributed the same amount', () => {
    const pots = buildPots([
      contribution('a', 1, 100),
      contribution('b', 2, 100),
      contribution('c', 3, 100),
    ]);

    expect(pots).toEqual([
      { index: 0, amount: 300, eligiblePlayerIds: ['a', 'b', 'c'] },
    ]);
  });

  it('builds main and side pots from unequal all-ins', () => {
    const pots = buildPots([
      contribution('a', 1, 100),
      contribution('b', 2, 200),
      contribution('c', 3, 300),
    ]);

    expect(pots).toEqual([
      { index: 0, amount: 300, eligiblePlayerIds: ['a', 'b', 'c'] },
      { index: 1, amount: 200, eligiblePlayerIds: ['b', 'c'] },
      { index: 2, amount: 100, eligiblePlayerIds: ['c'] },
    ]);
    expect(pots.reduce((sum, pot) => sum + pot.amount, 0)).toBe(600);
  });

  it('keeps folded chips in the pot but removes folded players from eligibility', () => {
    const pots = buildPots([
      contribution('a', 1, 100, true),
      contribution('b', 2, 100),
      contribution('c', 3, 200),
    ]);

    expect(pots).toEqual([
      { index: 0, amount: 300, eligiblePlayerIds: ['b', 'c'] },
      { index: 1, amount: 100, eligiblePlayerIds: ['c'] },
    ]);
    expect(pots[0].eligiblePlayerIds).not.toContain('a');
  });

  it('merges a dead layer into the next lower pot so every chip is awarded', () => {
    const pots = buildPots([
      contribution('a', 1, 300, true),
      contribution('b', 2, 200),
      contribution('c', 3, 100),
    ]);

    expect(pots).toEqual([
      { index: 0, amount: 300, eligiblePlayerIds: ['b', 'c'] },
      { index: 1, amount: 300, eligiblePlayerIds: ['b'] },
    ]);
    expect(pots.reduce((sum, pot) => sum + pot.amount, 0)).toBe(600);
  });

  it('keeps dead money in a live-eligible pot when the lowest contributor folded', () => {
    const pots = buildPots([
      contribution('a', 1, 50, true),
      contribution('b', 2, 100),
    ]);

    expect(pots).toEqual([
      { index: 0, amount: 100, eligiblePlayerIds: ['b'] },
      { index: 1, amount: 50, eligiblePlayerIds: ['b'] },
    ]);
    expect(pots.reduce((sum, pot) => sum + pot.amount, 0)).toBe(150);
  });

  it('ignores zero contributions and preserves integer chip conservation', () => {
    const pots = buildPots([
      contribution('a', 1, 0),
      contribution('b', 2, 75),
      contribution('c', 3, 125),
    ]);

    expect(pots).toEqual([
      { index: 0, amount: 150, eligiblePlayerIds: ['b', 'c'] },
      { index: 1, amount: 50, eligiblePlayerIds: ['c'] },
    ]);
    expect(pots.reduce((sum, pot) => sum + pot.amount, 0)).toBe(200);
  });

  it('throws when there are no live players to award dead chips to', () => {
    expect(() =>
      buildPots([contribution('a', 1, 100, true), contribution('b', 2, 100, true)]),
    ).toThrow(/no live players/i);
  });
});

describe('pots — splitting and odd chips', () => {
  it('splits a pot equally between tied winners', () => {
    const split = splitPot(
      300,
      [
        { playerId: 'a', seat: 1 },
        { playerId: 'b', seat: 4 },
      ],
      6,
      6,
    );

    expect(split).toEqual({ a: 150, b: 150 });
  });

  it('awards odd chips one at a time clockwise, starting left of the dealer', () => {
    const split = splitPot(
      101,
      [
        { playerId: 'seat5', seat: 5 },
        { playerId: 'seat1', seat: 1 },
        { playerId: 'seat3', seat: 3 },
      ],
      6,
      6,
    );

    // Order from dealer seat 6: seat 1, seat 3, seat 5.
    expect(split).toEqual({ seat1: 34, seat3: 34, seat5: 33 });
    expect(Object.values(split).reduce((sum, value) => sum + value, 0)).toBe(101);
  });

  it('places the dealer last in the odd-chip order', () => {
    const split = splitPot(
      100,
      [
        { playerId: 'dealer', seat: 4 },
        { playerId: 'left', seat: 5 },
      ],
      4,
      6,
    );

    expect(split.left).toBe(50);
    expect(split.dealer).toBe(50);

    const odd = splitPot(
      101,
      [
        { playerId: 'dealer', seat: 4 },
        { playerId: 'left', seat: 5 },
      ],
      4,
      6,
    );
    expect(odd.left).toBe(51);
    expect(odd.dealer).toBe(50);
  });

  it('wraps around the table when computing clockwise distance', () => {
    expect(clockwiseDistance(1, 6, 6)).toBe(1);
    expect(clockwiseDistance(6, 6, 6)).toBe(6);
    expect(clockwiseDistance(2, 6, 6)).toBe(2);
    expect(clockwiseDistance(6, 1, 6)).toBe(5);
  });

  it('rejects duplicate winners, empty winners and invalid amounts', () => {
    expect(() => splitPot(100, [], 1, 6)).toThrow(/at least one winner/i);
    expect(() =>
      splitPot(
        100,
        [
          { playerId: 'a', seat: 1 },
          { playerId: 'a', seat: 2 },
        ],
        1,
        6,
      ),
    ).toThrow(/Duplicate winners/i);
    expect(() => splitPot(-1, [{ playerId: 'a', seat: 1 }], 1, 6)).toThrow(/non-negative/i);
    expect(() => splitPot(10.5, [{ playerId: 'a', seat: 1 }], 1, 6)).toThrow(/integer/i);
  });

  it('conserves chips for a variety of pot sizes, ties and seat layouts', () => {
    for (let amount = 0; amount <= 50; amount += 1) {
      for (let winnerCount = 1; winnerCount <= 5; winnerCount += 1) {
        const winners = Array.from({ length: winnerCount }, (_, index) => ({
          playerId: `p${index + 1}`,
          seat: index + 1,
        }));
        const split = splitPot(amount, winners, 6, 6);
        const total = Object.values(split).reduce((sum, value) => sum + value, 0);
        expect(total).toBe(amount);
        const values = Object.values(split);
        expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
      }
    }
  });
});
