-- Remove callers before rollback. Never restore or reissue expired credentials.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
DO $guard$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations)
    IS DISTINCT FROM ARRAY['0001_tenant_catalog', '0002_tenant_resolution', '0003_identity_sessions', '0004_tenant_memberships', '0005_operator_sessions', '0006_auth_expiry'] THEN
    RAISE EXCEPTION 'Unexpected migration versions';
  END IF;
END
$guard$;
DROP FUNCTION qmenux_identity.cleanup_expired();
DROP FUNCTION qmenux_operator.cleanup_expired();
DROP INDEX qmenux_identity.login_attempts_expiry;
DROP INDEX qmenux_identity.identity_sessions_expiry;
DROP INDEX qmenux_operator.operator_sessions_expiry;
DELETE FROM qmenux.schema_migrations WHERE version = '0006_auth_expiry';
