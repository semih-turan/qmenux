import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/** Migrations use the DIRECT (non-pooled) owner connection, never the runtime URL. */
export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

interface Migration {
  version: string;
  name: string;
  up: string;
  down: string;
  checksum: string;
}

async function loadMigrations(dir = MIGRATIONS_DIR): Promise<Migration[]> {
  const files = (await readdir(dir)).filter((f) => /^\d{4}_[a-z0-9_]+\.up\.sql$/.test(f)).sort();
  return Promise.all(
    files.map(async (file) => {
      const [version = '', ...rest] = file.replace(/\.up\.sql$/, '').split('_');
      const up = await readFile(join(dir, file), 'utf8');
      const down = await readFile(join(dir, file.replace('.up.sql', '.down.sql')), 'utf8');
      return { version, name: rest.join('_'), up, down, checksum: createHash('sha256').update(up).digest('hex') };
    }),
  );
}

async function ensureTable(client: pg.Client) {
  await client.query(`CREATE TABLE IF NOT EXISTS public.qmenux_schema_migrations (
    version text PRIMARY KEY, name text NOT NULL, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
}

export async function migrateUp(connectionString: string, log: (m: string) => void = console.log): Promise<string[]> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  const applied: string[] = [];
  try {
    await ensureTable(client);
    // Serialise concurrent migrators.
    await client.query('SELECT pg_advisory_lock(727001)');
    const done = new Map(
      (await client.query<{ version: string; checksum: string }>('SELECT version, checksum FROM public.qmenux_schema_migrations')).rows.map(
        (r) => [r.version, r.checksum],
      ),
    );
    for (const m of await loadMigrations()) {
      const prev = done.get(m.version);
      if (prev) {
        if (prev !== m.checksum) throw new Error(`migration ${m.version}_${m.name} was modified after being applied`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(m.up);
        await client.query('INSERT INTO public.qmenux_schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [
          m.version,
          m.name,
          m.checksum,
        ]);
        await client.query('COMMIT');
        log(`applied ${m.version}_${m.name}`);
        applied.push(m.version);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => undefined);
    await client.end();
  }
  return applied;
}

export async function migrateDown(connectionString: string, steps = 1, log: (m: string) => void = console.log): Promise<string[]> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  const reverted: string[] = [];
  try {
    await ensureTable(client);
    await client.query('SELECT pg_advisory_lock(727001)');
    const all = new Map((await loadMigrations()).map((m) => [m.version, m]));
    const applied = (
      await client.query<{ version: string }>('SELECT version FROM public.qmenux_schema_migrations ORDER BY version DESC LIMIT $1', [steps])
    ).rows;
    for (const { version } of applied) {
      const m = all.get(version);
      if (!m) throw new Error(`no down migration for ${version}`);
      await client.query('BEGIN');
      try {
        await client.query(m.down);
        await client.query('DELETE FROM public.qmenux_schema_migrations WHERE version = $1', [version]);
        await client.query('COMMIT');
        log(`reverted ${m.version}_${m.name}`);
        reverted.push(version);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => undefined);
    await client.end();
  }
  return reverted;
}
