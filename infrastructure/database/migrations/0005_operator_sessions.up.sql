-- Atomic direct-owner migration; no operator is provisioned or activated.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
DO $guard$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations)
    IS DISTINCT FROM ARRAY['0001_tenant_catalog', '0002_tenant_resolution', '0003_identity_sessions', '0004_tenant_memberships'] THEN
    RAISE EXCEPTION 'Expected tenant, identity and membership baseline only';
  END IF;
END
$guard$;
CREATE SCHEMA qmenux_operator;
REVOKE ALL ON SCHEMA qmenux_operator FROM PUBLIC;
GRANT USAGE ON SCHEMA qmenux_operator TO qmenux_runtime;
CREATE TABLE qmenux_operator.operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer text NOT NULL CHECK (issuer ~ '^https://[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$'),
  subject text NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 255),
  role text NOT NULL CHECK (role = 'PLATFORM_ADMIN'),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);
CREATE TABLE qmenux_operator.sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  audience text NOT NULL CHECK (audience ~ '^[a-f0-9]{64}$'),
  operator_id uuid NOT NULL REFERENCES qmenux_operator.operators(id),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')
);
CREATE INDEX operator_sessions_operator ON qmenux_operator.sessions(operator_id);

-- These global security records are separate from tenant identities and tenant RLS.
CREATE FUNCTION qmenux_operator.create_session(issuer text, subject text, audience text, token_hash text, previous_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE oid uuid;
BEGIN
  SELECT o.id INTO oid FROM qmenux_operator.operators o
    WHERE o.issuer = $1 AND o.subject = $2 AND o.status = 'ACTIVE' AND o.role = 'PLATFORM_ADMIN'
    FOR UPDATE;
  IF oid IS NULL THEN RETURN NULL; END IF;
  DELETE FROM qmenux_operator.sessions s WHERE s.token_hash = $5 AND s.operator_id = oid AND s.audience = $3;
  INSERT INTO qmenux_operator.sessions(token_hash, audience, operator_id) VALUES ($4, $3, oid);
  RETURN oid;
END
$f$;
CREATE FUNCTION qmenux_operator.read_session(issuer text, subject text, audience text, token_hash text)
RETURNS TABLE(id uuid, role text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  SELECT o.id, o.role FROM qmenux_operator.sessions s JOIN qmenux_operator.operators o ON o.id = s.operator_id
  WHERE o.issuer = $1 AND o.subject = $2 AND s.audience = $3 AND s.token_hash = $4 AND s.expires_at > now()
    AND o.status = 'ACTIVE' AND o.role = 'PLATFORM_ADMIN'
$f$;
CREATE FUNCTION qmenux_operator.revoke_session(issuer text, subject text, audience text, token_hash text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DELETE FROM qmenux_operator.sessions s USING qmenux_operator.operators o
  WHERE o.id = s.operator_id AND o.issuer = $1 AND o.subject = $2 AND s.audience = $3 AND s.token_hash = $4
$f$;
CREATE FUNCTION qmenux_operator.revoke_changed_operator()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
BEGIN
  DELETE FROM qmenux_operator.sessions WHERE operator_id IN (OLD.id, NEW.id);
  RETURN NULL;
END
$f$;
CREATE TRIGGER operator_session_revocation AFTER UPDATE ON qmenux_operator.operators
FOR EACH ROW EXECUTE FUNCTION qmenux_operator.revoke_changed_operator();
REVOKE ALL ON ALL TABLES IN SCHEMA qmenux_operator FROM PUBLIC, qmenux_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA qmenux_operator FROM PUBLIC, qmenux_runtime;
GRANT EXECUTE ON FUNCTION qmenux_operator.create_session(text,text,text,text,text),
  qmenux_operator.read_session(text,text,text,text), qmenux_operator.revoke_session(text,text,text,text) TO qmenux_runtime;
INSERT INTO qmenux.schema_migrations(version) VALUES ('0005_operator_sessions');
