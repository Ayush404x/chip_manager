import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDb, db } from './client.js';

const folder = process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), 'drizzle');

try {
  console.log(`[db] applying migrations from ${folder}`);
  await migrate(db, { migrationsFolder: folder });
  console.log('[db] migrations applied');
} catch (error) {
  console.error('[db] migration failed', error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
