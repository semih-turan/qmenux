import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { Module } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import type { Client } from 'pg';
import { AdminAuthErrors } from '../src/admin-auth.controller.js';
import { AdminOnboardingController } from '../src/admin-onboarding.controller.js';
import { Database } from '../src/database.js';
import { IdentityStore } from '../src/identity-store.js';
import { OnboardingApplications } from '../src/onboarding-applications.js';

export async function exerciseOnboardingHttp(database: Database, owner: Client) {
  const env = { ...process.env }, key = 'o'.repeat(43), authKey = 'a'.repeat(43);
  const secret = () => randomBytes(32).toString('base64url');
  const session = secret(), csrf = secret(), other = secret(), otherCsrf = secret();
  const store = new IdentityStore(database), applications = new OnboardingApplications(database);
  const user = await store.createAdminSession('google', 'synthetic-onboarding-http', session, csrf); assert(user);
  await store.createAdminSession('google', 'synthetic-onboarding-http-other', other, otherCsrf);
  @Module({ controllers: [AdminOnboardingController], providers: [
    { provide: APP_FILTER, useClass: AdminAuthErrors }, { provide: OnboardingApplications, useValue: applications },
  ] })
  class FixtureModule {}
  const app = await NestFactory.create(FixtureModule, { logger: false, rawBody: true });
  app.setGlobalPrefix('v1'); await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  const send = (path: string, input: unknown, bearer = key) => new Promise<{ status: number; body: Record<string, unknown>; cache?: string; cookie?: string[] }>((resolve, reject) => {
    const req = request(`${origin}/v1/internal/admin-onboarding/${path}`, { method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' } }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', chunk => { text += chunk; });
      res.on('end', () => { try { resolve({ status: res.statusCode!, body: JSON.parse(text), cache: res.headers['cache-control'], cookie: res.headers['set-cookie'] }); } catch (error) { reject(error); } });
    });
    req.on('error', reject); req.setTimeout(5000, () => req.destroy(new Error('Application HTTP deadline'))); req.end(JSON.stringify(input));
  });
  try {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED; delete process.env.VERCEL_ENV;
    process.env.ADMIN_ONBOARDING_SECRET = key; process.env.ADMIN_BFF_SECRET = authKey;
    process.env.ADMIN_ONBOARDING_ENABLED = 'false';
    assert.equal((await send('list', { session })).status, 503);
    process.env.ADMIN_ONBOARDING_ENABLED = 'true';
    assert.equal((await send('list', { session }, authKey)).status, 401);
    assert.deepEqual((await send('list', { session })).body, { items: [], nextCursor: null });
    const payload = { session, csrf, name: 'Synthetic HTTP café', idempotencyKey: randomUUID() };
    const racing = await Promise.all([send('drafts', payload), send('drafts', payload)]);
    assert(racing.every(result => result.status === 200));
    const application = racing[0]!.body.application as { id: string; revision: number; status: string; createdAt: string; submittedAt: string | null };
    assert.deepEqual(racing[1]!.body, racing[0]!.body); assert.equal(application.revision, 1); assert.equal(application.status, 'DRAFT');
    assert.match(application.createdAt, /Z$/); assert.equal(application.submittedAt, null);
    assert.equal(Object.hasOwn(application, 'applicant_id'), false); assert.equal(Object.hasOwn(application, 'request_key'), false);
    for (const result of racing) { assert.equal(result.cache, 'no-store'); assert.equal(result.cookie, undefined); }
    assert.equal((await send(`drafts/${application.id}/edit`, { session, csrf: otherCsrf, name: 'Denied', revision: 1 })).status, 401);
    const edited = await send(`drafts/${application.id}/edit`, { session, csrf, name: 'Synthetic renamed café', revision: 1 });
    assert.equal(edited.status, 200); assert.equal((edited.body.application as { revision: number }).revision, 2);
    const stale = await send(`drafts/${application.id}/edit`, { session, csrf, name: 'Stale', revision: 1 });
    assert.equal(stale.status, 409); assert.deepEqual(stale.body, { status: 'conflict' });
    const submitted = await send(`drafts/${application.id}/submit`, { session, csrf, revision: 2 });
    assert.equal(submitted.status, 200); assert.equal((submitted.body.application as { status: string }).status, 'PENDING_APPROVAL');
    assert.deepEqual((await send(`drafts/${application.id}/submit`, { session, csrf, revision: 2 })).body, submitted.body);
    assert.deepEqual((await send('drafts', payload)).body, submitted.body);
    const foreign = await send(`drafts/${application.id}/submit`, { session: other, csrf: otherCsrf, revision: 2 });
    assert.equal(foreign.status, 404); assert.deepEqual(foreign.body, { status: 'not_found' });
    assert.deepEqual((await send('list', { session: other })).body, { items: [], nextCursor: null });
    const own = await send('list', { session, limit: 20 }); assert.equal(own.status, 200);
    assert.deepEqual(own.body.items, [submitted.body.application]);
    assert.equal((await send('drafts', { ...payload, status: 'APPROVED' })).status, 400);
    assert.equal((await send(`drafts/${application.id}/approve`, { session, csrf })).status, 404);
    assert.equal((await owner.query('SELECT count(*) FROM qmenux_identity.memberships WHERE user_id=$1', [user])).rows[0].count, '0');
    assert.deepEqual(await store.readAdminSession(session), { id: user, status: 'REGISTERED' });
    assert.equal((await owner.query('SELECT count(*) FROM qmenux_onboarding.application_events WHERE application_id=$1', [application.id])).rows[0].count, '3');
  } finally {
    await app.close();
    for (const name of ['ADMIN_ONBOARDING_ENABLED','ADMIN_ONBOARDING_SECRET','ADMIN_BFF_SECRET','NODE_TLS_REJECT_UNAUTHORIZED','VERCEL_ENV']) {
      if (env[name] === undefined) delete process.env[name]; else process.env[name] = env[name];
    }
  }
}
