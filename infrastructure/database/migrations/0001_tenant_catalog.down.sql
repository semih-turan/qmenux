-- Empty-development rollback only; execute in one transaction as the migration owner.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
-- Fail rather than mistaking RLS-hidden rows for an empty database.
SET LOCAL row_security = off;
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
LOCK TABLE qmenux.tenants, qmenux.branches, qmenux.menus, qmenux.categories, qmenux.products IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
  IF (SELECT array_agg(version) FROM qmenux.schema_migrations) IS DISTINCT FROM ARRAY['0001_tenant_catalog']
    OR EXISTS (SELECT FROM qmenux.tenants)
    OR EXISTS (SELECT FROM qmenux.branches)
    OR EXISTS (SELECT FROM qmenux.menus)
    OR EXISTS (SELECT FROM qmenux.categories)
    OR EXISTS (SELECT FROM qmenux.products) THEN
    RAISE EXCEPTION 'Rollback refused: later migrations or application data exist';
  END IF;
END
$guard$;
DROP TABLE qmenux.products;
DROP TABLE qmenux.categories;
DROP TABLE qmenux.menus;
DROP TABLE qmenux.branches;
DROP TABLE qmenux.tenants;
DROP TABLE qmenux.schema_migrations;
DROP SCHEMA qmenux;
