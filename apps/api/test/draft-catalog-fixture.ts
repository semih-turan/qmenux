import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Client } from 'pg';
import { Database } from '../src/database.js';
import { DraftCatalog } from '../src/draft-catalog.js';
import { IdentityStore } from '../src/identity-store.js';
import { TenantAuthorization } from '../src/tenant-authorization.js';
import { TenantTransactions } from '../src/tenant-transactions.js';

const tenantA = 'a0000000-0000-4000-8000-000000000001', tenantB = 'a0000000-0000-4000-8000-000000000002';
const categoryA = 'd0000000-0000-4000-8000-000000000001', categoryB = 'd0000000-0000-4000-8000-000000000002';
const hostA = 't003-cafe-a.qmenux.com', hostB = 't003-restaurant-b.qmenux.com';
const secret = () => randomBytes(32).toString('base64url');
const status = (value: number) => (error: { getStatus?: () => number }) => error.getStatus?.() === value;
const code = (value: string) => (error: { code?: string }) => error.code === value;

// Local disposable database only: immutable audit evidence is retained until the whole private cluster is removed.
export async function exerciseDraftCatalog(database: Database, owner: Client) {
  const sql = (direction: string) => readFileSync(new URL(`../../../../infrastructure/database/migrations/0010_draft_product_events.${direction}.sql`, import.meta.url), 'utf8');
  const migrate = async (direction: string, commit = true) => {
    await owner.query('BEGIN');
    try { await owner.query(sql(direction)); await owner.query(commit ? 'COMMIT' : 'ROLLBACK'); }
    catch (error) { await owner.query('ROLLBACK'); throw error; }
  };
  const before = (await owner.query('SELECT * FROM qmenux.products ORDER BY id')).rows;
  const beforeJson = (await owner.query('SELECT to_jsonb(p) AS product FROM qmenux.products p ORDER BY id')).rows.map(row => row.product);
  await migrate('up', false);
  assert.equal((await owner.query("SELECT to_regclass('qmenux.product_events') IS NULL AS absent")).rows[0].absent, true);
  await migrate('up');
  assert.deepEqual((await owner.query('SELECT to_jsonb(p)-\'revision\' AS product FROM qmenux.products p ORDER BY id')).rows.map(row => row.product),
    beforeJson);
  assert((await owner.query('SELECT revision FROM qmenux.products')).rows.every(row => row.revision === 1));
  await assert.rejects(migrate('up'), code('P0001'));
  await migrate('down');
  assert.deepEqual((await owner.query('SELECT * FROM qmenux.products ORDER BY id')).rows, before);
  await migrate('up');
  await owner.query('BEGIN');
  try {
    await assert.rejects(owner.query(readFileSync(new URL('../../../../infrastructure/database/migrations/0009_admin_audience.down.sql', import.meta.url), 'utf8')), code('P0001'));
  } finally { await owner.query('ROLLBACK'); }

  const identities = new IdentityStore(database), authorization = new TenantAuthorization(new TenantTransactions(database), identities);
  const catalog = new DraftCatalog(authorization);
  const seed = secret(), user = await identities.createSession('synthetic-catalog-editor', seed);
  assert(user);
  await owner.query("INSERT INTO qmenux_identity.memberships(tenant_id,user_id,role,status) VALUES ($1,$2,'EDITOR','ACTIVE')", [tenantA, user]);
  const token = secret(); await identities.createSession('synthetic-catalog-editor', token);
  const policy = async () => true; // Test-only; real controller must supply reviewed license entitlement.
  const initial = { categoryId: categoryA, name: '  Türk kahvesi  ', priceMinor: 12550 };

  for (const input of [null, [], {}, { ...initial, name: '' }, { ...initial, name: ' ' }, { ...initial, name: 'x'.repeat(201) },
    { ...initial, name: 'bad\nname' }, { ...initial, name: 'bad\0name' }, { ...initial, description: 'x'.repeat(2001) },
    { ...initial, priceMinor: -1 }, { ...initial, priceMinor: 1.1 }, { ...initial, priceMinor: '12550' },
    { ...initial, priceMinor: NaN }, { ...initial, priceMinor: Infinity }, { ...initial, priceMinor: 2147483648 },
    { ...initial, categoryId: 'invalid' }, { ...initial, currency: 'EUR' }, { ...initial, tenant_id: tenantB },
    { ...initial, actorId: user }, { ...initial, availability: 'PUBLISHED' }, { ...initial, sortOrder: -1 },
    { ...initial, revision: 1 }, { ...initial, allergens: ['verified'] }, { ...initial, calories: 0 },
    Object.assign(Object.create({ tenant_id: tenantB }) as object, initial)]) {
    await assert.rejects(async () => catalog.create(hostA, token, input, policy), status(400));
  }
  for (const badPolicy of [undefined, async () => false, async () => 'true']) {
    await assert.rejects(catalog.create(hostA, token, initial, badPolicy as never), status(403));
  }
  await assert.rejects(catalog.create(hostB, token, { ...initial, categoryId: categoryB }, policy), status(403));
  await assert.rejects(catalog.create(hostA, secret(), initial, policy), status(403));
  await assert.rejects(catalog.create('t003-pending.qmenux.com', token, initial, policy), status(404));
  await assert.rejects(catalog.create(hostA, token, { ...initial, categoryId: categoryB }, policy), status(404));

  const product = await catalog.create(hostA, token, initial, policy);
  assert.equal(product.name, 'Türk kahvesi'); assert.equal(product.priceMinor, 12550);
  assert.equal(product.currency, 'TRY'); assert.equal(product.description, ''); assert.equal(product.availability, 'AVAILABLE');
  assert.equal(product.revision, 1); assert.equal(product.sortOrder, 0);
  assert.equal(Object.hasOwn(product, 'tenant_id'), false);
  let history = await catalog.history(hostA, token, product.id, {}, policy);
  assert.equal(history.items.length, 1); assert.equal(history.items[0]!.actorId, user);
  assert.equal(history.items[0]!.previous, null); assert.equal(history.nextRevision, null);
  assert.equal((history.items[0]!.current as { price_minor: number }).price_minor, 12550);
  assert.match((history.items[0]!.current as { created_at: string }).created_at, /(?:Z|\+00:00)$/);
  assert.deepEqual(await catalog.read(hostA, token, product.id.toUpperCase(), policy), product);
  const noOp = await catalog.update(hostA, token, product.id, { revision: 1, priceMinor: 12550 }, policy);
  assert.equal(noOp.revision, 1);
  assert.equal((await catalog.history(hostA, token, product.id, {}, policy)).items.length, 1);
  const changed = await catalog.update(hostA, token, product.id, { revision: 1, priceMinor: 13500, description: "Plain text\n<script>'$1';</script>" }, policy);
  assert.equal(changed.revision, 2); assert.equal(changed.priceMinor, 13500);
  history = await catalog.history(hostA, token, product.id, { limit: 1 }, policy);
  assert.equal(history.items.length, 1); assert.equal(history.nextRevision, 1);
  const next = await catalog.history(hostA, token, product.id, { afterRevision: 1 }, policy);
  assert.equal(next.items.length, 1); assert.equal(next.items[0]!.revision, 2);
  assert.equal((next.items[0]!.previous as { price_minor: number }).price_minor, 12550);
  assert.equal((next.items[0]!.current as { price_minor: number }).price_minor, 13500);
  await assert.rejects(catalog.update(hostA, token, product.id, { revision: 1, priceMinor: 0 }, policy), status(409));
  assert.equal((await catalog.read(hostA, token, product.id, policy)).priceMinor, 13500);

  const results = await Promise.allSettled([
    catalog.update(hostA, token, product.id, { revision: 2, priceMinor: 14000 }, policy),
    catalog.update(hostA, token, product.id, { revision: 2, priceMinor: 14500 }, policy),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected');
  assert(rejected?.status === 'rejected'); assert.equal(rejected.reason.getStatus(), 409);
  let current = await catalog.read(hostA, token, product.id, policy); assert.equal(current.revision, 3);
  for (const availability of ['SOLD_OUT','HIDDEN','AVAILABLE'] as const) {
    current = await catalog.update(hostA, token, product.id, { revision: current.revision, availability }, policy);
    assert.equal(current.availability, availability);
  }
  assert.equal((await catalog.history(hostA, token, product.id, {}, policy)).items.length, 6);
  for (const input of [{}, { revision: 6 }, { revision: 0, name: 'x' }, { revision: 6, priceMinor: null },
    { revision: 6, id: product.id }, { revision: 6, status: 'PUBLISHED' }, { revision: 6, name: undefined }]) {
    await assert.rejects(async () => catalog.update(hostA, token, product.id, input, policy), status(400));
  }
  for (const input of [{ limit: 0 }, { limit: 101 }, { limit: '20' }, { after: 'invalid' }, { tenant_id: tenantB }]) {
    await assert.rejects(async () => catalog.list(hostA, token, input, policy), status(400));
  }
  for (const input of [{ afterRevision: -1 }, { limit: 101 }, { tenant_id: tenantB }]) {
    await assert.rejects(async () => catalog.history(hostA, token, product.id, input, policy), status(400));
  }
  await assert.rejects(catalog.list(hostA, token, { categoryId: categoryB }, policy), status(404));
  const collected: string[] = [];
  let after: string | null = null;
  do {
    const page: Awaited<ReturnType<DraftCatalog['list']>> = await catalog.list(hostA, token, { limit: 1, ...(after ? { after } : {}) }, policy);
    collected.push(...page.items.map(item => item.id)); after = page.nextCursor;
  } while (after);
  assert.equal(new Set(collected).size, collected.length); assert(collected.includes(product.id));
  assert.equal(collected.includes('e0000000-0000-4000-8000-000000000002'), false);

  const other = secret(), otherUser = await identities.createSession('synthetic-catalog-other', other); assert(otherUser);
  await owner.query("INSERT INTO qmenux_identity.memberships(tenant_id,user_id,role,status) VALUES ($1,$2,'OWNER','ACTIVE')", [tenantB, otherUser]);
  const otherToken = secret(); await identities.createSession('synthetic-catalog-other', otherToken);
  await assert.rejects(catalog.read(hostB, otherToken, product.id, policy), status(404));
  await assert.rejects(catalog.history(hostB, otherToken, product.id, {}, policy), status(404));
  await assert.rejects(catalog.update(hostB, otherToken, product.id, { revision: 6, name: 'denied' }, policy), status(404));
  await assert.rejects(catalog.update(hostA, token, product.id, { revision: 6, categoryId: categoryB }, policy), status(404));

  const otherProduct = await catalog.create(hostB, otherToken, { categoryId: categoryB, name: 'Synthetic lunch', priceMinor: 0 }, policy);
  assert.equal(otherProduct.priceMinor, 0);
  assert.equal((await catalog.history(hostB, otherToken, otherProduct.id, {}, policy)).items[0]!.actorId, otherUser);
  await assert.rejects(catalog.read(hostA, token, otherProduct.id, policy), status(404));
  for (let i = 0; i < 20; i++) {
    const otherTenant = i % 2 === 1;
    const page = await catalog.list(otherTenant ? hostB : hostA, otherTenant ? otherToken : token, {}, policy);
    assert(page.items.some(item => item.id === (otherTenant ? otherProduct.id : product.id)));
    assert(!page.items.some(item => item.id === (otherTenant ? product.id : otherProduct.id)));
  }
  const legacyId = 'e0000000-0000-4000-8000-000000000001';
  const legacy = await catalog.read(hostA, token, legacyId, policy);
  assert.equal((await catalog.history(hostA, token, legacyId, {}, policy)).items.length, 0);
  await catalog.update(hostA, token, legacyId, { revision: 1, priceMinor: 2147483647 }, policy);
  const legacyHistory = (await catalog.history(hostA, token, legacyId, {}, policy)).items;
  assert.equal(legacyHistory.length, 1); assert.equal(legacyHistory[0]!.revision, 2);
  assert.equal((legacyHistory[0]!.previous as { price_minor: number }).price_minor, legacy.priceMinor);
  assert.equal((legacyHistory[0]!.current as { price_minor: number }).price_minor, 2147483647);

  const committedHistory = (await owner.query('SELECT * FROM qmenux.product_events ORDER BY tenant_id,product_id,revision')).rows;
  await assert.rejects(authorization.run(hostA, token, 'catalog:write', policy, async (client, tenant) => {
    await client.query("SELECT set_config('app.catalog_actor',$1,true)", [tenant.userId]);
    await client.query('UPDATE qmenux.products SET price_minor=0 WHERE id=$1', [product.id]);
    throw new Error('Synthetic failure after audit insert');
  }), status(503));
  assert.deepEqual((await owner.query('SELECT * FROM qmenux.product_events ORDER BY tenant_id,product_id,revision')).rows, committedHistory);
  assert.deepEqual(await catalog.read(hostA, token, product.id, policy), current);
  await assert.rejects(authorization.run(hostA, token, 'catalog:write', policy, async (client, tenant) => {
    await client.query("SELECT set_config('app.catalog_actor',$1,true)", [tenant.userId]);
    await client.query('INSERT INTO qmenux.products(tenant_id,category_id,name,price_minor) VALUES ($1,$2,$3,0)',
      [tenant.id, categoryB, 'Invalid cross-tenant category']);
  }), status(503));
  assert.deepEqual((await owner.query('SELECT * FROM qmenux.product_events ORDER BY tenant_id,product_id,revision')).rows, committedHistory);

  for (const query of ['UPDATE qmenux.product_events SET actor_id=actor_id', 'DELETE FROM qmenux.product_events', 'TRUNCATE qmenux.product_events']) {
    await owner.query('BEGIN');
    try { await assert.rejects(owner.query(query), code('42501')); } finally { await owner.query('ROLLBACK'); }
  }
  for (const query of ['UPDATE qmenux.products SET price_minor=0', 'DELETE FROM qmenux.products',
    'INSERT INTO qmenux.product_events SELECT * FROM qmenux.product_events', 'SELECT qmenux.record_product_change()']) {
    const client = await database.begin();
    try {
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantA]);
      await assert.rejects(client.query(query), code('42501'));
    } finally { await client.query('ROLLBACK'); client.release(); }
  }
  const client = await database.begin();
  try {
    assert.equal((await client.query('SELECT * FROM qmenux.product_events')).rows.length, 0);
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantB]);
    const otherEvents = (await client.query('SELECT * FROM qmenux.product_events')).rows;
    assert.equal(otherEvents.length, 1); assert.equal(otherEvents[0].tenant_id, tenantB);
    await client.query('ROLLBACK');
  } finally { client.release(); }
  const flags = (await owner.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='qmenux.product_events'::regclass")).rows;
  assert.deepEqual(flags, [{ relrowsecurity: true, relforcerowsecurity: true }]);
  const permissions = (await owner.query(`SELECT prosecdef,proconfig,
    EXISTS(SELECT FROM aclexplode(proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS public_execute,
    has_function_privilege('qmenux_runtime',oid,'EXECUTE') AS runtime_execute
    FROM pg_proc WHERE oid='qmenux.record_product_change()'::regprocedure`)).rows;
  assert.deepEqual(permissions, [{ prosecdef: true, proconfig: ['search_path=pg_catalog, pg_temp', 'TimeZone=UTC'], public_execute: false, runtime_execute: false }]);
  await assert.rejects(migrate('down'), code('P0001'));
  assert.deepEqual((await owner.query('SELECT * FROM qmenux.product_events ORDER BY tenant_id,product_id,revision')).rows, committedHistory);
  const clean = await database.begin();
  try {
    assert.equal((await clean.query("SELECT NULLIF(current_setting('app.catalog_actor',true),'') AS actor")).rows[0].actor, null);
    await clean.query('ROLLBACK');
  } finally { clean.release(); }
  const dirty = await database.begin();
  await dirty.query("SELECT set_config('app.catalog_actor',$1,false)", [user]); await dirty.query('COMMIT'); dirty.release();
  await assert.rejects(database.begin(), status(503));
  assert.equal(await database.isReady(), true);
  await owner.query("UPDATE qmenux_identity.memberships SET status='SUSPENDED' WHERE tenant_id=$1 AND user_id=$2", [tenantA, user]);
  await assert.rejects(catalog.read(hostA, token, product.id, policy), status(403));
}
