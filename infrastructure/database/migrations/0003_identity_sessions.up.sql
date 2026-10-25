-- Run the entire file atomically via the direct migration owner.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
DO $guard$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations)
    IS DISTINCT FROM ARRAY['0001_tenant_catalog', '0002_tenant_resolution'] THEN
    RAISE EXCEPTION 'Expected tenant baseline and resolver only';
  END IF;
END
$guard$;

CREATE SCHEMA qmenux_identity;
REVOKE ALL ON SCHEMA qmenux_identity FROM PUBLIC;
GRANT USAGE ON SCHEMA qmenux_identity TO qmenux_runtime;
CREATE TABLE qmenux_identity.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'REGISTERED' CHECK (status IN ('REGISTERED', 'SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE qmenux_identity.external_identities (
  issuer text NOT NULL CHECK (issuer = 'https://accounts.google.com'),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  user_id uuid NOT NULL REFERENCES qmenux_identity.users(id),
  PRIMARY KEY (issuer, subject)
);
CREATE TABLE qmenux_identity.login_attempts (
  state_hash text PRIMARY KEY CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  browser_hash text NOT NULL CHECK (browser_hash ~ '^[0-9a-f]{64}$'),
  verifier text NOT NULL CHECK (verifier ~ '^[a-zA-Z0-9_-]{43}$'),
  nonce text NOT NULL CHECK (nonce ~ '^[a-zA-Z0-9_-]{43}$'),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes')
);
CREATE TABLE qmenux_identity.sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES qmenux_identity.users(id),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour')
);
CREATE INDEX sessions_user ON qmenux_identity.sessions(user_id);

-- Only this identity-module contract can touch global identity/session rows.
CREATE FUNCTION qmenux_identity.begin_login(state_hash text, browser_hash text, verifier text, nonce text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  INSERT INTO qmenux_identity.login_attempts(state_hash, browser_hash, verifier, nonce)
  VALUES ($1, $2, $3, $4)
$f$;
CREATE FUNCTION qmenux_identity.consume_login(state_hash text, browser_hash text)
RETURNS TABLE(verifier text, nonce text) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DELETE FROM qmenux_identity.login_attempts AS attempt
  WHERE attempt.state_hash = $1 AND attempt.browser_hash = $2 AND attempt.expires_at > now()
  RETURNING attempt.verifier, attempt.nonce
$f$;
CREATE FUNCTION qmenux_identity.create_session(subject text, token_hash text, previous_hash text)
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
CREATE FUNCTION qmenux_identity.read_session(token_hash text)
RETURNS TABLE(id uuid, status text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  SELECT u.id, u.status FROM qmenux_identity.sessions s JOIN qmenux_identity.users u ON u.id = s.user_id
  WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'REGISTERED'
$f$;
CREATE FUNCTION qmenux_identity.revoke_session(token_hash text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DELETE FROM qmenux_identity.sessions WHERE sessions.token_hash = $1
$f$;
REVOKE ALL ON ALL TABLES IN SCHEMA qmenux_identity FROM PUBLIC, qmenux_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA qmenux_identity FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA qmenux_identity TO qmenux_runtime;
INSERT INTO qmenux.schema_migrations(version) VALUES ('0003_identity_sessions');
