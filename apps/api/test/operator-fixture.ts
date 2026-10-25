import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import type { Client } from 'pg';
import { Database } from '../src/database.js';
import { IdentityStore, secretHash } from '../src/identity-store.js';
import { OperatorAccess } from '../src/operator-access.js';
import { OperatorAuthorization, type OperatorMfaPolicy } from '../src/operator-authorization.js';

// Synthetic Access + MFA policy only; no app controller imports this fixture.
export async function exerciseOperators(database: Database, owner: Client): Promise<void> {
  const env = { ...process.env };
  const originalFetch = globalThis.fetch;
  const issuer = 'https://synthetic-operator.cloudflareaccess.com';
  const subject = 'qmenux-operator-fixture';
  const audience = 'c'.repeat(64);
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const assertion = (changes: Record<string, unknown> = {}) => {
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT', kid: 'operator' })}.${encode({
      iss: issuer, sub: subject, aud: [audience], type: 'app', exp: now + 900, iat: now, nbf: now, ...changes })}`;
    return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`;
  };
  globalThis.fetch = async (url) => {
    assert.equal(String(url), `${issuer}/cdn-cgi/access/certs`);
    return Response.json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'operator', alg: 'RS256', use: 'sig' }] });
  };
  process.env.OPERATOR_ACCESS_ENABLED = 'true';
  process.env.OPERATOR_ACCESS_ISSUER = issuer;
  process.env.OPERATOR_ACCESS_AUDIENCE = audience;
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  const access = new OperatorAccess();
  const authorization = new OperatorAuthorization(access, database);
  const identities = new IdentityStore(database);
  const secret = () => randomBytes(32).toString('base64url');
  const denied = (error: { getStatus?: () => number }) => error.getStatus?.() === 403;
  const unavailable = (error: { getStatus?: () => number }) => error.getStatus?.() === 503;
  const mfa: OperatorMfaPolicy = async (identity) => identity.issuer === issuer && identity.subject === subject && identity.audience === audience;
  const run = <T>(token: unknown, work: (client: import('pg').PoolClient, operator: import('../src/operator-authorization.js').AuthorizedOperator) => Promise<T>) =>
    authorization.run(assertion(), token, 'platform:read', mfa, work);
  let worked = false;
  const work = async () => { worked = true; return true; };
  try {
    await assert.rejects(authorization.signIn(assertion(), mfa), denied);
    const { rows } = await owner.query<{ id: string }>(
      "INSERT INTO qmenux_operator.operators(issuer,subject,role) VALUES ($1,$2,'PLATFORM_ADMIN') RETURNING id", [issuer, subject]);
    const id = rows[0]!.id;
    assert.equal((await owner.query('SELECT status FROM qmenux_operator.operators WHERE id=$1', [id])).rows[0].status, 'PENDING');
    await assert.rejects(authorization.signIn(assertion(), mfa), denied);
    await owner.query("UPDATE qmenux_operator.operators SET status='ACTIVE' WHERE id=$1", [id]);
    for (const policy of [undefined, false, async () => false, async () => 'true']) {
      await assert.rejects(authorization.signIn(assertion(), policy as OperatorMfaPolicy), denied);
    }
    await assert.rejects(authorization.signIn(assertion(), async () => { throw new Error('Private MFA failure'); }), unavailable);
    await assert.rejects(authorization.signIn(assertion(), mfa, 'bad'), denied);
    await assert.rejects(authorization.signIn(assertion({ aud: ['d'.repeat(64)] }), mfa));
    let token = await authorization.signIn(assertion(), mfa);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    const stored = (await owner.query('SELECT token_hash,expires_at > now() AND expires_at <= now()+interval \'15 minutes\' AS bounded FROM qmenux_operator.sessions')).rows;
    assert.deepEqual(stored, [{ token_hash: secretHash(token), bounded: true }]);
    assert.deepEqual(await run(token, async (_client, operator) => { assert(Object.isFrozen(operator)); return operator; }), { id, role: 'PLATFORM_ADMIN' });
    for (const invalid of [undefined, '', [], 'bad', secret()]) await assert.rejects(run(invalid, work), denied);
    for (const permission of ['license:grant', 'tenant:approve', 'catalog:write', 'toString', undefined]) {
      await assert.rejects(authorization.run(assertion(), token, permission as never, mfa, work), denied);
    }
    await assert.rejects(authorization.run(assertion(), token, 'platform:read', async () => false, work), denied);
    for (const changes of [{ sub: 'different-operator' }, { iss: 'https://different.cloudflareaccess.com' }]) {
      await assert.rejects(authorization.run(assertion(changes), token, 'platform:read', async () => true, work));
    }
    process.env.OPERATOR_ACCESS_AUDIENCE = 'd'.repeat(64);
    await assert.rejects(authorization.run(assertion({ aud: ['d'.repeat(64)] }), token, 'platform:read', async () => true, work), denied);
    process.env.OPERATOR_ACCESS_AUDIENCE = audience;
    assert.equal(worked, false);
    const tenantToken = secret();
    const uid = await identities.createSession('qmenux-operator-tenant-only', tenantToken); assert(uid);
    await assert.rejects(run(tenantToken, work), denied);
    assert.equal(await identities.readSession(token), undefined, 'Operator token cannot become a tenant identity');
    await identities.revokeSession(token);
    assert.equal(await run(token, async () => true), true, 'Tenant logout cannot revoke operator session');
    await owner.query("INSERT INTO qmenux_operator.operators(issuer,subject,role,status) VALUES ($1,$2,'PLATFORM_ADMIN','ACTIVE')", [issuer, `${subject}-other`]);
    const foreignToken = await authorization.signIn(assertion({ sub: `${subject}-other` }), async () => true, token);
    assert.equal(await run(token, async () => true), true, 'Another operator cannot rotate away this session');
    await assert.rejects(run(foreignToken, work), denied);
    await authorization.signOut(assertion({ sub: `${subject}-other` }), foreignToken);
    const rotated = await authorization.signIn(assertion(), mfa, token);
    await assert.rejects(run(token, work), denied); token = rotated;

    const client = await database.begin();
    try {
      for (const table of ['operators', 'sessions']) {
        for (const sql of [`SELECT * FROM qmenux_operator.${table}`, `DELETE FROM qmenux_operator.${table}`,
          `UPDATE qmenux_operator.${table} SET ${table === 'operators' ? "status='ACTIVE'" : 'expires_at=now()'}`]) {
          await client.query('SAVEPOINT restricted');
          await assert.rejects(client.query(sql), (error: { code: string }) => error.code === '42501');
          await client.query('ROLLBACK TO SAVEPOINT restricted');
        }
      }
      await client.query('ROLLBACK');
    } finally { client.release(); }
    for (const table of ['operators', 'sessions']) {
      const grants = (await owner.query(`SELECT has_table_privilege('qmenux_runtime',$1,'SELECT,INSERT,UPDATE,DELETE') AS allowed`, [`qmenux_operator.${table}`])).rows;
      assert.deepEqual(grants, [{ allowed: false }]);
    }
    const privileges = await owner.query(`SELECT p.proname,p.prosecdef,p.proconfig,
      has_function_privilege('qmenux_runtime',p.oid,'EXECUTE') AS runtime,
      EXISTS (SELECT FROM aclexplode(p.proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS public
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='qmenux_operator'`);
    const hasExpiry = (await owner.query("SELECT EXISTS (SELECT FROM qmenux.schema_migrations WHERE version='0006_auth_expiry') AS present")).rows[0].present;
    assert.equal(privileges.rowCount, hasExpiry ? 5 : 4);
    for (const row of privileges.rows) {
      assert.equal(row.prosecdef, true); assert.deepEqual(row.proconfig, ['search_path=pg_catalog, pg_temp']);
      assert.equal(row.public, false); assert.equal(row.runtime, row.proname !== 'revoke_changed_operator');
    }
    await owner.query('BEGIN');
    await assert.rejects(owner.query("UPDATE qmenux_operator.operators SET role='OWNER' WHERE id=$1", [id]), (e: { code: string }) => e.code === '23514');
    await owner.query('ROLLBACK');
    const rollbackToken = secret();
    await assert.rejects(run(token, async (c) => {
      await c.query('SELECT qmenux_operator.create_session($1,$2,$3,$4,NULL)', [issuer, subject, audience, secretHash(rollbackToken)]);
      throw new Error('Private transaction failure');
    }), unavailable);
    assert.equal((await owner.query('SELECT count(*) FROM qmenux_operator.sessions WHERE token_hash=$1', [secretHash(rollbackToken)])).rows[0].count, '0');
    const backends = new Set<number>();
    for (let i = 0; i < 20; i++) await run(token, async (c) => {
      const row = (await c.query("SELECT pg_backend_pid() AS pid,NULLIF(current_setting('app.tenant_id',true),'') AS tenant")).rows[0];
      assert.equal(row.tenant, null); backends.add(row.pid);
      assert.equal((await c.query('SELECT count(*) FROM qmenux.products')).rows[0].count, '0', 'Platform role never bypasses tenant RLS');
    });
    assert.equal(backends.size, 1);
    assert.deepEqual(await Promise.all(Array.from({ length: 20 }, () => run(token, async () => true))), Array(20).fill(true));
    await owner.query("UPDATE qmenux_operator.sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [secretHash(token)]);
    await assert.rejects(run(token, work), denied);
    token = await authorization.signIn(assertion(), mfa);
    await owner.query("UPDATE qmenux_operator.operators SET status='SUSPENDED' WHERE id=$1", [id]);
    await assert.rejects(run(token, work), denied);
    await assert.rejects(authorization.signIn(assertion(), mfa), denied);
    await owner.query("UPDATE qmenux_operator.operators SET status='ACTIVE' WHERE id=$1", [id]);
    await assert.rejects(run(token, work), denied, 'Restoring operator must not revive old sessions');
    token = await authorization.signIn(assertion(), mfa);
    await authorization.signOut(assertion({ sub: 'different-operator' }), token);
    assert.equal(await run(token, async () => true), true, 'Foreign identity cannot revoke session');
    await authorization.signOut(assertion(), token);
    await assert.rejects(run(token, work), denied);
    assert.equal(worked, false);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name];
    Object.assign(process.env, env);
  }
}
