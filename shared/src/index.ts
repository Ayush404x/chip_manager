import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Enums & primitives                                                  */
/* ------------------------------------------------------------------ */

export const ROOM_STATUSES = ['lobby', 'active', 'paused', 'closed'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const PLAYER_STATUSES = ['pending', 'seated', 'sitting_out', 'removed'] as const;
export type PlayerStatus = (typeof PLAYER_STATUSES)[number];

export const HAND_PHASES = ['betting', 'awaiting_payout', 'complete'] as const;
export type HandPhase = (typeof HAND_PHASES)[number];

export const STREETS = ['preflop', 'flop', 'turn', 'river'] as const;
export type Street = (typeof STREETS)[number];

export const ACTION_TYPES = [
  'post_sb',
  'post_bb',
  'check',
  'bet',
  'call',
  'raise',
  'fold',
  'all_in',
  'win',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const SPOT_STATUSES = ['active', 'folded', 'all_in', 'sitting_out', 'disconnected'] as const;
export type SpotStatus = (typeof SPOT_STATUSES)[number];

/** Chip values are always integers. 100m is a generous guard rail. */
export const MAX_CHIPS = 100_000_000;

/* ------------------------------------------------------------------ */
/* Public API types                                                    */
/* ------------------------------------------------------------------ */

export interface RoomSettings {
  smallBlind: number;
  bigBlind: number;
  startingChips: number;
  maxPlayers: number;
  spectatorMode: boolean;
  lateJoin: boolean;
  allowRebuys: boolean;
  requireApproval: boolean;
  hasPassword: boolean;
}

export interface RoomSummary {
  id: string;
  code: string;
  name: string;
  status: RoomStatus;
  settings: RoomSettings;
  playerCount: number;
  seatedCount: number;
  createdAt: string;
}

export interface PublicPlayer {
  id: string;
  nickname: string;
  seat: number | null;
  chips: number;
  isHost: boolean;
  isReady: boolean;
  status: PlayerStatus;
  isConnected: boolean;
  isSpectator: boolean;
  joinedAt: string;
  inHand: boolean;
  handStatus: SpotStatus | null;
  committed: number;
  contributed: number;
  folded: boolean;
  allIn: boolean;
}

export interface RoomPreview {
  room: RoomSummary;
  hostNickname: string | null;
  players: Array<{
    nickname: string;
    seat: number | null;
    isHost: boolean;
    isConnected: boolean;
    status: PlayerStatus;
    isSpectator: boolean;
  }>;
}

export interface AuthResponse {
  roomCode: string;
  playerId: string;
  sessionToken: string;
  isHost: boolean;
  isSpectator: boolean;
}

export interface PlayerSeatView {
  playerId: string;
  nickname: string;
  seat: number;
  chips: number;
  committed: number;
  contributed: number;
  startingChips: number;
  folded: boolean;
  allIn: boolean;
  sittingOut: boolean;
  hasActed: boolean;
  raiseLocked: boolean;
  payout: number;
  endingChips: number | null;
  isConnected: boolean;
  isHost: boolean;
}

export interface PotView {
  id: string | null;
  index: number;
  amount: number;
  eligiblePlayerIds: string[];
  winnerIds: string[];
  distribution: Record<string, number> | null;
}

export interface ActionView {
  id: string;
  seq: number;
  playerId: string | null;
  nickname: string | null;
  type: ActionType;
  amount: number;
  street: Street;
  note: string | null;
  createdAt: string;
}

export interface LegalActions {
  canAct: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canBet: boolean;
  canRaise: boolean;
  canFold: boolean;
  minBet: number;
  minRaiseTo: number;
  maxRaiseTo: number;
  isAllInOnly: boolean;
  toCall: number;
}

export interface HandView {
  id: string;
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
  turnPlayerId: string | null;
  totalPot: number;
  pots: PotView[];
  seats: PlayerSeatView[];
  actions: ActionView[];
  legalActions: LegalActions | null;
  undoablePlayerId: string | null;
  autoSettled: boolean;
  startedAt: string;
  completedAt: string | null;
}

export interface ChipAdjustmentView {
  id: string;
  playerId: string;
  nickname: string;
  amount: number;
  reason: string;
  createdAt: string;
}

export interface RoomState {
  room: {
    id: string;
    code: string;
    name: string;
    status: RoomStatus;
    settings: RoomSettings;
    totalChips: number;
    version: number;
    createdAt: string;
    hostPlayerId: string | null;
  };
  me: PublicPlayer | null;
  players: PublicPlayer[];
  hand: HandView | null;
  adjustments?: ChipAdjustmentView[];
}

export interface PotPayout {
  potIndex: number;
  amount: number;
  winners: Array<{ playerId: string; nickname: string; amount: number }>;
}

export interface SettlementPreview {
  pots: PotPayout[];
  totalDistributed: number;
}

export interface HandHistorySummary {
  id: string;
  handNumber: number;
  startedAt: string;
  completedAt: string | null;
  totalPot: number;
  winners: Array<{ playerId: string; nickname: string; amount: number }>;
  yourNet?: number;
}

export interface HandHistoryDetail extends HandHistorySummary {
  street: Street;
  dealerSeat: number;
  actions: ActionView[];
  seats: PlayerSeatView[];
  pots: PotView[];
}

export interface RoomStats {
  handsPlayed: number;
  biggestPot: number;
  totalChipsInPlay: number;
  yourNet: number;
}

export interface RoomHistoryResponse {
  hands: HandHistoryDetail[];
  stats: RoomStats;
  adjustments: ChipAdjustmentView[];
}

/* ------------------------------------------------------------------ */
/* Zod schemas                                                         */
/* ------------------------------------------------------------------ */

const nicknameSchema = z
  .string()
  .trim()
  .min(2, 'Nickname must be at least 2 characters')
  .max(20, 'Nickname must be 20 characters or fewer')
  .regex(/^[\p{L}\p{N} _.\-']+$/u, 'Use letters, numbers, spaces, dots, dashes or apostrophes');

const roomNameSchema = z
  .string()
  .trim()
  .min(2, 'Room name must be at least 2 characters')
  .max(60, 'Room name must be 60 characters or fewer');

const passwordSchema = z
  .string()
  .max(64, 'Password must be 64 characters or fewer')
  .optional()
  .transform((value) => (value === undefined || value.trim() === '' ? undefined : value));

export const createRoomSchema = z
  .object({
    roomName: roomNameSchema,
    hostNickname: nicknameSchema,
    startingChips: z.number().int().min(100).max(1_000_000),
    smallBlind: z.number().int().min(1).max(1_000_000),
    bigBlind: z.number().int().min(2).max(1_000_000),
    maxPlayers: z.number().int().min(2).max(10),
    password: passwordSchema,
    spectatorMode: z.boolean().default(false),
    lateJoin: z.boolean().default(true),
    allowRebuys: z.boolean().default(true),
    requireApproval: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.bigBlind <= data.smallBlind) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bigBlind'],
        message: 'Big blind must be greater than the small blind',
      });
    }
    if (data.smallBlind >= data.startingChips) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['smallBlind'],
        message: 'Small blind must be smaller than the starting stack',
      });
    }
    if (data.password !== undefined && data.password.length < 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'Password must be at least 4 characters',
      });
    }
  });

export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const joinRoomSchema = z.object({
  nickname: nicknameSchema,
  password: z.string().max(64).optional(),
  spectator: z.boolean().optional().default(false),
});

export type JoinRoomInput = z.infer<typeof joinRoomSchema>;

export const rejoinSchema = z.object({
  sessionToken: z.string().min(16).max(128),
});

export const bettingActionSchema = z
  .object({
    actionId: z.string().uuid(),
    type: z.enum(['check', 'bet', 'call', 'raise', 'fold', 'all_in']),
    amount: z.number().int().min(0).optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.type === 'bet' || value.type === 'raise') && value.amount === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount'],
        message: 'A target amount is required for a bet or raise',
      });
    }
  });

export type BettingActionInput = z.infer<typeof bettingActionSchema>;

export const settleSchema = z.object({
  selections: z
    .array(
      z.object({
        potIndex: z.number().int().min(0),
        winnerIds: z.array(z.string().uuid()).min(1),
      }),
    )
    .min(1),
});

export type SettleInput = z.infer<typeof settleSchema>;

export const updateSettingsSchema = z
  .object({
    roomName: roomNameSchema.optional(),
    startingChips: z.number().int().min(100).max(1_000_000).optional(),
    smallBlind: z.number().int().min(1).max(1_000_000).optional(),
    bigBlind: z.number().int().min(2).max(1_000_000).optional(),
    maxPlayers: z.number().int().min(2).max(10).optional(),
    password: z.string().max(64).nullable().optional(),
    spectatorMode: z.boolean().optional(),
    lateJoin: z.boolean().optional(),
    allowRebuys: z.boolean().optional(),
    requireApproval: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.smallBlind === undefined ||
      value.bigBlind === undefined ||
      value.bigBlind > value.smallBlind,
    { message: 'Big blind must be greater than the small blind', path: ['bigBlind'] },
  );

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/** Normalize a room code for lookup. */
export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export function isRoomCode(value: string): boolean {
  return /^[A-HJ-NP-Z2-9]{6}$/.test(value);
}

/** Human readable labels for action types. */
export const ACTION_LABELS: Record<ActionType, string> = {
  post_sb: 'Small blind',
  post_bb: 'Big blind',
  check: 'Check',
  bet: 'Bet',
  call: 'Call',
  raise: 'Raise',
  fold: 'Fold',
  all_in: 'All in',
  win: 'Won pot',
};
