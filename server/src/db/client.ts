import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/chiproom';

export const pool = new pg.Pool({
  connectionString,
  max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (error) => {
  console.error('[db] idle client error', error);
});

export const db = drizzle(pool, { schema });

export async function closeDb(): Promise<void> {
  await pool.end();
}

export { schema };
