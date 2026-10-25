import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';

test('health is minimal, readiness fails closed, business and checkout routes are absent', async () => {
  const originalUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('v1');
  try {
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    const response = await fetch(`${origin}/v1/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { status: 'ok' });
    for (const databaseUrl of ['', 'invalid',
      'postgresql://neondb_owner:synthetic@ep-test-pooler.c-14.us-east-1.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require',
      'postgresql://qmenux_runtime:synthetic@ep-test-pooler.c-14.us-east-1.aws.neon.tech/neondb?sslmode=disable&channel_binding=require',
      'postgresql://qmenux_runtime:synthetic@ep-test-pooler.c-14.us-east-1.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require&host=wrong.invalid']) {
      process.env.DATABASE_URL = databaseUrl;
      const ready = await fetch(`${origin}/v1/health/ready`);
      assert.equal(ready.status, 503);
      assert.equal(ready.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await ready.json(), { status: 'unavailable' });
    }
    for (const path of ['/health', '/v1/admin/products', '/v1/superadmin/tenants', '/v1/billing/checkout']) {
      const denied = await fetch(`${origin}${path}`, { method: path.endsWith('checkout') ? 'POST' : 'GET' });
      assert.equal(denied.status, 404, path);
    }
  } finally {
    await app.close();
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  }
});
