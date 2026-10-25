import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { Client, Pool } from 'pg';

const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const contextSql = "SELECT NULLIF(current_setting('app.tenant_id', true), '') AS tenant, pg_backend_pid() AS pid";
const fixture = readFileSync(new URL('./neon-rls-fixture.sql', import.meta.url), 'utf8');
let owner;
let pool;
let created = false;
let stage = 'configuration';
let idleError = false;

const validateUrl = (value, role, pooled) => {
  const url = new URL(value);
  assert(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.equal(url.hostname, `ep-bold-darkness-b8anifaq${pooled ? '-pooler' : ''}.c-14.us-east-1.aws.neon.tech`);
  assert.equal(decodeURIComponent(url.username), role);
  assert.equal(url.pathname, '/neondb');
  assert(url.password);
  assert.equal(url.port, '');
  assert.equal(url.hash, '');
  assert.deepEqual([...url.searchParams], [['sslmode', 'verify-full'], ['channel_binding', 'require']]);
};
const deny = async (client, sql, params = []) => {
  await client.query('SAVEPOINT denied');
  await assert.rejects(client.query(sql, params), (error) => error.code === '42501');
  await client.query('ROLLBACK TO SAVEPOINT denied');
};
const readOwn = async (client, id) => {
  assert.deepEqual((await client.query('SELECT id FROM qmenux_rls_probe.items ORDER BY id')).rows, [{ id }]);
};

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env.neon-development.local', import.meta.url)));
  process.loadEnvFile(fileURLToPath(new URL('../../../.env.neon-migration.local', import.meta.url)));
  validateUrl(process.env.DATABASE_URL, 'qmenux_runtime', true);
  validateUrl(process.env.DATABASE_DIRECT_URL, 'neondb_owner', false);
  assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, '0');
  const timeouts = { connectionTimeoutMillis: 10000, query_timeout: 10000, enableChannelBinding: true };
  owner = new Client({ connectionString: process.env.DATABASE_DIRECT_URL, ...timeouts });
  owner.on('error', () => { idleError = true; });
  stage = 'direct migration rollback';
  await owner.connect();
  assert.equal((await owner.query("SELECT to_regnamespace('qmenux_rls_probe') IS NULL AS absent")).rows[0].absent, true);
  await owner.query('BEGIN');
  await owner.query(fixture);
  await owner.query('ROLLBACK');
  assert.equal((await owner.query("SELECT to_regnamespace('qmenux_rls_probe') IS NULL AS absent")).rows[0].absent, true);

  stage = 'direct fixture migration';
  await owner.query('BEGIN');
  await owner.query(fixture);
  await owner.query('COMMIT');
  created = true;
  pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, ...timeouts });
  pool.on('error', () => { idleError = true; });
  const { rows } = await pool.query(`SELECT current_user AS role, rolsuper, rolbypassrls,
    c.relowner = r.oid AS owns_fixture FROM pg_roles r CROSS JOIN pg_class c
    WHERE r.rolname = current_user AND c.oid = 'qmenux_rls_probe.items'::regclass`);
  assert.deepEqual(rows, [{ role: 'qmenux_runtime', rolsuper: false, rolbypassrls: false, owns_fixture: false }]);

  stage = 'pooled RLS reads and writes';
  const backends = new Set();
  const clients = new Set();
  for (let i = 0; i < 20; i++) {
    const client = await pool.connect();
    clients.add(client);
    let clean = false;
    try {
      await client.query('BEGIN');
      assert.equal((await client.query(contextSql)).rows[0].tenant, null);
      assert.deepEqual((await client.query('SELECT id FROM qmenux_rls_probe.items')).rows, []);
      await deny(client, 'INSERT INTO qmenux_rls_probe.items VALUES ($1,$2,$3)', [100 + i, a, 'synthetic']);
      await deny(client, 'CREATE TABLE qmenux_rls_probe.forbidden (id integer)');
      await client.query('SAVEPOINT invalid_context');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", ['invalid-uuid']);
      await assert.rejects(client.query('SELECT id FROM qmenux_rls_probe.items'), (error) => error.code === '22P02');
      await client.query('ROLLBACK TO SAVEPOINT invalid_context');
      const tenant = i % 2 === 0 ? a : b;
      const own = i % 2 === 0 ? 1 : 2;
      const other = own === 1 ? 2 : 1;
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
      backends.add((await client.query(contextSql)).rows[0].pid);
      await readOwn(client, own);
      await deny(client, 'INSERT INTO qmenux_rls_probe.items VALUES ($1,$2,$3)', [100 + i, tenant === a ? b : a, 'synthetic']);
      await deny(client, 'UPDATE qmenux_rls_probe.items SET tenant_id=$1 WHERE id=$2', [tenant === a ? b : a, own]);
      assert.equal((await client.query('UPDATE qmenux_rls_probe.items SET label=$1 WHERE id=$2', ['forbidden', other])).rowCount, 0);
      assert.equal((await client.query('DELETE FROM qmenux_rls_probe.items WHERE id=$1', [other])).rowCount, 0);
      assert.equal((await client.query('INSERT INTO qmenux_rls_probe.items VALUES ($1,$2,$3)', [100 + i, tenant, 'draft'])).rowCount, 1);
      assert.equal((await client.query('UPDATE qmenux_rls_probe.items SET label=$1 WHERE id=$2', ['approved', 100 + i])).rowCount, 1);
      assert.deepEqual((await client.query('SELECT label FROM qmenux_rls_probe.items WHERE id=$1', [100 + i])).rows, [{ label: 'approved' }]);
      if (i % 4 < 2) {
        assert.equal((await client.query('DELETE FROM qmenux_rls_probe.items WHERE id=$1', [100 + i])).rowCount, 1);
        await client.query('COMMIT');
      } else {
        await client.query('ROLLBACK');
      }
      assert.equal((await client.query(contextSql)).rows[0].tenant, null);
      clean = true;
    } finally { client.release(!clean); }
  }
  assert.equal(clients.size, 1);

  stage = 'overlapping pooled RLS transactions';
  const held = [];
  try {
    held.push(await pool.connect());
    held.push(await pool.connect());
    for (const [i, client] of held.entries()) {
      await client.query('BEGIN');
      assert.equal((await client.query(contextSql)).rows[0].tenant, null);
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [i === 0 ? a : b]);
    }
    const pids = await Promise.all(held.map(async (c) => (await c.query(contextSql)).rows[0].pid));
    assert.notEqual(pids[0], pids[1]);
    await Promise.all(held.map((client, i) => readOwn(client, i + 1)));
    await held[0].query('COMMIT');
    await readOwn(held[1], 2);
    await held[1].query('ROLLBACK');
  } finally { for (const client of held) client.release(true); }
  assert.deepEqual((await owner.query('SELECT id, label FROM qmenux_rls_probe.items ORDER BY id')).rows,
    [{ id: 1, label: 'synthetic A' }, { id: 2, label: 'synthetic B' }]);
  assert.equal(idleError, false);
  console.log(JSON.stringify({ result: 'PASS', serialTransactions: 20, reusedClients: clients.size,
    observedBackends: backends.size, overlappingTransactions: 2, directMigrationRollback: true }));
} catch (error) {
  console.error(`Neon RLS probe FAIL: ${stage} (${/^[0-9A-Z]{5}$/.test(error.code ?? '') ? error.code : 'CHECK_FAILED'}); details hidden`);
  process.exitCode = 1;
} finally {
  await pool?.end();
  if (owner) {
    try {
      await owner.query('ROLLBACK');
      if (created) {
        await owner.query('BEGIN');
        await owner.query('DROP TABLE qmenux_rls_probe.items');
        await owner.query('DROP SCHEMA qmenux_rls_probe');
        await owner.query('COMMIT');
        assert.equal((await owner.query("SELECT to_regnamespace('qmenux_rls_probe') IS NULL AS absent")).rows[0].absent, true);
        console.log('Synthetic fixture and grants removed: PASS');
      }
    } catch { console.error('Fixture cleanup failed; inspect qmenux-dev before retrying'); process.exitCode = 1; }
    await owner.end();
  }
}
