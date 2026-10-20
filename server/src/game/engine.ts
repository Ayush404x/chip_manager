import type { LegalActions, Street } from '@chiproom/shared';
import {
  EngineError,
  type EngineAction,
  type EngineEvent,
  type EngineHand,
  type EngineResult,
  type EngineSeat,
  type StartHandInput,
} from './types.js';

const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];

function cloneHand(hand: EngineHand): EngineHand {
  return structuredClone(hand);
}

function orderedSeats(hand: EngineHand): EngineSeat[] {
  return [...hand.seats].sort((a, b) => a.seat - b.seat);
}

function liveSeats(hand: EngineHand): EngineSeat[] {
  return hand.seats.filter((seat) => !seat.folded && !seat.sittingOut);
}

function countLive(hand: EngineHand): number {
  return liveSeats(hand).length;
}

function countActable(hand: EngineHand): number {
  return hand.seats.filter(
    (seat) => !seat.folded && !seat.sittingOut && !seat.allIn && seat.chips > 0,
  ).length;
}

function seatOf(hand: EngineHand, playerId: string): EngineSeat {
  const seat = hand.seats.find((entry) => entry.playerId === playerId);
  if (!seat) throw new EngineError('Player is not part of this hand');
  return seat;
}

function needsAction(seat: EngineSeat, currentBet: number): boolean {
  if (seat.folded || seat.sittingOut || seat.allIn) return false;
  return !seat.hasActed || seat.committed < currentBet;
}

/** Next seat clockwise that still owes an action. */
function findNextToAct(hand: EngineHand, fromSeat: number): number | null {
  const seats = orderedSeats(hand);
  if (seats.length === 0) return null;

  let startIndex = seats.findIndex((seat) => seat.seat === fromSeat);
  if (startIndex === -1) {
    // Fallback: start at the last seat before `fromSeat`.
    startIndex = seats.reduce(
      (best, seat, index) => (seat.seat < fromSeat ? index : best),
      seats.length - 1,
    );
  }

  for (let offset = 1; offset <= seats.length; offset += 1) {
    const seat = seats[(startIndex + offset) % seats.length];
    if (needsAction(seat, hand.currentBet)) return seat.seat;
  }
  return null;
}

function nextStreet(street: Street): Street {
  const index = STREETS.indexOf(street);
  return STREETS[Math.min(index + 1, STREETS.length - 1)];
}

function resetForNewStreet(hand: EngineHand, bigBlind: number): void {
  for (const seat of hand.seats) {
    seat.committed = 0;
    seat.hasActed = false;
    seat.raiseLocked = false;
  }
  hand.currentBet = 0;
  hand.minRaise = bigBlind;
  hand.lastRaiseSize = bigBlind;
}

function setAwaitingPayout(hand: EngineHand): void {
  hand.phase = 'awaiting_payout';
  hand.turnSeat = null;
}

/** Run the remaining streets when nobody can bet any more (all-in scenario). */
function runOutStreets(hand: EngineHand, bigBlind: number): void {
  while (hand.street !== 'river') {
    hand.street = nextStreet(hand.street);
    resetForNewStreet(hand, bigBlind);
  }
  setAwaitingPayout(hand);
}

/** Move to the next street, skipping streets where betting is impossible. */
function advanceStreet(hand: EngineHand, bigBlind: number): void {
  while (hand.street !== 'river') {
    hand.street = nextStreet(hand.street);
    resetForNewStreet(hand, bigBlind);

    if (countActable(hand) < 2) continue; // no further betting possible
    const next = findNextToAct(hand, hand.dealerSeat);
    if (next !== null) {
      hand.turnSeat = next;
      hand.phase = 'betting';
      return;
    }
  }
  setAwaitingPayout(hand);
}

function resolveAction(hand: EngineHand, bigBlind: number, actorSeat: number): void {
  if (countLive(hand) <= 1) {
    setAwaitingPayout(hand);
    return;
  }

  // A player may still owe chips even when everyone else is all-in — for
  // example when a short all-in blind is raised. Let them call or fold before
  // running out the remaining streets.
  const next = findNextToAct(hand, actorSeat);
  if (next !== null) {
    hand.turnSeat = next;
    hand.phase = 'betting';
    return;
  }

  advanceStreet(hand, bigBlind);
}

function reopenBetting(hand: EngineHand, actorPlayerId: string): void {
  for (const seat of hand.seats) {
    if (seat.playerId === actorPlayerId) continue;
    if (!seat.folded && !seat.sittingOut && !seat.allIn) {
      seat.hasActed = false;
      seat.raiseLocked = false;
    }
  }
}

/**
 * A short all-in does not reopen betting for players who already acted.
 * They may call or fold, but cannot re-raise.
 */
function lockRaiseForActedPlayers(hand: EngineHand, actorPlayerId: string): void {
  for (const seat of hand.seats) {
    if (seat.playerId === actorPlayerId) continue;
    if (!seat.folded && !seat.sittingOut && !seat.allIn && seat.hasActed) {
      seat.raiseLocked = true;
    }
  }
}

function commitChips(seat: EngineSeat, amount: number): number {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new EngineError('Chip amount must be a non-negative integer');
  }
  if (amount > seat.chips) {
    throw new EngineError('A player cannot commit more chips than their stack');
  }
  seat.chips -= amount;
  seat.committed += amount;
  seat.contributed += amount;
  if (seat.chips === 0) seat.allIn = true;
  return amount;
}

function nextOccupiedSeat(hand: EngineHand, fromSeat: number): EngineSeat {
  const seats = orderedSeats(hand);
  const index = seats.findIndex((seat) => seat.seat === fromSeat);
  return seats[(index + 1) % seats.length];
}

/**
 * Create a new hand: rotate the button, post blinds and find the first player
 * to act. Hands never deal cards.
 */
export function startHand(input: StartHandInput): EngineResult {
  if (input.players.length < 2) {
    throw new EngineError('At least two players with chips are required to start a hand');
  }
  const sorted = [...input.players].sort((a, b) => a.seat - b.seat);
  const uniqueSeats = new Set(sorted.map((p) => p.seat));
  if (uniqueSeats.size !== sorted.length) throw new EngineError('Duplicate seats in hand');

  const seats: EngineSeat[] = sorted.map((player) => ({
    playerId: player.playerId,
    nickname: player.nickname,
    seat: player.seat,
    startingChips: player.chips,
    chips: player.chips,
    committed: 0,
    contributed: 0,
    folded: false,
    allIn: false,
    sittingOut: false,
    hasActed: false,
    raiseLocked: false,
    payout: 0,
  }));

  const hand: EngineHand = {
    handNumber: input.handNumber,
    phase: 'betting',
    street: 'preflop',
    dealerSeat: seats[0].seat,
    sbSeat: null,
    bbSeat: null,
    currentBet: 0,
    minRaise: input.bigBlind,
    lastRaiseSize: input.bigBlind,
    turnSeat: null,
    actionSeq: 0,
    seats,
  };

  if (input.previousDealerSeat === null) {
    hand.dealerSeat = seats[0].seat;
  } else {
    const next = orderedSeats(hand).find((seat) => seat.seat > (input.previousDealerSeat as number));
    hand.dealerSeat = next ? next.seat : seats[0].seat;
  }

  if (seats.length === 2) {
    hand.sbSeat = hand.dealerSeat;
    hand.bbSeat = nextOccupiedSeat(hand, hand.dealerSeat).seat;
  } else {
    hand.sbSeat = nextOccupiedSeat(hand, hand.dealerSeat).seat;
    hand.bbSeat = nextOccupiedSeat(hand, hand.sbSeat).seat;
  }

  const events: EngineEvent[] = [];

  const postBlind = (seatNumber: number, blind: number, type: 'post_sb' | 'post_bb') => {
    const seat = hand.seats.find((entry) => entry.seat === seatNumber);
    if (!seat) throw new EngineError('Blind seat missing');
    const paid = commitChips(seat, Math.min(blind, seat.chips));
    events.push({
      playerId: seat.playerId,
      type,
      amount: paid,
      street: 'preflop',
      note: paid < blind ? `All-in for less than the ${type === 'post_sb' ? 'small' : 'big'} blind` : undefined,
    });
  };

  postBlind(hand.sbSeat, input.smallBlind, 'post_sb');
  postBlind(hand.bbSeat, input.bigBlind, 'post_bb');

  hand.currentBet = Math.max(0, ...hand.seats.map((seat) => seat.committed));
  hand.minRaise = input.bigBlind;
  hand.lastRaiseSize = input.bigBlind;

  // Preflop action starts left of the big blind. Heads-up that wraps to the
  // dealer/small blind, which is exactly the heads-up rule. If everyone is
  // already all-in, findNextToAct returns null and the streets run out.
  const first = findNextToAct(hand, hand.bbSeat);
  hand.turnSeat = first;
  if (first === null) advanceStreet(hand, input.bigBlind);

  return { hand, events };
}

export function getLegalActions(hand: EngineHand, playerId: string): LegalActions {
  const blank: LegalActions = {
    canAct: false,
    canCheck: false,
    canCall: false,
    callAmount: 0,
    canBet: false,
    canRaise: false,
    canFold: false,
    minBet: hand.minRaise,
    minRaiseTo: 0,
    maxRaiseTo: 0,
    isAllInOnly: false,
    toCall: 0,
  };

  if (hand.phase !== 'betting' || hand.turnSeat === null) return blank;
  const seat = hand.seats.find((entry) => entry.playerId === playerId);
  if (!seat || seat.folded || seat.allIn || seat.sittingOut || seat.seat !== hand.turnSeat) {
    return blank;
  }

  const toCall = Math.max(0, hand.currentBet - seat.committed);
  const maxRaiseTo = seat.committed + seat.chips;
  // With no other player holding chips there is nobody to respond to a bet or
  // raise. The last player can still call an all-in or fold.
  const othersCanAct = countActable(hand) >= 2;
  const canBet = hand.currentBet === 0 && seat.chips > 0 && othersCanAct;
  const canRaise =
    hand.currentBet > 0 && !seat.raiseLocked && maxRaiseTo > hand.currentBet && othersCanAct;
  const fullRaiseTarget = hand.currentBet + hand.minRaise;
  const minRaiseTo = canRaise ? Math.min(fullRaiseTarget, maxRaiseTo) : 0;
  const isAllInOnly =
    (canBet && maxRaiseTo < hand.minRaise) ||
    (canRaise && maxRaiseTo < fullRaiseTarget && maxRaiseTo > hand.currentBet);

  return {
    canAct: true,
    canCheck: toCall === 0,
    canCall: toCall > 0,
    callAmount: Math.min(toCall, seat.chips),
    canBet,
    canRaise,
    canFold: true,
    minBet: Math.min(hand.minRaise, maxRaiseTo),
    minRaiseTo,
    maxRaiseTo,
    isAllInOnly,
    toCall,
  };
}

/**
 * Apply one betting action. The server only calls this after authenticating
 * the actor; all chip and legality decisions live here.
 */
export function applyAction(
  hand: EngineHand,
  playerId: string,
  action: EngineAction,
): EngineResult {
  if (hand.phase !== 'betting') throw new EngineError('Betting is closed for this hand');
  if (hand.turnSeat === null) throw new EngineError('There is no player to act');

  const next = cloneHand(hand);
  const actor = seatOf(next, playerId);

  if (actor.folded) throw new EngineError('Folded players cannot act');
  if (actor.allIn) throw new EngineError('All-in players cannot act');
  if (actor.sittingOut) throw new EngineError('Sitting-out players cannot act');
  if (actor.seat !== next.turnSeat) throw new EngineError('It is not your turn');

  const othersCanAct = countActable(next) >= 2;

  const events: EngineEvent[] = [];
  const toCall = Math.max(0, next.currentBet - actor.committed);
  const maxTarget = actor.committed + actor.chips;
  const bigBlind = Math.max(next.lastRaiseSize, next.minRaise, 1);

  const markActed = () => {
    actor.hasActed = true;
  };

  const log = (
    type: EngineEvent['type'],
    amount: number,
    note?: string,
  ) => {
    events.push({
      playerId: actor.playerId,
      type,
      amount,
      street: next.street,
      note,
    });
  };

  switch (action.type) {
    case 'fold': {
      actor.folded = true;
      markActed();
      log('fold', 0);
      break;
    }

    case 'check': {
      if (toCall > 0) {
        throw new EngineError(`You must call ${toCall} chips or fold; checking is not allowed`);
      }
      markActed();
      log('check', 0);
      break;
    }

    case 'call': {
      if (toCall <= 0) throw new EngineError('There is no bet to call; use check instead');
      const paid = commitChips(actor, Math.min(toCall, actor.chips));
      markActed();
      log('call', paid);
      break;
    }

    case 'bet': {
      if (next.currentBet !== 0) {
        throw new EngineError('There is already a bet; use raise instead');
      }
      if (!othersCanAct) {
        throw new EngineError('No other player can call a bet; check instead');
      }
      if (action.amount === undefined) throw new EngineError('A bet amount is required');
      const target = action.amount;
      if (!Number.isInteger(target)) throw new EngineError('Bet must be a whole number of chips');
      if (target <= 0) throw new EngineError('Bet must be greater than zero');
      if (target > maxTarget) throw new EngineError('You cannot bet more chips than your stack');
      const isAllIn = target === maxTarget;
      if (!isAllIn && target < next.minRaise) {
        throw new EngineError(`Minimum bet is ${next.minRaise} chips`);
      }
      commitChips(actor, target - actor.committed);
      markActed();

      if (target >= next.minRaise) {
        next.currentBet = target;
        next.minRaise = target;
        next.lastRaiseSize = target;
        reopenBetting(next, actor.playerId);
      } else {
        // All-in for less than a full bet: does not reopen betting for checkers.
        next.currentBet = target;
        lockRaiseForActedPlayers(next, actor.playerId);
      }
      log('bet', target, isAllIn ? 'All-in bet' : undefined);
      break;
    }

    case 'raise': {
      if (next.currentBet === 0) {
        throw new EngineError('There is no bet to raise; use bet instead');
      }
      if (!othersCanAct) {
        throw new EngineError('No other player can call a raise; call or fold instead');
      }
      if (actor.raiseLocked) {
        throw new EngineError('Betting was not reopened by the short all-in; you may only call or fold');
      }
      if (action.amount === undefined) throw new EngineError('A raise target is required');
      const target = action.amount;
      if (!Number.isInteger(target)) throw new EngineError('Raise target must be a whole number');
      if (target <= next.currentBet) {
        throw new EngineError(`Raise target must be greater than the current bet (${next.currentBet})`);
      }
      if (target > maxTarget) throw new EngineError('You cannot raise more chips than your stack');
      const raiseSize = target - next.currentBet;
      const isAllIn = target === maxTarget;
      if (!isAllIn && raiseSize < next.minRaise) {
        throw new EngineError(`Minimum raise is ${next.minRaise} chips on top of the current bet`);
      }

      commitChips(actor, target - actor.committed);
      markActed();

      if (raiseSize >= next.minRaise) {
        next.currentBet = target;
        next.minRaise = raiseSize;
        next.lastRaiseSize = raiseSize;
        reopenBetting(next, actor.playerId);
        log('raise', target, isAllIn ? 'All-in raise' : undefined);
      } else {
        // Short all-in raise: raise the required call, but do not reopen betting.
        next.currentBet = target;
        lockRaiseForActedPlayers(next, actor.playerId);
        log('raise', target, 'Short all-in raise; betting not reopened');
      }
      break;
    }

    case 'all_in': {
      if (actor.chips <= 0) throw new EngineError('You have no chips left to go all-in');
      const target = actor.committed + actor.chips;
      const paid = actor.chips;

      if (target > next.currentBet && !othersCanAct) {
        throw new EngineError('No other player can call an all-in raise; call the bet or fold instead');
      }

      if (target <= next.currentBet) {
        commitChips(actor, paid);
        markActed();
        log('all_in', paid, 'All-in call');
        break;
      }

      if (next.currentBet === 0) {
        if (actor.raiseLocked) {
          throw new EngineError('Betting is not reopened; you may only call or fold');
        }
        commitChips(actor, paid);
        markActed();
        if (target >= next.minRaise) {
          next.currentBet = target;
          next.minRaise = target;
          next.lastRaiseSize = target;
          reopenBetting(next, actor.playerId);
          log('all_in', paid, `All-in bet to ${target}`);
        } else {
          next.currentBet = target;
          lockRaiseForActedPlayers(next, actor.playerId);
          log('all_in', paid, `Short all-in bet to ${target}`);
        }
        break;
      }

      if (actor.raiseLocked) {
        throw new EngineError('Betting was not reopened by the short all-in; you may only call or fold');
      }
      if (!othersCanAct) {
        throw new EngineError('No other player can call an all-in raise; call the bet or fold instead');
      }

      const raiseSize = target - next.currentBet;
      commitChips(actor, paid);
      markActed();
      if (raiseSize >= next.minRaise) {
        next.currentBet = target;
        next.minRaise = raiseSize;
        next.lastRaiseSize = raiseSize;
        reopenBetting(next, actor.playerId);
        log('all_in', paid, `All-in raise to ${target}`);
      } else {
        next.currentBet = target;
        lockRaiseForActedPlayers(next, actor.playerId);
        log('all_in', paid, `Short all-in raise to ${target}; betting not reopened`);
      }
      break;
    }

    default: {
      throw new EngineError('Unknown betting action');
    }
  }

  next.actionSeq += 1;
  resolveAction(next, bigBlind, actor.seat);

  return { hand: next, events };
}

/**
 * Host-initiated fold (sit out / recovery). Unlike a betting fold, this can be
 * applied when it is not the player's turn.
 */
export function forceFold(hand: EngineHand, playerId: string, note = 'Folded by host'): EngineResult {
  if (hand.phase !== 'betting') throw new EngineError('The hand is no longer in the betting phase');
  if (hand.turnSeat === null) throw new EngineError('There is no player to act');

  const next = cloneHand(hand);
  const seat = seatOf(next, playerId);
  if (seat.folded) throw new EngineError('Player has already folded');
  if (seat.allIn) throw new EngineError('All-in players cannot fold');

  seat.folded = true;
  seat.hasActed = true;
  next.actionSeq += 1;
  const events: EngineEvent[] = [
    { playerId: seat.playerId, type: 'fold', amount: 0, street: next.street, note },
  ];

  if (countLive(next) <= 1) {
    setAwaitingPayout(next);
    return { hand: next, events };
  }

  if (countActable(next) < 2) {
    const following = findNextToAct(next, seat.seat);
    if (following !== null) {
      next.turnSeat = following;
      return { hand: next, events };
    }
    runOutStreets(next, next.lastRaiseSize || next.minRaise);
    return { hand: next, events };
  }

  if (next.turnSeat === seat.seat) {
    const following = findNextToAct(next, seat.seat);
    if (following === null) {
      advanceStreet(next, next.lastRaiseSize || next.minRaise);
    } else {
      next.turnSeat = following;
    }
  }

  return { hand: next, events };
}

/**
 * Force the hand forward when no betting is possible. Used for host recovery
 * and for interrupted hands. Never changes contributed chips.
 */
export function forceAdvance(hand: EngineHand, bigBlind: number): EngineResult {
  if (hand.phase !== 'betting') throw new EngineError('The hand is not in the betting phase');
  const next = cloneHand(hand);
  if (countLive(next) <= 1) {
    setAwaitingPayout(next);
  } else if (countActable(next) < 2 || next.turnSeat === null) {
    runOutStreets(next, bigBlind);
  } else {
    advanceStreet(next, bigBlind);
  }
  return { hand: next, events: [] };
}

/** Recompute who should act. Returns null when the hand should be settled. */
export function findRecoveredTurn(hand: EngineHand): number | null {
  if (hand.phase !== 'betting') return null;
  if (countLive(hand) <= 1) return null;
  if (countActable(hand) < 2) {
    // The last player with chips may still owe a call after a short all-in.
    return findNextToAct(hand, hand.turnSeat ?? hand.dealerSeat);
  }
  const from = hand.turnSeat ?? hand.dealerSeat;
  return findNextToAct(hand, from);
}

export const streetOrder = STREETS;
