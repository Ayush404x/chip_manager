import type { ActionType, HandPhase, Street } from '@chiproom/shared';

export interface EngineSeat {
  playerId: string;
  nickname: string;
  seat: number;
  startingChips: number;
  chips: number;
  committed: number;
  contributed: number;
  folded: boolean;
  allIn: boolean;
  sittingOut: boolean;
  hasActed: boolean;
  raiseLocked: boolean;
  payout: number;
}

export interface EngineHand {
  handNumber: number;
  phase: HandPhase;
  street: Street;
  dealerSeat: number;
  sbSeat: number | null;
  bbSeat: number | null;
  currentBet: number;
  minRaise: number;
  lastRaiseSize: number;
  turnSeat: number | null;
  actionSeq: number;
  seats: EngineSeat[];
}

export interface EngineEvent {
  playerId: string;
  type: ActionType;
  amount: number;
  street: Street;
  note?: string;
}

export type EngineActionType = 'check' | 'bet' | 'call' | 'raise' | 'fold' | 'all_in';

export interface EngineAction {
  type: EngineActionType;
  /** Total target contribution for the current street (bet/raise). */
  amount?: number;
}

export interface EngineResult {
  hand: EngineHand;
  events: EngineEvent[];
}

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineError';
  }
}

export interface StartHandInput {
  handNumber: number;
  smallBlind: number;
  bigBlind: number;
  previousDealerSeat: number | null;
  players: Array<{
    playerId: string;
    nickname: string;
    seat: number;
    chips: number;
  }>;
}

export interface PotLayer {
  index: number;
  amount: number;
  eligiblePlayerIds: string[];
}

export interface ContributionInput {
  playerId: string;
  seat: number;
  contributed: number;
  folded: boolean;
}
