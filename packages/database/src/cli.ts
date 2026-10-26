import { migrateDown, migrateUp } from './migrate.js';
import { seedDev } from './seed.js';

/** Migrations and seed use the direct (non-pooled) owner URL; never the pooled runtime URL. */
const direct = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!direct) {
  console.error('DATABASE_DIRECT_URL is not set');
  process.exit(1);
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === 'migrate') await migrateUp(direct);
  else if (cmd === 'rollback') await migrateDown(direct, Number(arg ?? 1));
  else if (cmd === 'seed') await seedDev(direct, process.env.DATABASE_URL ?? direct);
  else {
    console.error('usage: cli <migrate|rollback [steps]|seed>');
    process.exit(2);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
