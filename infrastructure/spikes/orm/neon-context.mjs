import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { Pool } from 'pg';

const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const contextSql = "SELECT NULLIF(current_setting('app.tenant_id', true), '') AS tenant, pg_backend_pid() AS pid";
const pools = [];
let stage = 'configuration';
let backgroundError = false;

const poolFor = (max) => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max,
    connectionTimeoutMillis: 10000,
    query_timeout: 10000,
    enableChannelBinding: true,
  });
  pool.on('error', () => { backgroundError = true; });
  pools.push(pool);
  return pool;
};

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env.neon-development.local', import.meta.url)));
  const url = new URL(process.env.DATABASE_URL);
  assert(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.equal(url.hostname, 'ep-bold-darkness-b8anifaq-pooler.c-14.us-east-1.aws.neon.tech');
  assert.equal(decodeURIComponent(url.username), 'qmenux_runtime');
  assert.equal(url.pathname, '/neondb');
  assert(url.password);
  assert.deepEqual([...url.searchParams], [['sslmode', 'verify-full'], ['channel_binding', 'require']]);
  assert.equal(url.port, '');
  assert.equal(url.hash, '');
  assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, '0');

  stage = 'runtime authentication';
  const serial = poolFor(1);
  const { rows } = await serial.query(`SELECT current_user AS role, current_database() AS db,
    rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication, rolinherit
    FROM pg_roles WHERE rolname = current_user`);
  assert.deepEqual(rows, [{ role: 'qmenux_runtime', db: 'neondb', rolsuper: false,
    rolbypassrls: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolinherit: false }]);

  stage = 'serial commit and rollback cleanup';
  const clients = new Set();
  const backends = new Set();
  for (let i = 0; i < 20; i++) {
    const client = await serial.connect();
    clients.add(client);
    let clean = false;
    try {
      await client.query('BEGIN');
      assert.equal((await client.query(contextSql)).rows[0].tenant, null);
      const tenant = i % 2 === 0 ? a : b;
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
      const first = (await client.query(contextSql)).rows[0];
      assert.equal(first.tenant, tenant);
      assert.deepEqual((await client.query(contextSql)).rows[0], first);
      backends.add(first.pid);
      await client.query(i % 4 < 2 ? 'COMMIT' : 'ROLLBACK');
      assert.equal((await client.query(contextSql)).rows[0].tenant, null);
      clean = true;
    } finally {
      client.release(!clean);
    }
  }
  assert.equal(clients.size, 1, 'serial probe must reuse the client connection');

  stage = 'overlapping transactions';
  const parallel = poolFor(2);
  const held = [];
  try {
    held.push(await parallel.connect());
    held.push(await parallel.connect());
    for (const [i, client] of held.entries()) {
      await client.query('BEGIN');
      assert.equal((await client.query(contextSql)).rows[0].tenant, null);
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [i === 0 ? a : b]);
    }
    const active = await Promise.all(held.map(async (client) => (await client.query(contextSql)).rows[0]));
    assert.deepEqual(active.map((row) => row.tenant), [a, b]);
    assert.notEqual(active[0].pid, active[1].pid, 'open transactions must occupy distinct backends');
    await held[0].query('COMMIT');
    assert.equal((await held[0].query(contextSql)).rows[0].tenant, null);
    assert.deepEqual((await held[1].query(contextSql)).rows[0], active[1]);
    await held[1].query('ROLLBACK');
    assert.equal((await held[1].query(contextSql)).rows[0].tenant, null);
  } finally {
    for (const client of held) client.release(true);
  }
  assert.equal(backgroundError, false, 'pool emitted an idle connection error');
  console.log(JSON.stringify({ result: 'PASS', serialTransactions: 20, reusedClientConnections: clients.size,
    observedSerialBackends: backends.size, overlappingTransactions: 2, tableQueries: 0 }));
} catch (error) {
  const code = /^[0-9A-Z]{5}$/.test(error.code ?? '') ? error.code : 'CHECK_FAILED';
  console.error(`Neon context probe FAIL: ${stage} (${code}); details and credentials hidden`);
  process.exitCode = 1;
} finally {
  await Promise.all(pools.map((pool) => pool.end()));
}
