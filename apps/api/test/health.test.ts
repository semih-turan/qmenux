import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';

test('health is minimal and uncached; business and checkout routes are absent', async () => {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('v1');
  try {
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    const response = await fetch(`${origin}/v1/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { status: 'ok' });
    for (const path of ['/health', '/v1/admin/products', '/v1/superadmin/tenants', '/v1/billing/checkout']) {
      const denied = await fetch(`${origin}${path}`, { method: path.endsWith('checkout') ? 'POST' : 'GET' });
      assert.equal(denied.status, 404, path);
    }
  } finally {
    await app.close();
  }
});
