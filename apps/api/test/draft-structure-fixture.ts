import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Client } from 'pg';
import { Database } from '../src/database.js';
import { DraftCatalog } from '../src/draft-catalog.js';
import { DraftStructure } from '../src/draft-structure.js';
import { IdentityStore } from '../src/identity-store.js';
import { TenantAuthorization } from '../src/tenant-authorization.js';
import { TenantTransactions } from '../src/tenant-transactions.js';

const tenantA = 'a0000000-0000-4000-8000-000000000001', tenantB = 'a0000000-0000-4000-8000-000000000002';
const branchA = 'b0000000-0000-4000-8000-000000000001', branchB = 'b0000000-0000-4000-8000-000000000002';
const hostA = 't003-cafe-a.qmenux.com', hostB = 't003-restaurant-b.qmenux.com';
const secret = () => randomBytes(32).toString('base64url');
const status = (value: number) => (error: { getStatus?: () => number }) => error.getStatus?.() === value;
const code = (value: string) => (error: { code?: string }) => error.code === value;

// Local disposable cluster only; append-only history is retained until full cluster teardown.
export async function exerciseDraftStructure(database: Database, owner: Client) {
  const sql = (direction: string) => readFileSync(new URL(`../../../../infrastructure/database/migrations/0012_draft_menu_structure.${direction}.sql`, import.meta.url), 'utf8');
  const migrate = async (direction: string, commit = true) => {
    await owner.query('BEGIN');
    try { await owner.query(sql(direction)); await owner.query(commit ? 'COMMIT' : 'ROLLBACK'); }
    catch (error) { await owner.query('ROLLBACK'); throw error; }
  };
  const beforeMenus = (await owner.query('SELECT to_jsonb(t) AS entity FROM qmenux.menus t ORDER BY id')).rows;
  const beforeCategories = (await owner.query('SELECT to_jsonb(t) AS entity FROM qmenux.categories t ORDER BY id')).rows;
  const beforeProducts = (await owner.query('SELECT to_jsonb(t) AS entity FROM qmenux.products t ORDER BY tenant_id,id')).rows;
  await migrate('up', false);
  assert.equal((await owner.query("SELECT to_regclass('qmenux.menu_events') IS NULL AS absent")).rows[0].absent, true);
  await migrate('up'); await assert.rejects(migrate('up'), code('P0001'));
  assert.deepEqual((await owner.query("SELECT to_jsonb(t)-'revision' AS entity FROM qmenux.menus t ORDER BY id")).rows, beforeMenus);
  assert.deepEqual((await owner.query("SELECT to_jsonb(t)-'revision' AS entity FROM qmenux.categories t ORDER BY id")).rows, beforeCategories);
  await migrate('down');
  assert.deepEqual((await owner.query('SELECT to_jsonb(t) AS entity FROM qmenux.menus t ORDER BY id')).rows, beforeMenus);
  assert.deepEqual((await owner.query('SELECT to_jsonb(t) AS entity FROM qmenux.categories t ORDER BY id')).rows, beforeCategories);
  await migrate('up');
  assert.deepEqual((await owner.query('SELECT to_jsonb(t) AS entity FROM qmenux.products t ORDER BY tenant_id,id')).rows, beforeProducts);
  await owner.query('BEGIN');
  try {
    await assert.rejects(owner.query(readFileSync(new URL('../../../../infrastructure/database/migrations/0011_admin_tenant_membership.down.sql', import.meta.url), 'utf8')), code('P0001'));
  } finally { await owner.query('ROLLBACK'); }
  await owner.query('BEGIN');
  try {
    await owner.query("INSERT INTO qmenux.schema_migrations(version) VALUES ('0013_synthetic_future')");
    await assert.rejects(owner.query(sql('down')), code('P0001'));
  } finally { await owner.query('ROLLBACK'); }

  const identities = new IdentityStore(database), authorization = new TenantAuthorization(new TenantTransactions(database), identities);
  const structure = new DraftStructure(authorization), products = new DraftCatalog(authorization);
  const user = await identities.createSession('synthetic-structure-a', secret()), otherUser = await identities.createSession('synthetic-structure-b', secret());
  assert(user && otherUser);
  await owner.query("INSERT INTO qmenux_identity.memberships(tenant_id,user_id,role,status) VALUES ($1,$3,'OWNER','ACTIVE'),($2,$4,'EDITOR','ACTIVE')", [tenantA, tenantB, user, otherUser]);
  const token = secret(), csrf = secret(), otherToken = secret();
  await identities.createAdminSession('google', 'synthetic-structure-a', token, csrf);
  await identities.createSession('synthetic-structure-b', otherToken);
  const entitled = async () => true; // Synthetic entitlement only; no real license grant or default policy.
  const menuA = await structure.create('menu', hostA, token, { branchId: branchA, name: '  Kafe menüsü  ' }, entitled, 'admin', csrf);
  const menuB = await structure.create('menu', hostB, otherToken, { branchId: branchB, name: 'Synthetic restaurant menu' }, entitled);
  assert('state' in menuA); assert.equal(menuA.state, 'DRAFT'); assert.equal(menuA.name, 'Kafe menüsü');
  const categoryA = await structure.create('category', hostA, token, { menuId: menuA.id, name: 'İçecekler', sortOrder: 2 }, entitled, 'admin', csrf);
  const categoryB = await structure.create('category', hostB, otherToken, { menuId: menuB.id, name: 'Synthetic lunch' }, entitled);
  assert('sortOrder' in categoryA); assert.equal(categoryA.sortOrder, 2);
  assert('sortOrder' in categoryB); assert.equal(categoryB.sortOrder, 0);
  const product = await products.create(hostA, token, { categoryId: categoryA.id, name: 'Synthetic coffee', priceMinor: 10000 }, entitled, 'admin', csrf);
  assert.equal(product.categoryId, categoryA.id);
  await assert.rejects(products.create(hostA, token, { categoryId: categoryB.id, name: 'Denied', priceMinor: 0 }, entitled, 'admin', csrf), status(404));

  for (const [kind, entity, ownParent, foreignParent] of [
    ['menu', menuA, branchA, branchB], ['category', categoryA, menuA.id, menuB.id],
  ] as const) {
    const key = kind === 'menu' ? 'branchId' : 'menuId', input = { [key]: ownParent, name: 'Valid synthetic name' };
    const history = await structure.history(kind, hostA, token, entity.id, {}, entitled, 'admin');
    assert.equal(history.items.length, 1); assert.equal(history.items[0]!.actorId, user); assert.equal(history.items[0]!.previous, null);
    assert.match((history.items[0]!.current as { created_at: string }).created_at, /(?:Z|\+00:00)$/);
    assert.deepEqual(await structure.read(kind, hostA, token, entity.id, entitled, 'admin'), entity);
    assert.equal((await structure.update(kind, hostA, token, entity.id, { revision: 1, name: entity.name }, entitled, 'admin', csrf)).revision, 1);
    for (const bad of [null, [], {}, { ...input, name: '' }, { ...input, name: 'x'.repeat(201) }, { ...input, name: 'bad\0name' },
      { ...input, [key]: 'invalid' }, { ...input, tenantId: tenantB }, { ...input, actorId: user }, { ...input, state: 'PUBLISHED' }, { ...input, revision: 1 }]) {
      await assert.rejects(async () => structure.create(kind, hostA, token, bad, entitled, 'admin', csrf), status(400));
    }
    for (const patch of [{ revision: 1 }, { name: 'No revision' }, { revision: 0, name: 'x' }, { revision: 1, name: null },
      { revision: 1, [key]: foreignParent }, { revision: 1, state: 'PUBLISHED' }]) {
      await assert.rejects(async () => structure.update(kind, hostA, token, entity.id, patch, entitled, 'admin', csrf), status(400));
    }
    for (const query of [{ limit: 0 }, { limit: 101 }, { limit: '20' }, { after: 'invalid' }, { tenant_id: tenantB }]) {
      await assert.rejects(async () => structure.list(kind, hostA, token, query, entitled, 'admin'), status(400));
    }
    for (const proof of [undefined, secret()]) {
      await assert.rejects(structure.create(kind, hostA, token, input, entitled, 'admin', proof), status(403));
    }
    for (const policy of [undefined, async () => false, async () => 'true']) {
      await assert.rejects(structure.create(kind, hostA, token, input, policy as never, 'admin', csrf), status(403));
    }
    await assert.rejects(structure.create(kind, hostA, token, { ...input, [key]: foreignParent }, entitled, 'admin', csrf), status(404));
    await assert.rejects(structure.read(kind, hostB, otherToken, entity.id, entitled), status(404));
    await assert.rejects(structure.history(kind, hostB, otherToken, entity.id, {}, entitled), status(404));
    await assert.rejects(structure.update(kind, hostB, otherToken, entity.id, { revision: 1, name: 'Denied' }, entitled), status(404));
    assert.deepEqual((await structure.list(kind, hostA, token, { [key]: foreignParent }, entitled, 'admin')).items, []);
    const race = await Promise.allSettled([
      structure.update(kind, hostA, token, entity.id, { revision: 1, name: 'First edit' }, entitled, 'admin', csrf),
      structure.update(kind, hostA, token, entity.id, { revision: 1, name: 'Other edit' }, entitled, 'admin', csrf),
    ]);
    assert.equal(race.filter(result => result.status === 'fulfilled').length, 1);
    const lost = race.find(result => result.status === 'rejected'); assert(lost?.status === 'rejected'); assert.equal(lost.reason.getStatus(), 409);
    const page = await structure.history(kind, hostA, token, entity.id, { limit: 1 }, entitled, 'admin');
    assert.equal(page.nextRevision, 1);
    const next = await structure.history(kind, hostA, token, entity.id, { afterRevision: 1 }, entitled, 'admin');
    assert.equal(next.items.length, 1); assert.equal((next.items[0]!.previous as { name: string }).name, entity.name);
    const ids: string[] = []; let after: string | null = null;
    do {
      const result: Awaited<ReturnType<DraftStructure['list']>> = await structure.list(kind, hostA, token, { limit: 1, ...(after ? { after } : {}) }, entitled, 'admin');
      ids.push(...result.items.map(row => row.id)); after = result.nextCursor;
    } while (after);
    assert.equal(new Set(ids).size, ids.length); assert(ids.includes(entity.id));
    assert(!ids.includes(kind === 'menu' ? menuB.id : categoryB.id));
  }
  for (const kind of ['products', 'tenants', '__proto__', 'constructor']) {
    await assert.rejects(async () => structure.list(kind as never, hostA, token, {}, entitled, 'admin'), status(400));
  }
  await assert.rejects(async () => structure.create('category', hostA, token, { menuId: menuA.id, name: 'x', sortOrder: -1 }, entitled, 'admin', csrf), status(400));
  await assert.rejects(async () => structure.create('menu', hostA, token, { branchId: branchA, name: 'x', sortOrder: 0 }, entitled, 'admin', csrf), status(400));
  const ordered = await structure.update('category', hostA, token, categoryA.id, { revision: 2, sortOrder: 2147483647 }, entitled, 'admin', csrf);
  assert('sortOrder' in ordered); assert.equal(ordered.sortOrder, 2147483647); assert.equal(ordered.revision, 3);
  const legacy = 'c0000000-0000-4000-8000-000000000001';
  assert.equal((await structure.history('menu', hostA, token, legacy, {}, entitled, 'admin')).items.length, 0);
  await structure.update('menu', hostA, token, legacy, { revision: 1, name: 'Updated legacy draft' }, entitled, 'admin', csrf);
  assert.equal((await structure.history('menu', hostA, token, legacy, {}, entitled, 'admin')).items[0]!.revision, 2);

  const snapshot = async () => ({
    menus: (await owner.query('SELECT * FROM qmenux.menu_events ORDER BY tenant_id,entity_id,revision')).rows,
    categories: (await owner.query('SELECT * FROM qmenux.category_events ORDER BY tenant_id,entity_id,revision')).rows,
  });
  const committed = await snapshot();
  await assert.rejects(authorization.run(hostA, token, 'catalog:write', entitled, async (client, tenant) => {
    await client.query("SELECT set_config('app.catalog_actor',$1,true)", [tenant.userId]);
    await client.query("UPDATE qmenux.menus SET name='rolled back' WHERE id=$1", [menuA.id]);
    await client.query("UPDATE qmenux.categories SET sort_order=0 WHERE id=$1", [categoryA.id]);
    throw new Error('Synthetic failure after both audits');
  }, 'admin', csrf), status(503));
  assert.deepEqual(await snapshot(), committed);
  for (const table of ['menus','categories']) {
    const client = await database.begin();
    try {
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantA]);
      await assert.rejects(client.query(`UPDATE qmenux.${table} SET name='No actor'`), code('42501'));
    } finally { await client.query('ROLLBACK'); client.release(); }
  }
  for (const table of ['menu_events','category_events']) {
    for (const query of [`UPDATE qmenux.${table} SET actor_id=actor_id`, `DELETE FROM qmenux.${table}`, `TRUNCATE qmenux.${table}`]) {
      await owner.query('BEGIN'); try { await assert.rejects(owner.query(query), code('42501')); } finally { await owner.query('ROLLBACK'); }
    }
    const client = await database.begin();
    try {
      assert.equal((await client.query(`SELECT * FROM qmenux.${table}`)).rows.length, 0);
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantB]);
      const rows = (await client.query(`SELECT * FROM qmenux.${table}`)).rows;
      assert(rows.length > 0); assert(rows.every(row => row.tenant_id === tenantB));
      await client.query('ROLLBACK');
    } finally { client.release(); }
    assert.deepEqual((await owner.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass', [`qmenux.${table}`])).rows,
      [{ relrowsecurity: true, relforcerowsecurity: true }]);
  }
  assert.deepEqual((await owner.query(`SELECT prosecdef,proconfig,
    has_function_privilege('qmenux_runtime',oid,'EXECUTE') AS runtime_execute,
    EXISTS(SELECT FROM aclexplode(proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS public_execute
    FROM pg_proc WHERE oid='qmenux.record_structure_change()'::regprocedure`)).rows,
  [{ prosecdef: true, proconfig: ['search_path=pg_catalog, pg_temp', 'TimeZone=UTC'], runtime_execute: false, public_execute: false }]);
  assert.equal((await owner.query("SELECT has_table_privilege('qmenux_runtime','qmenux.menus','DELETE') OR has_table_privilege('qmenux_runtime','qmenux.categories','DELETE') AS allowed")).rows[0].allowed, false);
  await assert.rejects(migrate('down'), code('P0001')); assert.deepEqual(await snapshot(), committed);
}
