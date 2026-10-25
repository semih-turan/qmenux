import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { Client, Pool } from 'pg';
import { Database } from '../../../apps/api/dist/src/database.js';
import { exerciseAdminAudience } from '../../../apps/api/dist/test/admin-audience-fixture.js';
import { exerciseAuthExpiry } from '../../../apps/api/dist/test/auth-expiry-fixture.js';

let owner, database;
let stage = 'configuration';
try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env.neon-development.local', import.meta.url)));
  process.loadEnvFile(fileURLToPath(new URL('../../../.env.neon-migration.local', import.meta.url)));
  for (const [key, role, pooled] of [['DATABASE_URL', 'qmenux_runtime', true], ['DATABASE_DIRECT_URL', 'neondb_owner', false]]) {
    const url = new URL(process.env[key]);
    assert.equal(url.hostname, `ep-bold-darkness-b8anifaq${pooled ? '-pooler' : ''}.c-14.us-east-1.aws.neon.tech`);
    assert.equal(decodeURIComponent(url.username), role); assert.equal(url.pathname, '/neondb'); assert(url.password);
    assert.equal(url.port, ''); assert.equal(url.hash, '');
    assert.deepEqual([...url.searchParams], [['sslmode', 'verify-full'], ['channel_binding', 'require']]);
  }
  assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, '0');
  const limits = { connectionTimeoutMillis: 30000, query_timeout: 10000, enableChannelBinding: true };
  owner = new Client({ connectionString: process.env.DATABASE_DIRECT_URL, ...limits }); await owner.connect();
  stage = 'empty isolated development preflight';
  const tables = ['qmenux.tenants', 'qmenux_identity.users', 'qmenux_identity.external_identities', 'qmenux_identity.memberships',
    'qmenux_identity.login_attempts', 'qmenux_identity.sessions', 'qmenux_operator.operators', 'qmenux_operator.sessions'];
  for (const table of tables) assert.equal((await owner.query(`SELECT count(*) FROM ${table}`)).rows[0].count, '0');
  const versions = (await owner.query('SELECT version FROM qmenux.schema_migrations ORDER BY version')).rows.map(r => r.version);
  const expected = ['0001_tenant_catalog', '0002_tenant_resolution', '0003_identity_sessions', '0004_tenant_memberships', '0005_operator_sessions', '0006_auth_expiry','0007_microsoft_identity','0008_apple_identity','0009_admin_audience'];
  assert([8,9].includes(versions.length)); assert.deepEqual(versions, expected.slice(0, versions.length));
  database = new Database(new Pool({ connectionString: process.env.DATABASE_URL, max: 2, ...limits }));
  stage = 'API/admin state and token isolation, CSRF, migration rollback and compatibility';
  await exerciseAdminAudience(database, owner);
  stage = 'predecessor expiry compatibility with later migration';
  await exerciseAuthExpiry(database, owner);
  for (const table of tables) assert.equal((await owner.query(`SELECT count(*) FROM ${table}`)).rows[0].count, '0');
  console.log('PASS: provider-bound attempts, distinct identities, concurrency, expiry, session revocation, rollback guards and existing cleanup compatibility; synthetic fixtures removed; 0009 retained');
} catch (error) {
  const line = error.stack?.match(/(?:admin-audience|auth-expiry)-fixture\.js:(\d+):\d+/)?.[1];
  console.error(`FAIL: ${stage}${line ? ` at fixture line ${line}` : ''}; details redacted`); process.exitCode = 1;
} finally {
  if (database) try { await database.onModuleDestroy(); } catch { process.exitCode = 1; }
  if (owner) await owner.end();
}
