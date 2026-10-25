import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { Client, Pool } from 'pg';
import { Database } from '../../../apps/api/dist/src/database.js';
import { exerciseOperators } from '../../../apps/api/dist/test/operator-fixture.js';

const sql = name => readFileSync(new URL(`../../database/${name}`, import.meta.url), 'utf8');
const tenants = [1, 2, 3].map(n => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
let owner, database, seeded = false;
let stage = 'configuration';
try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env.neon-development.local', import.meta.url)));
  process.loadEnvFile(fileURLToPath(new URL('../../../.env.neon-migration.local', import.meta.url)));
  for (const [key, role, pooled] of [['DATABASE_URL', 'qmenux_runtime', true], ['DATABASE_DIRECT_URL', 'neondb_owner', false]]) {
    const u = new URL(process.env[key]);
    assert.equal(u.hostname, `ep-bold-darkness-b8anifaq${pooled ? '-pooler' : ''}.c-14.us-east-1.aws.neon.tech`);
    assert.equal(decodeURIComponent(u.username), role); assert.equal(u.pathname, '/neondb'); assert(u.password);
    assert.equal(u.port, ''); assert.equal(u.hash, '');
    assert.deepEqual([...u.searchParams], [['sslmode', 'verify-full'], ['channel_binding', 'require']]);
  }
  assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, '0');
  const limits = { connectionTimeoutMillis: 30000, query_timeout: 10000, enableChannelBinding: true };
  owner = new Client({ connectionString: process.env.DATABASE_DIRECT_URL, ...limits }); await owner.connect();
  stage = 'empty development preflight';
  assert.equal((await owner.query('SELECT count(*) FROM qmenux.tenants')).rows[0].count, '0');
  for (const table of ['users', 'external_identities', 'login_attempts', 'sessions', 'memberships']) {
    assert.equal((await owner.query(`SELECT count(*) FROM qmenux_identity.${table}`)).rows[0].count, '0');
  }
  const versions = (await owner.query('SELECT version FROM qmenux.schema_migrations ORDER BY version')).rows.map(r => r.version);
  const expected = ['0001_tenant_catalog', '0002_tenant_resolution', '0003_identity_sessions', '0004_tenant_memberships', '0005_operator_sessions','0006_auth_expiry','0007_microsoft_identity','0008_apple_identity','0009_admin_audience'];
  assert([4, 5, 6, 7, 8,9].includes(versions.length)); assert.deepEqual(versions, expected.slice(0, versions.length));
  stage = 'direct operator migration';
  const up = sql('migrations/0005_operator_sessions.up.sql'), down = sql('migrations/0005_operator_sessions.down.sql');
  if (versions.length === 4) {
    await owner.query('BEGIN'); await owner.query(up); await owner.query('ROLLBACK');
    assert.equal((await owner.query("SELECT to_regnamespace('qmenux_operator') IS NULL AS absent")).rows[0].absent, true);
    await owner.query('BEGIN'); await owner.query(up); await owner.query('COMMIT');
    await owner.query('BEGIN'); await owner.query(down); await owner.query('COMMIT');
    await owner.query('BEGIN'); await owner.query(up); await owner.query('COMMIT');
  }
  for (const table of ['operators', 'sessions']) assert.equal((await owner.query(`SELECT count(*) FROM qmenux_operator.${table}`)).rows[0].count, '0');
  stage = 'synthetic catalog';
  await owner.query('BEGIN'); await owner.query(sql('t003-fixture.sql')); await owner.query('COMMIT'); seeded = true;
  database = new Database(new Pool({ connectionString: process.env.DATABASE_URL, max: 2, ...limits }));
  stage = 'signed Access, mandatory MFA policy and durable operator sessions';
  await exerciseOperators(database, owner);
  stage = 'data-bearing rollback refusal';
  await owner.query('BEGIN'); await assert.rejects(owner.query(down), e => e.code === 'P0001'); await owner.query('ROLLBACK');
  console.log('PASS: operator session/tenant separation, subject/audience binding, mandatory test MFA policy, rotation/revocation/expiry, no tenant RLS bypass, 20 serial and 20 concurrent calls');
} catch (error) {
  const line = error.stack?.match(/operator-fixture\.js:(\d+):\d+/)?.[1];
  console.error(`FAIL: ${stage}${line ? ` at fixture line ${line}` : ''}; details redacted`); process.exitCode = 1;
} finally {
  if (database) try { await database.onModuleDestroy(); } catch { process.exitCode = 1; }
  if (owner) {
    if (seeded) try {
      await owner.query('ROLLBACK'); await owner.query('BEGIN');
      await owner.query(`DELETE FROM qmenux_operator.sessions WHERE operator_id IN
        (SELECT id FROM qmenux_operator.operators WHERE issuer=$1 AND subject=ANY($2::text[]))`, ['https://synthetic-operator.cloudflareaccess.com', ['qmenux-operator-fixture', 'qmenux-operator-fixture-other']]);
      await owner.query('DELETE FROM qmenux_operator.operators WHERE issuer=$1 AND subject=ANY($2::text[])', ['https://synthetic-operator.cloudflareaccess.com', ['qmenux-operator-fixture', 'qmenux-operator-fixture-other']]);
      const ids = (await owner.query('SELECT user_id FROM qmenux_identity.external_identities WHERE subject=$1', ['qmenux-operator-tenant-only'])).rows.map(r => r.user_id);
      await owner.query('DELETE FROM qmenux_identity.sessions WHERE user_id=ANY($1::uuid[])', [ids]);
      await owner.query('DELETE FROM qmenux_identity.external_identities WHERE user_id=ANY($1::uuid[])', [ids]);
      await owner.query('DELETE FROM qmenux_identity.users WHERE id=ANY($1::uuid[])', [ids]);
      for (const table of ['products', 'categories', 'menus', 'branches']) await owner.query(`DELETE FROM qmenux.${table} WHERE tenant_id=ANY($1::uuid[])`, [tenants]);
      await owner.query('DELETE FROM qmenux.tenants WHERE id=ANY($1::uuid[])', [tenants]);
      for (const table of ['operators', 'sessions']) assert.equal((await owner.query(`SELECT count(*) FROM qmenux_operator.${table}`)).rows[0].count, '0');
      for (const table of ['memberships', 'users', 'external_identities', 'login_attempts', 'sessions']) assert.equal((await owner.query(`SELECT count(*) FROM qmenux_identity.${table}`)).rows[0].count, '0');
      assert.equal((await owner.query('SELECT count(*) FROM qmenux.tenants')).rows[0].count, '0');
      await owner.query('COMMIT'); console.log('PASS: synthetic operator/identity/catalog rows removed; empty migration 0005 retained');
    } catch { console.error('FAIL: isolated development fixture cleanup; manual inspection required'); process.exitCode = 1; }
    await owner.end();
  }
}
