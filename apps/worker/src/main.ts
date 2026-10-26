import { resolve } from 'node:path';
import { Db } from '@qmenux/database';
import { processPdf } from './pdf-job.js';

/**
 * Durable job consumer (T049 interim, DECISIONS OD-04/OD-05): polls qx.outbox_events with
 * FOR UPDATE SKIP LOCKED, so several worker processes can run side by side. Only `pdf.requested`
 * is handled today; other event types are acknowledged untouched so they stay visible.
 *
 * Storage: the same local media directory the API serves from (`QX_MEDIA_DIR`), production R2 is
 * not wired (DECISIONS D-API-04). Object keys are tenant-prefixed and unguessable, like images.
 */
const POLL_MS = Number(process.env.QX_WORKER_POLL_MS || 3000);
const MAX_ATTEMPTS = 5;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not configured');
  process.exit(2);
}
const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
const mediaDir = resolve(process.env.QX_MEDIA_DIR || '../api/.local/media');
const db = new Db({ connectionString: databaseUrl, ssl: isProd, max: 2, statementTimeoutMs: 30_000 });

interface Claimed {
  id: string;
  tenant_id: string | null;
  type: string;
  payload: { jobId?: string };
  attempts: number;
}

async function claimOne(): Promise<Claimed | null> {
  return db.withWorker(async (tx) => {
    const { rows } = await tx.query<Claimed>(
      `UPDATE qx.outbox_events SET status = 'PROCESSING', locked_at = now(), attempts = attempts + 1
        WHERE id = (SELECT id FROM qx.outbox_events
                     WHERE status IN ('PENDING','PROCESSING') AND available_at <= now()
                       AND (locked_at IS NULL OR locked_at < now() - interval '10 minutes')
                     ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING id, tenant_id, type, payload, attempts`,
    );
    return rows[0] ?? null;
  });
}

async function finish(id: string, ok: boolean, error?: string, attempts = 0) {
  await db.withWorker((tx) =>
    tx.query(
      ok
        ? `UPDATE qx.outbox_events SET status = 'DONE', processed_at = now(), locked_at = NULL, last_error = NULL WHERE id = $1`
        : attempts >= MAX_ATTEMPTS
          ? `UPDATE qx.outbox_events SET status = 'FAILED', locked_at = NULL, last_error = $2 WHERE id = $1`
          : `UPDATE qx.outbox_events SET status = 'PENDING', locked_at = NULL, last_error = $2, available_at = now() + interval '1 minute' WHERE id = $1`,
      ok ? [id] : [id, (error ?? 'unknown').slice(0, 500)],
    ),
  );
}

async function handle(ev: Claimed) {
  if (ev.type === 'pdf.requested') {
    if (!ev.payload.jobId) throw new Error('pdf.requested without jobId');
    await processPdf(db, mediaDir, ev.payload.jobId);
    return;
  }
  // Other events (menu.published, tenant.approved) have no consumer yet: mark done so they do not block the queue.
}

let stopping = false;
async function loop() {
  while (!stopping) {
    let ev: Claimed | null = null;
    try {
      ev = await claimOne();
      if (!ev) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        continue;
      }
      await handle(ev);
      await finish(ev.id, true);
    } catch (err) {
      console.error(`event ${ev?.id ?? '-'} failed:`, (err as Error).message);
      if (ev) await finish(ev.id, false, (err as Error).message, ev.attempts).catch(() => undefined);
      else await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    stopping = true;
    void db.close().finally(() => process.exit(0));
  });
}

console.log(`QMenuX worker → polling outbox every ${POLL_MS}ms; media dir ${mediaDir}`);
await loop();
