SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
DO $guard$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations)
    IS DISTINCT FROM ARRAY['0001_tenant_catalog', '0002_tenant_resolution', '0003_identity_sessions', '0004_tenant_memberships'] THEN
    RAISE EXCEPTION 'Unexpected migration versions';
  END IF;
  LOCK TABLE qmenux_identity.memberships IN ACCESS EXCLUSIVE MODE;
  SET LOCAL row_security = off;
  IF EXISTS (SELECT FROM qmenux_identity.memberships) THEN
    RAISE EXCEPTION 'Rollback refused: memberships exist';
  END IF;
END
$guard$;
DROP TRIGGER membership_session_revocation ON qmenux_identity.memberships;
DROP TRIGGER user_status_session_revocation ON qmenux_identity.users;
DROP FUNCTION qmenux_identity.revoke_authorization_sessions();
DROP FUNCTION qmenux_identity.tenant_membership(text);
DROP TABLE qmenux_identity.memberships;
DELETE FROM qmenux.schema_migrations WHERE version = '0004_tenant_memberships';
