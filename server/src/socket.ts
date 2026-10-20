import type { Server, Socket } from 'socket.io';
import { eq } from 'drizzle-orm';
import { z, ZodError } from 'zod';
import { bettingActionSchema, settleSchema, updateSettingsSchema } from '@chiproom/shared';
import { db } from './db/client.js';
import { players } from './db/schema.js';
import { AppError } from './lib/errors.js';
import { FixedWindowLimiter } from './lib/rateLimit.js';
import {
  adjustChips,
  approvePlayer,
  closeRoom,
  getRoomHistory,
  getRoomState,
  pauseRoom,
  removePlayer,
  resetRoom,
  resumeRoom,
  setReady,
  updateSettings,
} from './services/roomService.js';
import {
  advanceHand,
  performAction,
  previewSettlement,
  recoverHand,
  setPlayerSittingOut,
  settleHand,
  startHandForRoom,
  undoLastAction,
} from './services/handService.js';

interface SessionData {
  code?: string;
  sessionToken?: string;
  playerId?: string;
}

type Ack = (response: Record<string, unknown>) => void;

const subscribeSchema = z.object({
  code: z.string().min(3).max(16),
  sessionToken: z.string().min(16).max(128),
});

const codeSchema = z.object({ code: z.string().min(3).max(16) });

const actionPayloadSchema = z.object({
  code: z.string().min(3).max(16),
  action: bettingActionSchema,
});

const settlePayloadSchema = z.object({
  code: z.string().min(3).max(16),
  selections: settleSchema.shape.selections,
});

const playerPayloadSchema = z.object({
  code: z.string().min(3).max(16),
  playerId: z.string().uuid(),
});

const sitOutPayloadSchema = playerPayloadSchema.extend({
  sittingOut: z.boolean(),
});

const adjustPayloadSchema = z.object({
  code: z.string().min(3).max(16),
  playerId: z.string().uuid(),
  amount: z.number().int().min(-100_000_000).max(100_000_000),
  reason: z.string().trim().min(3).max(120),
});

const settingsPayloadSchema = z.object({
  code: z.string().min(3).max(16),
  settings: updateSettingsSchema,
});

const resetPayloadSchema = z.object({
  code: z.string().min(3).max(16),
  confirmation: z.string().min(1).max(16),
});

const readyPayloadSchema = z.object({
  code: z.string().min(3).max(16),
  ready: z.boolean(),
});

const actionLimiter = new FixedWindowLimiter(60, 10_000);
const subscribeLimiter = new FixedWindowLimiter(30, 60_000);

const presence = new Map<string, Set<string>>();
let ioRef: Server | null = null;

function addPresence(playerId: string, socketId: string) {
  const set = presence.get(playerId) ?? new Set<string>();
  set.add(socketId);
  presence.set(playerId, set);
}

function removePresence(playerId: string, socketId: string): boolean {
  const set = presence.get(playerId);
  if (!set) return true;
  set.delete(socketId);
  if (set.size === 0) {
    presence.delete(playerId);
    return true;
  }
  return false;
}

async function setConnected(playerId: string, connected: boolean): Promise<void> {
  await db
    .update(players)
    .set({ connected, lastSeenAt: new Date() })
    .where(eq(players.id, playerId));
}

function roomName(code: string): string {
  return `room:${code.toUpperCase()}`;
}

async function emitStateToSocket(socket: {
  data: SessionData;
  emit: (...args: any[]) => unknown;
  leave: (room: string) => unknown;
}): Promise<void> {
  const data = socket.data;
  if (!data.code || !data.sessionToken) return;
  try {
    const state = await getRoomState(data.code, data.sessionToken);
    socket.emit('room:state', state);
  } catch {
    socket.emit('room:removed', { message: 'You no longer have access to this room' });
    await socket.leave(roomName(data.code));
  }
}

/** Broadcast a personalized snapshot to every socket in the room. */
export async function broadcastRoomState(code: string): Promise<void> {
  const io = ioRef;
  if (!io) return;
  const name = roomName(code);
  const sockets = await io.in(name).fetchSockets();
  await Promise.all(sockets.map((socket) => emitStateToSocket(socket)));
}

function sendAck(ack: Ack | undefined, payload: Record<string, unknown>): void {
  if (typeof ack === 'function') ack(payload);
}

function sendError(socket: Socket, ack: Ack | undefined, error: unknown): void {
  let message: string;
  if (error instanceof ZodError) message = error.issues[0]?.message ?? 'Invalid input';
  else if (error instanceof AppError) message = error.message;
  else if (error instanceof Error) message = error.message;
  else message = String(error);

  if (!(error instanceof AppError) && !(error instanceof ZodError)) {
    console.error('[socket] error', error);
  }
  if (typeof ack === 'function') {
    ack({ ok: false, error: message });
  } else {
    socket.emit('room:error', { message });
  }
}

function requireSession(socket: Socket, code: string): SessionData {
  const data = socket.data as SessionData;
  if (!data.playerId || !data.sessionToken || !data.code) {
    throw new AppError('Join the room first', 401, 'unauthorized');
  }
  if (data.code.toUpperCase() !== code.toUpperCase()) {
    throw new AppError('Session does not match this room', 403, 'forbidden');
  }
  return data;
}

async function cleanupSocket(socket: Socket): Promise<void> {
  const data = socket.data as SessionData;
  if (!data.playerId) return;
  if (data.code) await socket.leave(roomName(data.code));
  const nowEmpty = removePresence(data.playerId, socket.id);
  if (nowEmpty) {
    try {
      await setConnected(data.playerId, false);
      if (data.code) await broadcastRoomState(data.code);
    } catch (error) {
      console.error('[socket] disconnect cleanup failed', error);
    }
  }
  socket.data = {};
}

export function initSocket(io: Server): void {
  ioRef = io;

  io.on('connection', (socket) => {
    socket.on('room:subscribe', async (payload, ack?: Ack) => {
      const limiter = subscribeLimiter.check(socket.handshake.address ?? socket.id);
      if (!limiter.allowed) {
        sendError(socket, ack, new AppError('Too many connection attempts', 429, 'rate_limited'));
        return;
      }

      try {
        const { code, sessionToken } = subscribeSchema.parse(payload);
        const normalized = code.trim().toUpperCase();

        // Leave any previous room before joining a new one.
        const previous = socket.data as SessionData;
        if (previous.code && previous.code !== normalized) {
          await cleanupSocket(socket);
        }

        await getRoomState(normalized, sessionToken); // validates the token
        const [row] = await db
          .select({ id: players.id })
          .from(players)
          .where(eq(players.sessionToken, sessionToken))
          .limit(1);
        if (!row) throw new AppError('Session not found', 401, 'unauthorized');

        socket.data = { code: normalized, sessionToken, playerId: row.id } satisfies SessionData;
        addPresence(row.id, socket.id);
        await setConnected(row.id, true);
        await socket.join(roomName(normalized));

        const state = await getRoomState(normalized, sessionToken);
        sendAck(ack, { ok: true, state });
        socket.emit('room:state', state);
        await broadcastRoomState(normalized);
      } catch (error) {
        sendError(socket, ack, error);
      }
    });

    socket.on('room:action', async (payload, ack?: Ack) => {
      try {
        const parsed = actionPayloadSchema.parse(payload);
        const data = requireSession(socket, parsed.code);
        const limiter = actionLimiter.check(data.playerId ?? socket.id);
        if (!limiter.allowed) {
          throw new AppError('Too many actions. Slow down.', 429, 'rate_limited');
        }
        const result = await performAction(parsed.code, data.playerId as string, parsed.action);
        sendAck(ack, { ok: true, duplicate: result.duplicate });
        await broadcastRoomState(parsed.code);
      } catch (error) {
        sendError(socket, ack, error);
      }
    });

    socket.on('room:undoAction', async (payload, ack?: Ack) => {
      try {
        const { code } = codeSchema.parse(payload);
        const data = requireSession(socket, code);
        const limiter = actionLimiter.check(data.playerId ?? socket.id);
        if (!limiter.allowed) {
          throw new AppError('Too many actions. Slow down.', 429, 'rate_limited');
        }
        await undoLastAction(code, data.playerId as string);
        sendAck(ack, { ok: true });
        await broadcastRoomState(code);
      } catch (error) {
        sendError(socket, ack, error);
      }
    });

    socket.on('host:startHand', async (payload, ack?: Ack) => {
      try {
        const { code } = codeSchema.parse(payload);
        const data = requireSession(socket, code);
        const result = await startHandForRoom(code, data.playerId as string);
        sendAck(ack, { ok: true, ...result });
        await broadcastRoomState(code);
      } catch (error) {
        sendError(socket, ack, error);
      }
    });

    socket.on('host:pause', async (payload, ack?: Ack) => {
      try {
        const { code } = codeSchema.parse(payload);
        const data = requireSession(socket, code);
        await pauseRoom(code, data.playerId as string);
        sendAck(ack, { ok: true });
        await broadcastRoomState(code);
      } catch (error) {
        sendError(socket, ack, error);
      }
    });

    socket.on('host:resume', async (payload, ack?: Ack) => {
      try {
        const { code } = codeSchema.parse(payload);
        const data = requireSession(socket, code);
        await resumeRoom(code, data.playerId as string);
        sendAck(ack, { ok: true });
        await broadcastRoomState(code);
      } catch (error) {
        sendError(socket, ack, error);
      }
    });

    socket.on('host:close', async (payload, ack?: Ack) => {
      try {
        const { code } = codeSchema.parse(payload);
        const data = requireSession(socket, code);
        await closeRoom(code, data.playerId as string);
        sendAck(ack, { ok: true });
        await broadcastRoomState(code);
      } catch (error) {
        sendError(socket, ack, error);
      }
    });

    socket.on('host:reset', async (payload, ack?: Ack) => {
      try {
        const parsed = resetPayloadSchema.parse(payload);
        const data = requireSession(socket, parsed.code);
        await resetRoom(parsed.code, data.playerId as string, parsed.confirmation);
        sendAck(ack, { ok: true });
        await broadcastRoomState(parsed.code);
      } catch (error) {
        sendError(socket, ack, error);
      }
    });

    socket.on('host:settings', async (payload, ack?: Ack) => {
      try {
        const parsed = settingsPayloadSchema.parse(payload);
        const data = requireSession(socket, parsed.code);
        await updateSettings(parsed.code, data.playerId as string, parsed.settings);
        sendAck(ack, { ok: true });
        await broadcastRoomState(parsed.code);
      } catch (error) {
        sendError(socket, ack, error);
      }
    });

    socket.on('host:approve', async (payload, ack?: Ack) => {
      try {
        const parsed = playerPayloadSchema.parse(payload);
        const data = requireSession(socket, parsed.code);
        await approvePlayer(parsed.code, data.playerId as string, parsed.playerId);
        sendAck(ack, { ok: true });
        await broadcastRoomState(parsed.code);
      } catch (error) {
        sendError(socket, ack, error);
      }
    });

    socket.on('host:kick', async (payload, ack?: Ack) => {
      try {
        const parsed = playerPayloadSchema.parse(payload);
        const data = requireSession(socket, parsed.code);
        await removePlayer(parsed.code, data.playerId as string, parsed.playerId);
        sendAck(ack, { ok: true });
        await broadcastRoomState(parsed.code);
      } catch (error) {
        sendError(socket, ack, error);
      }
    });

    socket.on('host:sitOut', async (payload, ack?: Ack) => {
      try {
        const parsed = sitOutPayloadSchema.parse(payload);
        const data = requireSession(socket, parsed.code);
        await setPlayerSittingOut(
          parsed.code,
          data.playerId as string,
          parsed.playerId,
          parsed.sittingOut,
        );
        sendAck(ack, { ok: true });
        await broadcastRoomState(parsed.code);
      } catch (error) {
        sendError(socket, ack, error);
      }
    });

    socket.on('host:adjustChips', async (payload, ack?: Ack) => {
      try {
        const parsed = adjustPayloadSchema.parse(payload);
        const data = requireSession(socket, parsed.code);
        await adjustChips(
          parsed.code,
          data.playerId as string,
          parsed.playerId,
          parsed.amount,
          parsed.reason,
        );
        sendAck(ack, { ok: true });
        await broadcastRoomState(parsed.code);
      } catch (error) {
        sendError(socket, ack, error);
      }
    });

    socket.on('host:previewSettlement', async (payload, ack?: Ack) => {
      try {
        const parsed = settlePayloadSchema.parse(payload);
        const data = requireSession(socket, parsed.code);
        const preview = await previewSettlement(
          parsed.code,
          data.playerId as string,
          parsed.selections,
        );
        sendAck(ack, { ok: true, preview });
      } catch (error) {
        sendError(socket, ack, error);
      }
    });

    socket.on('host:settle', async (payload, ack?: Ack) => {
      try {
        const parsed = settlePayloadSchema.parse(payload);
        const data = requireSession(socket, parsed.code);
        const preview = await settleHand(parsed.code, data.playerId as string, {
          selections: parsed.selections,
        });
        sendAck(ack, { ok: true, preview });
        await broadcastRoomState(parsed.code);
      } catch (error) {
        sendError(socket, ack, error);
      }
    });

    socket.on('host:recoverHand', async (payload, ack?: Ack) => {
      try {
        const { code } = codeSchema.parse(payload);
        const data = requireSession(socket, code);
        await recoverHand(code, data.playerId as string);
        sendAck(ack, { ok: true });
        await broadcastRoomState(code);
      } catch (error) {
        sendError(socket, ack, error);
      }
    });

    socket.on('host:advanceHand', async (payload, ack?: Ack) => {
      try {
        const { code } = codeSchema.parse(payload);
        const data = requireSession(socket, code);
        await advanceHand(code, data.playerId as string);
        sendAck(ack, { ok: true });
        await broadcastRoomState(code);
      } catch (error) {
        sendError(socket, ack, error);
      }
    });

    socket.on('room:ready', async (payload, ack?: Ack) => {
      try {
        const parsed = readyPayloadSchema.parse(payload);
        const data = requireSession(socket, parsed.code);
        await setReady(parsed.code, data.playerId as string, parsed.ready);
        sendAck(ack, { ok: true });
        await broadcastRoomState(parsed.code);
      } catch (error) {
        sendError(socket, ack, error);
      }
    });

    socket.on('room:history', async (payload, ack?: Ack) => {
      try {
        const { code } = codeSchema.parse(payload);
        const data = requireSession(socket, code);
        const history = await getRoomHistory(code, data.sessionToken as string);
        sendAck(ack, { ok: true, history });
      } catch (error) {
        sendError(socket, ack, error);
      }
    });

    socket.on('disconnect', () => {
      void cleanupSocket(socket);
    });
  });
}

/** Mark stale connected flags as offline on boot. */
export async function resetPresenceOnBoot(): Promise<void> {
  await db.update(players).set({ connected: false });
}
