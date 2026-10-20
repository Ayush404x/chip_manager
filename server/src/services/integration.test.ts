import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { CreateRoomInput } from '@chiproom/shared';
import { closeDb, db, pool } from '../db/client.js';
import {
  adjustChips,
  approvePlayer,
  authenticateSession,
  closeRoom,
  createRoom,
  getRoomHistory,
  getRoomPreview,
  getRoomState,
  joinRoom,
  pauseRoom,
  removePlayer,
  resetRoom,
  resumeRoom,
  setReady,
  updateSettings,
} from './roomService.js';
import {
  performAction,
  previewSettlement,
  settleHand,
  startHandForRoom,
  undoLastAction,
} from './handService.js';
import type { AuthResult } from './roomService.js';

const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

beforeAll(async () => {
  await migrate(db, { migrationsFolder });
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE TABLE payouts, pots, actions, hand_players, hands, chip_adjustments, players, rooms RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await closeDb();
});

function input(overrides: Partial<CreateRoomInput> = {}): CreateRoomInput {
  return {
    roomName: 'Test Table',
    hostNickname: 'Host',
    startingChips: 1000,
    smallBlind: 10,
    bigBlind: 20,
    maxPlayers: 6,
    spectatorMode: true,
    lateJoin: true,
    allowRebuys: true,
    requireApproval: false,
    ...overrides,
  };
}

async function makeRoom(overrides: Partial<CreateRoomInput> = {}): Promise<AuthResult> {
  return createRoom(input(overrides));
}

async function addPlayer(code: string, nickname: string, options: { password?: string; spectator?: boolean } = {}) {
  return joinRoom(code, {
    nickname,
    password: options.password,
    spectator: options.spectator ?? false,
  });
}

async function act(
  code: string,
  playerId: string,
  type: 'check' | 'bet' | 'call' | 'raise' | 'fold' | 'all_in',
  amount?: number,
  actionId = randomUUID(),
) {
  return performAction(code, playerId, { actionId, type, amount });
}

function player(state: Awaited<ReturnType<typeof getRoomState>>, nickname: string) {
  const found = state.players.find((entry) => entry.nickname === nickname);
  if (!found) throw new Error(`Player ${nickname} not found`);
  return found;
}

describe('room creation, joining and access control', () => {
  it('creates a private room and enforces passwords, unique nicknames, seats and spectators', async () => {
    const host = await makeRoom({ password: 'secret', maxPlayers: 2 });
    const preview = await getRoomPreview(host.roomCode);

    expect(preview.room.code).toBe(host.roomCode);
    expect(preview.hostNickname).toBe('Host');
    expect(preview.players).toHaveLength(1);
    expect(preview.room.settings.hasPassword).toBe(true);

    await expect(addPlayer(host.roomCode, 'Leo')).rejects.toThrow(/requires a password/i);
    await expect(addPlayer(host.roomCode, 'Leo', { password: 'wrong' })).rejects.toThrow(
      /Incorrect room password/i,
    );

    const leo = await addPlayer(host.roomCode, 'Leo', { password: 'secret' });
    expect(leo.isHost).toBe(false);
    expect(leo.isSpectator).toBe(false);

    await expect(addPlayer(host.roomCode, 'leo', { password: 'secret' })).rejects.toThrow(
      /nickname is already taken/i,
    );

    // The two player seats are now full, but spectators do not consume a seat.
    await expect(addPlayer(host.roomCode, 'Third', { password: 'secret' })).rejects.toThrow(
      /room is full/i,
    );
    const spectator = await addPlayer(host.roomCode, 'Watcher', {
      password: 'secret',
      spectator: true,
    });
    expect(spectator.isSpectator).toBe(true);

    const state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.me?.isHost).toBe(true);
    expect(state.players).toHaveLength(3);
    expect(state.players.filter((entry) => !entry.isSpectator)).toHaveLength(2);

    await expect(authenticateSession(host.roomCode, 'not-a-real-session-token')).rejects.toThrow(
      /session/i,
    );
  });

  it('supports approval, readiness and closing late joining after play starts', async () => {
    const host = await makeRoom({
      maxPlayers: 3,
      requireApproval: true,
      lateJoin: false,
    });

    const leo = await addPlayer(host.roomCode, 'Leo');
    await expect(getRoomState(host.roomCode, leo.sessionToken)).resolves.toMatchObject({
      me: { status: 'pending', chips: 0 },
    });

    await expect(approvePlayer(host.roomCode, leo.playerId, leo.playerId)).rejects.toThrow(
      /Only the host/i,
    );
    await approvePlayer(host.roomCode, host.playerId, leo.playerId);

    let state = await getRoomState(host.roomCode, leo.sessionToken);
    expect(player(state, 'Leo')).toMatchObject({
      status: 'seated',
      chips: 1000,
      isReady: true,
      seat: 2,
    });

    await setReady(host.roomCode, host.playerId, false);
    await expect(startHandForRoom(host.roomCode, host.playerId)).rejects.toThrow(/ready up/i);
    await setReady(host.roomCode, host.playerId, true);

    await startHandForRoom(host.roomCode, host.playerId);
    await expect(addPlayer(host.roomCode, 'Late')).rejects.toThrow(
      /no longer accepting new players/i,
    );

    state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.room.status).toBe('active');
    expect(state.hand?.handNumber).toBe(1);
  });

  it('frees a removed seat and nickname and invalidates the removed session', async () => {
    const host = await makeRoom();
    const leo = await addPlayer(host.roomCode, 'Leo');
    const mia = await addPlayer(host.roomCode, 'Mia');

    await expect(removePlayer(host.roomCode, leo.playerId, mia.playerId)).rejects.toThrow(
      /Only the host/i,
    );
    await expect(removePlayer(host.roomCode, host.playerId, host.playerId)).rejects.toThrow(
      /cannot remove themselves/i,
    );

    await removePlayer(host.roomCode, host.playerId, leo.playerId);

    let state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.players.find((entry) => entry.nickname === 'Leo')).toBeUndefined();
    expect(state.room.totalChips).toBe(2000);
    await expect(getRoomState(host.roomCode, leo.sessionToken)).rejects.toThrow();

    const leoAgain = await addPlayer(host.roomCode, 'Leo');
    expect(leoAgain.playerId).not.toBe(leo.playerId);
    state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.room.totalChips).toBe(3000);
    expect(player(state, 'Leo')).toMatchObject({ chips: 1000, status: 'seated' });
  });
});

describe('hand lifecycle and action validation', () => {
  it('posts blinds, persists server-validated actions, deduplicates retries and rotates the button', async () => {
    const host = await makeRoom();
    const leo = await addPlayer(host.roomCode, 'Leo');
    const mia = await addPlayer(host.roomCode, 'Mia');

    await expect(startHandForRoom(host.roomCode, leo.playerId)).rejects.toThrow(/Only the host/i);
    await startHandForRoom(host.roomCode, host.playerId);

    let state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.hand).toMatchObject({
      handNumber: 1,
      phase: 'betting',
      street: 'preflop',
      dealerSeat: 1,
      sbSeat: 2,
      bbSeat: 3,
      currentBet: 20,
      turnSeat: 1,
    });
    expect(player(state, 'Host').chips).toBe(1000);
    expect(player(state, 'Leo').chips).toBe(990);
    expect(player(state, 'Mia').chips).toBe(980);
    expect(state.room.totalChips).toBe(3000);

    await expect(act(host.roomCode, host.playerId, 'check')).rejects.toThrow(/must call 20/i);
    await expect(act(host.roomCode, leo.playerId, 'call')).rejects.toThrow(/not your turn/i);

    const actionId = randomUUID();
    await act(host.roomCode, host.playerId, 'call', undefined, actionId);
    const duplicate = await act(host.roomCode, host.playerId, 'call', undefined, actionId);
    expect(duplicate.duplicate).toBe(true);

    state = await getRoomState(host.roomCode, host.sessionToken);
    expect(player(state, 'Host').chips).toBe(980);
    expect(state.hand?.actions.filter((entry) => entry.type === 'call')).toHaveLength(1);
    expect(state.hand?.turnSeat).toBe(2);

    await act(host.roomCode, leo.playerId, 'fold');
    await act(host.roomCode, mia.playerId, 'check');
    state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.hand?.street).toBe('flop');
    expect(state.hand?.turnSeat).toBe(3);

    await act(host.roomCode, mia.playerId, 'check');
    await act(host.roomCode, host.playerId, 'fold');

    state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.hand?.phase).toBe('complete');
    expect(state.hand?.autoSettled).toBe(true);
    expect(player(state, 'Mia').chips).toBe(1030);
    expect(player(state, 'Leo').chips).toBe(990);
    expect(player(state, 'Host').chips).toBe(980);
    expect(
      state.players.reduce((sum, entry) => sum + entry.chips, 0),
    ).toBe(3000);

    await expect(
      settleHand(host.roomCode, host.playerId, {
        selections: [{ potIndex: 0, winnerIds: [mia.playerId] }],
      }),
    ).rejects.toThrow(/already been settled/i);

    await startHandForRoom(host.roomCode, host.playerId);
    state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.hand?.handNumber).toBe(2);
    expect(state.hand?.dealerSeat).toBe(2);
    expect(state.hand?.sbSeat).toBe(3);
    expect(state.hand?.bbSeat).toBe(1);

    const history = await getRoomHistory(host.roomCode, host.sessionToken);
    const hand1 = history.hands.find((entry) => entry.handNumber === 1)!;
    expect(hand1).toBeDefined();
    expect(hand1.actions.some((entry) => entry.type === 'win')).toBe(true);
    expect(history.stats.handsPlayed).toBeGreaterThanOrEqual(1);
  });

  it('handles ties, dead folded chips, odd-chip order and manual payout exactly once', async () => {
    const host = await makeRoom({ startingChips: 1000, smallBlind: 5, bigBlind: 10, maxPlayers: 6 });
    const leo = await addPlayer(host.roomCode, 'Leo');
    const mia = await addPlayer(host.roomCode, 'Mia');
    const noah = await addPlayer(host.roomCode, 'Noah');
    await startHandForRoom(host.roomCode, host.playerId);

    // Pre-flop: everyone sees 10. No cards are dealt; this is pure chip state.
    await act(host.roomCode, noah.playerId, 'call'); // seat 4, first to act
    await act(host.roomCode, host.playerId, 'call'); // seat 1 / dealer
    await act(host.roomCode, leo.playerId, 'call'); // seat 2 / small blind
    await act(host.roomCode, mia.playerId, 'check'); // seat 3 / big blind

    // Flop: Leo bets 10, Mia calls, Noah folds, Host calls.
    await act(host.roomCode, leo.playerId, 'bet', 10);
    await act(host.roomCode, mia.playerId, 'call');
    await act(host.roomCode, noah.playerId, 'fold');
    await act(host.roomCode, host.playerId, 'call');

    // Turn and river check down.
    await act(host.roomCode, leo.playerId, 'check');
    await act(host.roomCode, mia.playerId, 'check');
    await act(host.roomCode, host.playerId, 'check');
    await act(host.roomCode, leo.playerId, 'check');
    await act(host.roomCode, mia.playerId, 'check');
    await act(host.roomCode, host.playerId, 'check');

    const state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.hand?.phase).toBe('awaiting_payout');
    expect(state.hand?.totalPot).toBe(70);
    expect(state.hand?.pots.map((pot) => pot.amount)).toEqual([40, 30]);
    expect(state.hand?.pots.every((pot) => pot.eligiblePlayerIds.length === 3)).toBe(true);
    expect(state.hand?.pots[0].eligiblePlayerIds).not.toContain(noah.playerId);

    const selections = state.hand!.pots.map((pot) => ({
      potIndex: pot.index,
      winnerIds: [host.playerId, leo.playerId, mia.playerId],
    }));

    await expect(
      previewSettlement(host.roomCode, host.playerId, [
        { potIndex: 0, winnerIds: [noah.playerId] },
        { potIndex: 1, winnerIds: [host.playerId] },
      ]),
    ).rejects.toThrow(/not eligible|folded/i);

    await expect(
      previewSettlement(host.roomCode, host.playerId, [
        { potIndex: 0, winnerIds: [host.playerId] },
      ]),
    ).rejects.toThrow(/every pot/i);

    const preview = await previewSettlement(host.roomCode, host.playerId, selections);
    expect(preview.totalDistributed).toBe(70);
    const mainPot = preview.pots.find((pot) => pot.potIndex === 0)!;
    const sidePot = preview.pots.find((pot) => pot.potIndex === 1)!;
    // Dealer seat 1: odd chip goes to seat 2 (Leo), then seat 3 (Mia), then seat 1.
    expect(mainPot.winners.find((winner) => winner.playerId === leo.playerId)?.amount).toBe(14);
    expect(mainPot.winners.find((winner) => winner.playerId === mia.playerId)?.amount).toBe(13);
    expect(mainPot.winners.find((winner) => winner.playerId === host.playerId)?.amount).toBe(13);
    expect(sidePot.winners.every((winner) => winner.amount === 10)).toBe(true);

    await expect(
      settleHand(host.roomCode, leo.playerId, { selections }),
    ).rejects.toThrow(/Only the host/i);
    const settled = await settleHand(host.roomCode, host.playerId, { selections });
    expect(settled.totalDistributed).toBe(70);

    const after = await getRoomState(host.roomCode, host.sessionToken);
    expect(after.hand?.phase).toBe('complete');
    expect(player(after, 'Host').chips).toBe(1003);
    expect(player(after, 'Leo').chips).toBe(1004);
    expect(player(after, 'Mia').chips).toBe(1003);
    expect(player(after, 'Noah').chips).toBe(990);
    expect(after.players.reduce((sum, entry) => sum + entry.chips, 0)).toBe(4000);
    expect(after.room.totalChips).toBe(4000);

    await expect(
      settleHand(host.roomCode, host.playerId, { selections }),
    ).rejects.toThrow(/already been settled/i);
    await expect(
      previewSettlement(host.roomCode, host.playerId, selections),
    ).rejects.toThrow(/already been settled/i);

    const history = await getRoomHistory(host.roomCode, host.sessionToken);
    const hand = history.hands.find((entry) => entry.handNumber === 1)!;
    expect(hand.winners.reduce((sum, winner) => sum + winner.amount, 0)).toBe(70);
    expect(hand.seats.find((seat) => seat.playerId === host.playerId)?.endingChips).toBe(1003);
  });

  it('undoes only the latest own action before anyone responds, then restores the turn', async () => {
    const host = await makeRoom({ startingChips: 5000, smallBlind: 10, bigBlind: 20, maxPlayers: 2 });
    const leo = await addPlayer(host.roomCode, 'Leo');
    await startHandForRoom(host.roomCode, host.playerId);

    let state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.hand?.undoablePlayerId).toBeNull();

    await act(host.roomCode, host.playerId, 'call');
    state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.hand?.undoablePlayerId).toBe(host.playerId);
    expect(player(state, 'Host').chips).toBe(4980);
    expect(state.hand?.turnSeat).toBe(2);

    await expect(undoLastAction(host.roomCode, leo.playerId)).rejects.toThrow(
      /only undo your own/i,
    );
    await undoLastAction(host.roomCode, host.playerId);

    state = await getRoomState(host.roomCode, host.sessionToken);
    expect(player(state, 'Host').chips).toBe(4990);
    expect(player(state, 'Leo').chips).toBe(4980);
    expect(state.hand?.turnSeat).toBe(1);
    expect(state.hand?.currentBet).toBe(20);
    expect(state.hand?.actions.filter((entry) => entry.type === 'call')).toHaveLength(0);
    expect(state.hand?.undoablePlayerId).toBeNull();
    expect(
      state.players.reduce((sum, entry) => sum + entry.chips, 0) + (state.hand?.totalPot ?? 0),
    ).toBe(10_000);

    await expect(undoLastAction(host.roomCode, host.playerId)).rejects.toThrow(
      /no undoable action/i,
    );

    await act(host.roomCode, host.playerId, 'call');
    await act(host.roomCode, leo.playerId, 'check');
    state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.hand?.street).toBe('flop');
    expect(state.hand?.undoablePlayerId).toBe(leo.playerId);

    await expect(undoLastAction(host.roomCode, host.playerId)).rejects.toThrow(
      /only undo your own/i,
    );
    await undoLastAction(host.roomCode, leo.playerId);
    state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.hand?.street).toBe('preflop');
    expect(state.hand?.turnSeat).toBe(2);
    expect(state.hand?.undoablePlayerId).toBe(host.playerId);

    await act(host.roomCode, leo.playerId, 'fold');
    state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.hand?.phase).toBe('complete');
    expect(state.hand?.undoablePlayerId).toBeNull();
    await expect(undoLastAction(host.roomCode, leo.playerId)).rejects.toThrow(
      /only a betting action/i,
    );
    expect(state.players.reduce((sum, entry) => sum + entry.chips, 0)).toBe(10_000);
  });

  it('builds correct main and side pots across all-ins without creating or losing chips', async () => {
    const host = await makeRoom({ startingChips: 100, smallBlind: 10, bigBlind: 20, maxPlayers: 3 });
    const leo = await addPlayer(host.roomCode, 'Leo');
    const mia = await addPlayer(host.roomCode, 'Mia');

    await adjustChips(host.roomCode, host.playerId, leo.playerId, 200, 'Rebuy');

    await adjustChips(host.roomCode, host.playerId, mia.playerId, 400, 'Rebuy');
    let state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.room.totalChips).toBe(900);
    expect(player(state, 'Leo').chips).toBe(300);
    expect(player(state, 'Mia').chips).toBe(500);

    await startHandForRoom(host.roomCode, host.playerId);
    await act(host.roomCode, host.playerId, 'all_in'); // 100 total
    await act(host.roomCode, leo.playerId, 'all_in'); // 300 total
    await act(host.roomCode, mia.playerId, 'call'); // call 280 to 300

    state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.hand?.phase).toBe('awaiting_payout');
    expect(state.hand?.pots.map((pot) => pot.amount)).toEqual([300, 400]);
    expect(state.hand?.pots[1].eligiblePlayerIds.sort()).toEqual(
      [leo.playerId, mia.playerId].sort(),
    );

    await expect(
      previewSettlement(host.roomCode, host.playerId, [
        { potIndex: 0, winnerIds: [leo.playerId] },
        { potIndex: 1, winnerIds: [host.playerId] },
      ]),
    ).rejects.toThrow(/not eligible/i);

    const selections = [
      { potIndex: 0, winnerIds: [leo.playerId] },
      { potIndex: 1, winnerIds: [mia.playerId] },
    ];
    const preview = await previewSettlement(host.roomCode, host.playerId, selections);
    expect(preview.totalDistributed).toBe(700);
    await settleHand(host.roomCode, host.playerId, { selections });

    const after = await getRoomState(host.roomCode, host.sessionToken);
    expect(player(after, 'Host').chips).toBe(0);
    expect(player(after, 'Leo').chips).toBe(300);
    expect(player(after, 'Mia').chips).toBe(600);
    expect(after.players.reduce((sum, entry) => sum + entry.chips, 0)).toBe(900);
    expect(after.room.totalChips).toBe(900);
  });

  it('serializes concurrent actions and only accepts one', async () => {
    const host = await makeRoom({ startingChips: 1000, smallBlind: 10, bigBlind: 20, maxPlayers: 3 });
    const leo = await addPlayer(host.roomCode, 'Leo');
    const mia = await addPlayer(host.roomCode, 'Mia');
    await startHandForRoom(host.roomCode, host.playerId);

    // Host is first to act. Mia is the big blind and cannot act until both
    // Host and Leo have acted, so one of these concurrent requests must lose.
    const results = await Promise.allSettled([
      act(host.roomCode, host.playerId, 'call'),
      act(host.roomCode, mia.playerId, 'call'),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.hand?.street).toBe('preflop');
    expect(state.hand?.turnSeat).toBe(2);
    expect(state.hand?.actions.filter((entry) => entry.type === 'call')).toHaveLength(1);
    expect(state.players.reduce((sum, entry) => sum + entry.chips, 0) + (state.hand?.totalPot ?? 0)).toBe(3000);

    const leoState = await getRoomState(host.roomCode, leo.sessionToken);
    expect(leoState.me?.id).toBe(leo.playerId);
    expect(leoState.hand?.street).toBe('preflop');
  });
});

describe('host controls, audit and room lifecycle', () => {
  it('records auditable chip adjustments, resets stacks and closes the room', async () => {
    const host = await makeRoom({ startingChips: 1000, maxPlayers: 3 });
    const leo = await addPlayer(host.roomCode, 'Leo');

    await expect(
      adjustChips(host.roomCode, leo.playerId, leo.playerId, 100, 'Not host'),
    ).rejects.toThrow(/Only the host/i);
    await expect(
      adjustChips(host.roomCode, host.playerId, host.playerId, 0, 'Bad amount'),
    ).rejects.toThrow(/non-zero/i);
    await expect(
      adjustChips(host.roomCode, host.playerId, host.playerId, -5000, 'Too much'),
    ).rejects.toThrow(/negative/i);

    await adjustChips(host.roomCode, host.playerId, host.playerId, 500, 'Top-up');
    let state = await getRoomState(host.roomCode, host.sessionToken);
    expect(player(state, 'Host').chips).toBe(1500);
    expect(state.room.totalChips).toBe(2500);
    expect(state.adjustments?.some((entry) => entry.amount === 500 && entry.reason === 'Top-up')).toBe(true);

    await startHandForRoom(host.roomCode, host.playerId);
    await expect(
      adjustChips(host.roomCode, host.playerId, host.playerId, 100, 'During hand'),
    ).rejects.toThrow(/between hands/i);
    await expect(pauseRoom(host.roomCode, host.playerId)).resolves.toBeUndefined();
    state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.room.status).toBe('paused');
    await expect(act(host.roomCode, host.playerId, 'call')).rejects.toThrow(/not currently running/i);
    await expect(resumeRoom(host.roomCode, host.playerId)).resolves.toBeUndefined();

    // Fold the hand down to the last live player so the room can be reset.
    await act(host.roomCode, host.playerId, 'fold');
    // Heads-up: Leo is the only live player and is auto-awarded the pot.
    state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.hand?.phase).toBe('complete');
    expect(state.hand?.autoSettled).toBe(true);

    await expect(resetRoom(host.roomCode, host.playerId, 'WRONG')).rejects.toThrow(
      /Type the room code/i,
    );
    await resetRoom(host.roomCode, host.playerId, host.roomCode.toLowerCase());
    state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.room.status).toBe('lobby');
    expect(state.room.totalChips).toBe(2000);
    expect(player(state, 'Host').chips).toBe(1000);
    expect(player(state, 'Leo').chips).toBe(1000);
    expect(state.adjustments?.some((entry) => entry.reason.includes('reset'))).toBe(true);

    await closeRoom(host.roomCode, host.playerId);
    state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.room.status).toBe('closed');
    await expect(addPlayer(host.roomCode, 'Late')).rejects.toThrow(/closed/i);
    await expect(startHandForRoom(host.roomCode, host.playerId)).rejects.toThrow(/closed/i);
  });

  it('updates settings only for the host and blocks structural changes mid-hand', async () => {
    const host = await makeRoom({ maxPlayers: 4 });
    const leo = await addPlayer(host.roomCode, 'Leo');

    await expect(
      updateSettings(host.roomCode, leo.playerId, { roomName: 'Hijacked' }),
    ).rejects.toThrow(/Only the host/i);

    await updateSettings(host.roomCode, host.playerId, {
      roomName: 'Friday Night',
      maxPlayers: 5,
      spectatorMode: false,
      requireApproval: true,
      password: 'newpass',
    });
    let state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.room.name).toBe('Friday Night');
    expect(state.room.settings.maxPlayers).toBe(5);
    expect(state.room.settings.requireApproval).toBe(true);
    expect(state.room.settings.hasPassword).toBe(true);

    await startHandForRoom(host.roomCode, host.playerId);
    await expect(
      updateSettings(host.roomCode, host.playerId, { bigBlind: 40 }),
    ).rejects.toThrow(/between hands|active hand/i);

    await updateSettings(host.roomCode, host.playerId, { roomName: 'Still Friday' });
    state = await getRoomState(host.roomCode, host.sessionToken);
    expect(state.room.name).toBe('Still Friday');
  });
});
