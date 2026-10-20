import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ActionType, Street } from '@chiproom/shared';
import { db } from '../db/client.js';
import { actions, handPlayers, hands, players, pots, type HandPlayerRow, type HandRow } from '../db/schema.js';
import type { EngineEvent, EngineHand } from '../game/types.js';
import { buildPots } from '../game/pots.js';

/** Drizzle's transaction and database clients share the same query surface. */
export type DbExecutor = NodePgDatabase<typeof import('../db/schema.js')>;

export function buildEngineHand(
  hand: HandRow,
  rows: HandPlayerRow[],
  nicknameById: Map<string, string>,
): EngineHand {
  return {
    handNumber: hand.handNumber,
    phase: hand.phase,
    street: hand.street,
    dealerSeat: hand.dealerSeat,
    sbSeat: hand.sbSeat,
    bbSeat: hand.bbSeat,
    currentBet: hand.currentBet,
    minRaise: hand.minRaise,
    lastRaiseSize: hand.lastRaiseSize,
    turnSeat: hand.turnSeat,
    actionSeq: 0,
    seats: rows
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map((row) => ({
        playerId: row.playerId,
        nickname: nicknameById.get(row.playerId) ?? 'Player',
        seat: row.seat,
        startingChips: row.startingChips,
        chips: 0, // filled by caller from players table
        committed: row.committed,
        contributed: row.contributed,
        folded: row.folded,
        allIn: row.allIn,
        sittingOut: false,
        hasActed: row.hasActed,
        raiseLocked: row.raiseLocked,
        payout: row.payout,
      })),
  };
}

export async function persistEngineHand(
  tx: DbExecutor,
  handId: string,
  engine: EngineHand,
): Promise<number> {
  const totalPot = engine.seats.reduce((sum, seat) => sum + seat.contributed, 0);

  await tx
    .update(hands)
    .set({
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
      version: sql`${hands.version} + 1`,
    })
    .where(eq(hands.id, handId));

  for (const seat of engine.seats) {
    await tx
      .update(handPlayers)
      .set({
        committed: seat.committed,
        contributed: seat.contributed,
        folded: seat.folded,
        allIn: seat.allIn,
        hasActed: seat.hasActed,
        raiseLocked: seat.raiseLocked,
        payout: seat.payout,
      })
      .where(and(eq(handPlayers.handId, handId), eq(handPlayers.playerId, seat.playerId)));

    await tx.update(players).set({ chips: seat.chips }).where(eq(players.id, seat.playerId));
  }

  return totalPot;
}

export async function insertEngineEvents(
  tx: DbExecutor,
  handId: string,
  roomId: string,
  events: EngineEvent[],
  clientActionId?: string | null,
): Promise<void> {
  if (events.length === 0) return;

  const [row] = await tx
    .select({ maxSeq: sql<number>`coalesce(max(${actions.seq}), 0)` })
    .from(actions)
    .where(eq(actions.handId, handId));

  let seq = Number(row?.maxSeq ?? 0);
  const values = events.map((event, index) => {
    seq += 1;
    return {
      handId,
      roomId,
      playerId: event.playerId,
      type: event.type as ActionType,
      amount: event.amount,
      street: event.street as Street,
      seq,
      clientActionId: index === 0 ? clientActionId ?? null : null,
      note: event.note ?? null,
    };
  });

  await tx.insert(actions).values(values);
}

export async function ensurePots(
  tx: DbExecutor,
  handId: string,
  engine: EngineHand,
): Promise<Array<typeof pots.$inferSelect>> {
  const existing = await tx
    .select()
    .from(pots)
    .where(eq(pots.handId, handId))
    .orderBy(pots.potIndex);
  if (existing.length > 0) return existing;

  const layers = buildPots(
    engine.seats.map((seat) => ({
      playerId: seat.playerId,
      seat: seat.seat,
      contributed: seat.contributed,
      folded: seat.folded,
    })),
  );

  if (layers.length === 0) return [];

  return tx
    .insert(pots)
    .values(
      layers.map((layer) => ({
        handId,
        potIndex: layer.index,
        amount: layer.amount,
        eligiblePlayerIds: layer.eligiblePlayerIds,
      })),
    )
    .returning();
}

export async function loadHandRows(
  executor: DbExecutor,
  handId: string,
): Promise<HandPlayerRow[]> {
  return executor
    .select()
    .from(handPlayers)
    .where(eq(handPlayers.handId, handId))
    .orderBy(handPlayers.seat);
}

/**
 * Load players and rebuild the engine state for a persisted hand.
 * The hand and player rows must already be locked by the caller when mutating.
 */
export async function loadEngineForHand(
  executor: DbExecutor,
  hand: HandRow,
): Promise<{ engine: EngineHand; rows: HandPlayerRow[]; chipsByPlayerId: Map<string, number> }> {
  const rows = await loadHandRows(executor, hand.id);
  const allPlayers = await executor.select().from(players);
  const playerMap = new Map(allPlayers.map((row) => [row.id, row]));

  const engine = buildEngineHand(
    hand,
    rows,
    new Map(allPlayers.map((row) => [row.id, row.nickname])),
  );
  for (const seat of engine.seats) {
    seat.chips = playerMap.get(seat.playerId)?.chips ?? 0;
  }

  return {
    engine,
    rows,
    chipsByPlayerId: new Map(allPlayers.map((row) => [row.id, row.chips])),
  };
}

export { db };
