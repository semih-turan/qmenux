import 'reflect-metadata';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AuthMaintenanceController } from '../src/auth-maintenance.controller.js';
import { Database } from '../src/database.js';

test('maintenance HTTP requires a dedicated bearer before DB access and masks failures', async () => {
  const original = process.env.CRON_SECRET;
  const secret = 's'.repeat(43);
  let calls = 0, commits = 0, rollbacks = 0, released = 0, fail = false;
  const database = { begin: async () => {
    calls++;
    return {
      query: async (sql: string) => {
        if (sql === 'COMMIT') { commits++; return {}; }
        if (sql === 'ROLLBACK') { rollbacks++; return {}; }
        assert.equal(sql, 'SELECT qmenux_identity.cleanup_expired() AS identity, qmenux_operator.cleanup_expired() AS operator');
        if (fail) throw new Error('Private database detail and credential');
        return { rows: [{ identity: 2, operator: 1 }] };
      },
      release: (destroy: boolean) => { assert.equal(destroy, false); released++; },
    };
  } };
  @Module({ controllers: [AuthMaintenanceController], providers: [{ provide: Database, useValue: database }] })
  class FixtureModule {}
  const app = await NestFactory.create(FixtureModule, { logger: false });
  app.setGlobalPrefix('v1'); await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  const send = (headers: Record<string, string | string[]> = {}, suffix = '', method = 'GET') =>
    new Promise<{ status: number; body: unknown; cache?: string; cookie?: string[] }>((resolve, reject) => {
      const req = request(`${origin}/v1/internal/maintenance/auth-expiry${suffix}`, { method, headers }, res => {
        let body = ''; res.setEncoding('utf8'); res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode!, body: body ? JSON.parse(body) : undefined,
            cache: res.headers['cache-control'], cookie: res.headers['set-cookie'] }); } catch (e) { reject(e); }
        });
      });
      req.on('error', reject); req.setTimeout(5000, () => req.destroy(new Error('Maintenance test deadline'))); req.end();
    });
  try {
    for (const value of [undefined, '', 'short', 'a'.repeat(44), 'é'.repeat(43), ` ${secret}`]) {
      if (value === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = value;
      const response = await send({ authorization: `Bearer ${secret}` });
      assert.equal(response.status, 503); assert.deepEqual(response.body, { status: 'unavailable' });
      assert.equal(response.cache, 'no-store');
    }
    assert.equal(calls, 0);
    process.env.CRON_SECRET = secret;
    const invalidHeaders: Record<string, string | string[]>[] = [{}, { authorization: 'Bearer wrong' }, { authorization: `bearer ${secret}` },
      { authorization: `Bearer ${'t'.repeat(43)}` }, { authorization: `Bearer ${'é'.repeat(43)}` },
      { authorization: [`Bearer ${secret}`, 'Bearer wrong'] },
      { cookie: `__Host-qmenux_session=${secret}` }, { 'user-agent': 'vercel-cron/1.0' },
      { 'x-forwarded-authorization': `Bearer ${secret}` }];
    for (const headers of invalidHeaders) {
      const response = await send(headers);
      assert.equal(response.status, 401); assert.equal(response.cache, 'no-store'); assert.equal(response.cookie, undefined);
    }
    assert.equal((await send({}, `?token=${secret}`)).status, 401);
    assert.equal((await send({ authorization: `Bearer ${secret}` }, '', 'POST')).status, 404);
    assert.equal((await send({ authorization: `Bearer ${secret}` }, '', 'HEAD')).status, 405);
    assert.equal(calls, 0, 'Invalid/missing authority must never reach the database');
    const success = await send({ authorization: `Bearer ${secret}` }, '?tenant_id=ignored&limit=99999');
    assert.equal(success.status, 200); assert.equal(success.cache, 'no-store'); assert.equal(success.cookie, undefined);
    assert.deepEqual(success.body, { status: 'ok', deleted: { identity: 2, operator: 1 } });
    assert.equal(commits, 1); assert.equal(released, 1);
    process.env.CRON_SECRET = 't'.repeat(43);
    assert.equal((await send({ authorization: `Bearer ${secret}` })).status, 401);
    assert.equal(calls, 1, 'Rotating the configured secret immediately rejects the old value');
    process.env.CRON_SECRET = secret;
    fail = true;
    const failure = await send({ authorization: `Bearer ${secret}` });
    assert.equal(failure.status, 503); assert.deepEqual(failure.body, { status: 'unavailable' });
    assert.equal(rollbacks, 1); assert.equal(released, 2); assert.equal(failure.cache, 'no-store');
  } finally {
    await app.close();
    if (original === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original;
  }
});
