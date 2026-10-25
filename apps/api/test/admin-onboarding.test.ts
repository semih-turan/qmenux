import 'reflect-metadata';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { Module } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import { AdminAuthErrors } from '../src/admin-auth.controller.js';
import { AdminOnboardingController } from '../src/admin-onboarding.controller.js';
import { Database } from '../src/database.js';
import { OnboardingApplications } from '../src/onboarding-applications.js';

test('onboarding HTTP denies disabled/malformed/cross-purpose authority before storage and sanitizes failures', async () => {
  const env = { ...process.env }, key = 'o'.repeat(43), session = 's'.repeat(43), csrf = 'c'.repeat(43);
  let calls = 0;
  const applications = new OnboardingApplications({ begin: async () => { calls++; throw new Error('Private database/credential diagnostic'); } } as unknown as Database);
  @Module({ controllers: [AdminOnboardingController], providers: [
    { provide: APP_FILTER, useClass: AdminAuthErrors }, { provide: OnboardingApplications, useValue: applications },
  ] })
  class FixtureModule {}
  const app = await NestFactory.create(FixtureModule, { logger: false, rawBody: true });
  app.setGlobalPrefix('v1'); await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  const send = (path = 'list', body: string | Buffer = JSON.stringify({ session }), headers: Record<string,string | string[]> = {}, method = 'POST') =>
    new Promise<{ status: number; body: unknown; cache?: string; cookie?: string[]; allow?: string }>((resolve, reject) => {
      const req = request(`${origin}/v1/internal/admin-onboarding/${path}`, { method, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', ...headers } }, res => {
        let raw = ''; res.setEncoding('utf8'); res.on('data', chunk => { raw += chunk; });
        res.on('end', () => { try { resolve({ status: res.statusCode!, body: raw ? JSON.parse(raw) : undefined, cache: res.headers['cache-control'], cookie: res.headers['set-cookie'], allow: res.headers.allow }); } catch (error) { reject(error); } });
      });
      req.on('error', reject); req.setTimeout(5000, () => req.destroy(new Error('Application boundary deadline'))); req.end(body);
    });
  try {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED; delete process.env.VERCEL_ENV;
    for (const flag of [undefined,'false','TRUE']) {
      if (flag === undefined) delete process.env.ADMIN_ONBOARDING_ENABLED; else process.env.ADMIN_ONBOARDING_ENABLED = flag;
      assert.equal((await send()).status, 503);
    }
    process.env.ADMIN_ONBOARDING_ENABLED = 'true';
    for (const invalid of [undefined,'short','é'.repeat(43)]) {
      if (invalid === undefined) delete process.env.ADMIN_ONBOARDING_SECRET; else process.env.ADMIN_ONBOARDING_SECRET = invalid;
      assert.equal((await send()).status, 503);
    }
    process.env.ADMIN_ONBOARDING_SECRET = key;
    process.env.VERCEL_ENV = 'preview'; assert.equal((await send()).status, 503); delete process.env.VERCEL_ENV;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; assert.equal((await send()).status, 503); delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.ADMIN_BFF_SECRET = key; assert.equal((await send()).status, 503);
    process.env.ADMIN_BFF_SECRET = 'a'.repeat(43);
    const invalidHeaders: Record<string,string | string[]>[] = [{ authorization: '' }, { authorization: `Bearer ${process.env.ADMIN_BFF_SECRET}` }, { authorization: [`Bearer ${key}`,`Bearer ${key}`] },
      { authorization: '', cookie: `__Host-qmenux_admin_session=${session}`, 'x-forwarded-authorization': `Bearer ${key}` }];
    for (const headers of invalidHeaders) {
      assert.equal((await send('list', undefined, headers)).status, 401);
    }
    for (const body of ['{}','[]','null','{','{"session":1}',`{"session":"${session}","session":"${session}"}`,
      `{"sess\\u0069on":"${session}","session":"${session}"}`, JSON.stringify({ session, nested: {} }),
      JSON.stringify({ session, applicantId: 'selected' }), JSON.stringify({ session, limit: '20' }), JSON.stringify({ session, limit: -1 }),
      JSON.stringify({ session, after: 'invalid' }), JSON.stringify({ session: 'x'.repeat(8200) })]) {
      const res = await send('list', body); assert.equal(res.status, 400); assert.equal(res.cache, 'no-store');
      assert.deepEqual(res.body, { status: 'invalid_request' });
    }
    for (const path of ['drafts','drafts/00000000-0000-4000-8000-000000000001/edit','drafts/00000000-0000-4000-8000-000000000001/submit']) {
      assert.equal((await send(path, JSON.stringify({ session, csrf, revision: '1' }))).status, 400);
      assert.equal((await send(path, JSON.stringify({ session, csrf, status: 'APPROVED' }))).status, 400);
    }
    assert.equal((await send('drafts', JSON.stringify({ session, csrf, name: '', idempotencyKey: '00000000-0000-4000-8000-000000000001' }))).status, 400);
    const encoded = Buffer.from(JSON.stringify({ session, csrf, name: 'placeholder', idempotencyKey: '00000000-0000-4000-8000-000000000001' }));
    const offset = encoded.indexOf('placeholder');
    const invalidUtf8 = Buffer.concat([encoded.subarray(0,offset),Buffer.from([0xc3,0x28]),encoded.subarray(offset+'placeholder'.length)]);
    assert.equal((await send('drafts', invalidUtf8)).status, 400);
    assert.equal((await send('list?applicant=selected')).status, 400);
    assert.equal((await send('list', undefined, { 'content-type': 'text/plain' })).status, 400);
    assert.equal((await send('list', undefined, { 'content-encoding': 'identity' })).status, 400);
    const oversized = await send('list', JSON.stringify({ session: 'x'.repeat(110000) }));
    assert.equal(oversized.status, 413); assert.equal(oversized.cache, 'no-store'); assert.deepEqual(oversized.body, { status: 'invalid_request' });
    for (const path of ['list','drafts','drafts/00000000-0000-4000-8000-000000000001/edit','drafts/00000000-0000-4000-8000-000000000001/submit']) {
      for (const method of ['GET','HEAD','OPTIONS','PATCH','DELETE']) {
        const res = await send(path, '', {}, method); assert.equal(res.status, 405); assert.equal(res.allow, 'POST'); assert.equal(res.cache, 'no-store');
      }
    }
    assert.equal(calls, 0);
    const failure = await send(); assert.equal(failure.status, 500); assert.equal(failure.cache, 'no-store');
    assert.deepEqual(failure.body, { status: 'invalid_request' }); assert.equal(failure.cookie, undefined); assert.equal(calls, 1);
  } finally {
    await app.close();
    for (const name of ['ADMIN_ONBOARDING_ENABLED','ADMIN_ONBOARDING_SECRET','ADMIN_BFF_SECRET','VERCEL_ENV','NODE_TLS_REJECT_UNAUTHORIZED']) {
      if (env[name] === undefined) delete process.env[name]; else process.env[name] = env[name];
    }
  }
});
