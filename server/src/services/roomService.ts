import bcrypt from 'bcryptjs';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import type {
  ActionView,
  ChipAdjustmentView,
  CreateRoomInput,
  HandHistoryDetail,
  HandView,
  JoinRoomInput,
  PlayerSeatView,
  PotView,
  PublicPlayer,
  RoomHistoryResponse,
  RoomPreview,
  RoomSettings,
  RoomState,
  RoomSummary,
  SpotStatus,
} from '@chiproom/shared';
import { normalizeRoomCode } from '@chiproom/shared';
import { db } from '../db/client.js';
import {
  actions,
  chipAdjustments,
  handPlayers,
  hands,
  payouts,
  players,
  pots,
  rooms,
  type PlayerRow,
  type RoomRow,
} from '../db/schema.js';
import { getLegalActions } from '../game/engine.js';
import { buildPots } from '../game/pots.js';
import { AppError, ConflictError, NotFoundError, UnauthorizedError } from '../lib/errors.js';
import { generateRoomCode, generateSessionToken, nicknameKey } from '../lib/ids.js';
import type { EngineHand } from '../game/types.js';
import { buildEngineHand, insertEngineEvents, DbExecutor } from './handStore.js';

const BCRYPT_ROUNDS = 10;

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function settingsOf(room: RoomRow): RoomSettings {
  return {
    smallBlind: room.smallBlind,
    bigBlind: room.bigBlind,
    startingChips: room.startingChips,
    maxPlayers: room.maxPlayers,
    spectatorMode: room.spectatorMode,
    lateJoin: room.lateJoin,
    allowRebuys: room.allowRebuys,
    requireApproval: room.requireApproval,
    hasPassword: Boolean(room.passwordHash),
  };
}

function summaryOf(room: RoomRow, playerCount: number, seatedCount: number): RoomSummary {
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    status: room.status,
    settings: settingsOf(room),
    playerCount,
    seatedCount,
    createdAt: room.createdAt.toISOString(),
  };
}

export function publicPlayer(
  row: PlayerRow,
  handInfo?: { inHand: boolean; folded: boolean; allIn: boolean; committed: number; contributed: number },
): PublicPlayer {
  let handStatus: SpotStatus | null = null;
  if (handInfo?.inHand) {
    if (handInfo.folded) handStatus = 'folded';
    else if (handInfo.allIn) handStatus = 'all_in';
    else if (!row.connected) handStatus = 'disconnected';
    else if (row.status === 'sitting_out') handStatus = 'sitting_out';
    else handStatus = 'active';
  } else if (row.status === 'sitting_out') {
    handStatus = 'sitting_out';
  } else if (row.status === 'seated' && !row.isSpectator) {
    handStatus = row.connected ? 'active' : 'disconnected';
  }

  return {
    id: row.id,
    nickname: row.nickname,
    seat: row.seat,
    chips: row.chips,
    isHost: row.isHost,
    isReady: row.isReady,
    status: row.status,
    isConnected: row.connected,
    isSpectator: row.isSpectator,
    joinedAt: row.joinedAt.toISOString(),
    inHand: handInfo?.inHand ?? false,
    handStatus,
    committed: handInfo?.committed ?? 0,
    contributed: handInfo?.contributed ?? 0,
    folded: handInfo?.folded ?? false,
    allIn: handInfo?.allIn ?? false,
  };
}

async function findRoom(code: string): Promise<RoomRow> {
  const normalized = normalizeRoomCode(code);
  const [room] = await db.select().from(rooms).where(eq(rooms.code, normalized)).limit(1);
  if (!room) throw new NotFoundError('Room not found. Check the code and try again.');
  return room;
}

async function findRoomTx(tx: DbExecutor, code: string): Promise<RoomRow> {
  const normalized = normalizeRoomCode(code);
  const [room] = await tx.select().from(rooms).where(eq(rooms.code, normalized)).for('update');
  if (!room) throw new NotFoundError('Room not found. Check the code and try again.');
  return room;
}

async function latestHand(roomId: string) {
  const [hand] = await db
    .select()
    .from(hands)
    .where(eq(hands.roomId, roomId))
    .orderBy(desc(hands.handNumber))
    .limit(1);
  return hand ?? null;
}

async function latestHandTx(tx: DbExecutor, roomId: string) {
  const [hand] = await tx
    .select()
    .from(hands)
    .where(eq(hands.roomId, roomId))
    .orderBy(desc(hands.handNumber))
    .limit(1);
  return hand ?? null;
}

function assertHost(room: RoomRow, playerId: string): void {
  if (room.hostPlayerId !== playerId) {
    throw new UnauthorizedError('Only the host can do that');
  }
}

async function sessionPlayer(
  executor: DbExecutor,
  code: string,
  token: string,
): Promise<{ room: RoomRow; player: PlayerRow }> {
  const normalized = normalizeRoomCode(code);
  const [row] = await executor
    .select({ room: rooms, player: players })
    .from(players)
    .innerJoin(rooms, eq(players.roomId, rooms.id))
    .where(and(eq(rooms.code, normalized), eq(players.sessionToken, token)))
    .limit(1);

  if (!row) throw new UnauthorizedError('Your session is no longer valid. Join the room again.');
  if (row.player.status === 'removed') {
    throw new UnauthorizedError('You were removed from this room');
  }
  return { room: row.room, player: row.player };
}

export async function authenticateSession(code: string, token: string) {
  return sessionPlayer(db, code, token);
}

function freeSeat(usedSeats: number[], maxPlayers: number): number {
  for (let seat = 1; seat <= maxPlayers; seat += 1) {
    if (!usedSeats.includes(seat)) return seat;
  }
  throw new ConflictError('This room is full');
}

/* ------------------------------------------------------------------ */
/* Room state snapshot                                                 */
/* ------------------------------------------------------------------ */

function buildHandView(
  handRow: typeof hands.$inferSelect,
  engine: EngineHand,
  hpRows: Array<typeof handPlayers.$inferSelect>,
  playerRows: PlayerRow[],
  actionRows: Array<typeof actions.$inferSelect>,
  potRows: Array<typeof pots.$inferSelect>,
  viewerId: string | null,
): HandView {
  const playerMap = new Map(playerRows.map((row) => [row.id, row]));
  const hpMap = new Map(hpRows.map((row) => [row.playerId, row]));

  const seats: PlayerSeatView[] = engine.seats
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .map((seat) => {
      const row = playerMap.get(seat.playerId);
      const hp = hpMap.get(seat.playerId);
      return {
        playerId: seat.playerId,
        nickname: row?.nickname ?? seat.nickname,
        seat: seat.seat,
        chips: row?.chips ?? seat.chips,
        committed: seat.committed,
        contributed: seat.contributed,
        startingChips: seat.startingChips,
        folded: seat.folded,
        allIn: seat.allIn,
        sittingOut: false,
        hasActed: seat.hasActed,
        raiseLocked: seat.raiseLocked,
        payout: hp?.payout ?? 0,
        endingChips: hp?.endingChips ?? null,
        isConnected: row?.connected ?? false,
        isHost: row?.isHost ?? false,
      };
    });

  let potsView: PotView[];
  if (handRow.phase === 'betting') {
    const layers = buildPots(
      engine.seats.map((seat) => ({
        playerId: seat.playerId,
        seat: seat.seat,
        contributed: seat.contributed,
        folded: seat.folded,
      })),
    );
    potsView = layers.map((layer) => ({
      id: null,
      index: layer.index,
      amount: layer.amount,
      eligiblePlayerIds: layer.eligiblePlayerIds,
      winnerIds: [],
      distribution: null,
    }));
  } else {
    potsView = potRows
      .slice()
      .sort((a, b) => a.potIndex - b.potIndex)
      .map((row) => ({
        id: row.id,
        index: row.potIndex,
        amount: row.amount,
        eligiblePlayerIds: row.eligiblePlayerIds,
        winnerIds: row.winnerIds,
        distribution: row.distribution ?? null,
      }));

    if (potsView.length === 0) {
      const layers = buildPots(
        engine.seats.map((seat) => ({
          playerId: seat.playerId,
          seat: seat.seat,
          contributed: seat.contributed,
          folded: seat.folded,
        })),
      );
      potsView = layers.map((layer) => ({
        id: null,
        index: layer.index,
        amount: layer.amount,
        eligiblePlayerIds: layer.eligiblePlayerIds,
        winnerIds: [],
        distribution: null,
      }));
    }
  }

  const actionViews: ActionView[] = actionRows
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((row) => ({
      id: row.id,
      seq: row.seq,
      playerId: row.playerId,
      nickname: row.playerId ? playerMap.get(row.playerId)?.nickname ?? null : null,
      type: row.type,
      amount: row.amount,
      street: row.street,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    }));

  const lastAction = actionRows.reduce<(typeof actionRows)[number] | null>(
    (latest, row) => (!latest || row.seq > latest.seq ? row : latest),
    null,
  );
  // Only a normal client-submitted betting action can be undone. Blind posts,
  // host force-folds and settlement events have no clientActionId.
  const undoablePlayerId =
    handRow.phase === 'betting' && lastAction?.clientActionId ? lastAction.playerId : null;

  const turnSeat = engine.turnSeat;
  const turnPlayer = turnSeat === null ? null : engine.seats.find((seat) => seat.seat === turnSeat);
  const totalPot = potsView.reduce((sum, pot) => sum + pot.amount, 0);
  const viewerSeat = viewerId ? engine.seats.find((seat) => seat.playerId === viewerId) : null;
  const legalActions =
    handRow.phase === 'betting' && viewerId && viewerSeat && !viewerSeat.sittingOut
      ? getLegalActions(engine, viewerId)
      : null;

  return {
    id: handRow.id,
    handNumber: handRow.handNumber,
    phase: handRow.phase,
    street: handRow.street,
    dealerSeat: handRow.dealerSeat,
    sbSeat: handRow.sbSeat,
    bbSeat: handRow.bbSeat,
    currentBet: engine.currentBet,
    minRaise: engine.minRaise,
    lastRaiseSize: engine.lastRaiseSize,
    turnSeat,
    turnPlayerId: turnPlayer?.playerId ?? null,
    totalPot,
    pots: potsView,
    seats,
    actions: actionViews,
    legalActions,
    undoablePlayerId,
    autoSettled: handRow.autoSettled,
    startedAt: handRow.startedAt.toISOString(),
    completedAt: handRow.completedAt ? handRow.completedAt.toISOString() : null,
  };
}

export async function getRoomState(code: string, sessionToken: string): Promise<RoomState> {
  const { room, player } = await sessionPlayer(db, code, sessionToken);

  const visiblePlayers = await db
    .select()
    .from(players)
    .where(and(eq(players.roomId, room.id), ne(players.status, 'removed')))
    .orderBy(asc(players.seat), asc(players.joinedAt));

  const handRow = await latestHand(room.id);
  let handView: HandView | null = null;

  let hpRows: Array<typeof handPlayers.$inferSelect> = [];
  if (handRow) {
    hpRows = await db
      .select()
      .from(handPlayers)
      .where(eq(handPlayers.handId, handRow.id))
      .orderBy(handPlayers.seat);

    const allPlayerRows = await db.select().from(players).where(eq(players.roomId, room.id));
    const playerMap = new Map(allPlayerRows.map((row) => [row.id, row]));
    const engine = buildEngineHand(
      handRow,
      hpRows,
      new Map(allPlayerRows.map((row) => [row.id, row.nickname])),
    );
    for (const seat of engine.seats) {
      seat.chips = playerMap.get(seat.playerId)?.chips ?? 0;
    }

    const actionRows = await db
      .select()
      .from(actions)
      .where(eq(actions.handId, handRow.id))
      .orderBy(actions.seq);

    const potRows = await db
      .select()
      .from(pots)
      .where(eq(pots.handId, handRow.id))
      .orderBy(pots.potIndex);

    handView = buildHandView(
      handRow,
      engine,
      hpRows,
      allPlayerRows,
      actionRows,
      potRows,
      player.id,
    );
  }

  const hpMap = new Map(hpRows.map((row) => [row.playerId, row]));
  const publicPlayers = visiblePlayers
    .filter((row) => row.id !== player.id || row.status !== 'removed')
    .map((row) => {
      const hp = hpMap.get(row.id);
      return publicPlayer(
        row,
        hp
          ? {
              inHand: true,
              folded: hp.folded,
              allIn: hp.allIn,
              committed: hp.committed,
              contributed: hp.contributed,
            }
          : undefined,
      );
    });

  const me = publicPlayers.find((entry) => entry.id === player.id) ?? null;

  let adjustments: ChipAdjustmentView[] | undefined;
  if (player.isHost) {
    const rows = await db
      .select({ adjustment: chipAdjustments, nickname: players.nickname })
      .from(chipAdjustments)
      .innerJoin(players, eq(chipAdjustments.playerId, players.id))
      .where(eq(chipAdjustments.roomId, room.id))
      .orderBy(desc(chipAdjustments.createdAt))
      .limit(100);
    adjustments = rows.map(({ adjustment, nickname }) => ({
      id: adjustment.id,
      playerId: adjustment.playerId,
      nickname,
      amount: adjustment.amount,
      reason: adjustment.reason,
      createdAt: adjustment.createdAt.toISOString(),
    }));
  }

  return {
    room: {
      id: room.id,
      code: room.code,
      name: room.name,
      status: room.status,
      settings: settingsOf(room),
      totalChips: room.totalChips,
      version: room.version,
      createdAt: room.createdAt.toISOString(),
      hostPlayerId: room.hostPlayerId,
    },
    me,
    players: publicPlayers,
    hand: handView,
    adjustments,
  };
}

/* ------------------------------------------------------------------ */
/* Creation & joining                                                  */
/* ------------------------------------------------------------------ */

export interface AuthResult {
  roomCode: string;
  playerId: string;
  sessionToken: string;
  isHost: boolean;
  isSpectator: boolean;
}

export async function createRoom(input: CreateRoomInput): Promise<AuthResult> {
  const passwordHash = input.password ? await bcrypt.hash(input.password, BCRYPT_ROUNDS) : null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateRoomCode();
    const token = generateSessionToken();
    try {
      const result = await db.transaction(async (tx) => {
        const [room] = await tx
          .insert(rooms)
          .values({
            code,
            name: input.roomName,
            smallBlind: input.smallBlind,
            bigBlind: input.bigBlind,
            startingChips: input.startingChips,
            maxPlayers: input.maxPlayers,
            passwordHash,
            spectatorMode: input.spectatorMode,
            lateJoin: input.lateJoin,
            allowRebuys: input.allowRebuys,
            requireApproval: input.requireApproval,
            totalChips: 0,
          })
          .returning();

        const [host] = await tx
          .insert(players)
          .values({
            roomId: room.id,
            nickname: input.hostNickname,
            nicknameKey: nicknameKey(input.hostNickname),
            seat: 1,
            chips: input.startingChips,
            isHost: true,
            isReady: true,
            status: 'seated',
            connected: false,
            sessionToken: token,
          })
          .returning();

        await tx
          .update(rooms)
          .set({ hostPlayerId: host.id, totalChips: input.startingChips })
          .where(eq(rooms.id, room.id));

        await tx.insert(chipAdjustments).values({
          roomId: room.id,
          playerId: host.id,
          hostPlayerId: host.id,
          amount: input.startingChips,
          reason: 'Initial buy-in',
        });

        return { roomCode: room.code, playerId: host.id };
      });

      return {
        ...result,
        sessionToken: token,
        isHost: true,
        isSpectator: false,
      };
    } catch (error) {
      const codeError = error as { code?: string };
      if (codeError.code === '23505') continue; // room code collision, retry
      throw error;
    }
  }

  throw new ConflictError('Could not allocate a room code. Please try again.');
}

export async function joinRoom(code: string, input: JoinRoomInput): Promise<AuthResult> {
  const normalized = normalizeRoomCode(code);
  const token = generateSessionToken();

  return db.transaction(async (tx) => {
    const room = await findRoomTx(tx, normalized);

    if (room.status === 'closed') {
      throw new ConflictError('This room is closed');
    }

    const spectator = input.spectator === true;
    if (spectator && !room.spectatorMode) {
      throw new AppError('Spectators are not enabled for this room');
    }
    if (!spectator && room.status !== 'lobby' && !room.lateJoin) {
      throw new ConflictError('This room is no longer accepting new players');
    }

    if (room.passwordHash) {
      if (!input.password) throw new UnauthorizedError('This room requires a password');
      const ok = await bcrypt.compare(input.password, room.passwordHash);
      if (!ok) throw new UnauthorizedError('Incorrect room password');
    }

    const key = nicknameKey(input.nickname);
    const [duplicate] = await tx
      .select({ id: players.id })
      .from(players)
      .where(
        and(
          eq(players.roomId, room.id),
          eq(players.nicknameKey, key),
          ne(players.status, 'removed'),
        ),
      )
      .limit(1);
    if (duplicate) throw new ConflictError('That nickname is already taken in this room');

    const existing = await tx
      .select({ id: players.id, seat: players.seat, spectator: players.isSpectator })
      .from(players)
      .where(and(eq(players.roomId, room.id), ne(players.status, 'removed')));

    const seatedOrPending = existing.filter((row) => !row.spectator);
    if (!spectator && seatedOrPending.length >= room.maxPlayers) {
      throw new ConflictError('This room is full');
    }

    let seat: number | null = null;
    let status: PlayerRow['status'] = 'seated';
    let chips = 0;

    if (spectator) {
      if (existing.length >= room.maxPlayers * 3 + 10) {
        throw new ConflictError('This room has reached its spectator limit');
      }
    } else if (room.requireApproval) {
      status = 'pending';
    } else {
      const usedSeats = existing
        .filter((row) => row.seat !== null)
        .map((row) => row.seat as number);
      seat = freeSeat(usedSeats, room.maxPlayers);
      chips = room.startingChips;
    }

    const [player] = await tx
      .insert(players)
      .values({
        roomId: room.id,
        nickname: input.nickname,
        nicknameKey: key,
        seat,
        chips,
        isHost: false,
        isReady: status === 'seated' && !spectator,
        isSpectator: spectator,
        status,
        connected: false,
        sessionToken: token,
      })
      .returning();

    if (chips > 0) {
      await tx.insert(chipAdjustments).values({
        roomId: room.id,
        playerId: player.id,
        hostPlayerId: room.hostPlayerId,
        amount: chips,
        reason: 'Initial buy-in',
      });
      await tx
        .update(rooms)
        .set({
          totalChips: room.totalChips + chips,
          version: room.version + 1,
        })
        .where(eq(rooms.id, room.id));
    } else {
      await tx
        .update(rooms)
        .set({ version: room.version + 1 })
        .where(eq(rooms.id, room.id));
    }

    return {
      roomCode: room.code,
      playerId: player.id,
      sessionToken: token,
      isHost: false,
      isSpectator: spectator,
    };
  });
}

export async function getRoomPreview(code: string): Promise<RoomPreview> {
  const room = await findRoom(code);
  const rows = await db
    .select()
    .from(players)
    .where(and(eq(players.roomId, room.id), ne(players.status, 'removed')))
    .orderBy(asc(players.seat), asc(players.joinedAt));

  const seated = rows.filter((row) => !row.isSpectator);
  const host = rows.find((row) => row.isHost);
  return {
    room: summaryOf(room, rows.length, seated.length),
    hostNickname: host?.nickname ?? null,
    players: rows.map((row) => ({
      nickname: row.nickname,
      seat: row.seat,
      isHost: row.isHost,
      isConnected: row.connected,
      status: row.status,
      isSpectator: row.isSpectator,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Player management                                                   */
/* ------------------------------------------------------------------ */

export async function approvePlayer(
  code: string,
  hostPlayerId: string,
  targetPlayerId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const room = await findRoomTx(tx, code);
    assertHost(room, hostPlayerId);

    const [target] = await tx
      .select()
      .from(players)
      .where(and(eq(players.id, targetPlayerId), eq(players.roomId, room.id)))
      .for('update');
    if (!target) throw new NotFoundError('Player not found');
    if (target.status !== 'pending') throw new ConflictError('Player is not awaiting approval');

    const existing = await tx
      .select({ seat: players.seat, spectator: players.isSpectator })
      .from(players)
      .where(and(eq(players.roomId, room.id), ne(players.status, 'removed')));
    const occupied = existing
      .filter((row) => !row.spectator && row.seat !== null)
      .map((row) => row.seat as number);
    if (occupied.length >= room.maxPlayers) throw new ConflictError('This room is full');

    const seat = freeSeat(occupied, room.maxPlayers);
    await tx
      .update(players)
      .set({ status: 'seated', seat, chips: room.startingChips, isReady: true })
      .where(eq(players.id, target.id));
    await tx.insert(chipAdjustments).values({
      roomId: room.id,
      playerId: target.id,
      hostPlayerId,
      amount: room.startingChips,
      reason: 'Initial buy-in (approved)',
    });
    await tx
      .update(rooms)
      .set({
        totalChips: room.totalChips + room.startingChips,
        version: room.version + 1,
      })
      .where(eq(rooms.id, room.id));
  });
}

export async function removePlayer(
  code: string,
  hostPlayerId: string,
  targetPlayerId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const room = await findRoomTx(tx, code);
    assertHost(room, hostPlayerId);
    if (targetPlayerId === hostPlayerId) {
      throw new AppError('The host cannot remove themselves. Close the room instead.');
    }

    const [target] = await tx
      .select()
      .from(players)
      .where(and(eq(players.id, targetPlayerId), eq(players.roomId, room.id)))
      .for('update');
    if (!target) throw new NotFoundError('Player not found');
    if (target.status === 'removed') return;

    const hand = await latestHandTx(tx, room.id);
    if (hand && (hand.phase === 'betting' || hand.phase === 'awaiting_payout')) {
      const [inHand] = await tx
        .select({ id: handPlayers.id })
        .from(handPlayers)
        .where(and(eq(handPlayers.handId, hand.id), eq(handPlayers.playerId, target.id)))
        .limit(1);
      if (inHand) {
        throw new ConflictError('Finish the current hand before removing this player');
      }
    }

    let nextTotal = room.totalChips;
    if (!target.isSpectator && target.chips > 0 && target.status !== 'pending') {
      nextTotal -= target.chips;
      await tx.insert(chipAdjustments).values({
        roomId: room.id,
        playerId: target.id,
        hostPlayerId,
        amount: -target.chips,
        reason: 'Player removed from room',
      });
    }

    await tx
      .update(players)
      .set({
        status: 'removed',
        seat: null,
        chips: 0,
        connected: false,
        nicknameKey: `removed:${target.id.slice(0, 16)}`,
        isReady: false,
      })
      .where(eq(players.id, target.id));

    await tx
      .update(rooms)
      .set({ totalChips: nextTotal, version: room.version + 1 })
      .where(eq(rooms.id, room.id));
  });
}

export async function setReady(
  code: string,
  playerId: string,
  ready: boolean,
): Promise<void> {
  const normalized = normalizeRoomCode(code);
  const [room] = await db.select().from(rooms).where(eq(rooms.code, normalized)).limit(1);
  if (!room) throw new NotFoundError('Room not found');
  const [player] = await db
    .select()
    .from(players)
    .where(and(eq(players.roomId, room.id), eq(players.id, playerId)))
    .limit(1);
  if (!player) throw new NotFoundError('Player not found');
  if (player.isSpectator || player.status === 'pending') {
    throw new AppError('Only seated players can ready up');
  }
  await db.update(players).set({ isReady: ready }).where(eq(players.id, playerId));
  await db
    .update(rooms)
    .set({ version: room.version + 1 })
    .where(eq(rooms.id, room.id));
}

/* ------------------------------------------------------------------ */
/* Host room controls                                                  */
/* ------------------------------------------------------------------ */

export async function updateSettings(
  code: string,
  hostPlayerId: string,
  input: {
    roomName?: string;
    startingChips?: number;
    smallBlind?: number;
    bigBlind?: number;
    maxPlayers?: number;
    password?: string | null;
    spectatorMode?: boolean;
    lateJoin?: boolean;
    allowRebuys?: boolean;
    requireApproval?: boolean;
  },
): Promise<void> {
  const passwordHash =
    input.password === null
      ? null
      : input.password !== undefined
        ? await bcrypt.hash(input.password, BCRYPT_ROUNDS)
        : undefined;

  await db.transaction(async (tx) => {
    const room = await findRoomTx(tx, code);
    assertHost(room, hostPlayerId);

    const smallBlind = input.smallBlind ?? room.smallBlind;
    const bigBlind = input.bigBlind ?? room.bigBlind;
    const startingChips = input.startingChips ?? room.startingChips;
    const maxPlayers = input.maxPlayers ?? room.maxPlayers;

    if (bigBlind <= smallBlind) throw new AppError('Big blind must be greater than the small blind');
    if (smallBlind >= startingChips) {
      throw new AppError('Small blind must be smaller than the starting stack');
    }

    const existing = await tx
      .select({ seat: players.seat, spectator: players.isSpectator })
      .from(players)
      .where(and(eq(players.roomId, room.id), ne(players.status, 'removed')));
    const occupiedSeats = existing.filter((row) => !row.spectator && row.seat !== null);
    if (maxPlayers < occupiedSeats.length) {
      throw new AppError('Max players cannot be lower than the number of seated players');
    }

    const hand = await latestHandTx(tx, room.id);
    const structuralChange =
      smallBlind !== room.smallBlind ||
      bigBlind !== room.bigBlind ||
      startingChips !== room.startingChips;
    if (structuralChange && hand && (hand.phase === 'betting' || hand.phase === 'awaiting_payout')) {
      throw new ConflictError('Blinds and buy-ins can only change between hands');
    }

    await tx
      .update(rooms)
      .set({
        name: input.roomName ?? room.name,
        smallBlind,
        bigBlind,
        startingChips,
        maxPlayers,
        ...(passwordHash !== undefined ? { passwordHash } : {}),
        spectatorMode: input.spectatorMode ?? room.spectatorMode,
        lateJoin: input.lateJoin ?? room.lateJoin,
        allowRebuys: input.allowRebuys ?? room.allowRebuys,
        requireApproval: input.requireApproval ?? room.requireApproval,
        version: room.version + 1,
      })
      .where(eq(rooms.id, room.id));
  });
}

export async function pauseRoom(code: string, hostPlayerId: string): Promise<void> {
  const room = await findRoom(code);
  assertHost(room, hostPlayerId);
  if (room.status !== 'active') throw new ConflictError('Room is not running');
  await db
    .update(rooms)
    .set({ status: 'paused', version: room.version + 1 })
    .where(eq(rooms.id, room.id));
}

export async function resumeRoom(code: string, hostPlayerId: string): Promise<void> {
  const room = await findRoom(code);
  assertHost(room, hostPlayerId);
  if (room.status !== 'paused') throw new ConflictError('Room is not paused');
  await db
    .update(rooms)
    .set({ status: 'active', version: room.version + 1 })
    .where(eq(rooms.id, room.id));
}

export async function closeRoom(code: string, hostPlayerId: string): Promise<void> {
  const room = await findRoom(code);
  assertHost(room, hostPlayerId);
  if (room.status === 'closed') return;
  const hand = await latestHand(room.id);
  if (hand && (hand.phase === 'betting' || hand.phase === 'awaiting_payout')) {
    throw new ConflictError('Finish and settle the current hand before closing the room');
  }
  await db
    .update(rooms)
    .set({ status: 'closed', closedAt: new Date(), version: room.version + 1 })
    .where(eq(rooms.id, room.id));
}

export async function resetRoom(
  code: string,
  hostPlayerId: string,
  confirmation: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const room = await findRoomTx(tx, code);
    assertHost(room, hostPlayerId);
    if (confirmation.trim().toUpperCase() !== room.code) {
      throw new AppError('Type the room code to confirm the reset');
    }

    const hand = await latestHandTx(tx, room.id);
    if (hand && (hand.phase === 'betting' || hand.phase === 'awaiting_payout')) {
      throw new ConflictError('Finish the current hand before resetting the room');
    }

    const allPlayers = await tx
      .select()
      .from(players)
      .where(and(eq(players.roomId, room.id), ne(players.status, 'removed')));

    let total = 0;
    for (const player of allPlayers) {
      if (player.isSpectator || player.status === 'pending') continue;
      total += room.startingChips;
      const delta = room.startingChips - player.chips;
      if (delta !== 0) {
        await tx.insert(chipAdjustments).values({
          roomId: room.id,
          playerId: player.id,
          hostPlayerId,
          amount: delta,
          reason: 'Room reset to starting stacks',
        });
      }
      await tx
        .update(players)
        .set({ chips: room.startingChips, isReady: true })
        .where(eq(players.id, player.id));
    }

    await tx
      .update(rooms)
      .set({ status: 'lobby', totalChips: total, version: room.version + 1 })
      .where(eq(rooms.id, room.id));
  });
}

export async function adjustChips(
  code: string,
  hostPlayerId: string,
  targetPlayerId: string,
  amount: number,
  reason: string,
): Promise<void> {
  if (!Number.isInteger(amount) || amount === 0) {
    throw new AppError('Adjustment must be a non-zero whole number of chips');
  }
  if (reason.trim().length < 3) throw new AppError('A reason is required for chip adjustments');

  await db.transaction(async (tx) => {
    const room = await findRoomTx(tx, code);
    assertHost(room, hostPlayerId);
    if (amount > 0 && !room.allowRebuys) {
      throw new ConflictError('Rebuys and chip additions are disabled for this room');
    }

    const hand = await latestHandTx(tx, room.id);
    if (hand && (hand.phase === 'betting' || hand.phase === 'awaiting_payout')) {
      throw new ConflictError('Chip adjustments are only allowed between hands');
    }

    const [target] = await tx
      .select()
      .from(players)
      .where(and(eq(players.id, targetPlayerId), eq(players.roomId, room.id)))
      .for('update');
    if (!target) throw new NotFoundError('Player not found');
    if (target.isSpectator || target.status === 'pending' || target.status === 'removed') {
      throw new AppError('Chips can only be adjusted for seated players');
    }
    if (target.chips + amount < 0) {
      throw new AppError('Adjustment would make the player balance negative');
    }

    await tx
      .update(players)
      .set({ chips: target.chips + amount })
      .where(eq(players.id, target.id));
    await tx.insert(chipAdjustments).values({
      roomId: room.id,
      playerId: target.id,
      hostPlayerId,
      amount,
      reason: reason.trim().slice(0, 120),
    });
    await tx
      .update(rooms)
      .set({ totalChips: room.totalChips + amount, version: room.version + 1 })
      .where(eq(rooms.id, room.id));
  });
}

/* ------------------------------------------------------------------ */
/* History & stats                                                     */
/* ------------------------------------------------------------------ */

export async function getRoomHistory(
  code: string,
  sessionToken: string,
): Promise<RoomHistoryResponse> {
  const { room, player } = await sessionPlayer(db, code, sessionToken);

  const handRows = await db
    .select()
    .from(hands)
    .where(eq(hands.roomId, room.id))
    .orderBy(desc(hands.handNumber))
    .limit(60);

  const allPlayerRows = await db.select().from(players).where(eq(players.roomId, room.id));
  const playerMap = new Map(allPlayerRows.map((row) => [row.id, row]));

  const handIds = handRows.map((row) => row.id);
  const hpRows =
    handIds.length === 0
      ? []
      : await db.select().from(handPlayers).where(inArray(handPlayers.handId, handIds));
  const actionRows =
    handIds.length === 0
      ? []
      : await db.select().from(actions).where(inArray(actions.handId, handIds));
  const potRows =
    handIds.length === 0
      ? []
      : await db.select().from(pots).where(inArray(pots.handId, handIds));

  const hpByHand = new Map<string, Array<typeof handPlayers.$inferSelect>>();
  for (const row of hpRows) {
    const list = hpByHand.get(row.handId) ?? [];
    list.push(row);
    hpByHand.set(row.handId, list);
  }
  const actionsByHand = new Map<string, Array<typeof actions.$inferSelect>>();
  for (const row of actionRows) {
    const list = actionsByHand.get(row.handId) ?? [];
    list.push(row);
    actionsByHand.set(row.handId, list);
  }
  const potsByHand = new Map<string, Array<typeof pots.$inferSelect>>();
  for (const row of potRows) {
    const list = potsByHand.get(row.handId) ?? [];
    list.push(row);
    potsByHand.set(row.handId, list);
  }

  let biggestPot = 0;
  let handsPlayed = 0;
  let yourNet = 0;

  const details: HandHistoryDetail[] = handRows.map((hand) => {
    const hps = (hpByHand.get(hand.id) ?? []).slice().sort((a, b) => a.seat - b.seat);
    const handActionRows = (actionsByHand.get(hand.id) ?? []).slice().sort((a, b) => a.seq - b.seq);
    const handPotRows = (potsByHand.get(hand.id) ?? []).slice().sort((a, b) => a.potIndex - b.potIndex);

    const seats: PlayerSeatView[] = hps.map((hp) => {
      const row = playerMap.get(hp.playerId);
      const computedEnding =
        hp.endingChips ?? hp.startingChips - hp.contributed + hp.payout;
      return {
        playerId: hp.playerId,
        nickname: row?.nickname ?? 'Player',
        seat: hp.seat,
        chips: computedEnding,
        committed: hp.committed,
        contributed: hp.contributed,
        startingChips: hp.startingChips,
        folded: hp.folded,
        allIn: hp.allIn,
        sittingOut: false,
        hasActed: hp.hasActed,
        raiseLocked: hp.raiseLocked,
        payout: hp.payout,
        endingChips: hp.endingChips,
        isConnected: row?.connected ?? false,
        isHost: row?.isHost ?? false,
      };
    });

    const actionViews: ActionView[] = handActionRows.map((row) => ({
      id: row.id,
      seq: row.seq,
      playerId: row.playerId,
      nickname: row.playerId ? playerMap.get(row.playerId)?.nickname ?? null : null,
      type: row.type,
      amount: row.amount,
      street: row.street,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    }));

    const potViews: PotView[] = handPotRows.map((row) => ({
      id: row.id,
      index: row.potIndex,
      amount: row.amount,
      eligiblePlayerIds: row.eligiblePlayerIds,
      winnerIds: row.winnerIds,
      distribution: row.distribution ?? null,
    }));

    const totalPot =
      handPotRows.length > 0
        ? handPotRows.reduce((sum, row) => sum + row.amount, 0)
        : hps.reduce((sum, row) => sum + row.contributed, 0);

    const winnerMap = new Map<string, number>();
    for (const potRow of handPotRows) {
      if (potRow.distribution) {
        for (const [winnerId, amount] of Object.entries(potRow.distribution)) {
          winnerMap.set(winnerId, (winnerMap.get(winnerId) ?? 0) + amount);
        }
      }
    }
    const winners = [...winnerMap.entries()].map(([winnerId, amount]) => ({
      playerId: winnerId,
      nickname: playerMap.get(winnerId)?.nickname ?? 'Player',
      amount,
    }));

    if (hand.phase === 'complete') {
      handsPlayed += 1;
      biggestPot = Math.max(biggestPot, totalPot);
      const me = hps.find((row) => row.playerId === player.id);
      if (me) yourNet += me.payout - me.contributed;
    }

    return {
      id: hand.id,
      handNumber: hand.handNumber,
      startedAt: hand.startedAt.toISOString(),
      completedAt: hand.completedAt ? hand.completedAt.toISOString() : null,
      totalPot,
      winners,
      yourNet: undefined,
      street: hand.street,
      dealerSeat: hand.dealerSeat,
      actions: actionViews,
      seats,
      pots: potViews,
    };
  });

  // Per-hand net for this viewer is useful in the UI.
  for (const detail of details) {
    const me = detail.seats.find((seat) => seat.playerId === player.id);
    detail.yourNet = me ? me.payout - me.contributed : 0;
  }

  let adjustments: ChipAdjustmentView[] = [];
  if (player.isHost) {
    const rows = await db
      .select({ adjustment: chipAdjustments, nickname: players.nickname })
      .from(chipAdjustments)
      .innerJoin(players, eq(chipAdjustments.playerId, players.id))
      .where(eq(chipAdjustments.roomId, room.id))
      .orderBy(desc(chipAdjustments.createdAt))
      .limit(200);
    adjustments = rows.map(({ adjustment, nickname }) => ({
      id: adjustment.id,
      playerId: adjustment.playerId,
      nickname,
      amount: adjustment.amount,
      reason: adjustment.reason,
      createdAt: adjustment.createdAt.toISOString(),
    }));
  }

  return {
    hands: details,
    stats: {
      handsPlayed,
      biggestPot,
      totalChipsInPlay: room.totalChips,
      yourNet,
    },
    adjustments,
  };
}

/** Internal helper used by hand service to assert the current hand state. */
export async function assertNoActiveHand(roomId: string): Promise<void> {
  const hand = await latestHand(roomId);
  if (hand && (hand.phase === 'betting' || hand.phase === 'awaiting_payout')) {
    throw new ConflictError('Finish the current hand first');
  }
}

export { findRoom, latestHand, insertEngineEvents, payouts };
