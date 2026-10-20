import 'dotenv/config';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Server } from 'socket.io';
import { closeDb } from './db/client.js';
import { apiErrorHandler, apiRouter } from './http.js';
import { initSocket, resetPresenceOnBoot } from './socket.js';

const port = Number(process.env.PORT ?? 3001);
const nodeEnv = process.env.NODE_ENV ?? 'development';
const allowedOrigins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (nodeEnv !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return true;
  }
  return false;
};

const app = express();

if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(compression());
app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) callback(null, true);
      else callback(new Error('Origin not allowed'));
    },
    credentials: false,
  }),
);
app.use(express.json({ limit: '64kb' }));
app.use('/api', apiRouter);
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found' });
});
app.use(apiErrorHandler);

const clientDist = process.env.CLIENT_DIST ?? path.resolve(process.cwd(), '../client/dist');
if (existsSync(clientDist)) {
  app.use(
    express.static(clientDist, {
      index: false,
      maxAge: nodeEnv === 'production' ? '1h' : 0,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-store');
      },
    }),
  );
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) callback(null, true);
      else callback(new Error('Origin not allowed'));
    },
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 64 * 1024,
  pingTimeout: 20_000,
  pingInterval: 25_000,
});

initSocket(io);

async function start(): Promise<void> {
  await resetPresenceOnBoot();
  httpServer.listen(port, () => {
    console.log(`[chiproom] server listening on http://localhost:${port} (${nodeEnv})`);
    if (!existsSync(clientDist)) {
      console.log('[chiproom] client build not found; run the Vite dev server for the UI');
    }
  });
}

start().catch((error) => {
  console.error('[chiproom] failed to start', error);
  process.exit(1);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[chiproom] received ${signal}, shutting down`);
  io.close();
  httpServer.close();
  try {
    await closeDb();
  } catch (error) {
    console.error('[chiproom] error closing database', error);
  }
  setTimeout(() => process.exit(0), 250).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
