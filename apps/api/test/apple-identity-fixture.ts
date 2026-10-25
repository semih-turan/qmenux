import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Client } from 'pg';
import { Database } from '../src/database.js';
import { IdentityStore, secretHash } from '../src/identity-store.js';
import { appleIssuer } from '../src/apple-oidc.js';
import { cleanupExpiredAuth } from '../src/auth-maintenance.js';

// Synthetic only; shared by disposable PostgreSQL and the isolated Neon development probe.
export async function exerciseAppleIdentity(database: Database, owner: Client): Promise<void> {
  const store = new IdentityStore(database);
  const subject = `synthetic-apple-${randomUUID()}`;
  const secret = () => randomBytes(32).toString('base64url');
  const state = secret(), browser = secret(), verifier = secret(), nonce = secret();
  const expiry = secret();
  const microsoftState = secret(), microsoftToken = secret();
  const googleState = secret(), googleToken = secret(), first = secret(), second = secret();
  const ids: string[] = [];
  const sql = (side: string) => readFileSync(new URL(`../../../../infrastructure/database/migrations/0008_apple_identity.${side}.sql`, import.meta.url), 'utf8');
  const migrate = async (side: string, commit = true) => {
    await owner.query('BEGIN');
    try { await owner.query(sql(side)); await owner.query(commit ? 'COMMIT' : 'ROLLBACK'); }
    catch (e) { await owner.query('ROLLBACK'); throw e; }
  };
  const rejected = async (text: string, values: (string | null)[], code: string) => {
    await owner.query('BEGIN');
    try { await assert.rejects(owner.query(text, values), (e: { code: string }) => e.code === code); }
    finally { await owner.query('ROLLBACK'); }
  };
  const appleCount = async () => (await owner.query('SELECT count(*) FROM qmenux_identity.external_identities WHERE issuer=$1 AND subject=$2', [appleIssuer, subject])).rows[0].count;
  const hasAdmin = (await owner.query("SELECT EXISTS (SELECT FROM qmenux.schema_migrations WHERE version='0009_admin_audience') AS present")).rows[0].present;
  try {
    if (!hasAdmin && (await owner.query("SELECT EXISTS (SELECT FROM qmenux.schema_migrations WHERE version='0008_apple_identity') AS present")).rows[0].present) await migrate('down');
    await store.begin(googleState, browser, verifier, nonce);
    const google = await store.createSession(subject, googleToken); assert(google); ids.push(google);
    const microsoft = await store.createMicrosoftSession(subject, microsoftToken); assert(microsoft); ids.push(microsoft);
    await store.beginMicrosoft(microsoftState, browser, verifier, nonce);
    if (!hasAdmin) {
      await migrate('up', false);
      assert.equal((await owner.query("SELECT is_nullable FROM information_schema.columns WHERE table_schema='qmenux_identity' AND table_name='login_attempts' AND column_name='verifier'")).rows[0].is_nullable, 'NO');
      await migrate('up');
      await assert.rejects(migrate('up'), (e: { code: string }) => e.code === 'P0001');
    }
    assert.equal((await owner.query('SELECT issuer FROM qmenux_identity.login_attempts WHERE state_hash=$1', [secretHash(googleState)])).rows[0].issuer, 'https://accounts.google.com');
    assert.deepEqual(await store.readSession(googleToken), { id: google, status: 'REGISTERED' });
    assert.equal(await store.consumeApple(googleState, browser), undefined);
    assert.deepEqual(await store.consume(googleState, browser), { verifier, nonce });
    assert.equal(await store.consumeApple(microsoftState, browser), undefined);
    assert.deepEqual(await store.consumeMicrosoft(microsoftState, browser), { verifier, nonce });
    await store.beginApple(state, browser, nonce);
    assert.deepEqual((await owner.query('SELECT issuer,verifier,nonce FROM qmenux_identity.login_attempts WHERE state_hash=$1', [secretHash(state)])).rows[0], { issuer: appleIssuer, verifier: null, nonce });
    assert.equal(await store.consumeMicrosoft(state, browser), undefined);
    assert.equal(await store.consume(state, browser), undefined, 'Google cannot consume Apple state');
    assert.equal(await store.consumeApple(state, secret()), undefined);
    await assert.rejects(migrate('down'), (e: { code: string }) => e.code === 'P0001', 'Live Apple attempts must block down');
    const consumed = await Promise.all([store.consumeApple(state, browser), store.consumeApple(state, browser)]);
    assert.equal(consumed.filter(Boolean).length, 1);
    assert.deepEqual(consumed.find(Boolean), { nonce });
    assert.equal(await store.consumeApple(state, browser), undefined);
    await store.beginApple(expiry, browser, nonce);
    await owner.query("UPDATE qmenux_identity.login_attempts SET expires_at=now()-interval '1 second' WHERE state_hash=$1", [secretHash(expiry)]);
    assert.equal(await store.consumeApple(expiry, browser), undefined);
    await cleanupExpiredAuth(database);
    assert.equal((await owner.query('SELECT count(*) FROM qmenux_identity.login_attempts WHERE state_hash=$1', [secretHash(expiry)])).rows[0].count, '0');
    const concurrent = await Promise.all([store.createAppleSession(subject, first), store.createAppleSession(subject, second)]);
    assert(concurrent[0]); assert.equal(concurrent[0], concurrent[1]); assert.notEqual(concurrent[0], google); assert.notEqual(concurrent[0], microsoft); ids.push(concurrent[0]);
    assert.equal(await appleCount(), '1');
    assert.deepEqual(await store.readSession(first), { id: concurrent[0], status: 'REGISTERED' });
    assert.equal((await owner.query('SELECT token_hash FROM qmenux_identity.sessions WHERE token_hash=$1', [secretHash(first)])).rows[0].token_hash, secretHash(first));
    const rotated = secret();
    assert.equal(await store.createAppleSession(subject, rotated, first), concurrent[0]);
    assert.equal(await store.readSession(first), undefined);
    await store.revokeSession(second); assert.equal(await store.readSession(second), undefined);
    assert.deepEqual(await store.readSession(googleToken), { id: google, status: 'REGISTERED' });
    await owner.query("UPDATE qmenux_identity.users SET status='SUSPENDED' WHERE id=$1", [concurrent[0]]);
    assert.equal(await store.readSession(rotated), undefined);
    assert.equal(await store.createAppleSession(subject, secret()), null);
    await owner.query("UPDATE qmenux_identity.users SET status='REGISTERED' WHERE id=$1", [concurrent[0]]);
    assert.equal(await store.readSession(rotated), undefined, 'Restoration never revives revoked sessions');
    const expiredSession = secret();
    assert.equal(await store.createAppleSession(subject, expiredSession), concurrent[0]);
    await owner.query("UPDATE qmenux_identity.sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [secretHash(expiredSession)]);
    assert.equal(await store.readSession(expiredSession), undefined);
    await cleanupExpiredAuth(database);
    assert.equal((await owner.query('SELECT count(*) FROM qmenux_identity.sessions WHERE token_hash=$1', [secretHash(expiredSession)])).rows[0].count, '0');
    assert.equal(await store.createSession(subject, secret()), google, 'Legacy Google session creation remains in its own namespace');
    await assert.rejects(migrate('down'), (e: { code: string }) => e.code === 'P0001', 'Apple identities block down without deleting them');
    assert.equal(await appleCount(), '1');
    assert.equal((await owner.query('SELECT count(*) FROM qmenux_identity.memberships WHERE user_id=ANY($1::uuid[])', [ids])).rows[0].count, '0');
    for (const name of ['begin_apple_login','consume_apple_login','create_apple_session']) {
      const row = (await owner.query(`SELECT p.prosecdef,p.proconfig,has_function_privilege('qmenux_runtime',p.oid,'EXECUTE') AS runtime,
        EXISTS (SELECT FROM aclexplode(p.proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS public
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='qmenux_identity' AND p.proname=$1`, [name])).rows[0];
      assert.equal(row.prosecdef, true); assert.deepEqual(row.proconfig, ['search_path=pg_catalog, pg_temp']);
      assert.equal(row.runtime, true); assert.equal(row.public, false);
    }
    const client = await database.begin();
    try {
      await client.query('SELECT qmenux_identity.create_apple_session($1,$2,NULL)', [`${subject}-rollback`, secretHash(secret())]);
      await client.query('ROLLBACK');
    } finally { await client.query('ROLLBACK'); client.release(); }
    assert.equal((await owner.query('SELECT count(*) FROM qmenux_identity.external_identities WHERE subject=$1', [`${subject}-rollback`])).rows[0].count, '0');
    for (const [issuer, pkce] of [['https://accounts.google.com', null],
      ['https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0', null], [appleIssuer, verifier]] as const) {
      await rejected('INSERT INTO qmenux_identity.login_attempts(state_hash,browser_hash,verifier,nonce,issuer) VALUES ($1,$1,$2,$3,$4)',
        [secretHash(secret()), pkce, nonce, issuer], '23514');
    }
    await rejected('INSERT INTO qmenux_identity.external_identities(issuer,subject,user_id) VALUES ($1,$2,$3)', ['https://evil.invalid', subject, google], '23514');
    for (const table of ['users','external_identities','login_attempts','sessions']) {
      const c = await database.begin();
      try { await assert.rejects(c.query(`SELECT * FROM qmenux_identity.${table}`), (e: { code: string }) => e.code === '42501'); }
      finally { await c.query('ROLLBACK'); c.release(); }
    }
    await owner.query('DELETE FROM qmenux_identity.sessions WHERE user_id=$1', [concurrent[0]]);
    await owner.query('DELETE FROM qmenux_identity.external_identities WHERE user_id=$1', [concurrent[0]]);
    await owner.query('DELETE FROM qmenux_identity.users WHERE id=$1', [concurrent[0]]);
    if (hasAdmin) await assert.rejects(migrate('down'), (e: { code: string }) => e.code === 'P0001');
    else await migrate('down');
    assert.deepEqual(await store.readSession(googleToken), { id: google, status: 'REGISTERED' }, 'Down preserves existing Google identity/session');
    assert.deepEqual(await store.readSession(microsoftToken), { id: microsoft, status: 'REGISTERED' }, 'Down preserves existing Microsoft identity/session');
    assert.equal(await store.createMicrosoftSession(subject, secret()), microsoft);
    if (!hasAdmin) await migrate('up');
  } finally {
    const created = (await owner.query('SELECT user_id FROM qmenux_identity.external_identities WHERE subject=$1', [subject])).rows.map((r: { user_id: string }) => r.user_id);
    ids.push(...created);
    await owner.query('DELETE FROM qmenux_identity.login_attempts WHERE state_hash=ANY($1::text[])', [[secretHash(state),secretHash(googleState),secretHash(microsoftState),secretHash(expiry)]]);
    await owner.query('DELETE FROM qmenux_identity.sessions WHERE user_id=ANY($1::uuid[])', [ids]);
    await owner.query('DELETE FROM qmenux_identity.external_identities WHERE user_id=ANY($1::uuid[])', [ids]);
    await owner.query('DELETE FROM qmenux_identity.users WHERE id=ANY($1::uuid[])', [ids]);
  }
}
