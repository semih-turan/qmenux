import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Client } from 'pg';
import { Database } from '../src/database.js';
import { DraftCatalog } from '../src/draft-catalog.js';
import { IdentityStore, secretHash } from '../src/identity-store.js';
import { TenantAuthorization } from '../src/tenant-authorization.js';
import { TenantTransactions } from '../src/tenant-transactions.js';

const tenantA = 'a0000000-0000-4000-8000-000000000001', tenantB = 'a0000000-0000-4000-8000-000000000002';
const categoryA = 'd0000000-0000-4000-8000-000000000001';
const hostA = 't003-cafe-a.qmenux.com', hostB = 't003-restaurant-b.qmenux.com';
const secret = () => randomBytes(32).toString('base64url');
const forbidden = (error: { getStatus?: () => number }) => error.getStatus?.() === 403;
const migrationError = (error: { code?: string }) => error.code === 'P0001';

// Disposable local database only; catalog audit from this fixture is never selectively deleted.
export async function exerciseAdminTenant(database: Database, owner: Client) {
  const sql = (direction: string) => readFileSync(new URL(`../../../../infrastructure/database/migrations/0011_admin_tenant_membership.${direction}.sql`, import.meta.url), 'utf8');
  const migrate = async (direction: string, commit = true) => {
    await owner.query('BEGIN');
    try { await owner.query(sql(direction)); await owner.query(commit ? 'COMMIT' : 'ROLLBACK'); }
    catch (error) { await owner.query('ROLLBACK'); throw error; }
  };
  await migrate('up', false);
  assert.equal((await owner.query("SELECT to_regprocedure('qmenux_identity.admin_tenant_membership(text,text)') IS NULL AS absent")).rows[0].absent, true);
  await migrate('up'); await assert.rejects(migrate('up'), migrationError);
  await migrate('down'); await migrate('up');
  await owner.query('BEGIN');
  try {
    await assert.rejects(owner.query(readFileSync(new URL('../../../../infrastructure/database/migrations/0010_draft_product_events.down.sql', import.meta.url), 'utf8')), migrationError);
  } finally { await owner.query('ROLLBACK'); }
  await owner.query('BEGIN');
  try {
    await owner.query("INSERT INTO qmenux.schema_migrations(version) VALUES ('0012_synthetic_future')");
    await assert.rejects(owner.query(sql('down')), migrationError);
  } finally { await owner.query('ROLLBACK'); }

  const identities = new IdentityStore(database), authorization = new TenantAuthorization(new TenantTransactions(database), identities);
  const catalog = new DraftCatalog(authorization), subject = 'synthetic-admin-tenant-owner';
  const user = await identities.createSession(subject, secret()); assert(user);
  await owner.query("INSERT INTO qmenux_identity.memberships(tenant_id,user_id,role,status) VALUES ($1,$3,'OWNER','ACTIVE'),($2,$3,'EDITOR','ACTIVE')", [tenantA, tenantB, user]);
  const apiToken = secret(), adminToken = secret(), csrf = secret();
  assert.equal(await identities.createSession(subject, apiToken), user);
  assert.equal(await identities.createAdminSession('google', subject, adminToken, csrf), user);
  const peerToken = secret(), peerCsrf = secret();
  await identities.createAdminSession('google', subject, peerToken, peerCsrf);
  const entitled = async () => true; // Synthetic entitlement only; no real license is fabricated.
  const work = async (_client: unknown, tenant: { userId: string; role: string }) => ({ userId: tenant.userId, role: tenant.role });
  assert.deepEqual(await authorization.run(hostA, adminToken, 'catalog:read', entitled, work, 'admin'), { userId: user, role: 'OWNER' });
  assert.deepEqual(await authorization.run(hostB, adminToken, 'catalog:read', entitled, work, 'admin'), { userId: user, role: 'EDITOR' });
  assert.deepEqual(await authorization.run(hostA, apiToken, 'catalog:read', entitled, work), { userId: user, role: 'OWNER' });
  await assert.rejects(authorization.run(hostA, apiToken, 'catalog:read', entitled, work, 'admin'), forbidden);
  await assert.rejects(authorization.run(hostA, adminToken, 'catalog:read', entitled, work), forbidden);
  await assert.rejects(authorization.run(hostA, apiToken, 'catalog:read', entitled, work, 'api', csrf), forbidden);
  for (const app of ['operator','Admin','',null]) {
    await assert.rejects(authorization.run(hostA, adminToken, 'catalog:read', entitled, work, app as never), forbidden);
  }
  for (const permission of ['platform:read','license:grant','menu:publish','toString','__proto__']) {
    await assert.rejects(authorization.run(hostA, adminToken, permission as never, entitled, work, 'admin', csrf), forbidden);
  }
  for (const proof of [undefined,null,'',42,'invalid',secret()]) {
    await assert.rejects(authorization.run(hostA, adminToken, 'catalog:write', entitled, work, 'admin', proof), forbidden);
    await assert.rejects(authorization.run(hostA, adminToken, 'membership:manage', entitled, work, 'admin', proof), forbidden);
  }
  await assert.rejects(authorization.run(hostA, adminToken, 'catalog:read', entitled, work, 'admin', secret()), forbidden);
  await assert.rejects(authorization.run(hostA, apiToken, 'catalog:write', entitled, work, 'admin', csrf), forbidden);
  await assert.rejects(authorization.run(hostA, adminToken, 'catalog:write', entitled, work, 'admin', peerCsrf), forbidden);
  await assert.rejects(authorization.run(hostA, peerToken, 'catalog:write', entitled, work, 'admin', csrf), forbidden);
  assert.deepEqual(await authorization.run(hostA, adminToken, 'membership:manage', entitled, work, 'admin', csrf), { userId: user, role: 'OWNER' });
  await assert.rejects(authorization.run(hostB, adminToken, 'membership:manage', entitled, work, 'admin', csrf), forbidden);
  for (const policy of [undefined, async () => false, async () => 'true']) {
    await assert.rejects(authorization.run(hostA, adminToken, 'catalog:write', policy as never, work, 'admin', csrf), forbidden);
  }

  const created = await catalog.create(hostA, adminToken, { name: 'Synthetic admin coffee', categoryId: categoryA, priceMinor: 15000 }, entitled, 'admin', csrf);
  const history = await catalog.history(hostA, adminToken, created.id, {}, entitled, 'admin');
  assert.equal(history.items[0]!.actorId, user);
  const count = (await owner.query('SELECT count(*) FROM qmenux.product_events')).rows[0].count;
  await assert.rejects(catalog.update(hostA, adminToken, created.id, { revision: 1, priceMinor: 0 }, entitled, 'admin'), forbidden);
  await assert.rejects(catalog.update(hostA, adminToken, created.id, { revision: 1, priceMinor: 0 }, entitled, 'admin', secret()), forbidden);
  assert.equal((await owner.query('SELECT count(*) FROM qmenux.product_events')).rows[0].count, count);
  const updated = await catalog.update(hostA, adminToken, created.id, { revision: 1, availability: 'SOLD_OUT' }, entitled, 'admin', csrf);
  assert.equal(updated.revision, 2); assert.equal(updated.priceMinor, 15000);
  await assert.rejects(catalog.read(hostA, adminToken, created.id, entitled), forbidden);
  await assert.rejects(catalog.read(hostA, apiToken, created.id, entitled, 'admin'), forbidden);
  for (let i = 0; i < 20; i++) {
    const app = i % 2 ? 'admin' : 'api';
    assert.equal((await catalog.read(hostA, app === 'admin' ? adminToken : apiToken, created.id, entitled, app)).id, created.id);
  }
  assert.equal((await catalog.list(hostA, adminToken, {}, entitled, 'admin')).items.some(item => item.id === created.id), true);

  for (const provider of ['microsoft','apple'] as const) {
    const token = secret(), proof = secret();
    const id = await identities.createAdminSession(provider, 'synthetic-admin-other-provider', secret(), secret()); assert(id);
    await owner.query("INSERT INTO qmenux_identity.memberships(tenant_id,user_id,role,status) VALUES ($1,$2,'EDITOR','ACTIVE')", [tenantA, id]);
    await identities.createAdminSession(provider, 'synthetic-admin-other-provider', token, proof);
    assert.deepEqual(await authorization.run(hostA, token, 'catalog:write', entitled, work, 'admin', proof), { userId: id, role: 'EDITOR' });
    await assert.rejects(authorization.run(hostB, token, 'catalog:read', entitled, work, 'admin'), forbidden);
  }
  const pendingUser = await identities.createAdminSession('google', 'synthetic-admin-pending', secret(), secret()); assert(pendingUser);
  await owner.query("INSERT INTO qmenux_identity.memberships(tenant_id,user_id,role) VALUES ($1,$2,'OWNER')", [tenantA, pendingUser]);
  const pending = secret(); await identities.createAdminSession('google', 'synthetic-admin-pending', pending, secret());
  await assert.rejects(authorization.run(hostA, pending, 'catalog:read', entitled, work, 'admin'), forbidden);

  const client = await database.begin();
  try {
    assert.deepEqual((await client.query('SELECT * FROM qmenux_identity.admin_tenant_membership($1,NULL)', [secretHash(adminToken)])).rows, []);
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantA]);
    assert.deepEqual((await client.query('SELECT * FROM qmenux_identity.admin_tenant_membership($1,$2)', [secretHash(adminToken), secretHash(csrf)])).rows,
      [{ userId: user, role: 'OWNER' }]);
    assert.deepEqual((await client.query('SELECT * FROM qmenux_identity.admin_tenant_membership($1,$2)', [secretHash(adminToken), secretHash(secret())])).rows, []);
    assert.deepEqual((await client.query('SELECT * FROM qmenux_identity.admin_tenant_membership($1,NULL)', [secretHash(apiToken)])).rows, []);
    await client.query('ROLLBACK');
  } finally { client.release(); }
  const permissions = (await owner.query(`SELECT prosecdef,proconfig,
    EXISTS(SELECT FROM aclexplode(proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS public_execute,
    has_function_privilege('qmenux_runtime',oid,'EXECUTE') AS runtime_execute
    FROM pg_proc WHERE oid='qmenux_identity.admin_tenant_membership(text,text)'::regprocedure`)).rows;
  assert.deepEqual(permissions, [{ prosecdef: true, proconfig: ['search_path=pg_catalog, pg_temp'], public_execute: false, runtime_execute: true }]);
  const snapshot = (await owner.query('SELECT * FROM qmenux.product_events ORDER BY tenant_id,product_id,revision')).rows;
  await migrate('down'); await migrate('up');
  assert.deepEqual((await owner.query('SELECT * FROM qmenux.product_events ORDER BY tenant_id,product_id,revision')).rows, snapshot);
  assert.equal((await catalog.read(hostA, adminToken, created.id, entitled, 'admin')).id, created.id);
  await owner.query("UPDATE qmenux_identity.memberships SET role='EDITOR' WHERE tenant_id=$1 AND user_id=$2", [tenantA, user]);
  await assert.rejects(catalog.read(hostA, adminToken, created.id, entitled, 'admin'), forbidden);
  await assert.rejects(catalog.read(hostA, apiToken, created.id, entitled), forbidden);
  const current = secret(); await identities.createAdminSession('google', subject, current, csrf);
  await assert.rejects(authorization.run(hostA, current, 'membership:manage', entitled, work, 'admin', csrf), forbidden);
  await owner.query("UPDATE qmenux_identity.sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [secretHash(current)]);
  await assert.rejects(catalog.read(hostA, current, created.id, entitled, 'admin'), forbidden);
  const suspended = secret(); await identities.createAdminSession('google', subject, suspended, csrf);
  await owner.query("UPDATE qmenux_identity.users SET status='SUSPENDED' WHERE id=$1", [user]);
  await assert.rejects(catalog.read(hostA, suspended, created.id, entitled, 'admin'), forbidden);
  await owner.query("UPDATE qmenux_identity.users SET status='REGISTERED' WHERE id=$1", [user]);
  await assert.rejects(catalog.read(hostA, suspended, created.id, entitled, 'admin'), forbidden);
}
