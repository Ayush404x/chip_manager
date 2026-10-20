import { Router, type NextFunction, type Request, type Response } from 'express';
import { createRoomSchema, joinRoomSchema } from '@chiproom/shared';
import { ZodError } from 'zod';
import {
  createRoom,
  getRoomHistory,
  getRoomPreview,
  getRoomState,
  joinRoom,
} from './services/roomService.js';
import { AppError } from './lib/errors.js';
import { FixedWindowLimiter } from './lib/rateLimit.js';
import { broadcastRoomState } from './socket.js';

const createLimiter = new FixedWindowLimiter(10, 60 * 60 * 1000);
const joinLimiter = new FixedWindowLimiter(40, 10 * 60 * 1000);
const stateLimiter = new FixedWindowLimiter(240, 60 * 1000);

function clientKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

function limit(limiter: FixedWindowLimiter) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = limiter.check(clientKey(req));
    if (!result.allowed) {
      res.setHeader('Retry-After', Math.ceil(result.retryAfterMs / 1000));
      res.status(429).json({ error: 'Too many requests. Please slow down and try again.' });
      return;
    }
    next();
  };
}

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<unknown>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

function sessionTokenFrom(req: Request): string {
  const header = req.header('x-session-token');
  if (header) return header;
  const query = req.query.token;
  if (typeof query === 'string') return query;
  throw new AppError('A player session is required', 401, 'unauthorized');
}

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'chiproom', time: new Date().toISOString() });
});

apiRouter.post(
  '/rooms',
  limit(createLimiter),
  asyncHandler(async (req, res) => {
    const input = createRoomSchema.parse(req.body);
    const auth = await createRoom(input);
    void broadcastRoomState(auth.roomCode);
    res.status(201).json(auth);
  }),
);

apiRouter.get(
  '/rooms/:code',
  asyncHandler(async (req, res) => {
    const preview = await getRoomPreview(req.params.code);
    res.setHeader('Cache-Control', 'no-store');
    res.json(preview);
  }),
);

apiRouter.post(
  '/rooms/:code/join',
  limit(joinLimiter),
  asyncHandler(async (req, res) => {
    const input = joinRoomSchema.parse(req.body);
    const auth = await joinRoom(req.params.code, input);
    void broadcastRoomState(auth.roomCode);
    res.status(201).json(auth);
  }),
);

apiRouter.get(
  '/rooms/:code/state',
  limit(stateLimiter),
  asyncHandler(async (req, res) => {
    const token = sessionTokenFrom(req);
    const state = await getRoomState(req.params.code, token);
    res.setHeader('Cache-Control', 'no-store');
    res.json(state);
  }),
);

apiRouter.get(
  '/rooms/:code/history',
  limit(stateLimiter),
  asyncHandler(async (req, res) => {
    const token = sessionTokenFrom(req);
    const history = await getRoomHistory(req.params.code, token);
    res.setHeader('Cache-Control', 'no-store');
    res.json(history);
  }),
);

export function apiErrorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: error.issues[0]?.message ?? 'Invalid input',
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }
  if (error instanceof AppError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  console.error('[api] unhandled error', error);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}
