import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const roomStatusEnum = pgEnum('room_status', ['lobby', 'active', 'paused', 'closed']);
export const playerStatusEnum = pgEnum('player_status', ['pending', 'seated', 'sitting_out', 'removed']);
export const handPhaseEnum = pgEnum('hand_phase', ['betting', 'awaiting_payout', 'complete']);
export const streetEnum = pgEnum('street', ['preflop', 'flop', 'turn', 'river']);
export const actionTypeEnum = pgEnum('action_type', [
  'post_sb',
  'post_bb',
  'check',
  'bet',
  'call',
  'raise',
  'fold',
  'all_in',
  'win',
]);

const createdAt = timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 8 }).notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    hostPlayerId: uuid('host_player_id'),
    status: roomStatusEnum('status').notNull().default('lobby'),
    smallBlind: integer('small_blind').notNull(),
    bigBlind: integer('big_blind').notNull(),
    startingChips: integer('starting_chips').notNull(),
    maxPlayers: integer('max_players').notNull(),
    passwordHash: text('password_hash'),
    spectatorMode: boolean('spectator_mode').notNull().default(false),
    lateJoin: boolean('late_join').notNull().default(true),
    allowRebuys: boolean('allow_rebuys').notNull().default(true),
    requireApproval: boolean('require_approval').notNull().default(false),
    totalChips: integer('total_chips').notNull().default(0),
    version: integer('version').notNull().default(0),
    createdAt,
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => ({
    codeUnique: uniqueIndex('rooms_code_unique').on(table.code),
  }),
);

export const players = pgTable(
  'players',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    nickname: varchar('nickname', { length: 24 }).notNull(),
    nicknameKey: varchar('nickname_key', { length: 24 }).notNull(),
    seat: integer('seat'),
    chips: integer('chips').notNull().default(0),
    isHost: boolean('is_host').notNull().default(false),
    isReady: boolean('is_ready').notNull().default(true),
    isSpectator: boolean('is_spectator').notNull().default(false),
    status: playerStatusEnum('status').notNull().default('seated'),
    connected: boolean('connected').notNull().default(false),
    sessionToken: varchar('session_token', { length: 128 }).notNull(),
    joinedAt: createdAt,
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    roomSeatUnique: uniqueIndex('players_room_seat_unique').on(table.roomId, table.seat),
    roomNicknameUnique: uniqueIndex('players_room_nickname_unique').on(
      table.roomId,
      table.nicknameKey,
    ),
    tokenUnique: uniqueIndex('players_session_token_unique').on(table.sessionToken),
    roomIndex: index('players_room_idx').on(table.roomId),
  }),
);

export const hands = pgTable(
  'hands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    handNumber: integer('hand_number').notNull(),
    phase: handPhaseEnum('phase').notNull().default('betting'),
    street: streetEnum('street').notNull().default('preflop'),
    dealerSeat: integer('dealer_seat').notNull(),
    sbSeat: integer('sb_seat'),
    bbSeat: integer('bb_seat'),
    currentBet: integer('current_bet').notNull().default(0),
    minRaise: integer('min_raise').notNull().default(0),
    lastRaiseSize: integer('last_raise_size').notNull().default(0),
    turnSeat: integer('turn_seat'),
    totalPot: integer('total_pot').notNull().default(0),
    autoSettled: boolean('auto_settled').notNull().default(false),
    version: integer('version').notNull().default(0),
    result: jsonb('result'),
    startedAt: createdAt,
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    roomHandUnique: uniqueIndex('hands_room_number_unique').on(table.roomId, table.handNumber),
    roomIndex: index('hands_room_idx').on(table.roomId),
    phaseIndex: index('hands_room_phase_idx').on(table.roomId, table.phase),
  }),
);

export const handPlayers = pgTable(
  'hand_players',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    handId: uuid('hand_id')
      .notNull()
      .references(() => hands.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    seat: integer('seat').notNull(),
    startingChips: integer('starting_chips').notNull(),
    contributed: integer('contributed').notNull().default(0),
    committed: integer('committed').notNull().default(0),
    folded: boolean('folded').notNull().default(false),
    allIn: boolean('all_in').notNull().default(false),
    hasActed: boolean('has_acted').notNull().default(false),
    raiseLocked: boolean('raise_locked').notNull().default(false),
    payout: integer('payout').notNull().default(0),
    endingChips: integer('ending_chips'),
  },
  (table) => ({
    handPlayerUnique: uniqueIndex('hand_players_hand_player_unique').on(
      table.handId,
      table.playerId,
    ),
    handSeatUnique: uniqueIndex('hand_players_hand_seat_unique').on(table.handId, table.seat),
    handIndex: index('hand_players_hand_idx').on(table.handId),
  }),
);

export const actions = pgTable(
  'actions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    handId: uuid('hand_id')
      .notNull()
      .references(() => hands.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id').references(() => players.id, { onDelete: 'set null' }),
    type: actionTypeEnum('type').notNull(),
    amount: integer('amount').notNull().default(0),
    street: streetEnum('street').notNull(),
    seq: integer('seq').notNull(),
    clientActionId: varchar('client_action_id', { length: 64 }),
    note: text('note'),
    createdAt,
  },
  (table) => ({
    seqUnique: uniqueIndex('actions_hand_seq_unique').on(table.handId, table.seq),
    clientIdUnique: uniqueIndex('actions_client_id_unique').on(table.handId, table.clientActionId),
    handIndex: index('actions_hand_idx').on(table.handId),
    roomIndex: index('actions_room_idx').on(table.roomId),
  }),
);

export const pots = pgTable(
  'pots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    handId: uuid('hand_id')
      .notNull()
      .references(() => hands.id, { onDelete: 'cascade' }),
    potIndex: integer('pot_index').notNull(),
    amount: integer('amount').notNull(),
    eligiblePlayerIds: jsonb('eligible_player_ids').$type<string[]>().notNull(),
    winnerIds: jsonb('winner_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    distribution: jsonb('distribution').$type<Record<string, number>>(),
    createdAt,
  },
  (table) => ({
    handPotUnique: uniqueIndex('pots_hand_index_unique').on(table.handId, table.potIndex),
    handIndex: index('pots_hand_idx').on(table.handId),
  }),
);

export const payouts = pgTable(
  'payouts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    handId: uuid('hand_id')
      .notNull()
      .references(() => hands.id, { onDelete: 'cascade' }),
    potId: uuid('pot_id')
      .notNull()
      .references(() => pots.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    createdAt,
  },
  (table) => ({
    payoutUnique: uniqueIndex('payouts_pot_player_unique').on(table.potId, table.playerId),
    handIndex: index('payouts_hand_idx').on(table.handId),
  }),
);

/**
 * Every chip issuance, removal, rebuy or correction is recorded here.
 * `amount` is signed: positive adds chips to the room, negative removes them.
 */
export const chipAdjustments = pgTable(
  'chip_adjustments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    hostPlayerId: uuid('host_player_id').references(() => players.id, { onDelete: 'set null' }),
    amount: integer('amount').notNull(),
    reason: text('reason').notNull(),
    createdAt,
  },
  (table) => ({
    roomIndex: index('chip_adjustments_room_idx').on(table.roomId),
  }),
);

export const roomsRelations = relations(rooms, ({ many }) => ({
  players: many(players),
  hands: many(hands),
}));

export const playersRelations = relations(players, ({ one, many }) => ({
  room: one(rooms, { fields: [players.roomId], references: [rooms.id] }),
  handPlayers: many(handPlayers),
}));

export const handsRelations = relations(hands, ({ one, many }) => ({
  room: one(rooms, { fields: [hands.roomId], references: [rooms.id] }),
  handPlayers: many(handPlayers),
  actions: many(actions),
  pots: many(pots),
}));

export const handPlayersRelations = relations(handPlayers, ({ one }) => ({
  hand: one(hands, { fields: [handPlayers.handId], references: [hands.id] }),
  player: one(players, { fields: [handPlayers.playerId], references: [players.id] }),
}));

export type RoomRow = typeof rooms.$inferSelect;
export type PlayerRow = typeof players.$inferSelect;
export type HandRow = typeof hands.$inferSelect;
export type HandPlayerRow = typeof handPlayers.$inferSelect;
export type ActionRow = typeof actions.$inferSelect;
export type PotRow = typeof pots.$inferSelect;
export type PayoutRow = typeof payouts.$inferSelect;
export type ChipAdjustmentRow = typeof chipAdjustments.$inferSelect;
