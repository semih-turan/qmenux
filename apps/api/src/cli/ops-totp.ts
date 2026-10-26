import { randomBytes } from 'node:crypto';
import { Db, identity } from '@qmenux/database';
import { loadConfig } from '../config.js';
import { base32Encode, encrypt, otpauthUri } from '../crypto.js';

/**
 * Operator TOTP enrolment (CLI only; never exposed over HTTP).
 *   pnpm --filter @qmenux/api ops:totp <operator-user-id>
 * Prints the secret ONCE to this terminal. Store it in an authenticator app, then discard the output.
 */
const userId = process.argv[2];
if (!userId) {
  console.error('Kullanım: ops:totp <operator-user-id>');
  process.exit(2);
}
const cfg = loadConfig();
const db = new Db({ connectionString: process.env.DATABASE_DIRECT_URL || cfg.databaseUrl, ssl: cfg.isProduction });
try {
  const secret = base32Encode(randomBytes(20));
  await db.withAuth(userId, async (tx) => {
    const op = await identity.getOperator(tx, userId);
    if (!op) throw new Error('Bu kullanıcı bir platform operatörü değil');
    await identity.setOperatorTotp(tx, userId, encrypt(cfg.dataKey, secret, `totp:${userId}`), true);
  });
  console.log('TOTP kaydedildi. Doğrulayıcı uygulamaya ekleyin:');
  console.log(otpauthUri(secret, userId));
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await db.pool.end();
}
