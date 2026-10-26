import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db } from '../src/db.js';
import { createCategory, createProduct, listProducts, publishMenu } from '../src/repos/catalog.js';
import { listTenants } from '../src/repos/platform.js';
import { createQrTable } from '../src/repos/settings.js';
import { makeOperator, makeTenant, resetSchema, TEST_URL } from './helpers.js';

let db: Db;
let A: Awaited<ReturnType<typeof makeTenant>>;
let B: Awaited<ReturnType<typeof makeTenant>>;
let productB: string;
let operatorId: string;

beforeAll(async () => {
  await resetSchema();
  // max: 1 forces every unit of work onto the SAME pooled connection (pool reuse test).
  db = new Db({ connectionString: TEST_URL, max: 1 });
  operatorId = (await makeOperator(db)).id;
  A = await makeTenant(db, operatorId, 'kafe-a');
  B = await makeTenant(db, operatorId, 'kafe-b');
  await db.withTenant(A.actor, async (tx) => {
    const c = await createCategory(tx, A.actor, { name: 'A içecekler', description: null, isVisible: true });
    await createProduct(tx, A.actor, { categoryId: c, name: 'A çay', priceMinor: 5000, tags: [], allergens: [], description: null, calories: null });
  });
  productB = await db.withTenant(B.actor, async (tx) => {
    const c = await createCategory(tx, B.actor, { name: 'B içecekler', description: null, isVisible: true });
    return createProduct(tx, B.actor, { categoryId: c, name: 'B kahve', priceMinor: 7000, tags: [], allergens: [], description: null, calories: null });
  });
});

afterAll(async () => {
  await db?.close();
});

describe('tenant isolation (RLS)', () => {
  it('lists only own products', async () => {
    const names = await db.withTenant(A.actor, async (tx) => (await listProducts(tx)).map((p) => p.name));
    expect(names).toEqual(['A çay']);
  });

  it('cannot GET another tenant row by id', async () => {
    const r = await db.withTenant(A.actor, (tx) => tx.query('SELECT * FROM qx.products WHERE id = $1', [productB]));
    expect(r.rowCount).toBe(0);
  });

  it('cannot UPDATE or DELETE another tenant row by id', async () => {
    const u = await db.withTenant(A.actor, (tx) => tx.query(`UPDATE qx.products SET name = 'hacked' WHERE id = $1`, [productB]));
    const d = await db.withTenant(A.actor, (tx) => tx.query('DELETE FROM qx.products WHERE id = $1', [productB]));
    expect(u.rowCount).toBe(0);
    expect(d.rowCount).toBe(0);
    const still = await db.withTenant(B.actor, (tx) => tx.query('SELECT name FROM qx.products WHERE id = $1', [productB]));
    expect(still.rows[0]?.name).toBe('B kahve');
  });

  it('cannot INSERT rows carrying another tenant id', async () => {
    await expect(
      db.withTenant(A.actor, (tx) => tx.query(`INSERT INTO qx.media_assets (tenant_id, object_key, content_type, bytes) VALUES ($1, 'x', 'image/png', 10)`, [B.tenantId])),
    ).rejects.toThrow(/row-level security/);
  });

  it('sees no other tenant in qx.tenants and cannot change status/slug', async () => {
    const r = await db.withTenant(A.actor, (tx) => tx.query('SELECT id FROM qx.tenants'));
    expect(r.rows.map((x) => x.id)).toEqual([A.tenantId]);
    await expect(db.withTenant(A.actor, (tx) => tx.query(`UPDATE qx.tenants SET status = 'ACTIVE'`))).rejects.toThrow(/permission denied/);
    await expect(db.withTenant(A.actor, (tx) => tx.query(`UPDATE qx.tenants SET slug = 'x-y-z'`))).rejects.toThrow(/permission denied/);
  });

  it('cannot read or write license grants of anyone / at all', async () => {
    const r = await db.withTenant(A.actor, (tx) => tx.query('SELECT tenant_id FROM qx.license_grants'));
    expect(r.rows.every((x) => x.tenant_id === A.tenantId)).toBe(true);
    await expect(
      db.withTenant(A.actor, (tx) => tx.query(`INSERT INTO qx.license_grants (tenant_id, starts_at, ends_at, granted_by) VALUES ($1, now(), now() + interval '9 years', $2)`, [A.tenantId, A.ownerId])),
    ).rejects.toThrow(/permission denied/);
  });

  it('cannot write audit entries pretending to be an operator', async () => {
    await expect(
      db.withTenant(A.actor, (tx) => tx.query(`INSERT INTO qx.audit_logs (tenant_id, actor_kind, action) VALUES ($1, 'operator', 'fake')`, [A.tenantId])),
    ).rejects.toThrow(/row-level security/);
  });

  it('audit log is append-only', async () => {
    await expect(db.withTenant(A.actor, (tx) => tx.query('DELETE FROM qx.audit_logs'))).rejects.toThrow();
  });
});

describe('missing or malformed context', () => {
  it('rejects non-uuid tenant context before touching the database', () => {
    expect(() => db.withTenant({ tenantId: "x' OR 1=1 --", userId: null }, async () => 1)).toThrow(/invalid tenant context/);
  });

  it('app role without tenant context sees nothing and cannot insert', async () => {
    const c = new pg.Client({ connectionString: TEST_URL });
    await c.connect();
    try {
      await c.query('BEGIN');
      await c.query('SET LOCAL ROLE qmenux_app');
      const r = await c.query('SELECT count(*)::int AS n FROM qx.products');
      expect(r.rows[0].n).toBe(0);
      await expect(c.query(`INSERT INTO qx.categories (tenant_id, branch_id, name) VALUES ($1, $1, 'x')`, [A.tenantId])).rejects.toThrow();
      await c.query('ROLLBACK');
    } finally {
      await c.end();
    }
  });

  it('context never survives on a reused pooled connection', async () => {
    await db.withTenant(A.actor, (tx) => tx.query('SELECT 1'));
    const r = await db.withAuth(null, (tx) =>
      tx.query(`SELECT current_setting('app.tenant_id', true) AS t, current_user AS role`),
    );
    expect(r.rows[0].t ?? '').toBe('');
    expect(r.rows[0].role).toBe('qmenux_auth');
    // And after the transaction the session role is back to the login role.
    const outer = await db.pool.query('SELECT current_user AS role, current_setting($1, true) AS t', ['app.tenant_id']);
    expect(outer.rows[0].role).not.toMatch(/^qmenux_/);
    expect(outer.rows[0].t ?? '').toBe('');
  });

  it('a failed transaction does not leak its context either', async () => {
    await expect(db.withTenant(A.actor, async (tx) => {
      await tx.query('SELECT 1/0');
    })).rejects.toThrow();
    const r = await db.withTenant(B.actor, (tx) => tx.query('SELECT DISTINCT tenant_id FROM qx.products'));
    expect(r.rows.map((x) => x.tenant_id)).toEqual([B.tenantId]);
  });
});

describe('role boundaries', () => {
  it('public role cannot read any table directly', async () => {
    for (const t of ['products', 'tenants', 'users', 'branch_wifi', 'qr_tables', 'menu_revisions']) {
      await expect(db.withPublic((tx) => tx.query(`SELECT 1 FROM qx.${t} LIMIT 1`))).rejects.toThrow(/permission denied/);
    }
  });

  it('auth role cannot read catalog or other users memberships', async () => {
    await expect(db.withAuth(A.ownerId, (tx) => tx.query('SELECT 1 FROM qx.products'))).rejects.toThrow(/permission denied/);
    const m = await db.withAuth(A.ownerId, (tx) => tx.query('SELECT tenant_id FROM qx.memberships'));
    expect(m.rows.map((r) => r.tenant_id)).toEqual([A.tenantId]);
  });

  it('auth role cannot add itself to another tenant', async () => {
    await expect(
      db.withAuth(A.ownerId, (tx) => tx.query(`INSERT INTO qx.memberships (tenant_id, user_id, role) VALUES ($1, $2, 'OWNER')`, [B.tenantId, A.ownerId])),
    ).rejects.toThrow(/permission denied/);
  });

  it('platform role never reads catalog contents', async () => {
    await expect(db.withPlatform(operatorId, (tx) => tx.query('SELECT 1 FROM qx.products'))).rejects.toThrow(/permission denied/);
    await expect(db.withPlatform(operatorId, (tx) => tx.query('SELECT 1 FROM qx.branch_wifi'))).rejects.toThrow(/permission denied/);
  });

  it('platform lists tenants with license state', async () => {
    const list = await db.withPlatform(operatorId, (tx) => listTenants(tx, 7));
    expect(list.map((t) => t.slug).sort()).toEqual(['kafe-a', 'kafe-b']);
    expect(list.every((t) => t.licenseState === 'ACTIVE' && t.status === 'ACTIVE')).toBe(true);
  });

  it('QR table tokens are unique and tenant-bound', async () => {
    await db.withTenant(A.actor, (tx) => createQrTable(tx, A.actor, 'Masa 1', 'hash-a-1'));
    await expect(db.withTenant(B.actor, (tx) => createQrTable(tx, B.actor, 'Masa 1', 'hash-a-1'))).rejects.toThrow(/token collision/);
  });

  it('publishing in A does not affect B', async () => {
    await db.withTenant(A.actor, (tx) => publishMenu(tx, A.actor, { expectedRevisionNo: 0 }));
    const b = await db.withTenant(B.actor, (tx) => tx.query('SELECT count(*)::int AS n FROM qx.menu_revisions'));
    expect(b.rows[0].n).toBe(0);
  });
});
