import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type {
  ActionView,
  BettingActionInput,
  PotView,
  SettlementPreview,
  SettleInput,
} from '@chiproom/shared';
import { normalizeRoomCode } from '@chiproom/shared';
import { db } from '../db/client.js';
import {
  actions,
  handPlayers,
  hands,
  payouts,
  players,
  pots,
  rooms,
  type HandRow,
  type PlayerRow,
  type RoomRow,
} from '../db/schema.js';
import {
  applyAction,
  findRecoveredTurn,
  forceAdvance,
  forceFold,
  getLegalActions,
  startHand,
} from '../game/engine.js';
import { splitPot } from '../game/pots.js';
import type { EngineAction, EngineEvent, EngineHand } from '../game/types.js';
import { AppError, ConflictError, NotFoundError, UnauthorizedError } from '../lib/errors.js';
import {
  ensurePots,
  insertEngineEvents,
  loadEngineForHand,
  loadHandRows,
  persistEngineHand,
  type DbExecutor,
} from './handStore.js';

function assertHost(room: RoomRow, playerId: string): void {
  if (room.hostPlayerId !== playerId) throw new UnauthorizedError('Only the host can do that');
}

async function lockRoom(tx: DbExecutor, code: string): Promise<RoomRow> {
  const normalized = normalizeRoomCode(code);
  const [room] = await tx.select().from(rooms).where(eq(rooms.code, normalized)).for('update');
  if (!room) throw new NotFoundError('Room not found');
  return room;
}

async function latestHandLocked(tx: DbExecutor, roomId: string): Promise<HandRow | null> {
  const [hand] = await tx
    .select()
    .from(hands)
    .where(eq(hands.roomId, roomId))
    .orderBy(desc(hands.handNumber))
    .limit(1)
    .for('update');
  return hand ?? null;
}

async function roomPlayerRows(tx: DbExecutor, roomId: string): Promise<PlayerRow[]> {
  return tx.select().from(players).where(eq(players.roomId, roomId));
}

async function incrementRoomVersion(tx: DbExecutor, roomId: string, status?: RoomRow['status']) {
  await tx
    .update(rooms)
    .set({
      version: sql`${rooms.version} + 1`,
      updatedAt: new Date(),
      ...(status ? { status } : {}),
    })
    .where(eq(rooms.id, roomId));
}

async function validateAutoSettle(
  tx: DbExecutor,
  room: RoomRow,
  hand: HandRow,
  engine: EngineHand,
  hostPlayerId: string | null,
): Promise<SettlementPreview | null> {
  const potRows = await ensurePots(tx, hand.id, engine);
  const live = engine.seats.filter((seat) => !seat.folded);
  if (live.length !== 1) return null;
  const winnerId = live[0].playerId;
  if (!potRows.every((pot) => pot.eligiblePlayerIds.includes(winnerId))) return null;

  const selections = potRows.map((pot) => ({
    potIndex: pot.potIndex,
    winnerIds: [winnerId],
  }));

  return finalizeSettlement(tx, room, hand, engine, selections, {
    auto: true,
    settledBy: hostPlayerId,
    potRowsOverride: potRows,
  });
}

interface FinalizeOptions {
  auto: boolean;
  settledBy: string | null;
  potRowsOverride?: Array<typeof pots.$inferSelect>;
}

async function finalizeSettlement(
  tx: DbExecutor,
  room: RoomRow,
  hand: HandRow,
  engine: EngineHand,
  selections: SettleInput['selections'],
  options: FinalizeOptions,
): Promise<SettlementPreview> {
  const potRows = options.potRowsOverride ?? (await ensurePots(tx, hand.id, engine));
  if (potRows.length === 0) throw new AppError('There are no pots to settle');

  const seatMap = new Map(engine.seats.map((seat) => [seat.playerId, seat]));
  const selectionMap = new Map<number, string[]>();
  for (const selection of selections) {
    if (selectionMap.has(selection.potIndex)) {
      throw new AppError(`Pot ${selection.potIndex + 1} was selected more than once`);
    }
    selectionMap.set(selection.potIndex, selection.winnerIds);
  }
  if (selectionMap.size !== potRows.length) {
    throw new AppError('Every pot must have at least one winner selected');
  }

  const distributedByPlayer = new Map<string, number>();
  const potPreviews: SettlementPreview['pots'] = [];

  for (const pot of potRows) {
    const winnerIds = selectionMap.get(pot.potIndex);
    if (!winnerIds || winnerIds.length === 0) {
      throw new AppError(`Pot ${pot.potIndex + 1} needs a winner`);
    }
    const unique = new Set(winnerIds);
    if (unique.size !== winnerIds.length) throw new AppError('Duplicate winners are not allowed');

    for (const winnerId of winnerIds) {
      if (!pot.eligiblePlayerIds.includes(winnerId)) {
        throw new AppError('A selected winner is not eligible for that pot');
      }
      const seat = seatMap.get(winnerId);
      if (!seat || seat.folded) {
        throw new AppError('Folded players cannot win a pot');
      }
    }

    const winners = winnerIds.map((winnerId) => {
      const seat = seatMap.get(winnerId);
      if (!seat) throw new AppError('Winner is not part of this hand');
      return { playerId: winnerId, seat: seat.seat };
    });

    const distribution = splitPot(pot.amount, winners, hand.dealerSeat, room.maxPlayers);
    for (const [playerId, amount] of Object.entries(distribution)) {
      distributedByPlayer.set(playerId, (distributedByPlayer.get(playerId) ?? 0) + amount);
    }

    potPreviews.push({
      potIndex: pot.potIndex,
      amount: pot.amount,
      winners: winners.map((winner) => ({
        playerId: winner.playerId,
        nickname: seatMap.get(winner.playerId)?.nickname ?? 'Player',
        amount: distribution[winner.playerId] ?? 0,
      })),
    });

    await tx
      .update(pots)
      .set({
        winnerIds,
        distribution,
      })
      .where(eq(pots.id, pot.id));

    for (const [playerId, amount] of Object.entries(distribution)) {
      await tx.insert(payouts).values({
        handId: hand.id,
        potId: pot.id,
        playerId,
        amount,
      });
    }
  }

  const totalPot = potRows.reduce((sum, pot) => sum + pot.amount, 0);
  const totalDistributed = [...distributedByPlayer.values()].reduce((sum, value) => sum + value, 0);
  if (totalDistributed !== totalPot) {
    throw new AppError('Payout calculation does not match the pot total');
  }

  const winEvents: EngineEvent[] = [];
  for (const pot of potPreviews) {
    for (const winner of pot.winners) {
      winEvents.push({
        playerId: winner.playerId,
        type: 'win',
        amount: winner.amount,
        street: hand.street,
        note: `Won ${pot.potIndex === 0 ? 'main pot' : `side pot ${pot.potIndex}`} (${pot.amount} chips)`,
      });
    }
  }

  for (const seat of engine.seats) {
    const winnings = distributedByPlayer.get(seat.playerId) ?? 0;
    const ending = seat.chips + winnings;
    await tx
      .update(players)
      .set({ chips: ending })
      .where(eq(players.id, seat.playerId));
    await tx
      .update(handPlayers)
      .set({
        payout: winnings,
        endingChips: ending,
      })
      .where(
        and(eq(handPlayers.handId, hand.id), eq(handPlayers.playerId, seat.playerId)),
      );
  }

  await tx
    .update(hands)
    .set({
      phase: 'complete',
      turnSeat: null,
      currentBet: 0,
      completedAt: new Date(),
      autoSettled: options.auto,
      totalPot,
      result: {
        auto: options.auto,
        settledBy: options.settledBy,
        pots: potPreviews,
      },
    })
    .where(eq(hands.id, hand.id));

  await insertEngineEvents(tx, hand.id, room.id, winEvents);

  const roomPlayers = await tx.select().from(players).where(eq(players.roomId, room.id));
  const chipSum = roomPlayers
    .filter((row) => row.status !== 'removed')
    .reduce((sum, row) => sum + row.chips, 0);
  if (chipSum !== room.totalChips) {
    throw new AppError(
      `Chip conservation check failed (players hold ${chipSum}, room accounts for ${room.totalChips})`,
    );
  }

  await incrementRoomVersion(tx, room.id);

  return { pots: potPreviews, totalDistributed };
}

/* ------------------------------------------------------------------ */
/* Start hand                                                          */
/* ------------------------------------------------------------------ */

export async function startHandForRoom(
  code: string,
  hostPlayerId: string,
): Promise<{ handNumber: number }> {
  return db.transaction(async (tx) => {
    const room = await lockRoom(tx, code);
    assertHost(room, hostPlayerId);
    if (room.status === 'closed') throw new ConflictError('This room is closed');
    if (room.status === 'paused') throw new ConflictError('Resume the room before starting a hand');

    const previousHand = await latestHandLocked(tx, room.id);
    if (previousHand && (previousHand.phase === 'betting' || previousHand.phase === 'awaiting_payout')) {
      throw new ConflictError('Finish the current hand before starting a new one');
    }

    const allPlayers = await roomPlayerRows(tx, room.id);
    const eligible = allPlayers
      .filter(
        (player) =>
          !player.isSpectator &&
          player.status === 'seated' &&
          player.chips > 0 &&
          player.seat !== null,
      )
      .sort((a, b) => (a.seat as number) - (b.seat as number));

    if (eligible.length < 2) {
      throw new AppError('At least two seated players with chips are needed to start a hand');
    }

    const notReady = eligible.filter((player) => !player.isReady);
    if (notReady.length > 0) {
      throw new ConflictError(
        `Waiting for ${notReady.map((player) => player.nickname).join(', ')} to ready up`,
      );
    }

    const handNumber = (previousHand?.handNumber ?? 0) + 1;
    const result = startHand({
      handNumber,
      smallBlind: room.smallBlind,
      bigBlind: room.bigBlind,
      previousDealerSeat: previousHand?.dealerSeat ?? null,
      players: eligible.map((player) => ({
        playerId: player.id,
        nickname: player.nickname,
        seat: player.seat as number,
        chips: player.chips,
      })),
    });

    const engine = result.hand;
    const totalPot = engine.seats.reduce((sum, seat) => sum + seat.contributed, 0);

    const [hand] = await tx
      .insert(hands)
      .values({
        roomId: room.id,
        handNumber,
        phase: engine.phase,
        street: engine.street,
        dealerSeat: engine.dealerSeat,
        sbSeat: engine.sbSeat,
        bbSeat: engine.bbSeat,
        currentBet: engine.currentBet,
        minRaise: engine.minRaise,
        lastRaiseSize: engine.lastRaiseSize,
        turnSeat: engine.turnSeat,
        totalPot,
      })
      .returning();

    await tx.insert(handPlayers).values(
      engine.seats.map((seat) => ({
        handId: hand.id,
        playerId: seat.playerId,
        seat: seat.seat,
        startingChips: seat.startingChips,
        contributed: seat.contributed,
        committed: seat.committed,
        folded: seat.folded,
        allIn: seat.allIn,
        hasActed: seat.hasActed,
        raiseLocked: seat.raiseLocked,
        payout: 0,
      })),
    );

    for (const seat of engine.seats) {
      await tx.update(players).set({ chips: seat.chips }).where(eq(players.id, seat.playerId));
    }

    await insertEngineEvents(tx, hand.id, room.id, result.events);
    await incrementRoomVersion(tx, room.id, 'active');

    if (engine.phase === 'awaiting_payout') {
      await ensurePots(tx, hand.id, engine);
      await validateAutoSettle(tx, room, hand, engine, hostPlayerId);
    }

    return { handNumber };
  });
}

/* ------------------------------------------------------------------ */
/* Betting actions                                                     */
/* ------------------------------------------------------------------ */

export interface ActionOutcome {
  duplicate: boolean;
}

export async function performAction(
  code: string,
  playerId: string,
  action: BettingActionInput,
): Promise<ActionOutcome> {
  return db.transaction(async (tx) => {
    const room = await lockRoom(tx, code);
    const hand = await latestHandLocked(tx, room.id);
    if (!hand) throw new ConflictError('There is no active hand');

    if (action.actionId) {
      const [duplicate] = await tx
        .select({ id: actions.id })
        .from(actions)
        .where(and(eq(actions.handId, hand.id), eq(actions.clientActionId, action.actionId)))
        .limit(1);
      if (duplicate) return { duplicate: true };
    }

    if (room.status !== 'active') throw new ConflictError('The room is not currently running');
    if (hand.phase !== 'betting') throw new ConflictError('Betting is closed for this hand');

    const participant = await tx
      .select({ id: handPlayers.id })
      .from(handPlayers)
      .where(and(eq(handPlayers.handId, hand.id), eq(handPlayers.playerId, playerId)))
      .limit(1);
    if (participant.length === 0) throw new UnauthorizedError('You are not in this hand');

    const { engine } = await loadEngineForHand(tx, hand);
    const actor = engine.seats.find((seat) => seat.playerId === playerId);
    if (!actor) throw new UnauthorizedError('You are not in this hand');

    const result = applyAction(engine, playerId, {
      type: action.type,
      amount: action.amount,
    });

    await persistEngineHand(tx, hand.id, result.hand);
    await insertEngineEvents(tx, hand.id, room.id, result.events, action.actionId);

    if (result.hand.phase === 'awaiting_payout') {
      await ensurePots(tx, hand.id, result.hand);
      await validateAutoSettle(tx, room, hand, result.hand, null);
    }

    await incrementRoomVersion(tx, room.id, 'active');
    return { duplicate: false };
  });
}

/* ------------------------------------------------------------------ */
/* Undo                                                                */
/* ------------------------------------------------------------------ */

/**
 * Undo the requesting player's most recent action when it is still the last
 * event in the hand. The hand is replayed from its stored starting stacks so
 * no inverse-action guesswork is needed; the transaction is all-or-nothing.
 */
export async function undoLastAction(code: string, playerId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const room = await lockRoom(tx, code);
    if (room.status !== 'active') throw new ConflictError('The room is not currently running');

    const hand = await latestHandLocked(tx, room.id);
    if (!hand) throw new ConflictError('There is no active hand');
    if (hand.phase !== 'betting') {
      throw new ConflictError('Only a betting action can be undone');
    }

    const [lastAction] = await tx
      .select()
      .from(actions)
      .where(eq(actions.handId, hand.id))
      .orderBy(desc(actions.seq))
      .limit(1);

    if (!lastAction || !lastAction.clientActionId) {
      throw new ConflictError('There is no undoable action');
    }
    if (lastAction.playerId !== playerId) {
      throw new UnauthorizedError('You can only undo your own last action');
    }

    const [existingPot] = await tx
      .select({ id: pots.id })
      .from(pots)
      .where(eq(pots.handId, hand.id))
      .limit(1);
    if (existingPot) throw new ConflictError('This hand has already reached settlement');

    const hpRows = await loadHandRows(tx, hand.id);
    if (!hpRows.some((row) => row.playerId === playerId)) {
      throw new UnauthorizedError('You are not in this hand');
    }
    const playerRows = await tx.select().from(players).where(eq(players.roomId, room.id));
    const nicknameById = new Map(playerRows.map((row) => [row.id, row.nickname]));

    const sorted = [...hpRows].sort((a, b) => a.seat - b.seat);
    const dealerIndex = sorted.findIndex((row) => row.seat === hand.dealerSeat);
    if (dealerIndex < 0) throw new ConflictError('The hand state is incomplete');
    const previousDealerSeat = sorted[(dealerIndex - 1 + sorted.length) % sorted.length].seat;

    let engine = startHand({
      handNumber: hand.handNumber,
      smallBlind: room.smallBlind,
      bigBlind: room.bigBlind,
      previousDealerSeat,
      players: sorted.map((row) => ({
        playerId: row.playerId,
        nickname: nicknameById.get(row.playerId) ?? 'Player',
        seat: row.seat,
        chips: row.startingChips,
      })),
    }).hand;

    const earlierActions = await tx
      .select()
      .from(actions)
      .where(and(eq(actions.handId, hand.id), lt(actions.seq, lastAction.seq)))
      .orderBy(actions.seq);

    for (const row of earlierActions) {
      if (row.type === 'post_sb' || row.type === 'post_bb') continue;
      if (!row.playerId) throw new ConflictError('The hand history is incomplete');

      if (!row.clientActionId) {
        if (row.type === 'fold') {
          engine = forceFold(engine, row.playerId, row.note ?? 'Folded by host').hand;
          continue;
        }
        throw new ConflictError('This action cannot be undone safely');
      }

      let engineAction: EngineAction;
      if (row.type === 'bet' || row.type === 'raise') {
        engineAction = { type: row.type, amount: row.amount };
      } else if (
        row.type === 'check' ||
        row.type === 'call' ||
        row.type === 'fold' ||
        row.type === 'all_in'
      ) {
        engineAction = { type: row.type };
      } else {
        throw new ConflictError('This action cannot be undone safely');
      }
      engine = applyAction(engine, row.playerId, engineAction).hand;
    }

    if (engine.phase !== 'betting') {
      throw new ConflictError('Undoing this action would not restore a valid betting state');
    }

    await tx.delete(actions).where(eq(actions.id, lastAction.id));
    await persistEngineHand(tx, hand.id, engine);
    await incrementRoomVersion(tx, room.id, 'active');
  });
}

/* ------------------------------------------------------------------ */
/* Settlement                                                          */
/* ------------------------------------------------------------------ */

async function loadSettlementContext(code: string, playerId: string) {
  return db.transaction(async (tx) => {
    const room = await lockRoom(tx, code);
    assertHost(room, playerId);
    const hand = await latestHandLocked(tx, room.id);
    if (!hand) throw new NotFoundError('There is no hand to settle');
    if (hand.phase === 'complete') {
      return { room, hand, engine: null as EngineHand | null, alreadySettled: true };
    }
    if (hand.phase !== 'awaiting_payout') {
      throw new ConflictError('Betting is still in progress');
    }
    const { engine } = await loadEngineForHand(tx, hand);
    await ensurePots(tx, hand.id, engine);
    return { room, hand, engine, alreadySettled: false };
  });
}

export async function previewSettlement(
  code: string,
  hostPlayerId: string,
  selections: SettleInput['selections'],
): Promise<SettlementPreview> {
  const { room, hand, engine, alreadySettled } = await loadSettlementContext(code, hostPlayerId);
  if (alreadySettled || !engine) {
    throw new ConflictError('This hand has already been settled');
  }

  const potRows = await db.select().from(pots).where(eq(pots.handId, hand.id)).orderBy(pots.potIndex);
  const seatMap = new Map(engine.seats.map((seat) => [seat.playerId, seat]));
  const selectionMap = new Map(selections.map((selection) => [selection.potIndex, selection.winnerIds]));
  if (selectionMap.size !== potRows.length) {
    throw new AppError('Select a winner for every pot');
  }

  const previews: SettlementPreview['pots'] = [];
  for (const pot of potRows) {
    const winnerIds = selectionMap.get(pot.potIndex);
    if (!winnerIds || winnerIds.length === 0) throw new AppError('Select at least one winner per pot');
    if (new Set(winnerIds).size !== winnerIds.length) throw new AppError('Duplicate winners');
    for (const winnerId of winnerIds) {
      if (!pot.eligiblePlayerIds.includes(winnerId)) {
        throw new AppError('A selected winner is not eligible for that pot');
      }
      if (seatMap.get(winnerId)?.folded) throw new AppError('Folded players cannot win');
    }
    const winners = winnerIds.map((winnerId) => ({
      playerId: winnerId,
      seat: seatMap.get(winnerId)?.seat ?? 0,
    }));
    const distribution = splitPot(pot.amount, winners, hand.dealerSeat, room.maxPlayers);
    previews.push({
      potIndex: pot.potIndex,
      amount: pot.amount,
      winners: winners.map((winner) => ({
        playerId: winner.playerId,
        nickname: seatMap.get(winner.playerId)?.nickname ?? 'Player',
        amount: distribution[winner.playerId] ?? 0,
      })),
    });
  }

  return {
    pots: previews,
    totalDistributed: previews.reduce((sum, pot) => sum + pot.amount, 0),
  };
}

export async function settleHand(
  code: string,
  hostPlayerId: string,
  input: SettleInput,
): Promise<SettlementPreview> {
  return db.transaction(async (tx) => {
    const room = await lockRoom(tx, code);
    assertHost(room, hostPlayerId);
    const hand = await latestHandLocked(tx, room.id);
    if (!hand) throw new NotFoundError('There is no hand to settle');
    if (hand.phase === 'complete') {
      throw new ConflictError('This hand has already been settled');
    }
    if (hand.phase !== 'awaiting_payout') {
      throw new ConflictError('Betting is still in progress');
    }
    const { engine } = await loadEngineForHand(tx, hand);
    return finalizeSettlement(tx, room, hand, engine, input.selections, {
      auto: false,
      settledBy: hostPlayerId,
    });
  });
}

/* ------------------------------------------------------------------ */
/* Host hand controls                                                  */
/* ------------------------------------------------------------------ */

export async function setPlayerSittingOut(
  code: string,
  hostPlayerId: string,
  targetPlayerId: string,
  sittingOut: boolean,
): Promise<void> {
  await db.transaction(async (tx) => {
    const room = await lockRoom(tx, code);
    assertHost(room, hostPlayerId);

    const [target] = await tx
      .select()
      .from(players)
      .where(and(eq(players.id, targetPlayerId), eq(players.roomId, room.id)))
      .for('update');
    if (!target) throw new NotFoundError('Player not found');
    if (target.isSpectator) throw new AppError('Spectators cannot be seated or sat out');
    if (target.status === 'pending') throw new AppError('Approve the player first');

    const hand = await latestHandLocked(tx, room.id);
    if (hand && hand.phase === 'betting') {
      const [participant] = await tx
        .select()
        .from(handPlayers)
        .where(and(eq(handPlayers.handId, hand.id), eq(handPlayers.playerId, target.id)))
        .limit(1);

      if (participant && !participant.folded && !participant.allIn && sittingOut) {
        const { engine } = await loadEngineForHand(tx, hand);
        const result = forceFold(engine, target.id, 'Sat out by the host');
        await persistEngineHand(tx, hand.id, result.hand);
        await insertEngineEvents(tx, hand.id, room.id, result.events);
        if (result.hand.phase === 'awaiting_payout') {
          await ensurePots(tx, hand.id, result.hand);
          await validateAutoSettle(tx, room, hand, result.hand, hostPlayerId);
        }
      }
    }

    await tx
      .update(players)
      .set({
        status: sittingOut ? 'sitting_out' : 'seated',
        isReady: !sittingOut,
      })
      .where(eq(players.id, target.id));

    await incrementRoomVersion(tx, room.id);
  });
}

export async function recoverHand(code: string, hostPlayerId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const room = await lockRoom(tx, code);
    assertHost(room, hostPlayerId);
    const hand = await latestHandLocked(tx, room.id);
    if (!hand) throw new NotFoundError('There is no hand to recover');

    if (hand.phase === 'awaiting_payout') {
      const { engine } = await loadEngineForHand(tx, hand);
      await ensurePots(tx, hand.id, engine);
      await validateAutoSettle(tx, room, hand, engine, hostPlayerId);
      await incrementRoomVersion(tx, room.id);
      return;
    }

    if (hand.phase !== 'betting') {
      throw new ConflictError('This hand is already complete');
    }

    const { engine } = await loadEngineForHand(tx, hand);
    const turnSeat = findRecoveredTurn(engine);
    const turnPlayer = engine.seats.find((seat) => seat.seat === engine.turnSeat);
    const turnIsValid =
      hand.turnSeat !== null &&
      turnPlayer &&
      !turnPlayer.folded &&
      !turnPlayer.allIn &&
      !turnPlayer.sittingOut;

    if (turnSeat !== null && turnIsValid) {
      const legal = getLegalActions(engine, turnPlayer.playerId);
      if (legal.canAct) {
        // State is healthy; nothing to repair.
        return;
      }
    }

    const result = forceAdvance(engine, hand.lastRaiseSize || hand.minRaise || room.bigBlind);
    await persistEngineHand(tx, hand.id, result.hand);
    if (result.hand.phase === 'awaiting_payout') {
      await ensurePots(tx, hand.id, result.hand);
      await validateAutoSettle(tx, room, hand, result.hand, hostPlayerId);
    }
    await incrementRoomVersion(tx, room.id);
  });
}

/** Force the hand to showdown when no further betting is possible. */
export async function advanceHand(code: string, hostPlayerId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const room = await lockRoom(tx, code);
    assertHost(room, hostPlayerId);
    const hand = await latestHandLocked(tx, room.id);
    if (!hand) throw new NotFoundError('There is no hand');
    if (hand.phase !== 'betting') throw new ConflictError('The hand is not in a betting phase');

    const { engine } = await loadEngineForHand(tx, hand);
    const result = forceAdvance(engine, hand.lastRaiseSize || hand.minRaise || room.bigBlind);
    await persistEngineHand(tx, hand.id, result.hand);
    if (result.hand.phase === 'awaiting_payout') {
      await ensurePots(tx, hand.id, result.hand);
      await validateAutoSettle(tx, room, hand, result.hand, hostPlayerId);
    }
    await incrementRoomVersion(tx, room.id);
  });
}

/* ------------------------------------------------------------------ */
/* Helpers used by history / audit                                     */
/* ------------------------------------------------------------------ */

export async function getHandActions(handId: string): Promise<ActionView[]> {
  const rows = await db.select().from(actions).where(eq(actions.handId, handId)).orderBy(actions.seq);
  return rows.map((row) => ({
    id: row.id,
    seq: row.seq,
    playerId: row.playerId,
    nickname: null,
    type: row.type,
    amount: row.amount,
    street: row.street,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getHandPots(handId: string): Promise<PotView[]> {
  const rows = await db.select().from(pots).where(eq(pots.handId, handId)).orderBy(pots.potIndex);
  return rows.map((row) => ({
    id: row.id,
    index: row.potIndex,
    amount: row.amount,
    eligiblePlayerIds: row.eligiblePlayerIds,
    winnerIds: row.winnerIds,
    distribution: row.distribution ?? null,
  }));
}


