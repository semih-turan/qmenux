SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
DO $guard$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations)
    IS DISTINCT FROM ARRAY['0001_tenant_catalog', '0002_tenant_resolution', '0003_identity_sessions'] THEN
    RAISE EXCEPTION 'Unexpected migration versions';
  END IF;
  LOCK TABLE qmenux_identity.users, qmenux_identity.external_identities,
    qmenux_identity.login_attempts, qmenux_identity.sessions IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT FROM qmenux_identity.users) OR EXISTS (SELECT FROM qmenux_identity.external_identities)
    OR EXISTS (SELECT FROM qmenux_identity.login_attempts) OR EXISTS (SELECT FROM qmenux_identity.sessions) THEN
    RAISE EXCEPTION 'Rollback refused: identity data exists';
  END IF;
END
$guard$;
DROP FUNCTION qmenux_identity.begin_login(text, text, text, text);
DROP FUNCTION qmenux_identity.consume_login(text, text);
DROP FUNCTION qmenux_identity.create_session(text, text, text);
DROP FUNCTION qmenux_identity.read_session(text);
DROP FUNCTION qmenux_identity.revoke_session(text);
DROP TABLE qmenux_identity.sessions;
DROP TABLE qmenux_identity.login_attempts;
DROP TABLE qmenux_identity.external_identities;
DROP TABLE qmenux_identity.users;
DROP SCHEMA qmenux_identity;
DELETE FROM qmenux.schema_migrations WHERE version = '0003_identity_sessions';
