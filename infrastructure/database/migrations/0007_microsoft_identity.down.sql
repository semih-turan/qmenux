-- Remove Microsoft callers first; never delete provider identities to force rollback.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
DO $guard$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations)
    IS DISTINCT FROM ARRAY['0001_tenant_catalog', '0002_tenant_resolution', '0003_identity_sessions', '0004_tenant_memberships', '0005_operator_sessions', '0006_auth_expiry', '0007_microsoft_identity'] THEN
    RAISE EXCEPTION 'Unexpected migration versions';
  END IF;
END
$guard$;
LOCK TABLE qmenux_identity.external_identities, qmenux_identity.login_attempts IN ACCESS EXCLUSIVE MODE;
DO $data_guard$
BEGIN
  IF EXISTS (SELECT FROM qmenux_identity.external_identities WHERE issuer <> 'https://accounts.google.com')
    OR EXISTS (SELECT FROM qmenux_identity.login_attempts WHERE issuer <> 'https://accounts.google.com') THEN
    RAISE EXCEPTION 'Microsoft identity or attempt records prevent rollback';
  END IF;
END
$data_guard$;
DROP FUNCTION qmenux_identity.begin_microsoft_login(text,text,text,text);
DROP FUNCTION qmenux_identity.consume_microsoft_login(text,text);
DROP FUNCTION qmenux_identity.create_microsoft_session(text,text,text);
CREATE OR REPLACE FUNCTION qmenux_identity.consume_login(state_hash text, browser_hash text)
RETURNS TABLE(verifier text, nonce text) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DELETE FROM qmenux_identity.login_attempts AS attempt
  WHERE attempt.state_hash = $1 AND attempt.browser_hash = $2 AND attempt.expires_at > now()
  RETURNING attempt.verifier, attempt.nonce
$f$;
ALTER TABLE qmenux_identity.login_attempts DROP COLUMN issuer;
ALTER TABLE qmenux_identity.external_identities DROP CONSTRAINT external_identities_issuer_check;
ALTER TABLE qmenux_identity.external_identities ADD CONSTRAINT external_identities_issuer_check
  CHECK (issuer = 'https://accounts.google.com');
DELETE FROM qmenux.schema_migrations WHERE version = '0007_microsoft_identity';
