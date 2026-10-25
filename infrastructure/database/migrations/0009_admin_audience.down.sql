-- Remove admin callers first. Never delete sessions/attempts to force rollback.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
DO $guard$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations)
    IS DISTINCT FROM ARRAY['0001_tenant_catalog', '0002_tenant_resolution', '0003_identity_sessions', '0004_tenant_memberships', '0005_operator_sessions', '0006_auth_expiry', '0007_microsoft_identity', '0008_apple_identity', '0009_admin_audience'] THEN
    RAISE EXCEPTION 'Unexpected migration versions';
  END IF;
END
$guard$;
LOCK TABLE qmenux_identity.login_attempts, qmenux_identity.sessions IN ACCESS EXCLUSIVE MODE;
DO $data_guard$
BEGIN
  IF EXISTS (SELECT FROM qmenux_identity.login_attempts WHERE audience='admin')
    OR EXISTS (SELECT FROM qmenux_identity.sessions WHERE audience='admin') THEN
    RAISE EXCEPTION 'Admin attempts or sessions prevent rollback';
  END IF;
END
$data_guard$;
DROP FUNCTION qmenux_identity.begin_admin_login(text,text,text,text,text);
DROP FUNCTION qmenux_identity.consume_admin_login(text,text,text);
DROP FUNCTION qmenux_identity.create_admin_session(text,text,text,text,text);
DROP FUNCTION qmenux_identity.read_admin_session(text);
DROP FUNCTION qmenux_identity.revoke_admin_session(text,text);
CREATE OR REPLACE FUNCTION qmenux_identity.begin_login(state_hash text, browser_hash text, verifier text, nonce text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  INSERT INTO qmenux_identity.login_attempts(state_hash, browser_hash, verifier, nonce)
  VALUES ($1, $2, $3, $4)
$f$;

CREATE OR REPLACE FUNCTION qmenux_identity.consume_login(state_hash text, browser_hash text)
RETURNS TABLE(verifier text, nonce text) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DELETE FROM qmenux_identity.login_attempts AS attempt
  WHERE attempt.issuer = 'https://accounts.google.com' AND attempt.state_hash = $1 AND attempt.browser_hash = $2 AND attempt.expires_at > now()
  RETURNING attempt.verifier, attempt.nonce
$f$;

CREATE OR REPLACE FUNCTION qmenux_identity.create_session(subject text, token_hash text, previous_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE uid uuid;
BEGIN
  -- Serialize first-login races without linking by email or creating orphan users.
  PERFORM pg_advisory_xact_lock(hashtextextended('google-identity:' || $1, 0));
  SELECT identity.user_id INTO uid FROM qmenux_identity.external_identities AS identity
    WHERE identity.issuer = 'https://accounts.google.com' AND identity.subject = $1;
  IF uid IS NULL THEN
    INSERT INTO qmenux_identity.users DEFAULT VALUES RETURNING id INTO uid;
    INSERT INTO qmenux_identity.external_identities(issuer, subject, user_id)
      VALUES ('https://accounts.google.com', $1, uid);
  END IF;
  IF NOT EXISTS (SELECT FROM qmenux_identity.users WHERE id = uid AND status = 'REGISTERED') THEN
    RETURN NULL;
  END IF;
  DELETE FROM qmenux_identity.sessions WHERE sessions.token_hash = $3;
  INSERT INTO qmenux_identity.sessions(token_hash, user_id) VALUES ($2, uid);
  RETURN uid;
END
$f$;

CREATE OR REPLACE FUNCTION qmenux_identity.begin_microsoft_login(state_hash text, browser_hash text, verifier text, nonce text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  INSERT INTO qmenux_identity.login_attempts(state_hash, browser_hash, verifier, nonce, issuer)
  VALUES ($1, $2, $3, $4, 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0')
$f$;

CREATE OR REPLACE FUNCTION qmenux_identity.consume_microsoft_login(state_hash text, browser_hash text)
RETURNS TABLE(verifier text, nonce text) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DELETE FROM qmenux_identity.login_attempts AS attempt
  WHERE attempt.issuer = 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0' AND attempt.state_hash = $1 AND attempt.browser_hash = $2 AND attempt.expires_at > now()
  RETURNING attempt.verifier, attempt.nonce
$f$;

CREATE OR REPLACE FUNCTION qmenux_identity.create_microsoft_session(subject text, token_hash text, previous_hash text)
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

CREATE OR REPLACE FUNCTION qmenux_identity.begin_apple_login(state_hash text, browser_hash text, nonce text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  INSERT INTO qmenux_identity.login_attempts(state_hash, browser_hash, verifier, nonce, issuer)
  VALUES ($1, $2, NULL, $3, 'https://appleid.apple.com')
$f$;

CREATE OR REPLACE FUNCTION qmenux_identity.consume_apple_login(state_hash text, browser_hash text)
RETURNS TABLE(nonce text) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DELETE FROM qmenux_identity.login_attempts AS attempt
  WHERE attempt.issuer = 'https://appleid.apple.com' AND attempt.state_hash = $1 AND attempt.browser_hash = $2 AND attempt.expires_at > now()
  RETURNING attempt.nonce
$f$;

CREATE OR REPLACE FUNCTION qmenux_identity.create_apple_session(subject text, token_hash text, previous_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE uid uuid;
BEGIN
  -- Serialize first-login races without linking by email or creating orphan users.
  PERFORM pg_advisory_xact_lock(hashtextextended('apple-identity:' || $1, 0));
  SELECT identity.user_id INTO uid FROM qmenux_identity.external_identities AS identity
    WHERE identity.issuer = 'https://appleid.apple.com' AND identity.subject = $1;
  IF uid IS NULL THEN
    INSERT INTO qmenux_identity.users DEFAULT VALUES RETURNING id INTO uid;
    INSERT INTO qmenux_identity.external_identities(issuer, subject, user_id)
      VALUES ('https://appleid.apple.com', $1, uid);
  END IF;
  IF NOT EXISTS (SELECT FROM qmenux_identity.users WHERE id = uid AND status = 'REGISTERED') THEN
    RETURN NULL;
  END IF;
  DELETE FROM qmenux_identity.sessions WHERE sessions.token_hash = $3;
  INSERT INTO qmenux_identity.sessions(token_hash, user_id) VALUES ($2, uid);
  RETURN uid;
END
$f$;

CREATE OR REPLACE FUNCTION qmenux_identity.read_session(token_hash text)
RETURNS TABLE(id uuid, status text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  SELECT u.id, u.status FROM qmenux_identity.sessions s JOIN qmenux_identity.users u ON u.id = s.user_id
  WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'REGISTERED'
$f$;

CREATE OR REPLACE FUNCTION qmenux_identity.revoke_session(token_hash text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DELETE FROM qmenux_identity.sessions WHERE sessions.token_hash = $1
$f$;

CREATE OR REPLACE FUNCTION qmenux_identity.tenant_membership(token_hash text)
RETURNS TABLE("userId" uuid, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  SELECT u.id, m.role FROM qmenux_identity.sessions s
    JOIN qmenux_identity.users u ON u.id = s.user_id
    JOIN qmenux_identity.memberships m ON m.user_id = u.id
  WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'REGISTERED'
    AND m.status = 'ACTIVE'
    -- Definer owner can bypass RLS; always constrain this lookup explicitly too.
    AND m.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
$f$;

ALTER TABLE qmenux_identity.sessions DROP COLUMN csrf_hash;
ALTER TABLE qmenux_identity.sessions DROP COLUMN audience;
ALTER TABLE qmenux_identity.login_attempts DROP COLUMN audience;
DELETE FROM qmenux.schema_migrations WHERE version='0009_admin_audience';
