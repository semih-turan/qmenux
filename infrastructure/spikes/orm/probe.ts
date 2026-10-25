import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { integer, pgTable, uuid } from 'drizzle-orm/pg-core';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client/index.js';

type Row = { tenant_id: string };
type Session = {
  setTenant: (tenant: string) => Promise<void>;
  rows: () => Promise<Row[]>;
  insert: (id: number, tenant: string) => Promise<void>;
  backendId: () => Promise<number>;
};
type Candidate = {
  name: string;
  transaction: (body: (session: Session) => Promise<void>) => Promise<void>;
  close: () => Promise<void>;
};

const rawUrl = process.env.PROBE_DATABASE_URL;
assert(rawUrl, 'Use run-local.sh to create the disposable database');
const url = new URL(rawUrl);
assert.equal(url.hostname, 'localhost');
assert.equal(url.username, 'qmenux_probe_runtime');
assert.equal(url.pathname, '/qmenux_probe');
assert.match(url.searchParams.get('host') ?? '', /^\/tmp\/qmenux-orm\.[A-Za-z0-9]+\/socket$/);
const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';

const preflight = new Pool({ connectionString: rawUrl, max: 1 });
try {
  const { rows } = await preflight.query<{ rolsuper: boolean; rolbypassrls: boolean; owns_table: boolean }>(`
    SELECT rolsuper, rolbypassrls,
      (SELECT tableowner = current_user FROM pg_tables WHERE tablename = 'isolation_probe') AS owns_table
    FROM pg_roles WHERE rolname = current_user
  `);
  assert.deepEqual(rows, [{ rolsuper: false, rolbypassrls: false, owns_table: false }]);
} finally {
  await preflight.end();
}

const pool = new Pool({ connectionString: rawUrl, max: 1 });
const db = drizzle(pool);
const probe = pgTable('isolation_probe', { id: integer('id').primaryKey(), tenantId: uuid('tenant_id').notNull() });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: rawUrl, max: 1 }) });
const candidates: Candidate[] = [
  {
    name: 'Drizzle + pg',
    transaction: async (body) => {
      await db.transaction(async (tx) => {
        await body({
          setTenant: async (tenant) => { await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenant}, true)`); },
          rows: () => tx.select({ tenant_id: probe.tenantId }).from(probe).orderBy(probe.id),
          insert: async (id, tenant) => { await tx.insert(probe).values({ id, tenantId: tenant }); },
          backendId: async () => {
            const result = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
            return result.rows[0]!.pid;
          },
        });
      });
    },
    close: () => pool.end(),
  },
  {
    name: 'Prisma + adapter-pg',
    transaction: async (body) => {
      await prisma.$transaction(async (tx) => {
        await body({
          setTenant: async (tenant) => { await tx.$queryRaw`SELECT set_config('app.tenant_id', ${tenant}, true)`; },
          rows: async () => (await tx.isolationProbe.findMany({ select: { tenantId: true }, orderBy: { id: 'asc' } })).map((row) => ({ tenant_id: row.tenantId })),
          insert: async (id, tenant) => { await tx.isolationProbe.create({ data: { id, tenantId: tenant } }); },
          backendId: async () => (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]!.pid,
        });
      });
    },
    close: () => prisma.$disconnect(),
  },
];

const isRlsDenial = (error: unknown): boolean => error instanceof Error
  && (/row-level security/i.test(error.message) || isRlsDenial(error.cause));

let nextId = 100;
try {
  for (const candidate of candidates) {
    const started = performance.now();
    const pids = new Set<number>();
    const empty = () => candidate.transaction(async (tx) => { assert.deepEqual(await tx.rows(), []); });
    await empty();
    await assert.rejects(candidate.transaction(async (tx) => { await tx.insert(nextId++, a); }), isRlsDenial);
    await assert.rejects(candidate.transaction(async (tx) => {
      await tx.setTenant(a);
      await tx.insert(nextId++, b);
    }), isRlsDenial);
    const rollback = new Error('intentional rollback');
    await assert.rejects(candidate.transaction(async (tx) => {
      await tx.setTenant(a);
      await tx.insert(nextId++, a);
      assert.equal((await tx.rows()).length, 2);
      throw rollback;
    }), (error) => error === rollback);
    await empty();
    await Promise.all(Array.from({ length: 20 }, (_, i) => candidate.transaction(async (tx) => {
      const tenant = i % 2 === 0 ? a : b;
      await tx.setTenant(tenant);
      pids.add(await tx.backendId());
      assert.deepEqual(await tx.rows(), [{ tenant_id: tenant }]);
    })));
    assert.equal(pids.size, 1, 'max=1 must reuse the same backend across tenants');
    await empty();
    console.log(JSON.stringify({ candidate: candidate.name, result: 'PASS', transactionsInConcurrentBatch: 20, reusedBackends: pids.size, elapsedMs: Math.round(performance.now() - started) }));
  }
} finally {
  await Promise.all(candidates.map((candidate) => candidate.close()));
}
