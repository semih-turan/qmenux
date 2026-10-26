import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  BFF_KEY,
  bearer,
  closeOwner,
  login,
  onboardTenant,
  opsSession,
  ownerQuery,
  PNG_1PX,
  resetRateLimits,
  resetSchema,
  startApi,
  type TestApi,
} from './helpers.js';

let api: TestApi;
let ops: Awaited<ReturnType<typeof opsSession>>;

beforeAll(async () => {
  await resetSchema();
  api = await startApi();
  ops = await opsSession(api, 'ops-admin');
});
afterAll(async () => {
  await api?.close();
  await closeOwner();
});
beforeEach(resetRateLimits);

const eventId = () => randomBytes(12).toString('base64url');

async function category(token: string, name = 'Sıcak İçecekler') {
  const r = await api.http.post('/v1/admin/categories').set(bearer(token)).send({ name });
  expect(r.status).toBe(201);
  return r.body.id as string;
}

async function product(token: string, categoryId: string, extra: Record<string, unknown> = {}) {
  const r = await api.http
    .post('/v1/admin/products')
    .set(bearer(token))
    .send({ categoryId, name: 'Filtre Kahve', priceMinor: 9500, ...extra });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.id as string;
}

async function publish(token: string) {
  const draft = await api.http.get('/v1/admin/menu/draft').set(bearer(token));
  const expectedRevisionNo = draft.body.publish?.revisionNo ?? 0;
  return api.http.post('/v1/admin/menu/publish').set(bearer(token)).send({ expectedRevisionNo });
}

describe('auth', () => {
  it('signs in through the dev IdP and refuses a replayed state', async () => {
    const l = await login(api, 'replay-user');
    expect(l.res.status).toBe(200);
    expect(l.res.body.mfaRequired).toBe(false);
    const me = await api.http.get('/v1/me').set(bearer(l.token));
    expect(me.status).toBe(200);
    expect(me.body.memberships).toEqual([]);
    const again = await api.http.post('/v1/auth/callback').send({ provider: 'dev', audience: 'admin', code: l.code, state: l.state });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('FLOW_INVALID');
  });

  it('rejects missing and forged bearer tokens', async () => {
    expect((await api.http.get('/v1/me')).status).toBe(401);
    expect((await api.http.get('/v1/me').set(bearer('x'.repeat(43)))).status).toBe(401);
  });

  it('an admin session is not an ops session', async () => {
    const l = await login(api, 'plain-owner');
    expect((await api.http.get('/v1/control/stats').set(bearer(l.token))).status).toBe(401);
  });

  it('ops sign-in is refused for non-operators', async () => {
    await login(api, 'not-an-operator');
    const r = await login(api, 'not-an-operator', 'ops');
    expect(r.res.status).toBe(403);
  });

  it('ops sessions need MFA, and verification rotates the token', async () => {
    const l = await login(api, 'ops-admin', 'ops');
    expect(l.res.body.mfaRequired).toBe(true);
    const before = await api.http.get('/v1/control/stats').set(bearer(l.token));
    expect(before.status).toBe(403);
    expect(before.body.code).toBe('MFA_REQUIRED');
    const bad = await api.http.post('/v1/control/mfa/verify').set(bearer(l.token)).send({ code: '000000' });
    expect(bad.status).toBe(403);
    const ok = await api.http.post('/v1/control/mfa/verify').set(bearer(l.token)).send({ code: await ops.nextCode() });
    expect(ok.status).toBe(200);
    expect((await api.http.get('/v1/control/stats').set(bearer(ok.body.sessionToken))).status).toBe(200);
    // The pre-MFA token is revoked.
    expect((await api.http.get('/v1/control/session').set(bearer(l.token))).status).toBe(401);
  });
});

describe('onboarding and licensing', () => {
  it('approval does not activate; publishing needs a manually granted license', async () => {
    const t = await onboardTenant(api, ops, { license: false });
    const cid = await category(t.token);
    await product(t.token, cid);
    const pub = await publish(t.token);
    expect(pub.status).toBe(403);
    expect(pub.body.code).toBe('LICENSE_INACTIVE');
    expect((await api.http.get(`/v1/public/menus/${t.slug}`)).body.state).toBe('UNAVAILABLE');
  });

  it('a license grant requires a fresh TOTP step-up even inside an MFA session', async () => {
    const t = await onboardTenant(api, ops, { license: false });
    const endsAt = new Date(Date.now() + 86400_000).toISOString();
    const noCode = await api.http.post(`/v1/control/tenants/${t.tenantId}/licenses`).set(bearer(ops.token)).send({ endsAt });
    expect(noCode.status).toBe(422);
    const wrong = await api.http.post(`/v1/control/tenants/${t.tenantId}/licenses`).set(bearer(ops.token)).send({ endsAt, totp: '123456' });
    expect(wrong.status).toBe(403);
    const code = await ops.nextCode();
    const ok = await api.http.post(`/v1/control/tenants/${t.tenantId}/licenses`).set(bearer(ops.token)).send({ endsAt, totp: code });
    expect(ok.status).toBe(201);
    // A TOTP time-step is single-use.
    const replay = await api.http.post(`/v1/control/tenants/${t.tenantId}/licenses`).set(bearer(ops.token)).send({ endsAt, totp: code });
    expect(replay.status).toBe(403);
  });

  it('tenant owners cannot reach platform operations', async () => {
    const t = await onboardTenant(api, ops);
    expect((await api.http.post(`/v1/control/tenants/${t.tenantId}/suspend`).set(bearer(t.token)).send({ reason: 'x' })).status).toBe(401);
  });
});

describe('tenant isolation and roles', () => {
  it("one tenant cannot read or change another tenant's products", async () => {
    const a = await onboardTenant(api, ops);
    const b = await onboardTenant(api, ops);
    const pid = await product(a.token, await category(a.token));
    expect((await api.http.get(`/v1/admin/products/${pid}`).set(bearer(b.token))).status).toBe(404);
    const patch = await api.http.patch(`/v1/admin/products/${pid}`).set(bearer(b.token)).send({ name: 'Ele geçirildi', expectedVersion: 1 });
    expect(patch.status).toBe(404);
    expect((await api.http.delete(`/v1/admin/products/${pid}`).set(bearer(b.token))).status).toBe(404);
    const list = await api.http.get('/v1/admin/products').set(bearer(b.token));
    expect(list.body.products).toEqual([]);
    const mine = await api.http.get(`/v1/admin/products/${pid}`).set(bearer(a.token));
    expect(mine.body.product.name).toBe('Filtre Kahve');
  });

  it('selecting a tenant you do not belong to is refused', async () => {
    const a = await onboardTenant(api, ops);
    const b = await onboardTenant(api, ops);
    expect((await api.http.post('/v1/me/active-tenant').set(bearer(b.token)).send({ tenantId: a.tenantId })).status).toBe(404);
  });

  it('staff can mark items sold out but cannot edit the catalog; invites are bound to the e-mail', async () => {
    const t = await onboardTenant(api, ops);
    const pid = await product(t.token, await category(t.token));
    const inv = await api.http.post('/v1/admin/team/invites').set(bearer(t.token)).send({ email: 'barista-1@example.test', role: 'STAFF' });
    expect(inv.status).toBe(201);
    const token = new URL(inv.body.inviteUrl).pathname.split('/').pop();

    const stranger = await login(api, 'stranger-1');
    expect((await api.http.post('/v1/invites/accept').set(bearer(stranger.token)).send({ token })).status).toBe(410);

    const staff = await login(api, 'barista-1');
    const acc = await api.http.post('/v1/invites/accept').set(bearer(staff.token)).send({ token });
    expect(acc.status).toBe(200);
    expect(acc.body.tenantId).toBe(t.tenantId);

    const write = await api.http.post('/v1/admin/categories').set(bearer(staff.token)).send({ name: 'Yeni' });
    expect(write.status).toBe(403);
    expect((await api.http.post('/v1/admin/menu/publish').set(bearer(staff.token)).send({ expectedRevisionNo: 0 })).status).toBe(403);
    const sold = await api.http.patch(`/v1/admin/products/${pid}/availability`).set(bearer(staff.token)).send({ availability: 'SOLD_OUT' });
    expect(sold.status).toBe(200);
  });

  it('stale product edits conflict instead of overwriting', async () => {
    const t = await onboardTenant(api, ops);
    const pid = await product(t.token, await category(t.token));
    expect((await api.http.patch(`/v1/admin/products/${pid}`).set(bearer(t.token)).send({ priceMinor: 10000, expectedVersion: 1 })).status).toBe(200);
    const stale = await api.http.patch(`/v1/admin/products/${pid}`).set(bearer(t.token)).send({ priceMinor: 11000, expectedVersion: 1 });
    expect(stale.status).toBe(409);
  });
});

describe('media', () => {
  it('accepts a real PNG and rejects a disguised file', async () => {
    const t = await onboardTenant(api, ops);
    const pid = await product(t.token, await category(t.token));
    const fake = await api.http
      .put(`/v1/admin/products/${pid}/image`)
      .set(bearer(t.token))
      .set('Content-Type', 'image/png')
      .send(Buffer.from('<svg onload="alert(1)"></svg>'));
    expect(fake.status).toBe(415);
    const ok = await api.http.put(`/v1/admin/products/${pid}/image`).set(bearer(t.token)).set('Content-Type', 'image/png').send(PNG_1PX);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const p = await api.http.get(`/v1/admin/products/${pid}`).set(bearer(t.token));
    const url = new URL(p.body.product.imageUrl);
    const img = await api.http.get(url.pathname);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['x-content-type-options']).toBe('nosniff');
    expect((await api.http.get(url.pathname.replace(/\.png$/, '.jpg'))).status).toBe(404);
    expect((await api.http.get('/v1/media/t/..%2F..%2Fetc/passwd')).status).toBe(404);
  });
});

describe('public menu', () => {
  it('serves only published, visible data and never internal ids or secrets', async () => {
    const t = await onboardTenant(api, ops);
    const cid = await category(t.token);
    const visible = await product(t.token, cid, { name: 'Latte' });
    const hidden = await product(t.token, cid, { name: 'Gizli Ürün' });
    await api.http.put('/v1/admin/branch/wifi').set(bearer(t.token)).send({ enabled: true, ssid: 'KafeMisafir', password: 'gizli-sifre-123' }).expect(200);
    expect((await publish(t.token)).status).toBe(201);
    await api.http.patch(`/v1/admin/products/${hidden}/availability`).set(bearer(t.token)).send({ availability: 'HIDDEN' }).expect(200);

    const r = await api.http.get(`/v1/public/menus/${t.slug}`);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(r.body.state).toBe('OK');
    const names = r.body.menu.categories.flatMap((c: { items: { name: string }[] }) => c.items.map((i) => i.name));
    expect(names).toEqual(['Latte']);
    expect(JSON.stringify(r.body)).not.toContain(hidden);
    expect(JSON.stringify(r.body)).toContain(visible);
    expect(r.body.menu.branch.id).toBeUndefined();
    expect(JSON.stringify(r.body)).not.toContain(t.tenantId);
    // Guests see the Wi-Fi password (that is the feature); the ciphertext never leaves the API.
    expect(r.body.menu.wifi).toMatchObject({ ssid: 'KafeMisafir', password: 'gizli-sifre-123' });
    expect(JSON.stringify(r.body)).not.toContain('v1:');

    // Admins never get the password back.
    const branch = await api.http.get('/v1/admin/branch').set(bearer(t.token));
    expect(JSON.stringify(branch.body)).not.toContain('gizli-sifre-123');
  });

  it('unknown and suspended menus reveal nothing', async () => {
    const missing = await api.http.get('/v1/public/menus/boyle-bir-kafe-yok');
    expect(missing.status).toBe(404);
    const t = await onboardTenant(api, ops);
    await product(t.token, await category(t.token));
    expect((await publish(t.token)).status).toBe(201);
    await api.http.post(`/v1/control/tenants/${t.tenantId}/suspend`).set(bearer(ops.token)).send({ reason: 'test' }).expect(200);
    const r = await api.http.get(`/v1/public/menus/${t.slug}`);
    expect(r.body).toEqual({ state: 'UNAVAILABLE', reason: 'SUSPENDED' });
    // Suspension also blocks tenant writes.
    expect((await api.http.post('/v1/admin/categories').set(bearer(t.token)).send({ name: 'x' })).body.code).toBe('TENANT_SUSPENDED');
  });

  it('search puts UNKNOWN or unverified allergen status in "uncertain", never in safe results', async () => {
    const t = await onboardTenant(api, ops);
    const cid = await category(t.token, 'Tatlılar');
    const verified = (status: string) => [{ code: 'GLUTEN', status, verification: 'VERIFIED', source: 'MANUAL' }];
    await product(t.token, cid, { name: 'Glutensiz Kek', allergens: verified('FREE') });
    await product(t.token, cid, { name: 'Kruvasan', allergens: verified('CONTAINS') });
    await product(t.token, cid, { name: 'Kurabiye', allergens: verified('MAY_CONTAIN') });
    await product(t.token, cid, { name: 'Ev Yapımı Puding' });
    // An unverified "free" claim (and any AI suggestion, even one marked verified) is shown as unknown.
    await product(t.token, cid, { name: 'Tahmini Glutensiz', allergens: [{ code: 'GLUTEN', status: 'FREE' }] });
    await product(t.token, cid, { name: 'AI Önerisi', allergens: [{ code: 'GLUTEN', status: 'FREE', verification: 'VERIFIED', source: 'AI_SUGGESTION' }] });
    expect((await publish(t.token)).status).toBe(201);

    const r = await api.http.get(`/v1/public/menus/${t.slug}/search`).query({ allergens_exclude: 'GLUTEN' });
    expect(r.status).toBe(200);
    expect(r.body.items.map((i: { name: string }) => i.name)).toEqual(['Glutensiz Kek']);
    expect(r.body.uncertain.map((i: { name: string }) => i.name).sort()).toEqual(['AI Önerisi', 'Ev Yapımı Puding', 'Tahmini Glutensiz']);

    const text = await api.http.get(`/v1/public/menus/${t.slug}/search`).query({ q: 'kruvasan' });
    expect(text.body.items.map((i: { name: string }) => i.name)).toEqual(['Kruvasan']);
    expect((await api.http.get(`/v1/public/menus/${t.slug}/search`).query({ allergens_exclude: 'NOPE' })).status).toBe(422);
  });

  it('geofenced menus need a short-lived pass from a location check', async () => {
    const t = await onboardTenant(api, ops);
    await product(t.token, await category(t.token));
    const regions = await api.http.put('/v1/admin/branch/visibility').set(bearer(t.token)).send({ mode: 'ADMIN_REGIONS', regions: [{ provinceCode: '06' }] });
    expect(regions.status).toBe(422);
    expect(regions.body.code).toBe('REGIONS_NOT_AVAILABLE');
    await api.http
      .put('/v1/admin/branch/visibility')
      .set(bearer(t.token))
      .send({ mode: 'RADIUS', center: { lat: 39.92077, lng: 32.85411 }, radiusKm: 1 })
      .expect(200);
    expect((await publish(t.token)).status).toBe(201);

    const gated = await api.http.get(`/v1/public/menus/${t.slug}`);
    expect(gated.body.state).toBe('GEOFENCE_REQUIRED');
    expect(gated.body.menu).toBeUndefined();

    const far = await api.http.post(`/v1/public/menus/${t.slug}/location-check`).send({ lat: 41.0082, lng: 28.9784, accuracyM: 20 });
    expect(far.body).toEqual({ ok: false, reason: 'OUTSIDE' });
    const fuzzy = await api.http.post(`/v1/public/menus/${t.slug}/location-check`).send({ lat: 39.9208, lng: 32.8541, accuracyM: 5000 });
    expect(fuzzy.body.reason).toBe('LOW_ACCURACY');
    const near = await api.http.post(`/v1/public/menus/${t.slug}/location-check`).send({ lat: 39.9209, lng: 32.8542, accuracyM: 30 });
    expect(near.body.ok).toBe(true);

    const open = await api.http.get(`/v1/public/menus/${t.slug}`).set('x-qx-geo-pass', near.body.pass);
    expect(open.body.state).toBe('OK');
    expect((await api.http.get(`/v1/public/menus/${t.slug}`).set('x-qx-geo-pass', `${near.body.pass}x`)).body.state).toBe('GEOFENCE_REQUIRED');

    // A pass is bound to its menu.
    const other = await onboardTenant(api, ops);
    await product(other.token, await category(other.token));
    await api.http.put('/v1/admin/branch/visibility').set(bearer(other.token)).send({ mode: 'RADIUS', center: { lat: 39.92077, lng: 32.85411 }, radiusKm: 1 }).expect(200);
    expect((await publish(other.token)).status).toBe(201);
    expect((await api.http.get(`/v1/public/menus/${other.slug}`).set('x-qx-geo-pass', near.body.pass)).body.state).toBe('GEOFENCE_REQUIRED');

    // Changing the policy invalidates old passes.
    await api.http.put('/v1/admin/branch/visibility').set(bearer(t.token)).send({ mode: 'RADIUS', center: { lat: 39.92077, lng: 32.85411 }, radiusKm: 2 }).expect(200);
    expect((await api.http.get(`/v1/public/menus/${t.slug}`).set('x-qx-geo-pass', near.body.pass)).body.state).toBe('GEOFENCE_REQUIRED');
  });

  it('scan events are deduplicated by client event id and counted per table', async () => {
    const t = await onboardTenant(api, ops);
    await product(t.token, await category(t.token));
    expect((await publish(t.token)).status).toBe(201);
    const qr = await api.http.post('/v1/admin/table-qrs').set(bearer(t.token)).send({ label: 'Masa 1' });
    expect(qr.status).toBe(201);
    const tableToken = new URL(qr.body.url).searchParams.get('t')!;

    const id = eventId();
    for (let i = 0; i < 3; i++) {
      await api.http.post(`/v1/public/menus/${t.slug}/scans`).send({ clientEventId: id, source: 'table', tableToken }).expect(202);
    }
    await api.http.post(`/v1/public/menus/${t.slug}/scans`).send({ clientEventId: eventId(), source: 'qr' }).expect(202);
    const { rows } = await ownerQuery(
      'SELECT source, table_id IS NOT NULL AS has_table, valid_count FROM qx.qr_scan_daily WHERE tenant_id = $1 ORDER BY source',
      [t.tenantId],
    );
    expect(rows).toEqual([
      { source: 'qr', has_table: false, valid_count: 1 },
      { source: 'table', has_table: true, valid_count: 1 },
    ]);
    // The raw table token is never stored.
    const raw = await ownerQuery('SELECT count(*)::int AS n FROM qx.qr_tables WHERE token_hash = $1', [tableToken]);
    expect(raw.rows[0].n).toBe(0);

    // A direct visit is reported apart and never counted as a QR scan; the general code carries `?src=qr`.
    await api.http.post(`/v1/public/menus/${t.slug}/scans`).send({ clientEventId: eventId(), source: 'direct' }).expect(202);
    // Crawlers and chat link previews are answered the same way but never counted.
    await api.http.post(`/v1/public/menus/${t.slug}/scans`).set('user-agent', 'WhatsApp/2.23.20.0 A').send({ clientEventId: eventId(), source: 'qr' }).expect(202);
    await api.http
      .post(`/v1/public/menus/${t.slug}/scans`)
      .set('user-agent', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')
      .send({ clientEventId: eventId(), source: 'table', tableToken })
      .expect(202);
    const dash = await api.http.get('/v1/admin/dashboard').set(bearer(t.token)).expect(200);
    expect(dash.body.scans).toMatchObject({ thisMonth: 2, allTime: 2 });
    const report = await api.http.get('/v1/admin/analytics/summary?days=30').set(bearer(t.token)).expect(200);
    expect(report.body.scans.monthly[0]).toMatchObject({ table: 1, qr: 1, total: 2, direct: 1 });
    const qrs = await api.http.get('/v1/admin/table-qrs').set(bearer(t.token)).expect(200);
    expect(new URL(qrs.body.generalQrUrl).searchParams.get('src')).toBe('qr');
    expect(qrs.body.tables[0]).toMatchObject({ label: 'Masa 1', scansThisMonth: 1 });
  });

  it('rate limits public reads with 429', async () => {
    const t = await onboardTenant(api, ops);
    let last = 0;
    for (let i = 0; i < 21 && last !== 429; i++) {
      last = (await api.http.post(`/v1/public/menus/${t.slug}/location-check`).send({ lat: 0, lng: 0 })).status;
    }
    expect(last).toBe(429);
  });

  it('trusts a stated client IP only from a BFF holding the shared key', async () => {
    const t = await onboardTenant(api, ops);
    const check = (headers: Record<string, string>) =>
      api.http.post(`/v1/public/menus/${t.slug}/location-check`).set(headers).send({ lat: 0, lng: 0 });
    // Forged key: the stated IP is ignored, so every attempt lands in the socket address bucket.
    let last = 0;
    for (let i = 0; i < 21 && last !== 429; i++) {
      last = (await check({ 'x-qx-bff-key': 'forged', 'x-qx-client-ip': `203.0.113.${i}` })).status;
    }
    expect(last).toBe(429);
    // A real BFF gets one bucket per end user instead of one shared bucket for everybody.
    expect((await check({ 'x-qx-bff-key': BFF_KEY, 'x-qx-client-ip': '198.51.100.7' })).status).not.toBe(429);
    // A malformed stated IP falls back to the socket address, which is exhausted.
    expect((await check({ 'x-qx-bff-key': BFF_KEY, 'x-qx-client-ip': 'not-an-ip' })).status).toBe(429);
  });
});

describe('security headers', () => {
  it('sets defensive defaults and hides the framework', async () => {
    const r = await api.http.get('/v1/auth/providers');
    expect(r.headers['x-powered-by']).toBeUndefined();
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('errors are problem documents without stack traces', async () => {
    const r = await api.http.post('/v1/auth/flows').set('Content-Type', 'application/json').send('{bad');
    expect(r.status).toBe(400);
    expect(r.headers['content-type']).toContain('application/problem+json');
    expect(JSON.stringify(r.body)).not.toMatch(/at .*\.ts:\d+/);
  });
});
