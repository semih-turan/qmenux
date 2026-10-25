import console from 'node:console';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { Database } from '../../../apps/api/dist/src/database.js';
import { cleanupExpiredAuth } from '../../../apps/api/dist/src/auth-maintenance.js';

const database = new Database();
try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env.neon-development.local', import.meta.url)));
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname !== 'ep-bold-darkness-b8anifaq-pooler.c-14.us-east-1.aws.neon.tech' || url.pathname !== '/neondb') throw new Error();
  console.log(JSON.stringify({ status: 'ok', deleted: await cleanupExpiredAuth(database) }));
} catch {
  console.error('Auth expiry maintenance unavailable; details redacted'); process.exitCode = 1;
} finally {
  try { await database.onModuleDestroy(); } catch { process.exitCode = 1; }
}
