import 'reflect-metadata';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { ConflictException, ForbiddenException, Module, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import { AdminAuthErrors } from '../src/admin-auth.controller.js';
import { OperatorProvisioningController } from '../src/operator-provisioning.controller.js';
import { TenantProvisioning } from '../src/tenant-provisioning.js';

test('provisioning HTTP isolates purpose credentials, rejects malformed transport and projects only server receipt fields', async () => {
  const env = { ...process.env }, key = 'p'.repeat(43), token = 's'.repeat(43), id = '00000000-0000-4000-8000-000000000001';
  const calls: unknown[][] = []; let failure: Error | undefined;
  const invoke = (args: unknown[], result: unknown) => { calls.push(args); if (failure) throw failure; return result; };
  // Dispatch/projection only; the separate native/HTTP/PostgreSQL fixture verifies actual authorization.
  const service = {
    begin: async (...args: unknown[]) => invoke(args, { challenge: token }),
    finish: async (...args: unknown[]) => invoke(args, token),
    provision: async (...args: unknown[]) => invoke(args, { applicationId: id, tenantId: id, branchId: id, slug: 'synthetic-cafe',
      createdAt: new Date('2026-10-26T00:00:00.000Z'), privateDiagnostic: 'must not escape' }),
  };
  @Module({ controllers: [OperatorProvisioningController], providers: [
    { provide: APP_FILTER, useClass: AdminAuthErrors }, { provide: TenantProvisioning, useValue: service },
  ] })
  class FixtureModule {}
  const app = await NestFactory.create(FixtureModule, { logger: false, rawBody: true });
  app.setGlobalPrefix('v1'); await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  const payload = { assertion: 'synthetic-access-assertion', browser: token, session: token, csrf: token, proof: token,
    id, revision: 3, slug: 'synthetic-cafe', businessName: 'Synthetic café', initialBranchName: 'Initial branch', reason: 'Synthetic setup', requestId: id };
  const send = (path = 'start', body: string | Buffer = JSON.stringify(payload), headers: Record<string,string | string[]> = {}, method = 'POST') =>
    new Promise<{ status: number; body: unknown; cache?: string; cookie?: string[]; location?: string; allow?: string }>((resolve, reject) => {
      const req = request(`${origin}/v1/internal/operator-provisioning/${path}`, { method, headers: { authorization: `Bearer ${key}`,
        'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)), ...headers } }, res => {
        let raw = ''; res.setEncoding('utf8'); res.on('data', part => { raw += part; });
        res.on('end', () => { try { resolve({ status: res.statusCode!, body: raw ? JSON.parse(raw) : undefined,
          cache: res.headers['cache-control'], cookie: res.headers['set-cookie'], location: res.headers.location, allow: res.headers.allow }); } catch (error) { reject(error); } });
      });
      req.on('error', reject); req.setTimeout(5000, () => req.destroy(new Error('Provisioning boundary deadline'))); req.end(body);
    });
  const otherKeys = ['ADMIN_BFF_SECRET','ADMIN_ONBOARDING_SECRET','CRON_SECRET','OPERATOR_BFF_SECRET','OPERATOR_REVIEW_SECRET'];
  try {
    delete process.env.VERCEL_ENV; delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    for (const name of otherKeys) delete process.env[name];
    process.env.OPERATOR_PROVISIONING_SECRET = key;
    for (const flag of ['OPERATOR_PROVISIONING_ENABLED','OPERATOR_BFF_ENABLED','OPERATOR_PASSKEY_ENABLED']) {
      for (const invalid of [undefined, 'false', 'TRUE']) {
        if (invalid === undefined) delete process.env[flag]; else process.env[flag] = invalid;
        assert.equal((await send()).status, 503);
      }
      process.env[flag] = 'true';
    }
    for (const invalid of [undefined, '', 'short', 'é'.repeat(43)]) {
      if (invalid === undefined) delete process.env.OPERATOR_PROVISIONING_SECRET; else process.env.OPERATOR_PROVISIONING_SECRET = invalid;
      assert.equal((await send()).status, 503);
    }
    process.env.OPERATOR_PROVISIONING_SECRET = key;
    process.env.VERCEL_ENV = 'preview'; assert.equal((await send()).status, 503); delete process.env.VERCEL_ENV;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; assert.equal((await send()).status, 503); delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    for (const name of otherKeys) {
      process.env[name] = key; assert.equal((await send()).status, 503); process.env[name] = 'x'.repeat(43);
      assert.equal((await send('start', undefined, { authorization: `Bearer ${process.env[name]}` })).status, 401);
    }
    const headers: Record<string,string | string[]>[] = [{ authorization: '' }, { authorization: `bearer ${key}` },
      { authorization: [`Bearer ${key}`,`Bearer ${key}`] }, { authorization: '', cookie: `__Host-qmenux_operator_session=${key}`, 'x-forwarded-authorization': `Bearer ${key}` }];
    for (const value of headers) assert.equal((await send('start', undefined, value)).status, 401);
    for (const body of ['{','[]','null','{}', JSON.stringify({ ...payload, applicantId: id }), JSON.stringify({ ...payload, status: 'ACTIVE' }),
      JSON.stringify({ ...payload, browser: 'bad' }), JSON.stringify({ ...payload, assertion: 'bad\nassertion' }),
      JSON.stringify({ ...payload, nested: {} }), JSON.stringify({ ...payload, proof: 1 }),
      JSON.stringify(payload).replace('"revision":3', '"revision":2,"rev\\u0069sion":3'), JSON.stringify({ ...payload, reason: 'x'.repeat(33000) })]) {
      const denied = await send('start', body); assert.equal(denied.status, 400); assert.equal(denied.cache, 'no-store');
      assert.deepEqual(denied.body, { status: 'invalid_request' });
    }
    const raw = Buffer.from(JSON.stringify(payload)), offset = raw.indexOf('Synthetic setup');
    assert.equal((await send('start', Buffer.concat([raw.subarray(0,offset), Buffer.from([0xc3,0x28]), raw.subarray(offset+15)]))).status, 400);
    assert.equal((await send('start?target=selected')).status, 400);
    assert.equal((await send('start', undefined, { 'content-type': 'text/plain' })).status, 400);
    assert.equal((await send('start', undefined, { 'content-encoding': 'identity' })).status, 400);
    const oversized = await send('start', JSON.stringify({ ...payload, reason: 'x'.repeat(110000) }));
    assert.equal(oversized.status, 413); assert.deepEqual(oversized.body, { status: 'invalid_request' }); assert.equal(oversized.cache, 'no-store');
    for (const path of ['start','finish','provision']) for (const method of ['GET','HEAD','OPTIONS','PUT','DELETE']) {
      const denied = await send(path, '', {}, method); assert.equal(denied.status, 405); assert.equal(denied.allow, 'POST'); assert.equal(denied.cache, 'no-store');
    }
    for (const response of ['{','{} ', 'x'.repeat(16385)]) assert.equal((await send('finish', JSON.stringify({ ...payload, challenge: token, response }))).status, 400);
    assert.equal((await send('provision', JSON.stringify({ ...payload, stepUp: 'bad' }))).status, 400);
    assert.equal((await send('start', JSON.stringify({ ...payload, stepUp: token }))).status, 400);
    assert.equal(calls.length, 0, 'Malformed authority/transport never invokes provisioning');
    const { revision, slug, businessName, initialBranchName, reason, requestId } = payload;
    const command = { revision, slug, businessName, initialBranchName, reason, requestId };
    const authority = [payload.assertion, token, token, token, token];
    assert.equal((await send()).status, 200); assert.deepEqual(calls[0], [...authority, id, command]);
    const finished = await send('finish', JSON.stringify({ ...payload, challenge: token, response: '{}' }));
    assert.deepEqual(finished.body, { stepUp: token, expiresIn: 120 }); assert.deepEqual(calls[1], [...authority, id, command, token, {}]);
    const result = await send('provision', JSON.stringify({ ...payload, stepUp: token }));
    assert.deepEqual(result.body, { provisioning: { applicationId: id, tenantId: id, branchId: id, slug, createdAt: '2026-10-26T00:00:00.000Z' } });
    assert.deepEqual(calls[2], [...authority, token, id, command]); assert.equal(result.cookie, undefined); assert.equal(result.location, undefined);
    assert.equal((await send('provision')).status, 200); assert.deepEqual(calls[3], [...authority, undefined, id, command]);
    for (const [error, expected, status] of [[new ForbiddenException(),403,'forbidden'],[new NotFoundException(),404,'not_found'],
      [new ConflictException(),409,'conflict'],[new ServiceUnavailableException(),503,'unavailable'],[new Error('Private credential diagnostic'),500,'invalid_request']] as const) {
      failure = error; const denied = await send(); assert.equal(denied.status, expected); assert.deepEqual(denied.body, { status });
      assert.equal(denied.cache, 'no-store'); assert.equal(denied.cookie, undefined);
    }
  } finally {
    await app.close();
    for (const name of Object.keys(process.env)) if (!(name in env)) delete process.env[name]; Object.assign(process.env, env);
  }
});
