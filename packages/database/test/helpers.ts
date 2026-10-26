import pg from 'pg';
import { Db } from '../src/db.js';
import { migrateDown, migrateUp } from '../src/migrate.js';
import { findOrCreateUserByIdentity, submitApplication } from '../src/repos/identity.js';
import { approveApplication, grantLicense } from '../src/repos/platform.js';

/** Local throwaway database only (scripts/dev-db.sh). Never point this at Neon. */
export const TEST_URL = process.env.QX_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/qmenux_test';

export async function resetSchema() {
  await migrateDown(TEST_URL, 100, () => undefined);
  await migrateUp(TEST_URL, () => undefined);
}

export async function ownerQuery(sql: string, values: unknown[] = []) {
  const c = new pg.Client({ connectionString: TEST_URL });
  await c.connect();
  try {
    return await c.query(sql, values);
  } finally {
    await c.end();
  }
}

let seq = 0;
export async function makeUser(db: Db, label: string) {
  seq += 1;
  return db.withAuth(null, (tx) =>
    findOrCreateUserByIdentity(tx, {
      provider: 'dev',
      issuer: 'https://dev-idp.test',
      subject: `${label}-${seq}-${Date.now()}`,
      email: `${label}${seq}@example.test`,
      emailVerified: true,
      name: label,
    }),
  );
}

export async function makeOperator(db: Db) {
  const u = await makeUser(db, 'operator');
  await ownerQuery(`INSERT INTO qx.platform_operators (user_id, role) VALUES ($1, 'PLATFORM_ADMIN')`, [u.id]);
  return u;
}

/** Full onboarding path: application → superadmin approval → (optional) manual license. */
export async function makeTenant(db: Db, operatorId: string, slug: string, opts: { license?: boolean } = {}) {
  const owner = await makeUser(db, `owner-${slug}`);
  const app = await db.withAuth(owner.id, (tx) =>
    submitApplication(tx, owner.id, {
      businessName: `Test ${slug}`,
      slug,
      businessType: 'CAFE',
      contactPhone: '+905550000001',
      city: 'Ankara',
      acceptedTermsVersion: 'draft-0',
    }),
  );
  if (typeof app === 'string') throw new Error(app);
  const tenantId = await db.withPlatform(operatorId, (tx) => approveApplication(tx, operatorId, app.id, 'test'));
  if (opts.license !== false) {
    await db.withPlatform(operatorId, (tx) => grantLicense(tx, operatorId, tenantId, new Date(Date.now() + 30 * 86400_000), null));
  }
  return { tenantId, ownerId: owner.id, actor: { tenantId, userId: owner.id } };
}
