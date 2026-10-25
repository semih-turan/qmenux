import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { request } from 'node:http';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Client } from 'pg';
import { AuthController, readSecretCookie } from '../src/auth.controller.js';
import { Database } from '../src/database.js';
import { GoogleOidc, googleIssuer } from '../src/google-oidc.js';
import { IdentityStore, secretHash } from '../src/identity-store.js';

// Private, signed provider simulation only; never imported by the application.
export async function exerciseAuth(database: Database, owner: Client): Promise<void> {
  const originalFetch = globalThis.fetch;
  const env = { ...process.env };
  process.env.AUTH_GOOGLE_ENABLED = 'true';
  process.env.AUTH_BASE_URL = 'https://qmenux-api.vercel.app';
  process.env.GOOGLE_CLIENT_ID = 'synthetic-client';
  process.env.GOOGLE_CLIENT_SECRET = 'synthetic-secret';
  const origin = process.env.AUTH_BASE_URL;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const attacker = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test', use: 'sig', alg: 'RS256' };
  const attempts = new Map<string, { nonce: string; challenge: string; claims?: Record<string, unknown>; badSignature?: boolean; noToken?: boolean }>();
  let exchanges = 0;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === `${googleIssuer}/.well-known/openid-configuration`) {
      return Response.json({ issuer: googleIssuer, authorization_endpoint: `${googleIssuer}/authorize`,
        token_endpoint: `${googleIssuer}/token`, jwks_uri: `${googleIssuer}/jwks`,
        response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'] });
    }
    if (url === `${googleIssuer}/jwks`) return Response.json({ keys: [jwk] });
    assert.equal(url, `${googleIssuer}/token`, 'No external provider requests allowed in tests');
    exchanges++;
    const body = new URLSearchParams(String(init?.body));
    const attempt = attempts.get(body.get('code')!);
    assert(attempt);
    assert.equal(body.get('grant_type'), 'authorization_code');
    assert.equal(body.get('redirect_uri'), `${origin}/v1/auth/google/callback`);
    assert.equal(body.get('client_id'), 'synthetic-client');
    assert.equal(body.get('client_secret'), 'synthetic-secret');
    assert.equal(createHash('sha256').update(body.get('code_verifier')!).digest('base64url'), attempt.challenge);
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'RS256', kid: 'test' })}.${encode({ iss: googleIssuer, sub: 'synthetic-google-subject',
      aud: 'synthetic-client', iat: now, exp: now + 60, nonce: attempt.nonce, ...attempt.claims })}`;
    const idToken = `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), attempt.badSignature ? attacker.privateKey : privateKey).toString('base64url')}`;
    return Response.json({ token_type: 'Bearer', access_token: 'synthetic-provider-access',
      ...(attempt.noToken ? {} : { id_token: idToken }) });
  };
  const store = new IdentityStore(database);
  @Module({ controllers: [AuthController], providers: [GoogleOidc, { provide: IdentityStore, useValue: store }] })
  class TestAuthModule {}
  const app = await NestFactory.create(TestAuthModule, { logger: false });
  app.setGlobalPrefix('v1');
  await app.listen(0, '127.0.0.1');
  const local = await app.getUrl();
  type Result = { status: number; cookies: string[]; location?: string; cache?: string; body: unknown };
  const send = (path: string, cookies = '', method = 'GET', headers: Record<string, string> = {}) =>
    new Promise<Result>((resolve, reject) => {
      const req = request(`${local}/v1/auth/${path}`, { method, headers: { host: new URL(origin).host, cookie: cookies, ...headers } }, res => {
        let text = ''; res.setEncoding('utf8'); res.on('data', chunk => { text += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode!, cookies: res.headers['set-cookie'] ?? [], location: res.headers.location,
            cache: res.headers['cache-control'], body: text ? JSON.parse(text) : null }); } catch (e) { reject(e); }
        });
      });
      req.on('error', reject); req.setTimeout(5000, () => req.destroy(new Error('Auth HTTP test deadline'))); req.end();
    });
  let count = 0;
  const start = async (changes: Partial<NonNullable<ReturnType<typeof attempts.get>>> = {}) => {
    const response = await send('google/start?returnTo=https://evil.invalid/');
    assert.equal(response.status, 302); assert.equal(response.cache, 'no-store');
    const url = new URL(response.location!);
    assert.equal(url.origin, googleIssuer); assert.equal(url.searchParams.get('scope'), 'openid');
    assert.equal(url.searchParams.get('response_type'), 'code'); assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('redirect_uri'), `${origin}/v1/auth/google/callback`);
    const code = `synthetic-code-${++count}`;
    attempts.set(code, { nonce: url.searchParams.get('nonce')!, challenge: url.searchParams.get('code_challenge')!, ...changes });
    const cookie = response.cookies[0]!.split(';')[0]!;
    assert.match(response.cookies[0]!, /Secure; HttpOnly; SameSite=Lax; Max-Age=300$/);
    assert(!response.cookies[0]!.includes('Domain='));
    return { path: `google/callback?code=${code}&state=${url.searchParams.get('state')}`, cookie,
      state: url.searchParams.get('state')! };
  };
  try {
    const malformedCookie = '__Host-qmenux_session';
    assert.equal(readSecretCookie(`${malformedCookie}=bad`, malformedCookie), undefined);
    assert.equal(readSecretCookie(`${malformedCookie}=${'a'.repeat(43)}; ${malformedCookie}=${'b'.repeat(43)}`, malformedCookie), undefined);
    process.env.AUTH_GOOGLE_ENABLED = 'false';
    assert.equal((await send('google/start')).status, 503);
    assert.equal((await send('google/callback?code=x&state=x')).status, 503);
    assert.equal(exchanges, 0);
    process.env.AUTH_GOOGLE_ENABLED = 'true';
    assert.equal((await send('google/start', '', 'GET', { host: 'superman.qmenux.com', 'x-forwarded-host': new URL(origin).host })).status, 401);
    const metadata = await send('providers');
    assert.equal(metadata.status, 200);
    assert.deepEqual(metadata.body, { providers: [{ id: 'google', enabled: true }, { id: 'microsoft', enabled: false }, { id: 'apple', enabled: false }] });

    const first = await start();
    const before = exchanges;
    assert.equal((await send(first.path)).status, 401);
    assert.equal((await send(first.path, first.cookie.replace(/=.+/, `=${'z'.repeat(43)}`))).status, 401);
    assert.equal((await send(`${first.path}&state=duplicate`, first.cookie)).status, 401);
    assert.equal((await send(first.path.replace(first.state, 'z'.repeat(43)), first.cookie)).status, 401);
    assert.equal(exchanges, before);
    const signedIn = await send(first.path, first.cookie);
    assert.equal(signedIn.status, 200); assert.equal(signedIn.cache, 'no-store');
    assert.equal((signedIn.body as { tenantAccess: boolean }).tenantAccess, false);
    const session = signedIn.cookies.find(c => c.startsWith('__Host-qmenux_session='))!;
    assert.match(session, /Secure; HttpOnly; SameSite=Lax; Max-Age=3600$/); assert(!session.includes('Domain='));
    const sessionCookie = session.split(';')[0]!;
    const token = readSecretCookie(sessionCookie, '__Host-qmenux_session')!;
    assert.equal((await owner.query('SELECT token_hash FROM qmenux_identity.sessions')).rows[0].token_hash, secretHash(token));
    assert(!JSON.stringify(signedIn.body).includes('synthetic-provider'));
    assert.equal((await send('me', sessionCookie)).status, 200);
    assert.equal((await send(first.path, first.cookie)).status, 401);
    assert.equal(exchanges, before + 1);

    for (const changes of [{ claims: { iss: 'https://evil.invalid' } }, { claims: { aud: 'other-client' } },
      { claims: { exp: 1 } }, { claims: { nonce: 'wrong' } }, { badSignature: true }, { noToken: true }]) {
      const attempt = await start(changes);
      assert.equal((await send(attempt.path, attempt.cookie)).status, 401, JSON.stringify(changes));
      assert.equal((await send(attempt.path, attempt.cookie)).status, 401);
    }
    const expired = await start();
    await owner.query("UPDATE qmenux_identity.login_attempts SET expires_at=now()-interval '1 minute' WHERE state_hash=$1", [secretHash(expired.state)]);
    assert.equal((await send(expired.path, expired.cookie)).status, 401);
    const cancel = await start();
    assert.equal((await send(`google/callback?error=access_denied&state=${cancel.state}`, cancel.cookie)).status, 401);
    assert.equal((await send(cancel.path, cancel.cookie)).status, 401);

    const rotation = await start();
    const rotated = await send(rotation.path, `${rotation.cookie}; ${sessionCookie}`);
    assert.equal(rotated.status, 200);
    assert.equal((await send('me', sessionCookie)).status, 401);
    assert.equal((await owner.query('SELECT count(*) FROM qmenux_identity.users')).rows[0].count, '1');
    const current = rotated.cookies.find(c => c.startsWith('__Host-qmenux_session='))!.split(';')[0]!;
    assert.equal((await send('logout', current, 'POST', { origin: 'https://evil.invalid' })).status, 401);
    assert.equal((await send('logout', current, 'POST')).status, 401);
    assert.equal((await send('me', current)).status, 200);
    assert.equal((await send('logout', current, 'POST', { origin })).status, 200);
    assert.equal((await send('me', current)).status, 401);

    const suspended = await start();
    await owner.query("UPDATE qmenux_identity.users SET status='SUSPENDED'");
    assert.equal((await send(suspended.path, suspended.cookie)).status, 401);
    await owner.query("UPDATE qmenux_identity.users SET status='REGISTERED'");
    const expiry = await start();
    const expSession = (await send(expiry.path, expiry.cookie)).cookies.find(c => c.startsWith('__Host-qmenux_session='))!.split(';')[0]!;
    await owner.query("UPDATE qmenux_identity.sessions SET expires_at=now()-interval '1 minute'");
    assert.equal((await send('me', expSession)).status, 401);
    const pkce = await start();
    await owner.query('UPDATE qmenux_identity.login_attempts SET verifier=$1 WHERE state_hash=$2', ['z'.repeat(43), secretHash(pkce.state)]);
    assert.equal((await send(pkce.path, pkce.cookie)).status, 401);
    const race = await start();
    const callbacks = await Promise.all([send(race.path, race.cookie), send(race.path, race.cookie)]);
    assert.deepEqual(callbacks.map(r => r.status).sort(), [200,401]);
    for (const query of ['SELECT * FROM qmenux_identity.users', 'SELECT * FROM qmenux_identity.sessions',
      "UPDATE qmenux_identity.users SET status='REGISTERED'"]) {
      // Runtime cannot enumerate identities/sessions or change user status.
      const c = await database.begin();
      try { await assert.rejects(c.query(query), (e: { code: string }) => e.code === '42501'); }
      finally { await c.query('ROLLBACK'); c.release(); }
    }
    const privileges = await owner.query(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='qmenux_identity' AND p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp']
      AND has_function_privilege('qmenux_runtime',p.oid,'EXECUTE')
      AND NOT EXISTS (SELECT FROM aclexplode(p.proacl) WHERE grantee=0 AND privilege_type='EXECUTE')`);
    assert.equal(privileges.rows[0].count,'5');
    assert.equal((await owner.query('SELECT count(*) FROM qmenux.tenants')).rows[0].count, '3');
  } finally {
    await app.close(); globalThis.fetch = originalFetch;
    for (const key of ['AUTH_GOOGLE_ENABLED','AUTH_BASE_URL','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET']) {
      if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key];
    }
  }
}
