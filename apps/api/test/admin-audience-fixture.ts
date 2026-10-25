import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ForbiddenException } from '@nestjs/common';
import type { Client } from 'pg';
import { Database } from '../src/database.js';
import { IdentityStore, secretHash, type IdentityProvider } from '../src/identity-store.js';
import { cleanupExpiredAuth } from '../src/auth-maintenance.js';

export async function exerciseAdminAudience(database: Database, owner: Client): Promise<void> {
  const store = new IdentityStore(database), subject = `synthetic-admin-${randomUUID()}`, tenant = randomUUID();
  const subjects = [subject], states: string[] = [];
  const secret = () => randomBytes(32).toString('base64url');
  const browser = secret(), verifier = secret(), nonce = secret();
  const providers = ['google','microsoft','apple'] as const;
  const apiTokens = new Map<IdentityProvider, string>(), apiStates = new Map<IdentityProvider, string>();
  const ids: string[] = [];
  const apiCreate = (p: IdentityProvider, token: string, previous?: string, sub = subject) => p === 'google'
    ? store.createSession(sub, token, previous) : p === 'microsoft'
      ? store.createMicrosoftSession(sub, token, previous) : store.createAppleSession(sub, token, previous);
  const apiBegin = (p: IdentityProvider, state: string) => p === 'google' ? store.begin(state, browser, verifier, nonce)
    : p === 'microsoft' ? store.beginMicrosoft(state, browser, verifier, nonce) : store.beginApple(state, browser, nonce);
  const apiConsume = (p: IdentityProvider, state: string) => p === 'google' ? store.consume(state, browser)
    : p === 'microsoft' ? store.consumeMicrosoft(state, browser) : store.consumeApple(state, browser);
  const sql = (side: string) => readFileSync(new URL(`../../../../infrastructure/database/migrations/0009_admin_audience.${side}.sql`, import.meta.url), 'utf8');
  const migrate = async (side: string, commit = true) => {
    await owner.query('BEGIN');
    try { await owner.query(sql(side)); await owner.query(commit ? 'COMMIT' : 'ROLLBACK'); }
    catch (e) { await owner.query('ROLLBACK'); throw e; }
  };
  const rejectSql = async (text: string, values: (string | null)[], code: string) => {
    await owner.query('BEGIN');
    try { await assert.rejects(owner.query(text, values), (e: { code: string }) => e.code === code); }
    finally { await owner.query('ROLLBACK'); }
  };
  try {
    if ((await owner.query("SELECT EXISTS (SELECT FROM qmenux.schema_migrations WHERE version='0009_admin_audience') AS present")).rows[0].present) await migrate('down');
    for (const p of providers) {
      const token = secret(), state = secret(); states.push(state);
      const uid = await apiCreate(p, token); assert(uid); ids.push(uid); apiTokens.set(p, token); apiStates.set(p, state);
      await apiBegin(p, state);
    }
    await owner.query("INSERT INTO qmenux.tenants(id,slug,name) VALUES ($1,$2,'Synthetic admin audience')", [tenant, `admin-test-${tenant}`]);
    await owner.query("INSERT INTO qmenux_identity.memberships(tenant_id,user_id,role,status) VALUES ($1,$2,'OWNER','ACTIVE')", [tenant, ids[0]]);
    apiTokens.set('google', secret()); await apiCreate('google', apiTokens.get('google')!);
    await migrate('up', false);
    assert.equal((await owner.query("SELECT count(*) FROM information_schema.columns WHERE table_schema='qmenux_identity' AND table_name='sessions' AND column_name='audience'")).rows[0].count, '0');
    await migrate('up'); await assert.rejects(migrate('up'), (e: { code: string }) => e.code === 'P0001');
    for (const p of providers) {
      const token = apiTokens.get(p)!, uid = ids[providers.indexOf(p)]!;
      assert.deepEqual(await store.readSession(token), { id: uid, status: 'REGISTERED' });
      assert.equal(await store.readAdminSession(token), undefined);
      assert.equal(await store.consumeAdmin(p, apiStates.get(p)!, browser), undefined);
      assert(await apiConsume(p, apiStates.get(p)!));
      const state = secret(); states.push(state);
      await store.beginAdmin(p, state, browser, p === 'apple' ? null : verifier, nonce);
      assert.deepEqual((await owner.query('SELECT audience,browser_hash FROM qmenux_identity.login_attempts WHERE state_hash=$1', [secretHash(state)])).rows[0], { audience: 'admin', browser_hash: secretHash(browser) });
      for (const other of providers) assert.equal(await apiConsume(other, state), undefined);
      assert.equal(await store.consumeAdmin(p, state, secret()), undefined);
      assert.equal(await store.consumeAdmin(providers[(providers.indexOf(p) + 1) % 3]!, state, browser), undefined);
      await assert.rejects(migrate('down'), (e: { code: string }) => e.code === 'P0001');
      const consumed = await Promise.all([store.consumeAdmin(p, state, browser), store.consumeAdmin(p, state, browser)]);
      assert.equal(consumed.filter(Boolean).length, 1);
      assert.deepEqual(consumed.find(Boolean), { verifier: p === 'apple' ? null : verifier, nonce });
      assert.equal(await store.consumeAdmin(p, state, browser), undefined);
      const admin = secret(), csrf = secret();
      assert.equal(await store.createAdminSession(p, subject, admin, csrf, token), uid);
      assert.deepEqual(await store.readAdminSession(admin), { id: uid, status: 'REGISTERED' });
      assert.equal(await store.readSession(admin), undefined);
      assert.equal(await store.revokeAdminSession(token, csrf), false);
      await store.revokeSession(admin);
      assert(await store.readAdminSession(admin));
      assert.equal(await store.revokeAdminSession(admin, secret()), false); assert(await store.readAdminSession(admin));
      assert.deepEqual((await owner.query('SELECT audience,csrf_hash FROM qmenux_identity.sessions WHERE token_hash=$1', [secretHash(admin)])).rows[0], { audience: 'admin', csrf_hash: secretHash(csrf) });
      assert.equal(await apiCreate(p, secret(), admin), uid); assert(await store.readAdminSession(admin));
      const rotated = secret(), nextCsrf = secret();
      assert.equal(await store.createAdminSession(p, subject, rotated, nextCsrf, admin), uid);
      assert.equal(await store.readAdminSession(admin), undefined); assert(await store.readSession(token));
      assert.equal(await store.revokeAdminSession(rotated, csrf), false);
      assert.equal(await store.revokeAdminSession(rotated, nextCsrf), true);
      assert.equal(await store.readAdminSession(rotated), undefined);
      const raceSubject = `${subject}-${p}-race`; subjects.push(raceSubject);
      const both = await Promise.all([apiCreate(p, secret(), undefined, raceSubject), store.createAdminSession(p, raceSubject, secret(), secret())]);
      assert(both[0]); assert.equal(both[0], both[1]); ids.push(both[0]);
    }
    const admin = secret(), csrf = secret(), api = apiTokens.get('google')!;
    await store.createAdminSession('google', subject, admin, csrf);
    const client = await database.begin();
    try {
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
      assert.deepEqual(await store.tenantMembership(client, api), { userId: ids[0], role: 'OWNER' });
      assert.equal(await store.tenantMembership(client, admin), undefined, 'Legacy tenant contract cannot accept admin token');
      await client.query('ROLLBACK');
    } finally { await client.query('ROLLBACK'); client.release(); }
    await assert.rejects(store.createAdminSession('google', subject, api, secret(), admin));
    assert(await store.readAdminSession(admin), 'Failed insert must roll back prior-token revocation');
    await owner.query("UPDATE qmenux_identity.memberships SET status='SUSPENDED' WHERE tenant_id=$1", [tenant]);
    assert.equal(await store.readSession(api), undefined); assert.equal(await store.readAdminSession(admin), undefined);
    await owner.query("UPDATE qmenux_identity.memberships SET status='ACTIVE' WHERE tenant_id=$1", [tenant]);
    assert.equal(await store.readAdminSession(admin), undefined);
    const activeApi = secret(), activeAdmin = secret();
    await apiCreate('google', activeApi); await store.createAdminSession('google', subject, activeAdmin, csrf);
    await owner.query("UPDATE qmenux_identity.users SET status='SUSPENDED' WHERE id=$1", [ids[0]]);
    assert.equal(await store.readSession(activeApi), undefined); assert.equal(await store.readAdminSession(activeAdmin), undefined);
    assert.equal(await store.createAdminSession('google', subject, secret(), secret()), null);
    await owner.query("UPDATE qmenux_identity.users SET status='REGISTERED' WHERE id=$1", [ids[0]]);
    assert.equal(await store.readAdminSession(activeAdmin), undefined);
    const expiredState = secret(), expiredSession = secret(); states.push(expiredState);
    await store.beginAdmin('apple', expiredState, browser, null, nonce);
    await store.createAdminSession('apple', subject, expiredSession, csrf);
    await owner.query("UPDATE qmenux_identity.login_attempts SET expires_at=now()-interval '1 second' WHERE state_hash=$1", [secretHash(expiredState)]);
    await owner.query("UPDATE qmenux_identity.sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [secretHash(expiredSession)]);
    assert.equal(await store.consumeAdmin('apple', expiredState, browser), undefined);
    assert.equal(await store.readAdminSession(expiredSession), undefined);
    assert.equal(await store.revokeAdminSession(expiredSession, csrf), false);
    await assert.rejects(migrate('down'), (e: { code: string }) => e.code === 'P0001');
    await cleanupExpiredAuth(database);
    assert.equal((await owner.query('SELECT count(*) FROM qmenux_identity.sessions WHERE token_hash=$1', [secretHash(expiredSession)])).rows[0].count, '0');
    await assert.rejects(store.beginAdmin('unknown' as IdentityProvider, secret(), browser, verifier, nonce), ForbiddenException);
    for (const [audience, hash] of [['admin', null], ['admin', 'bad'], ['api', secretHash(csrf)], ['operator', null]] as const) {
      await rejectSql('INSERT INTO qmenux_identity.sessions(token_hash,user_id,audience,csrf_hash) VALUES ($1,$2,$3,$4)', [secretHash(secret()), ids[0]!, audience, hash], '23514');
    }
    for (const name of ['begin_admin_login','consume_admin_login','create_admin_session','read_admin_session','revoke_admin_session']) {
      const row = (await owner.query(`SELECT p.prosecdef,p.proconfig,has_function_privilege('qmenux_runtime',p.oid,'EXECUTE') AS runtime,
        EXISTS (SELECT FROM aclexplode(p.proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS public
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='qmenux_identity' AND p.proname=$1`, [name])).rows[0];
      assert.equal(row.prosecdef, true); assert.deepEqual(row.proconfig, ['search_path=pg_catalog, pg_temp']);
      assert.equal(row.runtime, true); assert.equal(row.public, false);
    }
    for (const table of ['sessions','login_attempts']) {
      const c = await database.begin();
      try { await assert.rejects(c.query(`SELECT * FROM qmenux_identity.${table}`), (e: { code: string }) => e.code === '42501'); }
      finally { await c.query('ROLLBACK'); c.release(); }
    }
    await owner.query("DELETE FROM qmenux_identity.sessions WHERE audience='admin' AND user_id=ANY($1::uuid[])", [ids]);
    const apiRows = async () => (await owner.query('SELECT token_hash,user_id,expires_at::text FROM qmenux_identity.sessions WHERE user_id=ANY($1::uuid[]) ORDER BY token_hash', [ids])).rows;
    const preserved = await apiRows();
    await migrate('down'); assert.deepEqual(await apiRows(), preserved);
    await migrate('up'); assert.deepEqual(await apiRows(), preserved);
  } finally {
    await owner.query('ROLLBACK');
    const created = (await owner.query('SELECT user_id FROM qmenux_identity.external_identities WHERE subject=ANY($1::text[])', [subjects])).rows.map((r: { user_id: string }) => r.user_id);
    await owner.query('DELETE FROM qmenux_identity.memberships WHERE tenant_id=$1', [tenant]);
    await owner.query('DELETE FROM qmenux_identity.sessions WHERE user_id=ANY($1::uuid[])', [created]);
    await owner.query('DELETE FROM qmenux_identity.login_attempts WHERE state_hash=ANY($1::text[])', [states.map(secretHash)]);
    await owner.query('DELETE FROM qmenux_identity.external_identities WHERE user_id=ANY($1::uuid[])', [created]);
    await owner.query('DELETE FROM qmenux_identity.users WHERE id=ANY($1::uuid[])', [created]);
    await owner.query('DELETE FROM qmenux.tenants WHERE id=$1', [tenant]);
  }
}
