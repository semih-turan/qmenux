SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
DO $guard$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations)
    IS DISTINCT FROM ARRAY['0001_tenant_catalog', '0002_tenant_resolution', '0003_identity_sessions', '0004_tenant_memberships', '0005_operator_sessions'] THEN
    RAISE EXCEPTION 'Unexpected migration versions';
  END IF;
  LOCK TABLE qmenux_operator.operators, qmenux_operator.sessions IN ACCESS EXCLUSIVE MODE;
  SET LOCAL row_security = off;
  IF EXISTS (SELECT FROM qmenux_operator.operators) OR EXISTS (SELECT FROM qmenux_operator.sessions) THEN
    RAISE EXCEPTION 'Rollback refused: operator records exist';
  END IF;
END
$guard$;
DROP TRIGGER operator_session_revocation ON qmenux_operator.operators;
DROP FUNCTION qmenux_operator.revoke_changed_operator();
DROP FUNCTION qmenux_operator.create_session(text,text,text,text,text);
DROP FUNCTION qmenux_operator.read_session(text,text,text,text);
DROP FUNCTION qmenux_operator.revoke_session(text,text,text,text);
DROP TABLE qmenux_operator.sessions;
DROP TABLE qmenux_operator.operators;
DROP SCHEMA qmenux_operator;
DELETE FROM qmenux.schema_migrations WHERE version = '0005_operator_sessions';
