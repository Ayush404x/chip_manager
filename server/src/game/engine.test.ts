import { describe, expect, it } from 'vitest';
import {
  applyAction,
  findRecoveredTurn,
  getLegalActions,
  startHand,
} from './engine.js';
import type { EngineHand, StartHandInput } from './types.js';

function players(...stacks: number[]) {
  return stacks.map((chips, index) => ({
    playerId: `p${index + 1}`,
    nickname: `Player ${index + 1}`,
    seat: index + 1,
    chips,
  }));
}

function start(
  stacks: number[],
  options: Partial<Pick<StartHandInput, 'smallBlind' | 'bigBlind' | 'previousDealerSeat' | 'handNumber'>> = {},
) {
  return startHand({
    handNumber: options.handNumber ?? 1,
    smallBlind: options.smallBlind ?? 25,
    bigBlind: options.bigBlind ?? 50,
    previousDealerSeat: options.previousDealerSeat ?? null,
    players: players(...stacks),
  });
}

function totalChips(hand: EngineHand): number {
  return hand.seats.reduce((sum, seat) => sum + seat.chips + seat.contributed, 0);
}

describe('engine — hand start, blinds and turn order', () => {
  it('posts heads-up blinds, puts the dealer on the small blind and starts with the dealer', () => {
    const { hand, events } = start([5000, 5000]);

    expect(hand.dealerSeat).toBe(1);
    expect(hand.sbSeat).toBe(1);
    expect(hand.bbSeat).toBe(2);
    expect(hand.street).toBe('preflop');
    expect(hand.phase).toBe('betting');
    expect(hand.currentBet).toBe(50);
    expect(hand.minRaise).toBe(50);
    expect(hand.turnSeat).toBe(1);
    expect(hand.seats[0].chips).toBe(4975);
    expect(hand.seats[0].committed).toBe(25);
    expect(hand.seats[1].chips).toBe(4950);
    expect(hand.seats[1].committed).toBe(50);
    expect(events.map((event) => event.type)).toEqual(['post_sb', 'post_bb']);
    expect(totalChips(hand)).toBe(10_000);
  });

  it('uses the seat clockwise from the previous dealer and starts three-handed action left of the big blind', () => {
    const { hand } = start([5000, 5000, 5000], { previousDealerSeat: 1 });

    expect(hand.dealerSeat).toBe(2);
    expect(hand.sbSeat).toBe(3);
    expect(hand.bbSeat).toBe(1);
    expect(hand.turnSeat).toBe(2);
    expect(hand.currentBet).toBe(50);
    expect(hand.seats.map((seat) => seat.committed)).toEqual([50, 0, 25]);
  });

  it('accepts a short all-in big blind and lets the small blind act on the remainder', () => {
    const { hand, events } = start([5000, 30]);

    expect(hand.currentBet).toBe(30);
    expect(hand.turnSeat).toBe(1);
    expect(hand.seats[1].allIn).toBe(true);
    expect(hand.seats[1].committed).toBe(30);
    expect(events[1].note).toMatch(/All-in for less than the big blind/);

    const legal = getLegalActions(hand, 'p1');
    expect(legal.canAct).toBe(true);
    expect(legal.canCall).toBe(true);
    expect(legal.callAmount).toBe(5);
    expect(legal.canBet).toBe(false);
    expect(legal.canRaise).toBe(false);

    expect(() => applyAction(hand, 'p1', { type: 'check' })).toThrow(/must call 5/i);
    expect(() => applyAction(hand, 'p1', { type: 'all_in' })).toThrow(/No other player can call/i);

    const called = applyAction(hand, 'p1', { type: 'call' });
    expect(called.hand.seats[0].contributed).toBe(30);
    expect(called.hand.seats[1].contributed).toBe(30);
    expect(called.hand.phase).toBe('awaiting_payout');
    expect(called.hand.street).toBe('river');
    expect(totalChips(called.hand)).toBe(5030);
  });

  it('runs out the streets automatically when every player is all-in from the blinds', () => {
    const { hand } = start([25, 40]);
    expect(hand.phase).toBe('awaiting_payout');
    expect(hand.street).toBe('river');
    expect(hand.turnSeat).toBeNull();
    expect(totalChips(hand)).toBe(65);
  });
});

describe('engine — actions and turn state machine', () => {
  it('advances streets only after every player has matched the bet', () => {
    let { hand } = start([5000, 5000]);

    let result = applyAction(hand, 'p1', { type: 'call' });
    hand = result.hand;
    expect(hand.turnSeat).toBe(2);
    expect(hand.street).toBe('preflop');
    expect(hand.seats[0].chips).toBe(4950);

    result = applyAction(hand, 'p2', { type: 'check' });
    hand = result.hand;
    expect(hand.street).toBe('flop');
    expect(hand.currentBet).toBe(0);
    expect(hand.turnSeat).toBe(2);
    expect(hand.seats[0].committed).toBe(0);

    result = applyAction(hand, 'p2', { type: 'check' });
    hand = result.hand;
    expect(hand.turnSeat).toBe(1);
    result = applyAction(hand, 'p1', { type: 'check' });
    hand = result.hand;
    expect(hand.street).toBe('turn');

    hand = applyAction(hand, 'p2', { type: 'check' }).hand;
    hand = applyAction(hand, 'p1', { type: 'check' }).hand;
    expect(hand.street).toBe('river');

    hand = applyAction(hand, 'p2', { type: 'check' }).hand;
    hand = applyAction(hand, 'p1', { type: 'check' }).hand;
    expect(hand.phase).toBe('awaiting_payout');
    expect(hand.street).toBe('river');
    expect(hand.turnSeat).toBeNull();
    expect(hand.seats.reduce((sum, seat) => sum + seat.contributed, 0)).toBe(100);
    expect(totalChips(hand)).toBe(10_000);
  });

  it('rejects checks facing a bet, calls with no bet and out-of-turn actions', () => {
    const { hand } = start([5000, 5000]);
    expect(() => applyAction(hand, 'p2', { type: 'call' })).toThrow(/not your turn/i);
    expect(() => applyAction(hand, 'p1', { type: 'check' })).toThrow(/must call 25/i);

    const checked = applyAction(hand, 'p1', { type: 'call' }).hand;
    const afterCheck = applyAction(checked, 'p2', { type: 'check' }).hand;
    expect(() => applyAction(afterCheck, 'p1', { type: 'call' })).toThrow(/not your turn/i);
    const flopFirst = applyAction(afterCheck, 'p2', { type: 'check' }).hand;
    expect(() => applyAction(flopFirst, 'p1', { type: 'call' })).toThrow(/no bet to call/i);
    expect(() => applyAction(flopFirst, 'p1', { type: 'raise', amount: 100 })).toThrow(
      /no bet to raise/i,
    );
  });

  it('enforces minimum bets and raises and prevents overspending', () => {
    let { hand } = start([5000, 5000]);
    hand = applyAction(hand, 'p1', { type: 'call' }).hand;
    hand = applyAction(hand, 'p2', { type: 'check' }).hand;
    expect(hand.street).toBe('flop');
    expect(hand.turnSeat).toBe(2);

    expect(() => applyAction(hand, 'p2', { type: 'bet', amount: 49 })).toThrow(/Minimum bet is 50/i);
    expect(() => applyAction(hand, 'p2', { type: 'bet', amount: 6000 })).toThrow(/cannot bet more/i);
    expect(() => applyAction(hand, 'p2', { type: 'bet', amount: 50.5 })).toThrow(/whole number/i);
    expect(() => applyAction(hand, 'p2', { type: 'bet', amount: -50 })).toThrow(/greater than zero/i);

    hand = applyAction(hand, 'p2', { type: 'bet', amount: 50 }).hand;
    expect(hand.currentBet).toBe(50);
    expect(hand.minRaise).toBe(50);
    expect(hand.turnSeat).toBe(1);

    expect(() => applyAction(hand, 'p1', { type: 'raise', amount: 75 })).toThrow(/Minimum raise is 50/i);
    expect(() => applyAction(hand, 'p1', { type: 'raise', amount: 50 })).toThrow(/greater than the current bet/i);
    expect(() => applyAction(hand, 'p1', { type: 'raise', amount: 10_000 })).toThrow(/cannot raise more/i);

    const raised = applyAction(hand, 'p1', { type: 'raise', amount: 100 }).hand;
    expect(raised.currentBet).toBe(100);
    expect(raised.minRaise).toBe(50);
    expect(raised.turnSeat).toBe(2);
    expect(raised.seats[0].chips).toBe(4850);

    const legal = getLegalActions(raised, 'p2');
    expect(legal.toCall).toBe(50);
    expect(legal.minRaiseTo).toBe(150);
    expect(legal.maxRaiseTo).toBe(4950);
  });

  it('does not reopen betting for players who already acted after a short all-in raise', () => {
    const hand: EngineHand = {
      handNumber: 1,
      phase: 'betting',
      street: 'flop',
      dealerSeat: 1,
      sbSeat: 1,
      bbSeat: 2,
      currentBet: 100,
      minRaise: 100,
      lastRaiseSize: 100,
      turnSeat: 2,
      actionSeq: 5,
      seats: [
        {
          playerId: 'p1',
          nickname: 'Player 1',
          seat: 1,
          startingChips: 1100,
          chips: 900,
          committed: 100,
          contributed: 200,
          folded: false,
          allIn: false,
          sittingOut: false,
          hasActed: true,
          raiseLocked: false,
          payout: 0,
        },
        {
          playerId: 'p2',
          nickname: 'Player 2',
          seat: 2,
          startingChips: 140,
          chips: 40,
          committed: 100,
          contributed: 200,
          folded: false,
          allIn: false,
          sittingOut: false,
          hasActed: false,
          raiseLocked: false,
          payout: 0,
        },
        {
          playerId: 'p3',
          nickname: 'Player 3',
          seat: 3,
          startingChips: 1100,
          chips: 900,
          committed: 100,
          contributed: 200,
          folded: false,
          allIn: false,
          sittingOut: false,
          hasActed: true,
          raiseLocked: false,
          payout: 0,
        },
      ],
    };

    const shortRaise = applyAction(hand, 'p2', { type: 'all_in' });
    expect(shortRaise.hand.currentBet).toBe(140);
    expect(shortRaise.hand.seats[1].allIn).toBe(true);
    expect(shortRaise.hand.seats[0].raiseLocked).toBe(true);
    expect(shortRaise.hand.seats[2].raiseLocked).toBe(true);
    expect(shortRaise.events[0].note).toMatch(/betting not reopened/i);
    expect(shortRaise.hand.turnSeat).toBe(3);

    const p3Legal = getLegalActions(shortRaise.hand, 'p3');
    expect(p3Legal.canCall).toBe(true);
    expect(p3Legal.callAmount).toBe(40);
    expect(p3Legal.canRaise).toBe(false);
    expect(() => applyAction(shortRaise.hand, 'p3', { type: 'raise', amount: 300 })).toThrow(
      /not reopened/i,
    );

    const calledByP3 = applyAction(shortRaise.hand, 'p3', { type: 'call' }).hand;
    expect(calledByP3.turnSeat).toBe(1);
    const p1Legal = getLegalActions(calledByP3, 'p1');
    expect(p1Legal.canRaise).toBe(false);
    expect(p1Legal.canCall).toBe(true);
    expect(p1Legal.callAmount).toBe(40);
    expect(() => applyAction(calledByP3, 'p1', { type: 'raise', amount: 300 })).toThrow(
      /not reopened/i,
    );

    const calledByP1 = applyAction(calledByP3, 'p1', { type: 'call' }).hand;
    expect(calledByP1.street).toBe('turn');
    expect(calledByP1.phase).toBe('betting');
  });

  it('runs out the board when an all-in is called and no player can bet', () => {
    let { hand } = start([100, 100]);
    hand = applyAction(hand, 'p1', { type: 'all_in' }).hand;
    expect(hand.seats[0].allIn).toBe(true);
    expect(hand.turnSeat).toBe(2);
    expect(hand.currentBet).toBe(100);

    hand = applyAction(hand, 'p2', { type: 'all_in' }).hand;
    expect(hand.seats[1].allIn).toBe(true);
    expect(hand.phase).toBe('awaiting_payout');
    expect(hand.street).toBe('river');
    expect(hand.seats.every((seat) => seat.contributed === 100)).toBe(true);
    expect(totalChips(hand)).toBe(200);
  });

  it('automatically opens settlement when only one live player remains', () => {
    let { hand } = start([5000, 5000, 5000]);
    hand = applyAction(hand, 'p1', { type: 'fold' }).hand;
    expect(hand.turnSeat).toBe(2);
    hand = applyAction(hand, 'p2', { type: 'fold' }).hand;
    expect(hand.phase).toBe('awaiting_payout');
    expect(hand.turnSeat).toBeNull();
    expect(totalChips(hand)).toBe(15_000);
  });

  it('skips folded and all-in players when finding the next actor', () => {
    let { hand } = start([5000, 5000, 5000], { smallBlind: 25, bigBlind: 50 });
    hand = applyAction(hand, 'p1', { type: 'fold' }).hand;
    expect(hand.turnSeat).toBe(2);
    hand = applyAction(hand, 'p2', { type: 'call' }).hand;
    expect(hand.turnSeat).toBe(3);
    hand = applyAction(hand, 'p3', { type: 'check' }).hand;
    expect(hand.street).toBe('flop');
    // Dealer 1 folded; action starts with seat 2 and seat 3 is still live.
    expect(hand.turnSeat).toBe(2);

    const recovery = findRecoveredTurn(hand);
    expect(recovery).not.toBeNull();
  });
});
