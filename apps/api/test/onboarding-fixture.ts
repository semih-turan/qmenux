import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Client } from 'pg';
import { exerciseOnboardingHttp } from './onboarding-http-fixture.js';
import { Database } from '../src/database.js';
import { DraftCatalog } from '../src/draft-catalog.js';
import { IdentityStore, secretHash } from '../src/identity-store.js';
import { OnboardingApplications } from '../src/onboarding-applications.js';
import { TenantAuthorization } from '../src/tenant-authorization.js';
import { TenantTransactions } from '../src/tenant-transactions.js';

const secret = () => randomBytes(32).toString('base64url');
const status = (value: number) => (error: { getStatus?: () => number }) => error.getStatus?.() === value;
const code = (value: string) => (error: { code?: string }) => error.code === value;

// Disposable local database only. No application/audit record is selectively deleted for cleanup.
export async function exerciseOnboarding(database: Database, owner: Client) {
  const sql = (direction: string) => readFileSync(new URL(`../../../../infrastructure/database/migrations/0013_onboarding_applications.${direction}.sql`, import.meta.url), 'utf8');
  const migrate = async (direction: string, commit = true) => {
    await owner.query('BEGIN');
    try { await owner.query(sql(direction)); await owner.query(commit ? 'COMMIT' : 'ROLLBACK'); }
    catch (error) { await owner.query('ROLLBACK'); throw error; }
  };
  const tenants = (await owner.query('SELECT * FROM qmenux.tenants ORDER BY id')).rows;
  const memberships = (await owner.query('SELECT * FROM qmenux_identity.memberships ORDER BY tenant_id,user_id')).rows;
  await migrate('up', false);
  assert.equal((await owner.query("SELECT to_regnamespace('qmenux_onboarding') IS NULL AS absent")).rows[0].absent, true);
  await migrate('up'); await assert.rejects(migrate('up'), code('P0001'));
  await migrate('down'); await migrate('up');
  await owner.query('BEGIN');
  try {
    await assert.rejects(owner.query(readFileSync(new URL('../../../../infrastructure/database/migrations/0012_draft_menu_structure.down.sql', import.meta.url), 'utf8')), code('P0001'));
  } finally { await owner.query('ROLLBACK'); }
  await owner.query('BEGIN');
  try {
    await owner.query("INSERT INTO qmenux.schema_migrations(version) VALUES ('0014_synthetic_future')");
    await assert.rejects(owner.query(sql('down')), code('P0001'));
  } finally { await owner.query('ROLLBACK'); }

  const store = new IdentityStore(database), applications = new OnboardingApplications(database);
  const session = secret(), csrf = secret(), peer = secret(), peerCsrf = secret(), api = secret(), other = secret(), otherCsrf = secret();
  const user = await store.createAdminSession('google', 'synthetic-applicant-a', session, csrf); assert(user);
  await store.createAdminSession('google', 'synthetic-applicant-a', peer, peerCsrf);
  assert.equal(await store.createSession('synthetic-applicant-a', api), user);
  const otherUser = await store.createAdminSession('microsoft', 'synthetic-applicant-b', other, otherCsrf); assert(otherUser);
  const key = randomUUID(), input = { name: '  Synthetic café  ', idempotencyKey: key };
  assert.deepEqual(await applications.list(session, {}), { items: [], nextCursor: null });
  for (const token of [undefined, null, 42, '', 'invalid', secret(), api]) {
    await assert.rejects(applications.list(token, {}), status(401));
    await assert.rejects(applications.create(token, csrf, input), status(401));
  }
  for (const proof of [undefined, null, 'invalid', secret(), peerCsrf]) {
    await assert.rejects(applications.create(session, proof, input), status(401));
  }
  for (const body of [null, [], {}, { ...input, name: '' }, { ...input, name: 'x'.repeat(201) }, { ...input, name: 'bad\nname' },
    { ...input, name: null }, { ...input, idempotencyKey: 'invalid' }, { ...input, applicantId: otherUser },
    { ...input, tenantId: randomUUID() }, { ...input, status: 'APPROVED' }, { ...input, license: 'ACTIVE' }]) {
    await assert.rejects(applications.create(session, csrf, body), status(400));
  }
  const drafts = await Promise.all(Array.from({ length: 6 }, () => applications.create(session, csrf, input)));
  const draft = drafts[0]!; assert(drafts.every(row => row.id === draft.id));
  assert.equal(draft.status, 'DRAFT'); assert.equal(draft.revision, 1); assert.equal(draft.requestedName, 'Synthetic café');
  assert.equal(draft.submittedAt, null); assert(draft.createdAt instanceof Date);
  assert.equal(Object.hasOwn(draft, 'applicant_id'), false); assert.equal(Object.hasOwn(draft, 'request_key'), false);
  assert.equal((await owner.query('SELECT count(*) FROM qmenux_onboarding.application_events WHERE application_id=$1', [draft.id])).rows[0].count, '1');
  await assert.rejects(applications.create(session, csrf, { ...input, name: 'Different payload' }), status(409));
  assert.equal((await applications.edit(session, csrf, draft.id, { revision: 1, name: draft.requestedName })).revision, 1);
  const edited = await applications.edit(session, csrf, draft.id, { revision: 1, name: 'Synthetic café and restaurant' });
  assert.equal(edited.revision, 2);
  assert.deepEqual(await applications.create(session, csrf, input), edited);
  const racing = await Promise.allSettled([
    applications.edit(session, csrf, draft.id, { revision: 2, name: 'First edit' }),
    applications.edit(session, csrf, draft.id, { revision: 2, name: 'Other edit' }),
  ]);
  assert.equal(racing.filter(row => row.status === 'fulfilled').length, 1);
  const rejected = racing.find(row => row.status === 'rejected'); assert(rejected?.status === 'rejected'); assert.equal(rejected.reason.getStatus(), 409);
  await assert.rejects(applications.submit(session, csrf, draft.id, { revision: 2 }), status(409));
  const submitted = await Promise.all([applications.submit(session, csrf, draft.id, { revision: 3 }), applications.submit(session, csrf, draft.id, { revision: 3 })]);
  assert.deepEqual(submitted[0], submitted[1]); assert.equal(submitted[0]!.status, 'PENDING_APPROVAL');
  assert.equal(submitted[0]!.revision, 4); assert(submitted[0]!.submittedAt instanceof Date);
  assert.deepEqual(await applications.submit(session, csrf, draft.id, { revision: 3 }), submitted[0]);
  assert.deepEqual(await applications.create(session, csrf, input), submitted[0]);
  await assert.rejects(applications.edit(session, csrf, draft.id, { revision: 4, name: 'Cannot edit submitted request' }), status(409));
  await assert.rejects(applications.edit(other, otherCsrf, draft.id, { revision: 4, name: 'Other user' }), status(404));
  await assert.rejects(applications.submit(other, otherCsrf, draft.id, { revision: 4 }), status(404));
  assert.deepEqual(await applications.list(other, {}), { items: [], nextCursor: null });
  const otherDraft = await applications.create(other, otherCsrf, { name: 'Synthetic restaurant B', idempotencyKey: key });
  assert.notEqual(otherDraft.id, draft.id);
  const apple = secret(), appleCsrf = secret();
  await store.createAdminSession('apple', 'synthetic-applicant-c', apple, appleCsrf);
  assert.equal((await applications.create(apple, appleCsrf, { name: 'Synthetic bakery', idempotencyKey: randomUUID() })).status, 'DRAFT');
  const additional = await applications.create(session, csrf, { name: 'Synthetic second request', idempotencyKey: randomUUID() });
  const ids: string[] = []; let after: string | null = null;
  do {
    const result: Awaited<ReturnType<OnboardingApplications['list']>> = await applications.list(session, { limit: 1, ...(after ? { after } : {}) });
    ids.push(...result.items.map(row => row.id)); after = result.nextCursor;
  } while (after);
  assert.deepEqual(new Set(ids), new Set([draft.id, additional.id]));
  assert.equal(ids.includes(otherDraft.id), false);
  for (const query of [{ limit: 0 }, { limit: 101 }, { limit: '20' }, { after: 'invalid' }, { applicantId: otherUser }]) {
    await assert.rejects(applications.list(session, query), status(400));
  }
  for (const body of [{}, { revision: 0 }, { revision: 1.5 }, { revision: 1, status: 'APPROVED' }]) {
    await assert.rejects(applications.submit(session, csrf, additional.id, body), status(400));
  }
  await assert.rejects(applications.edit(session, csrf, additional.id, { revision: 1 }), status(400));
  const events = (await owner.query('SELECT * FROM qmenux_onboarding.application_events WHERE application_id=$1 ORDER BY revision', [draft.id])).rows;
  assert.equal(events.length, 4); assert(events.every(row => row.actor_id === user));
  assert.equal(events[0].previous, null); assert.equal(events[1].previous.requested_name, 'Synthetic café');
  assert.equal(events.at(-1).current.status, 'PENDING_APPROVAL'); assert.match(events[0].current.created_at, /(?:Z|\+00:00)$/);
  const client = await database.begin(); let rollbackId: string;
  try {
    rollbackId = (await client.query('SELECT * FROM qmenux_onboarding.create_draft($1,$2,$3,$4)', [secretHash(session), secretHash(csrf), randomUUID(), 'Rolled back request'])).rows[0].id;
    await client.query('ROLLBACK');
  } finally { client.release(); }
  assert.equal((await owner.query('SELECT count(*) FROM qmenux_onboarding.applications WHERE id=$1', [rollbackId])).rows[0].count, '0');
  assert.equal((await owner.query('SELECT count(*) FROM qmenux_onboarding.application_events WHERE application_id=$1', [rollbackId])).rows[0].count, '0');
  for (const table of ['applications','application_events']) {
    const runtime = await database.begin();
    try { await assert.rejects(runtime.query(`SELECT * FROM qmenux_onboarding.${table}`), code('42501')); }
    finally { await runtime.query('ROLLBACK'); runtime.release(); }
    assert.deepEqual((await owner.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass', [`qmenux_onboarding.${table}`])).rows,
      [{ relrowsecurity: true, relforcerowsecurity: true }]);
  }
  for (const query of ['UPDATE qmenux_onboarding.application_events SET actor_id=actor_id', 'DELETE FROM qmenux_onboarding.application_events', 'TRUNCATE qmenux_onboarding.application_events']) {
    await owner.query('BEGIN'); try { await assert.rejects(owner.query(query), code('42501')); } finally { await owner.query('ROLLBACK'); }
  }
  await owner.query('BEGIN');
  try {
    await owner.query("SELECT set_config('app.onboarding_actor',$1,true)", [user]);
    await assert.rejects(owner.query("UPDATE qmenux_onboarding.applications SET requested_name='Changed submitted application' WHERE id=$1", [draft.id]), code('42501'));
  } finally { await owner.query('ROLLBACK'); }
  assert.deepEqual((await owner.query(`SELECT prosecdef,proconfig,
    has_function_privilege('qmenux_runtime',oid,'EXECUTE') AS runtime_execute,
    EXISTS(SELECT FROM aclexplode(proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS public_execute
    FROM pg_proc WHERE oid='qmenux_onboarding.create_draft(text,text,uuid,text)'::regprocedure`)).rows,
  [{ prosecdef: true, proconfig: ['search_path=pg_catalog, pg_temp'], runtime_execute: true, public_execute: false }]);
  const catalog = new DraftCatalog(new TenantAuthorization(new TenantTransactions(database), store));
  await assert.rejects(catalog.create('t003-cafe-a.qmenux.com', session, { name: 'Denied', categoryId: 'd0000000-0000-4000-8000-000000000001', priceMinor: 0 }, async () => true, 'admin', csrf), status(403));
  assert.deepEqual((await owner.query('SELECT * FROM qmenux.tenants ORDER BY id')).rows, tenants);
  assert.deepEqual((await owner.query('SELECT * FROM qmenux_identity.memberships ORDER BY tenant_id,user_id')).rows, memberships);
  assert.deepEqual(await store.readAdminSession(session), { id: user, status: 'REGISTERED' });
  await assert.rejects(migrate('down'), code('P0001'));
  const clean = await database.begin();
  try { assert.equal((await clean.query("SELECT NULLIF(current_setting('app.onboarding_actor',true),'') AS actor")).rows[0].actor, null); await clean.query('ROLLBACK'); }
  finally { clean.release(); }
  const dirty = await database.begin(); await dirty.query("SELECT set_config('app.onboarding_actor',$1,false)", [user]);
  await dirty.query('COMMIT'); dirty.release(); await assert.rejects(database.begin(), status(503)); assert.equal(await database.isReady(), true);
  await owner.query("UPDATE qmenux_identity.sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [secretHash(session)]);
  await assert.rejects(applications.list(session, {}), status(401));
  const fresh = secret(); await store.createAdminSession('google', 'synthetic-applicant-a', fresh, csrf);
  await owner.query("UPDATE qmenux_identity.users SET status='SUSPENDED' WHERE id=$1", [user]);
  await assert.rejects(applications.submit(fresh, csrf, additional.id, { revision: 1 }), status(401));
  await owner.query("UPDATE qmenux_identity.users SET status='REGISTERED' WHERE id=$1", [user]);
  await assert.rejects(applications.list(fresh, {}), status(401));
  await exerciseOnboardingHttp(database, owner);
}
