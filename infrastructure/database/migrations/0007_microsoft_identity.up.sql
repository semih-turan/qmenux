-- Atomic direct-owner migration; fixed provider-owned contracts only.
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
ALTER TABLE qmenux_identity.external_identities DROP CONSTRAINT external_identities_issuer_check;
ALTER TABLE qmenux_identity.external_identities ADD CONSTRAINT external_identities_issuer_check
  CHECK (issuer IN ('https://accounts.google.com', 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0'));
ALTER TABLE qmenux_identity.login_attempts ADD COLUMN issuer text NOT NULL DEFAULT 'https://accounts.google.com'
  CHECK (issuer IN ('https://accounts.google.com', 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0'));
CREATE OR REPLACE FUNCTION qmenux_identity.consume_login(state_hash text, browser_hash text)
RETURNS TABLE(verifier text, nonce text) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DELETE FROM qmenux_identity.login_attempts AS attempt
  WHERE attempt.issuer = 'https://accounts.google.com' AND attempt.state_hash = $1 AND attempt.browser_hash = $2 AND attempt.expires_at > now()
  RETURNING attempt.verifier, attempt.nonce
$f$;
CREATE FUNCTION qmenux_identity.begin_microsoft_login(state_hash text, browser_hash text, verifier text, nonce text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  INSERT INTO qmenux_identity.login_attempts(state_hash, browser_hash, verifier, nonce, issuer)
  VALUES ($1, $2, $3, $4, 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0')
$f$;
CREATE FUNCTION qmenux_identity.consume_microsoft_login(state_hash text, browser_hash text)
RETURNS TABLE(verifier text, nonce text) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DELETE FROM qmenux_identity.login_attempts AS attempt
  WHERE attempt.issuer = 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0' AND attempt.state_hash = $1 AND attempt.browser_hash = $2 AND attempt.expires_at > now()
  RETURNING attempt.verifier, attempt.nonce
$f$;
CREATE FUNCTION qmenux_identity.create_microsoft_session(subject text, token_hash text, previous_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE uid uuid;
BEGIN
  -- Serialize first-login races without linking by email or creating orphan users.
  PERFORM pg_advisory_xact_lock(hashtextextended('microsoft-identity:' || $1, 0));
  SELECT identity.user_id INTO uid FROM qmenux_identity.external_identities AS identity
    WHERE identity.issuer = 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0' AND identity.subject = $1;
  IF uid IS NULL THEN
    INSERT INTO qmenux_identity.users DEFAULT VALUES RETURNING id INTO uid;
    INSERT INTO qmenux_identity.external_identities(issuer, subject, user_id)
      VALUES ('https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0', $1, uid);
  END IF;
  IF NOT EXISTS (SELECT FROM qmenux_identity.users WHERE id = uid AND status = 'REGISTERED') THEN
    RETURN NULL;
  END IF;
  DELETE FROM qmenux_identity.sessions WHERE sessions.token_hash = $3;
  INSERT INTO qmenux_identity.sessions(token_hash, user_id) VALUES ($2, uid);
  RETURN uid;
END
$f$;
REVOKE ALL ON FUNCTION qmenux_identity.begin_microsoft_login(text,text,text,text),
  qmenux_identity.consume_microsoft_login(text,text), qmenux_identity.create_microsoft_session(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qmenux_identity.begin_microsoft_login(text,text,text,text),
  qmenux_identity.consume_microsoft_login(text,text), qmenux_identity.create_microsoft_session(text,text,text) TO qmenux_runtime;
INSERT INTO qmenux.schema_migrations(version) VALUES ('0007_microsoft_identity');
