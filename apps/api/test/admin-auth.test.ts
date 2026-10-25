import 'reflect-metadata';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { Module } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import { AdminAuthController, AdminAuthErrors } from '../src/admin-auth.controller.js';
import { GoogleOidc } from '../src/google-oidc.js';
import { MicrosoftOidc } from '../src/microsoft-oidc.js';
import { AppleOidc } from '../src/apple-oidc.js';
import { IdentityStore } from '../src/identity-store.js';
import { authOrigin, oidcCallback, type AuthApp } from '../src/oidc-callback.js';

test('admin machine boundary rejects malformed authority and input before any provider or DB work', async () => {
  const env = { ...process.env }, key = 'k'.repeat(43), token = 't'.repeat(43);
  let calls = 0;
  const provider = { start: async () => { calls++; throw new Error('Unexpected provider access'); } };
  const store = { readAdminSession: async (value: string) => {
    calls++; assert.equal(value, token); return { id: '00000000-0000-4000-8000-000000000001', status: 'REGISTERED' };
  } };
  @Module({ controllers: [AdminAuthController], providers: [{ provide: APP_FILTER, useClass: AdminAuthErrors },
    { provide: GoogleOidc, useValue: provider }, { provide: MicrosoftOidc, useValue: provider },
    { provide: AppleOidc, useValue: provider }, { provide: IdentityStore, useValue: store },
  ] })
  class FixtureModule {}
  const app = await NestFactory.create(FixtureModule, { logger: false, rawBody: true });
  app.setGlobalPrefix('v1'); await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  const send = (path = 'me', body = JSON.stringify({ session: token }),
    headers: Record<string, string | string[]> = {}, method = 'POST') =>
    new Promise<{ status: number; body: unknown; cache?: string; cookie?: string[] }>((resolve, reject) => {
      const req = request(`${origin}/v1/internal/admin-auth/${path}`, { method, headers: {
        authorization: `Bearer ${key}`, 'content-type': 'application/json', ...headers,
      } }, res => {
        let raw = ''; res.setEncoding('utf8'); res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode!, body: raw ? JSON.parse(raw) : undefined,
            cache: res.headers['cache-control'], cookie: res.headers['set-cookie'] }); } catch (error) { reject(error); }
        });
      });
      req.on('error', reject); req.setTimeout(5000, () => req.destroy(new Error('Admin boundary deadline'))); req.end(body);
    });
  try {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    for (const value of [undefined, '', 'short', 'é'.repeat(43), 'x'.repeat(44)]) {
      if (value === undefined) delete process.env.ADMIN_BFF_SECRET; else process.env.ADMIN_BFF_SECRET = value;
      const result = await send(); assert.equal(result.status, 503); assert.equal(result.cache, 'no-store');
      assert.deepEqual(result.body, { status: 'unavailable' });
    }
    process.env.ADMIN_BFF_SECRET = key;
    const invalidHeaders: Record<string, string | string[]>[] = [{ authorization: '' }, { authorization: `bearer ${key}` }, { authorization: `Bearer ${token}` },
      { authorization: [`Bearer ${key}`, `Bearer ${key}`] },
      { authorization: '', cookie: `__Host-qmenux_admin_session=${key}`, 'x-forwarded-authorization': `Bearer ${key}` }];
    for (const headers of invalidHeaders) {
      assert.equal((await send('me', undefined, headers)).status, 401);
    }
    for (const body of ['{}', '[]', 'null', '"string"', '{', '{"session":null}', '{"session":1}',
      JSON.stringify({ session: 'short' }), JSON.stringify({ session: token, audience: 'api' }),
      `{"session":"wrong","session":"${token}"}`, `{"sess\\u0069on":"wrong","session":"${token}"}`,
      JSON.stringify({ session: `${token}\n` }), JSON.stringify({ session: 's'.repeat(8200) }),
      JSON.stringify({ session: token, nested: { session: token } }), '{"session":"synthetic-private" trailing}']) {
      const result = await send('me', body);
      assert.equal(result.status, 400, body.slice(0, 80)); assert.equal(result.cache, 'no-store');
      assert.deepEqual(result.body, { status: 'invalid_request' });
    }
    const oversized = await send('me', JSON.stringify({ session: 'x'.repeat(110000) }));
    assert.equal(oversized.status, 413); assert.equal(oversized.cache, 'no-store');
    assert.deepEqual(oversized.body, { status: 'invalid_request' });
    assert.equal((await send('me', undefined, { 'content-type': 'text/plain' })).status, 400);
    assert.equal((await send('me', undefined, { 'content-encoding': 'identity' })).status, 400);
    assert.equal((await send('me?session=ignored')).status, 400);
    for (const method of ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']) {
      const denied = await send('me', '', {}, method);
      assert.equal(denied.status, 405, method); assert.equal(denied.cache, 'no-store');
    }
    assert.equal((await send('other/start', JSON.stringify({ browser: token }))).status, 400);
    for (const p of ['google', 'microsoft', 'apple']) {
      process.env[`AUTH_${p.toUpperCase()}_ENABLED`] = 'false';
      assert.equal((await send(`${p}/start`, JSON.stringify({ browser: token }))).status, 503);
      assert.equal((await send(`${p}/finish`, JSON.stringify({ browser: token, state: token, code: 'synthetic' }))).status, 503);
      for (const extra of [{}, { code: 'x', error: 'access_denied' }, { error: 'private diagnostic' },
        { code: 'x', callback: 'https://evil.invalid' }, { code: 'x', previousSession: 'bad' }, { code: 'x', id_token: 'injected' }]) {
        assert.equal((await send(`${p}/finish`, JSON.stringify({ browser: token, state: token, ...extra }))).status, 400);
      }
    }
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; assert.equal((await send()).status, 503);
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    assert.equal(calls, 0, 'All denied cases precede provider/DB access');
    const success = await send(); assert.equal(success.status, 200); assert.equal(success.cache, 'no-store');
    assert.equal(success.cookie, undefined);
    assert.deepEqual(success.body, { user: { id: '00000000-0000-4000-8000-000000000001', status: 'REGISTERED' }, tenantAccess: false });
    process.env.ADMIN_BFF_SECRET = token;
    assert.equal((await send()).status, 401); assert.equal(calls, 1);
    for (const p of ['google','microsoft','apple'] as const) {
      assert.equal(oidcCallback(p, 'admin'), `https://admin.qmenux.com/api/auth/${p}/callback`);
    }
    assert.throws(() => oidcCallback('google', 'evil' as AuthApp));
    process.env.AUTH_BASE_URL = 'https://admin.qmenux.com'; assert.equal(authOrigin(), undefined);
    assert.throws(() => oidcCallback('google', 'api'));
  } finally {
    await app.close();
    for (const name of ['ADMIN_BFF_SECRET','NODE_TLS_REJECT_UNAUTHORIZED','AUTH_BASE_URL',
      'AUTH_GOOGLE_ENABLED','AUTH_MICROSOFT_ENABLED','AUTH_APPLE_ENABLED']) {
      if (env[name] === undefined) delete process.env[name]; else process.env[name] = env[name];
    }
  }
});
