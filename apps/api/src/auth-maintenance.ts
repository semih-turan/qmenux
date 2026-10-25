import { ServiceUnavailableException } from '@nestjs/common';
import type { Database } from './database.js';

// shortcut: manual bounded sweeps; add a reviewed scheduler when retention deadlines require it.
export async function cleanupExpiredAuth(database: Database): Promise<{ identity: number; operator: number }> {
  const client = await database.begin();
  let clean = false;
  try {
    const { rows } = await client.query<{ identity: number; operator: number }>(
      'SELECT qmenux_identity.cleanup_expired() AS identity, qmenux_operator.cleanup_expired() AS operator');
    await client.query('COMMIT'); clean = true;
    return rows[0]!;
  } catch {
    try { await client.query('ROLLBACK'); clean = true; } catch { /* Destroy an unresettable connection. */ }
    throw new ServiceUnavailableException({ status: 'unavailable' });
  } finally { client.release(!clean); }
}
