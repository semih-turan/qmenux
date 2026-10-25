import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Client } from 'pg';
import { cleanupExpiredAuth } from '../src/auth-maintenance.js';
import { Database } from '../src/database.js';
import { secretHash } from '../src/identity-store.js';

// Private synthetic fixture; never imported by an HTTP controller.
export async function exerciseAuthExpiry(database: Database, owner: Client): Promise<void> {
  const uid = 'f6000000-0000-4000-8000-000000000001';
  const oid = 'f6000000-0000-4000-8000-000000000002';
  const hashes = (kind: string) => Array.from({ length: 107 }, (_, i) => secretHash(`qmenux-expiry-${kind}-${i}`));
  const attempts = hashes('attempt'), sessions = hashes('session'), operators = hashes('operator');
  const sql = (side: string) => readFileSync(new URL(`../../../../infrastructure/database/migrations/0006_auth_expiry.${side}.sql`, import.meta.url), 'utf8');
  const protectedCounts = async () => (await owner.query(`SELECT
    (SELECT count(*) FROM qmenux_identity.users) AS users,
    (SELECT count(*) FROM qmenux_identity.memberships) AS memberships,
    (SELECT count(*) FROM qmenux_operator.operators) AS operators,
    (SELECT count(*) FROM qmenux.tenants) AS tenants,
    (SELECT count(*) FROM qmenux.products) AS products`)).rows[0];
  const baseline = await protectedCounts();
  await cleanupExpiredAuth(database); await cleanupExpiredAuth(database);
  const counts = async () => (await owner.query(`SELECT
    (SELECT count(*) FROM qmenux_identity.login_attempts WHERE state_hash=ANY($1::text[])) AS attempts,
    (SELECT count(*) FROM qmenux_identity.sessions WHERE user_id=$2) AS sessions,
    (SELECT count(*) FROM qmenux_operator.sessions WHERE operator_id=$3) AS operators`, [attempts, uid, oid])).rows[0];
  const purge = async (client: import('pg').PoolClient) => (await client.query(
    'SELECT qmenux_identity.cleanup_expired() AS identity,qmenux_operator.cleanup_expired() AS operator')).rows[0];
  try {
    await owner.query('INSERT INTO qmenux_identity.users(id) VALUES ($1)', [uid]);
    await owner.query("INSERT INTO qmenux_operator.operators(id,issuer,subject,role) VALUES ($1,'https://synthetic-expiry.cloudflareaccess.com','expiry-fixture','PLATFORM_ADMIN')", [oid]);
    await owner.query(`INSERT INTO qmenux_identity.login_attempts(state_hash,browser_hash,verifier,nonce,expires_at)
      SELECT h,$2,$3,$3,CASE WHEN n<=105 THEN now()-interval '1 minute' ELSE now()+interval '1 day' END
      FROM unnest($1::text[]) WITH ORDINALITY AS x(h,n)`, [attempts, secretHash('synthetic-browser'), 'a'.repeat(43)]);
    for (const [table, field, id, tokens] of [
      ['qmenux_identity.sessions', 'user_id', uid, sessions], ['qmenux_operator.sessions', 'operator_id', oid, operators],
    ] as const) {
      await owner.query(`INSERT INTO ${table}(token_hash,${field},${field === 'operator_id' ? 'audience,' : ''}expires_at)
        SELECT h,$2,${field === 'operator_id' ? "repeat('a',64)," : ''}
        CASE WHEN n<=105 THEN now()-interval '1 minute' ELSE now()+interval '1 day' END
        FROM unnest($1::text[]) WITH ORDINALITY AS x(h,n)`, [tokens, id]);
    }
    const preserved = await protectedCounts();
    const before = { attempts: '107', sessions: '107', operators: '107' };
    assert.deepEqual(await counts(), before);
    const client = await database.begin();
    try {
      assert.deepEqual(await purge(client), { identity: 200, operator: 100 });
      await client.query('ROLLBACK');
    } finally { client.release(); }
    assert.deepEqual(await counts(), before, 'Transaction rollback must restore purged rows');

    await owner.query('BEGIN');
    try {
      await owner.query('SELECT FROM qmenux_identity.login_attempts WHERE state_hash=$1 FOR UPDATE', [attempts[0]]);
      await owner.query('SELECT FROM qmenux_identity.sessions WHERE token_hash=$1 FOR UPDATE', [sessions[0]]);
      await owner.query('SELECT FROM qmenux_operator.sessions WHERE token_hash=$1 FOR UPDATE', [operators[0]]);
      assert.deepEqual(await cleanupExpiredAuth(database), { identity: 200, operator: 100 });
      assert.deepEqual(await counts(), { attempts: '7', sessions: '7', operators: '7' });
      assert.equal((await owner.query('SELECT count(*) FROM qmenux_identity.login_attempts WHERE state_hash=$1', [attempts[0]])).rows[0].count, '1');
    } finally { await owner.query('ROLLBACK'); }
    assert.deepEqual(await cleanupExpiredAuth(database), { identity: 10, operator: 5 });
    const live = { attempts: '2', sessions: '2', operators: '2' };
    assert.deepEqual(await counts(), live);
    assert.deepEqual(await protectedCounts(), preserved);
    assert.deepEqual(await cleanupExpiredAuth(database), { identity: 0, operator: 0 });

    // Two overlapping transactions must partition expired rows without waiting on each other.
    await owner.query("UPDATE qmenux_identity.login_attempts SET expires_at=now()-interval '1 minute' WHERE state_hash=ANY($1::text[])", [attempts.slice(105)]);
    const one = await database.begin();
    const two = await database.begin();
    try {
      const time = (await two.query('SELECT now()::text AS time')).rows[0].time;
      const boundary = secretHash('qmenux-expiry-boundary');
      await owner.query('INSERT INTO qmenux_identity.login_attempts(state_hash,browser_hash,verifier,nonce,expires_at) VALUES ($1,$1,$2,$2,$3)', [boundary, 'a'.repeat(43), time]);
      assert.deepEqual(await purge(one), { identity: 2, operator: 0 });
      assert.deepEqual(await purge(two), { identity: 1, operator: 0 }, 'Exact expiry boundary qualifies and locked rows are skipped');
      await one.query('COMMIT'); await two.query('COMMIT');
      assert.equal((await owner.query('SELECT count(*) FROM qmenux_identity.login_attempts WHERE state_hash=$1', [boundary])).rows[0].count, '0');
    } finally { await one.query('ROLLBACK'); await two.query('ROLLBACK'); one.release(); two.release(); }
    assert.deepEqual(await counts(), { attempts: '0', sessions: '2', operators: '2' });

    const grants = await owner.query(`SELECT p.prosecdef,p.proconfig,
      has_function_privilege('qmenux_runtime',p.oid,'EXECUTE') AS runtime,
      EXISTS (SELECT FROM aclexplode(p.proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS public
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('qmenux_identity','qmenux_operator') AND p.proname='cleanup_expired'`);
    assert.equal(grants.rowCount, 2);
    for (const row of grants.rows) assert.deepEqual(row, { prosecdef: true, proconfig: ['search_path=pg_catalog, pg_temp'], runtime: true, public: false });
    assert.equal((await owner.query(`SELECT count(*) FROM pg_indexes WHERE indexname IN
      ('login_attempts_expiry','identity_sessions_expiry','operator_sessions_expiry')`)).rows[0].count, '3');
    for (const table of ['qmenux_identity.login_attempts', 'qmenux_identity.sessions', 'qmenux_operator.sessions']) {
      assert.equal((await owner.query("SELECT has_table_privilege('qmenux_runtime',$1,'DELETE') AS allowed", [table])).rows[0].allowed, false);
    }

    const hasMicrosoft = (await owner.query("SELECT EXISTS (SELECT FROM qmenux.schema_migrations WHERE version='0007_microsoft_identity') AS present")).rows[0].present;
    if (hasMicrosoft) {
      await owner.query('BEGIN');
      await assert.rejects(owner.query(sql('down')), (e: { code: string }) => e.code === 'P0001');
      await owner.query('ROLLBACK');
    } else {
      await owner.query('BEGIN'); await owner.query(sql('down')); await owner.query('COMMIT');
      assert.deepEqual(await counts(), { attempts: '0', sessions: '2', operators: '2' }, 'Down must preserve live credentials');
      await assert.rejects(cleanupExpiredAuth(database), (error: { getResponse?: () => unknown }) =>
        JSON.stringify(error.getResponse?.()) === '{"status":"unavailable"}');
      await owner.query('BEGIN'); await owner.query(sql('up')); await owner.query('COMMIT');
    }
    assert.deepEqual(await cleanupExpiredAuth(database), { identity: 0, operator: 0 });
    assert.deepEqual(await protectedCounts(), preserved);
  } finally {
    await owner.query('ROLLBACK');
    await owner.query('BEGIN');
    await owner.query('DELETE FROM qmenux_identity.login_attempts WHERE state_hash=ANY($1::text[])', [[...attempts, secretHash('qmenux-expiry-boundary')]]);
    await owner.query('DELETE FROM qmenux_identity.sessions WHERE user_id=$1', [uid]);
    await owner.query('DELETE FROM qmenux_operator.sessions WHERE operator_id=$1', [oid]);
    await owner.query('DELETE FROM qmenux_identity.users WHERE id=$1', [uid]);
    await owner.query('DELETE FROM qmenux_operator.operators WHERE id=$1', [oid]);
    await owner.query('COMMIT');
    assert.deepEqual(await protectedCounts(), baseline);
  }
}
