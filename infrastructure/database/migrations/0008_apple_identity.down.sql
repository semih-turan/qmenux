-- Remove Apple callers first; never delete identities or attempts to force rollback.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
DO $guard$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations)
    IS DISTINCT FROM ARRAY['0001_tenant_catalog', '0002_tenant_resolution', '0003_identity_sessions', '0004_tenant_memberships', '0005_operator_sessions', '0006_auth_expiry', '0007_microsoft_identity', '0008_apple_identity'] THEN
    RAISE EXCEPTION 'Unexpected migration versions';
  END IF;
END
$guard$;
LOCK TABLE qmenux_identity.external_identities, qmenux_identity.login_attempts IN ACCESS EXCLUSIVE MODE;
DO $data_guard$
BEGIN
  IF EXISTS (SELECT FROM qmenux_identity.external_identities WHERE issuer = 'https://appleid.apple.com')
    OR EXISTS (SELECT FROM qmenux_identity.login_attempts WHERE issuer = 'https://appleid.apple.com') THEN
    RAISE EXCEPTION 'Apple identity or attempt records prevent rollback';
  END IF;
END
$data_guard$;
DROP FUNCTION qmenux_identity.begin_apple_login(text,text,text);
DROP FUNCTION qmenux_identity.consume_apple_login(text,text);
DROP FUNCTION qmenux_identity.create_apple_session(text,text,text);
ALTER TABLE qmenux_identity.login_attempts DROP CONSTRAINT login_attempts_provider_verifier;
ALTER TABLE qmenux_identity.login_attempts ALTER COLUMN verifier SET NOT NULL;
ALTER TABLE qmenux_identity.login_attempts DROP CONSTRAINT login_attempts_issuer_check;
ALTER TABLE qmenux_identity.login_attempts ADD CONSTRAINT login_attempts_issuer_check
  CHECK (issuer IN ('https://accounts.google.com', 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0'));
ALTER TABLE qmenux_identity.external_identities DROP CONSTRAINT external_identities_issuer_check;
ALTER TABLE qmenux_identity.external_identities ADD CONSTRAINT external_identities_issuer_check
  CHECK (issuer IN ('https://accounts.google.com', 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0'));
DELETE FROM qmenux.schema_migrations WHERE version = '0008_apple_identity';
