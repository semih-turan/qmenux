import type { AllergenEntry } from '@qmenux/contracts';
import pg from 'pg';
import { Db } from './db.js';
import { createCategory, createProduct, publishMenu } from './repos/catalog.js';
import { findOrCreateUserByIdentity, submitApplication } from './repos/identity.js';
import { approveApplication, grantLicense } from './repos/platform.js';

/** Issuer of the local mock IdP (QX_DEV_IDP=1). Never accepted in production. */
export const DEV_ISSUER = 'https://dev-idp.qmenux.localhost';

/**
 * Fictional development data only (no real businesses or personal data).
 * Goes through the same repositories and DB roles as the application, except the
 * operator bootstrap, which needs the owner connection by design.
 */
export async function seedDev(ownerUrl: string, runtimeUrl = ownerUrl, log: (m: string) => void = console.log) {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    throw new Error('refusing to seed a production database');
  }
  const db = new Db({ connectionString: runtimeUrl });
  try {
    const user = (subject: string, name: string) =>
      db.withAuth(null, (tx) =>
        findOrCreateUserByIdentity(tx, { provider: 'dev', issuer: DEV_ISSUER, subject, email: `${subject}@example.test`, emailVerified: true, name }),
      );
    const owner = await user('dev-owner', 'Demo İşletme Sahibi');
    const operator = await user('dev-operator', 'Demo Operatör');
    await user('dev-applicant', 'Demo Başvuru Sahibi');

    const owner_ = new pg.Client({ connectionString: ownerUrl });
    await owner_.connect();
    try {
      await owner_.query(
        `INSERT INTO qx.platform_operators (user_id, role) VALUES ($1, 'PLATFORM_ADMIN') ON CONFLICT (user_id) DO NOTHING`,
        [operator.id],
      );
    } finally {
      await owner_.end();
    }

    const existing = await db.withAuth(owner.id, (tx) => tx.query('SELECT tenant_id FROM qx.memberships WHERE user_id = $1', [owner.id]));
    if (existing.rows[0]) {
      log('seed: demo tenant already present, skipping');
      return;
    }

    const app = await db.withAuth(owner.id, (tx) =>
      submitApplication(tx, owner.id, {
        businessName: 'Demo Kahve',
        slug: 'demo-kahve',
        businessType: 'COFFEE_SHOP',
        contactPhone: '+905550000000',
        city: 'İstanbul',
        note: 'Geliştirme verisi',
        acceptedTermsVersion: 'draft-0',
      }),
    );
    if (typeof app === 'string') throw new Error(`seed application failed: ${app}`);
    const tenantId = await db.withPlatform(operator.id, (tx) => approveApplication(tx, operator.id, app.id, 'Geliştirme verisi'));
    const oneYear = new Date(Date.now() + 365 * 24 * 3600 * 1000);
    await db.withPlatform(operator.id, (tx) => grantLicense(tx, operator.id, tenantId, oneYear, 'Geliştirme lisansı'));

    const actor = { tenantId, userId: owner.id };
    await db.withTenant(actor, async (tx) => {
      const hot = await createCategory(tx, actor, { name: 'Sıcak kahveler', description: null, isVisible: true });
      const cold = await createCategory(tx, actor, { name: 'Soğuk içecekler', description: null, isVisible: true });
      const sweet = await createCategory(tx, actor, { name: 'Tatlılar', description: 'Günlük taze', isVisible: true });
      // Owner-entered, deliberately UNVERIFIED: the public menu shows them as "unknown" until verified.
      const contains = (code: AllergenEntry['code']): AllergenEntry => ({ code, status: 'CONTAINS', verification: 'UNVERIFIED', source: 'MANUAL' });
      const milk = [contains('MILK')];
      const items: [string, string, number, string | null, AllergenEntry[]][] = [
        [hot, 'Espresso', 9000, 'Tek shot', []],
        [hot, 'Latte', 13500, 'Espresso ve süt köpüğü', milk],
        [hot, 'Türk kahvesi', 10000, null, []],
        [cold, 'Soğuk demleme', 14000, '16 saat demlenmiş', []],
        [cold, 'Ev yapımı limonata', 12000, null, []],
        [sweet, 'Cheesecake', 18000, 'Frambuaz soslu', [contains('MILK'), contains('GLUTEN')]],
      ];
      for (const [categoryId, name, priceMinor, description, allergens] of items) {
        await createProduct(tx, actor, { categoryId, name, priceMinor, description, tags: [], allergens, calories: null });
      }
      await publishMenu(tx, actor, { expectedRevisionNo: 0, note: 'İlk yayın (geliştirme)' });
    });
    log(`seed: demo-kahve tenant ${tenantId} (owner dev-owner, operator dev-operator)`);
  } finally {
    await db.close();
  }
}
