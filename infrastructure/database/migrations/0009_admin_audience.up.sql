-- Atomic direct-owner migration; preserve API rows and isolate tenant-admin identity sessions.
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
ALTER TABLE qmenux_identity.login_attempts ADD COLUMN audience text NOT NULL DEFAULT 'api' CHECK (audience IN ('api','admin'));
ALTER TABLE qmenux_identity.sessions ADD COLUMN audience text NOT NULL DEFAULT 'api' CHECK (audience IN ('api','admin'));
ALTER TABLE qmenux_identity.sessions ADD COLUMN csrf_hash text;
ALTER TABLE qmenux_identity.sessions ADD CONSTRAINT sessions_audience_csrf CHECK (
  (audience='api' AND csrf_hash IS NULL) OR
  (audience='admin' AND csrf_hash IS NOT NULL AND csrf_hash ~ '^[0-9a-f]{64}$')
);
CREATE OR REPLACE FUNCTION qmenux_identity.begin_login(state_hash text, browser_hash text, verifier text, nonce text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  INSERT INTO qmenux_identity.login_attempts(state_hash, browser_hash, verifier, nonce, audience)
  VALUES ($1, $2, $3, $4, 'api')
$f$;

CREATE OR REPLACE FUNCTION qmenux_identity.consume_login(state_hash text, browser_hash text)
RETURNS TABLE(verifier text, nonce text) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DELETE FROM qmenux_identity.login_attempts AS attempt
  WHERE attempt.audience = 'api' AND attempt.issuer = 'https://accounts.google.com' AND attempt.state_hash = $1 AND attempt.browser_hash = $2 AND attempt.expires_at > now()
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
  DELETE FROM qmenux_identity.sessions WHERE sessions.token_hash = $3 AND sessions.audience = 'api';
  INSERT INTO qmenux_identity.sessions(token_hash, user_id, audience) VALUES ($2, uid, 'api');
  RETURN uid;
END
$f$;

CREATE OR REPLACE FUNCTION qmenux_identity.begin_microsoft_login(state_hash text, browser_hash text, verifier text, nonce text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  INSERT INTO qmenux_identity.login_attempts(state_hash, browser_hash, verifier, nonce, issuer, audience)
  VALUES ($1, $2, $3, $4, 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0', 'api')
$f$;

CREATE OR REPLACE FUNCTION qmenux_identity.consume_microsoft_login(state_hash text, browser_hash text)
RETURNS TABLE(verifier text, nonce text) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DELETE FROM qmenux_identity.login_attempts AS attempt
  WHERE attempt.audience = 'api' AND attempt.issuer = 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0' AND attempt.state_hash = $1 AND attempt.browser_hash = $2 AND attempt.expires_at > now()
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
  DELETE FROM qmenux_identity.sessions WHERE sessions.token_hash = $3 AND sessions.audience = 'api';
  INSERT INTO qmenux_identity.sessions(token_hash, user_id, audience) VALUES ($2, uid, 'api');
  RETURN uid;
END
$f$;

CREATE OR REPLACE FUNCTION qmenux_identity.begin_apple_login(state_hash text, browser_hash text, nonce text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  INSERT INTO qmenux_identity.login_attempts(state_hash, browser_hash, verifier, nonce, issuer, audience)
  VALUES ($1, $2, NULL, $3, 'https://appleid.apple.com', 'api')
$f$;

CREATE OR REPLACE FUNCTION qmenux_identity.consume_apple_login(state_hash text, browser_hash text)
RETURNS TABLE(nonce text) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DELETE FROM qmenux_identity.login_attempts AS attempt
  WHERE attempt.audience = 'api' AND attempt.issuer = 'https://appleid.apple.com' AND attempt.state_hash = $1 AND attempt.browser_hash = $2 AND attempt.expires_at > now()
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
  DELETE FROM qmenux_identity.sessions WHERE sessions.token_hash = $3 AND sessions.audience = 'api';
  INSERT INTO qmenux_identity.sessions(token_hash, user_id, audience) VALUES ($2, uid, 'api');
  RETURN uid;
END
$f$;

CREATE OR REPLACE FUNCTION qmenux_identity.read_session(token_hash text)
RETURNS TABLE(id uuid, status text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  SELECT u.id, u.status FROM qmenux_identity.sessions s JOIN qmenux_identity.users u ON u.id = s.user_id
  WHERE s.audience = 'api' AND s.token_hash = $1 AND s.expires_at > now() AND u.status = 'REGISTERED'
$f$;

CREATE OR REPLACE FUNCTION qmenux_identity.revoke_session(token_hash text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DELETE FROM qmenux_identity.sessions WHERE sessions.audience = 'api' AND sessions.token_hash = $1
$f$;

CREATE OR REPLACE FUNCTION qmenux_identity.tenant_membership(token_hash text)
RETURNS TABLE("userId" uuid, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  SELECT u.id, m.role FROM qmenux_identity.sessions s
    JOIN qmenux_identity.users u ON u.id = s.user_id
    JOIN qmenux_identity.memberships m ON m.user_id = u.id
  WHERE s.audience = 'api' AND s.token_hash = $1 AND s.expires_at > now() AND u.status = 'REGISTERED'
    AND m.status = 'ACTIVE'
    -- Definer owner can bypass RLS; always constrain this lookup explicitly too.
    AND m.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
$f$;

CREATE FUNCTION qmenux_identity.begin_admin_login(issuer text, state_hash text, browser_hash text, verifier text, nonce text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  INSERT INTO qmenux_identity.login_attempts(issuer,state_hash,browser_hash,verifier,nonce,audience)
  VALUES ($1,$2,$3,$4,$5,'admin')
$f$;
CREATE FUNCTION qmenux_identity.consume_admin_login(issuer text, state_hash text, browser_hash text)
RETURNS TABLE(verifier text, nonce text) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DELETE FROM qmenux_identity.login_attempts a
  WHERE a.audience='admin' AND a.issuer=$1 AND a.state_hash=$2 AND a.browser_hash=$3 AND a.expires_at>now()
  RETURNING a.verifier,a.nonce
$f$;
CREATE FUNCTION qmenux_identity.create_admin_session(issuer text, subject text, token_hash text, csrf_hash text, previous_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE uid uuid; provider text;
BEGIN
  CASE $1
    WHEN 'https://accounts.google.com' THEN provider := 'google';
    WHEN 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0' THEN provider := 'microsoft';
    WHEN 'https://appleid.apple.com' THEN provider := 'apple';
    ELSE RAISE EXCEPTION 'Invalid identity provider' USING ERRCODE='22023';
  END CASE;
  -- Match the legacy provider lock: API and admin first-login races share one identity.
  PERFORM pg_advisory_xact_lock(hashtextextended(provider || '-identity:' || $2, 0));
  SELECT e.user_id INTO uid FROM qmenux_identity.external_identities e WHERE e.issuer=$1 AND e.subject=$2;
  IF uid IS NULL THEN
    INSERT INTO qmenux_identity.users DEFAULT VALUES RETURNING id INTO uid;
    INSERT INTO qmenux_identity.external_identities(issuer,subject,user_id) VALUES ($1,$2,uid);
  END IF;
  IF NOT EXISTS (SELECT FROM qmenux_identity.users WHERE id=uid AND status='REGISTERED') THEN RETURN NULL; END IF;
  DELETE FROM qmenux_identity.sessions s WHERE s.audience='admin' AND s.token_hash=$5;
  INSERT INTO qmenux_identity.sessions(token_hash,user_id,audience,csrf_hash) VALUES ($3,uid,'admin',$4);
  RETURN uid;
END
$f$;
CREATE FUNCTION qmenux_identity.read_admin_session(token_hash text)
RETURNS TABLE(id uuid, status text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  SELECT u.id,u.status FROM qmenux_identity.sessions s JOIN qmenux_identity.users u ON u.id=s.user_id
  WHERE s.audience='admin' AND s.token_hash=$1 AND s.expires_at>now() AND u.status='REGISTERED'
$f$;
CREATE FUNCTION qmenux_identity.revoke_admin_session(token_hash text, csrf_hash text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  WITH removed AS (
    DELETE FROM qmenux_identity.sessions s
    WHERE s.audience='admin' AND s.token_hash=$1 AND s.csrf_hash=$2 AND s.expires_at>now() RETURNING 1
  ) SELECT EXISTS (SELECT FROM removed)
$f$;
REVOKE ALL ON FUNCTION qmenux_identity.begin_admin_login(text,text,text,text,text),
  qmenux_identity.consume_admin_login(text,text,text), qmenux_identity.create_admin_session(text,text,text,text,text),
  qmenux_identity.read_admin_session(text), qmenux_identity.revoke_admin_session(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qmenux_identity.begin_admin_login(text,text,text,text,text),
  qmenux_identity.consume_admin_login(text,text,text), qmenux_identity.create_admin_session(text,text,text,text,text),
  qmenux_identity.read_admin_session(text), qmenux_identity.revoke_admin_session(text,text) TO qmenux_runtime;
INSERT INTO qmenux.schema_migrations(version) VALUES ('0009_admin_audience');
