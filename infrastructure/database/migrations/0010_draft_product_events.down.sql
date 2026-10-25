-- Remove callers first. Data-bearing rollback is refused, never forced by deleting history.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
DO $guard$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations)
    IS DISTINCT FROM ARRAY['0001_tenant_catalog', '0002_tenant_resolution', '0003_identity_sessions', '0004_tenant_memberships', '0005_operator_sessions', '0006_auth_expiry', '0007_microsoft_identity', '0008_apple_identity', '0009_admin_audience', '0010_draft_product_events'] THEN
    RAISE EXCEPTION 'Unexpected migration versions';
  END IF;
END
$guard$;
LOCK TABLE qmenux.products, qmenux.product_events IN ACCESS EXCLUSIVE MODE;
SET LOCAL row_security = off;
DO $data_guard$
BEGIN
  IF EXISTS (SELECT FROM qmenux.product_events) OR EXISTS (SELECT FROM qmenux.products WHERE revision <> 1) THEN
    RAISE EXCEPTION 'Product history prevents rollback';
  END IF;
END
$data_guard$;
DROP TRIGGER product_change ON qmenux.products;
DROP FUNCTION qmenux.record_product_change();
DROP TABLE qmenux.product_events;
DROP FUNCTION qmenux.reject_product_event_change();
ALTER TABLE qmenux.products DROP COLUMN revision;
GRANT DELETE ON qmenux.products TO qmenux_runtime;
DELETE FROM qmenux.schema_migrations WHERE version = '0010_draft_product_events';
