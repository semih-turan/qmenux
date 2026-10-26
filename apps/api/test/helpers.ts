import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Db, migrateDown, migrateUp } from '@qmenux/database';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig, type ApiConfig } from '../src/config.js';
import { base32Encode, encrypt, hotp, totpStep } from '../src/crypto.js';

/**
 * Local throwaway database only (scripts/dev-db.sh). Never point this at Neon.
 * Separate from the database package's qmenux_test so both suites can run in parallel.
 */
export const TEST_URL = process.env.QX_API_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/qmenux_api_test';

/** What the first-party Next.js servers send to state the end-user IP. */
export const BFF_KEY = randomBytes(32).toString('base64');

let owner: Db | null = null;
/** Owner (migration) connection for fixtures that have no API yet, e.g. operator enrolment. */
export async function ownerQuery(sql: string, values: unknown[] = []) {
  owner ??= new Db({ connectionString: TEST_URL });
  return owner.pool.query(sql, values);
}

export async function resetSchema() {
  await migrateDown(TEST_URL, 100, () => undefined);
  await migrateUp(TEST_URL, () => undefined);
}

/** Every request comes from 127.0.0.1; clear fixed windows so suites don't throttle each other. */
export async function resetRateLimits() {
  await ownerQuery('DELETE FROM qx.rate_limit_buckets');
}

export async function closeOwner() {
  await owner?.pool.end();
  owner = null;
}

export interface TestApi {
  app: INestApplication;
  cfg: ApiConfig;
  db: Db;
  http: ReturnType<typeof request>;
  close(): Promise<void>;
}

export async function startApi(): Promise<TestApi> {
  const cfg = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_URL,
    QX_TOKEN_PEPPER: randomBytes(32).toString('base64'),
    QX_DATA_KEY: randomBytes(32).toString('base64'),
    QX_BFF_SHARED_KEY: BFF_KEY,
    QX_DEV_IDP: '1',
    QX_MEDIA_DIR: mkdtempSync(join(tmpdir(), 'qx-media-')),
  });
  const db = new Db({ connectionString: TEST_URL });
  const app = await createApp(cfg, { db });
  await app.init();
  const server = app.getHttpServer();
  return {
    app,
    cfg,
    db,
    get http() {
      return request(server);
    },
    async close() {
      await app.close();
      await db.pool.end();
    },
  };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Drives the real flow: /auth/flows → dev IdP form POST (303) → /auth/callback. */
export async function login(api: TestApi, sub: string, audience: 'admin' | 'ops' = 'admin') {
  const flow = await api.http.post('/v1/auth/flows').send({ provider: 'dev', audience });
  if (flow.status !== 201) throw new Error(`flow ${flow.status} ${JSON.stringify(flow.body)}`);
  const u = new URL(flow.body.authorizationUrl);
  const form = await api.http
    .post('/v1/dev-idp/authorize')
    .type('form')
    .send({
      redirect_uri: u.searchParams.get('redirect_uri'),
      state: u.searchParams.get('state'),
      nonce: u.searchParams.get('nonce'),
      code_challenge: u.searchParams.get('code_challenge'),
      sub,
    });
  if (form.status !== 303) throw new Error(`dev-idp ${form.status} ${JSON.stringify(form.body)}`);
  const back = new URL(form.headers.location as string);
  const cb = await api.http.post('/v1/auth/callback').send({ provider: 'dev', audience, code: back.searchParams.get('code'), state: back.searchParams.get('state') });
  return { res: cb, token: cb.body.sessionToken as string, state: back.searchParams.get('state')!, code: back.searchParams.get('code')! };
}

export async function userIdOf(api: TestApi, token: string): Promise<string> {
  const me = await api.http.get('/v1/me').set(bearer(token));
  return me.body.user.id as string;
}

/** Makes `sub` a PLATFORM_ADMIN with an enrolled TOTP secret; returns a code generator. */
export async function makeOperator(api: TestApi, sub: string) {
  const first = await login(api, sub, 'admin');
  const userId = await userIdOf(api, first.token);
  const secret = randomBytes(20);
  await ownerQuery(
    `INSERT INTO qx.platform_operators (user_id, role, totp_secret_ciphertext, totp_enrolled_at) VALUES ($1, 'PLATFORM_ADMIN', $2, now())`,
    [userId, encrypt(api.cfg.dataKey, base32Encode(secret), `totp:${userId}`)],
  );
  // A time-step is single-use and steps must increase. Tests run many grants within one 30 s
  // step, so each new code first forgets the burned step (fixture-only, owner connection).
  const nextCode = async () => {
    await ownerQuery('UPDATE qx.platform_operators SET totp_last_step = NULL WHERE user_id = $1', [userId]);
    return hotp(secret, totpStep());
  };
  return { userId, nextCode };
}

/** Operator session that passed MFA. */
export async function opsSession(api: TestApi, sub: string) {
  const op = await makeOperator(api, sub);
  const l = await login(api, sub, 'ops');
  const v = await api.http.post('/v1/control/mfa/verify').set(bearer(l.token)).send({ code: await op.nextCode() });
  if (v.status !== 200) throw new Error(`mfa ${v.status} ${JSON.stringify(v.body)}`);
  return { ...op, token: v.body.sessionToken as string };
}

let slugSeq = 0;
/** Applicant applies, operator approves (+ optional license), owner selects the tenant. */
export async function onboardTenant(api: TestApi, ops: { token: string; nextCode: () => Promise<string> }, opts: { license?: boolean; slug?: string } = {}) {
  slugSeq += 1;
  const slug = opts.slug ?? `kafe-${slugSeq}-${Date.now().toString(36)}`;
  const owner = await login(api, `owner-${slug}`);
  const app = await api.http
    .post('/v1/onboarding/applications')
    .set(bearer(owner.token))
    .send({ businessName: `Kafe ${slug}`, slug, businessType: 'CAFE', contactPhone: '+905550000001', city: 'Ankara', acceptedTermsVersion: 'draft-0' });
  if (app.status !== 201) throw new Error(`apply ${app.status} ${JSON.stringify(app.body)}`);
  const approved = await api.http.post(`/v1/control/applications/${app.body.application.id}/approve`).set(bearer(ops.token)).send({ reason: 'test' });
  if (approved.status !== 200) throw new Error(`approve ${approved.status} ${JSON.stringify(approved.body)}`);
  const tenantId = approved.body.tenantId as string;
  if (opts.license !== false) {
    const g = await api.http
      .post(`/v1/control/tenants/${tenantId}/licenses`)
      .set(bearer(ops.token))
      .send({ endsAt: new Date(Date.now() + 30 * 86400_000).toISOString(), totp: await ops.nextCode() });
    if (g.status !== 201) throw new Error(`grant ${g.status} ${JSON.stringify(g.body)}`);
  }
  const sel = await api.http.post('/v1/me/active-tenant').set(bearer(owner.token)).send({ tenantId });
  if (sel.status >= 300) throw new Error(`select ${sel.status} ${JSON.stringify(sel.body)}`);
  return { slug, tenantId, token: owner.token };
}

/** Smallest valid PNG (1×1). */
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
