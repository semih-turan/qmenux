-- Direct-owner atomic migration. No application data is deleted.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
DO $guard$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations)
    IS DISTINCT FROM ARRAY['0001_tenant_catalog', '0002_tenant_resolution', '0003_identity_sessions', '0004_tenant_memberships', '0005_operator_sessions', '0006_auth_expiry', '0007_microsoft_identity', '0008_apple_identity', '0009_admin_audience', '0010_draft_product_events', '0011_admin_tenant_membership', '0012_draft_menu_structure'] THEN
    RAISE EXCEPTION 'Unexpected migration versions';
  END IF;
END
$guard$;
LOCK TABLE qmenux.menus, qmenux.categories, qmenux.menu_events, qmenux.category_events IN ACCESS EXCLUSIVE MODE;
SET LOCAL row_security = off;
DO $data_guard$
BEGIN
  IF EXISTS (SELECT FROM qmenux.menu_events) OR EXISTS (SELECT FROM qmenux.category_events)
    OR EXISTS (SELECT FROM qmenux.menus WHERE revision <> 1) OR EXISTS (SELECT FROM qmenux.categories WHERE revision <> 1) THEN
    RAISE EXCEPTION 'Catalog history prevents rollback';
  END IF;
END
$data_guard$;
DROP TRIGGER menu_change ON qmenux.menus;
DROP TRIGGER category_change ON qmenux.categories;
DROP FUNCTION qmenux.record_structure_change();
DROP TABLE qmenux.menu_events;
DROP TABLE qmenux.category_events;
DROP FUNCTION qmenux.reject_structure_event_change();
ALTER TABLE qmenux.menus DROP COLUMN revision;
ALTER TABLE qmenux.categories DROP COLUMN revision;
GRANT DELETE ON qmenux.menus, qmenux.categories TO qmenux_runtime;
DELETE FROM qmenux.schema_migrations WHERE version = '0012_draft_menu_structure';
