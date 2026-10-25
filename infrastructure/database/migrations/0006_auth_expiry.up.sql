-- Atomic direct-owner migration; only already-expired credentials can be purged.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
DO $guard$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations)
    IS DISTINCT FROM ARRAY['0001_tenant_catalog', '0002_tenant_resolution', '0003_identity_sessions', '0004_tenant_memberships', '0005_operator_sessions'] THEN
    RAISE EXCEPTION 'Expected identity/operator baseline only';
  END IF;
END
$guard$;
CREATE INDEX login_attempts_expiry ON qmenux_identity.login_attempts(expires_at, state_hash);
CREATE INDEX identity_sessions_expiry ON qmenux_identity.sessions(expires_at, token_hash);
CREATE INDEX operator_sessions_expiry ON qmenux_operator.sessions(expires_at, token_hash);
CREATE FUNCTION qmenux_identity.cleanup_expired()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE attempts integer; sessions integer;
BEGIN
  WITH expired AS (
    SELECT state_hash FROM qmenux_identity.login_attempts WHERE expires_at <= now()
    ORDER BY expires_at, state_hash LIMIT 100 FOR UPDATE SKIP LOCKED
  ) DELETE FROM qmenux_identity.login_attempts a USING expired e WHERE a.state_hash = e.state_hash;
  GET DIAGNOSTICS attempts = ROW_COUNT;
  WITH expired AS (
    SELECT token_hash FROM qmenux_identity.sessions WHERE expires_at <= now()
    ORDER BY expires_at, token_hash LIMIT 100 FOR UPDATE SKIP LOCKED
  ) DELETE FROM qmenux_identity.sessions s USING expired e WHERE s.token_hash = e.token_hash;
  GET DIAGNOSTICS sessions = ROW_COUNT;
  RETURN attempts + sessions;
END
$f$;
CREATE FUNCTION qmenux_operator.cleanup_expired()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE sessions integer;
BEGIN
  WITH expired AS (
    SELECT token_hash FROM qmenux_operator.sessions WHERE expires_at <= now()
    ORDER BY expires_at, token_hash LIMIT 100 FOR UPDATE SKIP LOCKED
  ) DELETE FROM qmenux_operator.sessions s USING expired e WHERE s.token_hash = e.token_hash;
  GET DIAGNOSTICS sessions = ROW_COUNT;
  RETURN sessions;
END
$f$;
REVOKE ALL ON FUNCTION qmenux_identity.cleanup_expired(), qmenux_operator.cleanup_expired() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qmenux_identity.cleanup_expired(), qmenux_operator.cleanup_expired() TO qmenux_runtime;
INSERT INTO qmenux.schema_migrations(version) VALUES ('0006_auth_expiry');
