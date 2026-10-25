-- Remove admin tenant callers first; existing sessions, memberships and catalog history survive.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
DO $guard$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations)
    IS DISTINCT FROM ARRAY['0001_tenant_catalog', '0002_tenant_resolution', '0003_identity_sessions', '0004_tenant_memberships', '0005_operator_sessions', '0006_auth_expiry', '0007_microsoft_identity', '0008_apple_identity', '0009_admin_audience', '0010_draft_product_events', '0011_admin_tenant_membership'] THEN
    RAISE EXCEPTION 'Unexpected migration versions';
  END IF;
END
$guard$;
DROP FUNCTION qmenux_identity.admin_tenant_membership(text,text);
DELETE FROM qmenux.schema_migrations WHERE version = '0011_admin_tenant_membership';
