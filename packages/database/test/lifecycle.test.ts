import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db } from '../src/db.js';
import {
  ConflictError,
  createCategory,
  createProduct,
  getProduct,
  getRevisionSnapshot,
  hasUnpublishedChanges,
  listRevisions,
  publishMenu,
  restoreRevision,
  setAvailability,
  updateProduct,
} from '../src/repos/catalog.js';
import { submitApplication, slugTaken, withdrawApplication } from '../src/repos/identity.js';
import { approveApplication, grantLicense, rejectApplication, revokeLicense, setTenantSuspended } from '../src/repos/platform.js';
import { acceptInvite, createInvite, createQrTable, scanSummary, updateGeofence, updateWifi } from '../src/repos/settings.js';
import { makeOperator, makeTenant, makeUser, ownerQuery, resetSchema, TEST_URL } from './helpers.js';

let db: Db;
let operatorId: string;

const publicMenu = (slug: string, geoOk = false) =>
  db.withPublic(async (tx) => (await tx.query('SELECT qx.public_menu($1, 7, $2) AS m', [slug, geoOk])).rows[0].m);

beforeAll(async () => {
  await resetSchema();
  db = new Db({ connectionString: TEST_URL, max: 3 });
  operatorId = (await makeOperator(db)).id;
});
afterAll(async () => {
  await db?.close();
});

describe('onboarding & licensing (no self-activation)', () => {
  it('signup + application never creates a tenant', async () => {
    const u = await makeUser(db, 'applicant');
    const app = await db.withAuth(u.id, (tx) =>
      submitApplication(tx, u.id, { businessName: 'Bekleyen', slug: 'bekleyen', businessType: 'CAFE', contactPhone: '+905550000002', city: 'İzmir', acceptedTermsVersion: 'draft-0' }),
    );
    expect(typeof app).toBe('object');
    const t = await ownerQuery(`SELECT count(*)::int AS n FROM qx.tenants WHERE slug = 'bekleyen'`);
    expect(t.rows[0].n).toBe(0);
    expect(await db.withAuth(u.id, (tx) => slugTaken(tx, 'bekleyen'))).toBe(true);
    // a second pending application by the same user is refused
    const again = await db.withAuth(u.id, (tx) =>
      submitApplication(tx, u.id, { businessName: 'İkinci', slug: 'ikinci', businessType: 'CAFE', contactPhone: '+905550000002', city: 'İzmir', acceptedTermsVersion: 'draft-0' }),
    );
    expect(again).toBe('ALREADY_PENDING');
  });

  it('applicant cannot approve their own application', async () => {
    const u = await makeUser(db, 'sneaky');
    const app = await db.withAuth(u.id, (tx) =>
      submitApplication(tx, u.id, { businessName: 'Sinsi', slug: 'sinsi', businessType: 'CAFE', contactPhone: '+905550000003', city: 'Bursa', acceptedTermsVersion: 'draft-0' }),
    );
    if (typeof app === 'string') throw new Error(app);
    await expect(
      db.withAuth(u.id, (tx) => tx.query(`UPDATE qx.tenant_applications SET status = 'APPROVED' WHERE id = $1`, [app.id])),
    ).rejects.toThrow(/row-level security/);
    await expect(db.withAuth(u.id, (tx) => tx.query(`INSERT INTO qx.tenants (slug, display_name, status) VALUES ('sinsi', 'x', 'ACTIVE')`))).rejects.toThrow(
      /permission denied/,
    );
    expect(await db.withAuth(u.id, (tx) => withdrawApplication(tx, u.id, app.id))).toBe(true);
  });

  it('rejected application does not create a tenant and cannot be approved later', async () => {
    const u = await makeUser(db, 'rejected');
    const app = await db.withAuth(u.id, (tx) =>
      submitApplication(tx, u.id, { businessName: 'Ret', slug: 'ret-kafe', businessType: 'CAFE', contactPhone: '+905550000004', city: 'Konya', acceptedTermsVersion: 'draft-0' }),
    );
    if (typeof app === 'string') throw new Error(app);
    await db.withPlatform(operatorId, (tx) => rejectApplication(tx, operatorId, app.id, 'eksik bilgi'));
    await expect(db.withPlatform(operatorId, (tx) => approveApplication(tx, operatorId, app.id, 'x'))).rejects.toBeInstanceOf(ConflictError);
  });

  it('approved tenant stays offline until a license is granted; license state drives the public menu', async () => {
    const t = await makeTenant(db, operatorId, 'lisans-kafe', { license: false });
    await db.withTenant(t.actor, async (tx) => {
      const c = await createCategory(tx, t.actor, { name: 'Kahveler', description: null, isVisible: true });
      await createProduct(tx, t.actor, { categoryId: c, name: 'Filtre', priceMinor: 8000, tags: [], allergens: [], description: null, calories: null });
      await publishMenu(tx, t.actor, { expectedRevisionNo: 0 });
    });
    expect((await publicMenu('lisans-kafe')).state).toBe('UNAVAILABLE');

    const grantId = await db.withPlatform(operatorId, (tx) => grantLicense(tx, operatorId, t.tenantId, new Date(Date.now() + 86400_000), 'test'));
    expect((await publicMenu('lisans-kafe')).state).toBe('OK');

    await db.withPlatform(operatorId, (tx) => setTenantSuspended(tx, operatorId, t.tenantId, true, 'test'));
    expect((await publicMenu('lisans-kafe')).reason).toBe('SUSPENDED');
    await db.withPlatform(operatorId, (tx) => setTenantSuspended(tx, operatorId, t.tenantId, false, 'test'));

    await db.withPlatform(operatorId, (tx) => revokeLicense(tx, operatorId, t.tenantId, grantId, 'test'));
    expect((await publicMenu('lisans-kafe')).reason).toBe('LICENSE_INACTIVE');
  });

  it('expired license within grace keeps the menu up, beyond grace takes it down', async () => {
    const t = await makeTenant(db, operatorId, 'grace-kafe', { license: false });
    await db.withTenant(t.actor, async (tx) => {
      const c = await createCategory(tx, t.actor, { name: 'K', description: null, isVisible: true });
      await createProduct(tx, t.actor, { categoryId: c, name: 'Çay', priceMinor: 3000, tags: [], allergens: [], description: null, calories: null });
      await publishMenu(tx, t.actor, { expectedRevisionNo: 0 });
    });
    await ownerQuery(
      `INSERT INTO qx.license_grants (tenant_id, starts_at, ends_at, granted_by) VALUES ($1, now() - interval '40 days', now() - interval '3 days', $2)`,
      [t.tenantId, operatorId],
    );
    await ownerQuery(`UPDATE qx.tenants SET status = 'ACTIVE' WHERE id = $1`, [t.tenantId]);
    expect((await publicMenu('grace-kafe')).state).toBe('OK'); // 3 days < 7 grace days
    const r = await db.withPublic((tx) => tx.query(`SELECT qx.public_menu('grace-kafe', 2, false) AS m`));
    expect(r.rows[0].m.reason).toBe('LICENSE_INACTIVE');
  });

  it('extension starts at the current end (no overlap, no shortening)', async () => {
    const t = await makeTenant(db, operatorId, 'uzatma-kafe');
    await expect(
      db.withPlatform(operatorId, (tx) => grantLicense(tx, operatorId, t.tenantId, new Date(Date.now() + 86400_000), null)),
    ).rejects.toBeInstanceOf(ConflictError);
    await db.withPlatform(operatorId, (tx) => grantLicense(tx, operatorId, t.tenantId, new Date(Date.now() + 60 * 86400_000), null));
    const g = await ownerQuery('SELECT starts_at, ends_at FROM qx.license_grants WHERE tenant_id = $1 ORDER BY ends_at', [t.tenantId]);
    expect(g.rows[1].starts_at.getTime()).toBe(g.rows[0].ends_at.getTime());
  });
});

describe('publishing, revisions and live availability', () => {
  let t: Awaited<ReturnType<typeof makeTenant>>;
  let productId: string;

  beforeAll(async () => {
    t = await makeTenant(db, operatorId, 'yayin-kafe');
    productId = await db.withTenant(t.actor, async (tx) => {
      const c = await createCategory(tx, t.actor, { name: 'Tatlılar', description: null, isVisible: true });
      return createProduct(tx, t.actor, {
        categoryId: c,
        name: 'Sütlaç',
        priceMinor: 11000,
        tags: [],
        description: null,
        calories: { kcal: 320, verification: 'VERIFIED', source: 'AI_SUGGESTION' },
        allergens: [
          { code: 'MILK', status: 'CONTAINS', verification: 'VERIFIED', source: 'MANUAL' },
          { code: 'GLUTEN', status: 'FREE', verification: 'UNVERIFIED', source: 'IMPORT' },
          { code: 'EGGS', status: 'FREE', verification: 'VERIFIED', source: 'AI_SUGGESTION' },
        ],
      });
    });
  });

  it('AI suggestions are never stored as verified', async () => {
    const p = await db.withTenant(t.actor, (tx) => getProduct(tx, productId));
    expect(p.calories?.verification).toBe('UNVERIFIED');
    expect(p.allergens.find((a) => a.code === 'EGGS')?.verification).toBe('UNVERIFIED');
    expect(p.allergens.find((a) => a.code === 'MILK')?.verification).toBe('VERIFIED');
  });

  it('DB refuses VERIFIED rows without a human verifier', async () => {
    await expect(
      db.withTenant(t.actor, (tx) =>
        tx.query(`UPDATE qx.product_allergens SET verification = 'VERIFIED', verified_by = NULL WHERE product_id = $1 AND allergen_code = 'GLUTEN'`, [productId]),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it('snapshot publishes only verified claims; unverified become UNKNOWN / null kcal', async () => {
    await db.withTenant(t.actor, (tx) => publishMenu(tx, t.actor, { expectedRevisionNo: 0 }));
    const snap = await db.withTenant(t.actor, (tx) => getRevisionSnapshot(tx));
    const item = snap!.snapshot.categories[0]!.items[0]!;
    expect(item.kcal).toBeNull();
    expect(Object.fromEntries(item.allergens.map((a) => [a.code, a.status]))).toEqual({ MILK: 'CONTAINS', GLUTEN: 'UNKNOWN', EGGS: 'UNKNOWN' });
  });

  it('stale expectedRevisionNo is rejected (concurrent publish)', async () => {
    await expect(db.withTenant(t.actor, (tx) => publishMenu(tx, t.actor, { expectedRevisionNo: 0 }))).rejects.toBeInstanceOf(ConflictError);
  });

  it('two concurrent publishers: exactly one wins', async () => {
    await db.withTenant(t.actor, (tx) => updateProduct(tx, t.actor, productId, { expectedVersion: 1, priceMinor: 12000 }));
    const results = await Promise.allSettled([
      db.withTenant(t.actor, (tx) => publishMenu(tx, t.actor, { expectedRevisionNo: 1 })),
      db.withTenant(t.actor, (tx) => publishMenu(tx, t.actor, { expectedRevisionNo: 1 })),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('stale product version is rejected', async () => {
    await expect(db.withTenant(t.actor, (tx) => updateProduct(tx, t.actor, productId, { expectedVersion: 1, name: 'x' }))).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('published revisions are immutable; restore creates a new revision', async () => {
    await expect(db.withTenant(t.actor, (tx) => tx.query(`UPDATE qx.menu_revisions SET note = 'x'`))).rejects.toThrow(/immutable|append-only|not allowed|permission denied/i);
    await expect(ownerQuery('DELETE FROM qx.menu_revisions')).rejects.toThrow();
    const revs = await db.withTenant(t.actor, (tx) => listRevisions(tx));
    const first = revs.find((r) => r.revisionNo === 1)!;
    const res = await db.withTenant(t.actor, (tx) => restoreRevision(tx, t.actor, first.id, 2));
    expect(res.revisionNo).toBe(3);
    const snap = await db.withTenant(t.actor, (tx) => getRevisionSnapshot(tx));
    expect(snap!.snapshot.categories[0]!.items[0]!.priceMinor).toBe(11000);
    expect(await db.withTenant(t.actor, (tx) => hasUnpublishedChanges(tx))).toBe(true); // draft has 12000
  });

  it('sold-out is a live overlay without republishing', async () => {
    await db.withTenant(t.actor, (tx) => setAvailability(tx, t.actor, productId, 'SOLD_OUT'));
    const m = await publicMenu('yayin-kafe');
    expect(m.availability[productId]).toBe('SOLD_OUT');
    expect(m.revision.no).toBe(3);
  });

  it('empty menus cannot be published', async () => {
    const e = await makeTenant(db, operatorId, 'bos-kafe');
    await expect(db.withTenant(e.actor, (tx) => publishMenu(tx, e.actor, { expectedRevisionNo: 0 }))).rejects.toThrow(/empty/);
  });
});

describe('public read model, scans, geofence, Wi-Fi', () => {
  let t: Awaited<ReturnType<typeof makeTenant>>;
  beforeAll(async () => {
    t = await makeTenant(db, operatorId, 'sayac-kafe');
    await db.withTenant(t.actor, async (tx) => {
      const c = await createCategory(tx, t.actor, { name: 'K', description: null, isVisible: true });
      await createProduct(tx, t.actor, { categoryId: c, name: 'Ayran', priceMinor: 4000, tags: [], allergens: [], description: null, calories: null });
      await publishMenu(tx, t.actor, { expectedRevisionNo: 0 });
      await createQrTable(tx, t.actor, 'Masa 7', 'table-hash-7');
    });
  });

  const scan = (eventId: string, source: string, tokenHash: string | null) =>
    db.withPublic(async (tx) => (await tx.query(`SELECT qx.public_record_scan('sayac-kafe', $1, $2, $3, (now() AT TIME ZONE 'Europe/Istanbul')::date) AS ok`, [eventId, source, tokenHash])).rows[0].ok);

  it('dedupes by client event id and attributes table scans only for valid tokens', async () => {
    expect(await scan('evt-aaaaaaaaaaaaaaaa1', 'qr', null)).toBe(true);
    expect(await scan('evt-aaaaaaaaaaaaaaaa1', 'qr', null)).toBe(false);
    expect(await scan('evt-aaaaaaaaaaaaaaaa2', 'table', 'table-hash-7')).toBe(true);
    expect(await scan('evt-aaaaaaaaaaaaaaaa3', 'table', 'forged-hash')).toBe(true);
    const r = await db.withTenant(t.actor, (tx) => tx.query('SELECT source, sum(valid_count)::int AS n FROM qx.qr_scan_daily GROUP BY source ORDER BY source'));
    expect(r.rows).toEqual([
      { source: 'qr', n: 2 },
      { source: 'table', n: 1 },
    ]);
  });

  it('scan summary counts QR landings only, in the current Istanbul month', async () => {
    const at = (eventId: string, source: string, daysAgo: number) =>
      db.withPublic((tx) =>
        tx.query(`SELECT qx.public_record_scan('sayac-kafe', $1, $2, NULL, (now() AT TIME ZONE 'Europe/Istanbul')::date - $3::int)`, [eventId, source, daysAgo]),
      );
    const before = await db.withTenant(t.actor, (tx) => scanSummary(tx));
    await at('evt-bbbbbbbbbbbbbbbb1', 'direct', 0);
    await at('evt-bbbbbbbbbbbbbbbb2', 'qr', 0);
    await at('evt-bbbbbbbbbbbbbbbb3', 'qr', 45);
    const after = await db.withTenant(t.actor, (tx) => scanSummary(tx));
    // A typed or shared link is a visit, not a scan; 45 days ago is always an earlier month.
    expect(after.thisMonth - before.thisMonth).toBe(1);
    expect(after.allTime - before.allTime).toBe(2);
    const current = after.monthly.find((m) => m.month === after.month)!;
    expect(current.total).toBe(current.table + current.qr);
    expect(current.direct - (before.monthly.find((m) => m.month === after.month)?.direct ?? 0)).toBe(1);
    expect(after.monthly).toHaveLength(2);
    expect(after.monthly[0]!.month).toBe(after.month);
    const today = after.last30Days.at(-1)!;
    expect(today.direct).toBeGreaterThanOrEqual(1);
  });

  it('tenant cannot write its own scan counters', async () => {
    await expect(
      db.withTenant(t.actor, (tx) => tx.query(`UPDATE qx.qr_scan_daily SET valid_count = 99999`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('geofence gates the menu payload until the client reports a check', async () => {
    await db.withTenant(t.actor, (tx) => updateGeofence(tx, t.actor, { mode: 'RADIUS', center: { lat: 41.0, lng: 29.0 }, radiusKm: 0.5, regions: [] }));
    const gated = await publicMenu('sayac-kafe', false);
    expect(gated.state).toBe('GEOFENCE_REQUIRED');
    expect(gated.snapshot).toBeUndefined();
    expect((await publicMenu('sayac-kafe', true)).state).toBe('OK');
    await db.withTenant(t.actor, (tx) => updateGeofence(tx, t.actor, { mode: 'OFF', center: null, radiusKm: null, regions: [] }));
  });

  it('Wi-Fi is optional and only ciphertext is stored', async () => {
    expect((await publicMenu('sayac-kafe')).wifi).toBeNull();
    await db.withTenant(t.actor, (tx) => updateWifi(tx, t.actor, { enabled: true, ssid: 'KafeWifi', passwordCiphertext: 'v1:iv:ct:tag' }));
    expect((await publicMenu('sayac-kafe')).wifi).toEqual({ ssid: 'KafeWifi', passwordCiphertext: 'v1:iv:ct:tag' });
    // Updating without a new password keeps the stored one.
    await db.withTenant(t.actor, (tx) => updateWifi(tx, t.actor, { enabled: true, ssid: 'KafeWifi2' }));
    expect((await publicMenu('sayac-kafe')).wifi.passwordCiphertext).toBe('v1:iv:ct:tag');
    const a = await ownerQuery(`SELECT metadata FROM qx.audit_logs WHERE action = 'branch.wifi' ORDER BY id DESC LIMIT 1`);
    expect(JSON.stringify(a.rows[0].metadata)).not.toContain('v1:iv:ct:tag');
  });

  it('unknown slugs reveal nothing', async () => {
    expect(await publicMenu('yok-boyle-bir-yer')).toEqual({ state: 'UNAVAILABLE', reason: 'NOT_FOUND' });
  });
});

describe('invites', () => {
  it('accepting an invite joins exactly that tenant, once, and only for the invited e-mail', async () => {
    const t = await makeTenant(db, operatorId, 'davet-kafe');
    const staff = await makeUser(db, 'staff');
    const other = await makeUser(db, 'other');
    const { rows } = await ownerQuery('SELECT email FROM qx.users WHERE id = $1', [staff.id]);
    await db.withTenant(t.actor, (tx) => createInvite(tx, t.actor, { email: rows[0].email.toUpperCase(), role: 'STAFF', tokenHash: 'invite-hash-1', ttlHours: 48 }));
    expect(await db.withAuth(staff.id, (tx) => acceptInvite(tx, 'wrong-hash'))).toBeNull();
    // A leaked link is useless to anyone else.
    expect(await db.withAuth(other.id, (tx) => acceptInvite(tx, 'invite-hash-1'))).toBeNull();
    expect(await db.withAuth(staff.id, (tx) => acceptInvite(tx, 'invite-hash-1'))).toBe(t.tenantId);
    expect(await db.withAuth(staff.id, (tx) => acceptInvite(tx, 'invite-hash-1'))).toBeNull();
    const m = await db.withAuth(staff.id, (tx) => tx.query('SELECT tenant_id, role FROM qx.memberships'));
    expect(m.rows).toEqual([{ tenant_id: t.tenantId, role: 'STAFF' }]);
  });
});

describe('migration rollback', () => {
  it('down then up is clean and idempotent', async () => {
    await db.close();
    await resetSchema();
    await resetSchema();
    db = new Db({ connectionString: TEST_URL, max: 1 });
    const r = await ownerQuery(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'qx'`);
    expect(r.rows[0].n).toBeGreaterThan(30);
  });
});
