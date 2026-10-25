-- Direct-owner, atomic development migration; no memberships are seeded.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
DO $guard$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations)
    IS DISTINCT FROM ARRAY['0001_tenant_catalog', '0002_tenant_resolution', '0003_identity_sessions'] THEN
    RAISE EXCEPTION 'Expected tenant and identity baseline only';
  END IF;
END
$guard$;

CREATE TABLE qmenux_identity.memberships (
  tenant_id uuid NOT NULL REFERENCES qmenux.tenants(id),
  user_id uuid NOT NULL REFERENCES qmenux_identity.users(id),
  role text NOT NULL CHECK (role IN ('OWNER', 'EDITOR')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX memberships_user ON qmenux_identity.memberships(user_id);
ALTER TABLE qmenux_identity.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux_identity.memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_tenant ON qmenux_identity.memberships
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
REVOKE ALL ON qmenux_identity.memberships FROM PUBLIC, qmenux_runtime;

CREATE FUNCTION qmenux_identity.tenant_membership(token_hash text)
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
REVOKE ALL ON FUNCTION qmenux_identity.tenant_membership(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qmenux_identity.tenant_membership(text) TO qmenux_runtime;

CREATE FUNCTION qmenux_identity.revoke_authorization_sessions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    DELETE FROM qmenux_identity.sessions WHERE user_id = NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM qmenux_identity.sessions WHERE user_id = OLD.user_id;
  ELSIF TG_OP = 'INSERT' THEN
    DELETE FROM qmenux_identity.sessions WHERE user_id = NEW.user_id;
  ELSE
    DELETE FROM qmenux_identity.sessions WHERE user_id IN (OLD.user_id, NEW.user_id);
  END IF;
  RETURN NULL;
END
$f$;
REVOKE ALL ON FUNCTION qmenux_identity.revoke_authorization_sessions() FROM PUBLIC, qmenux_runtime;
CREATE TRIGGER membership_session_revocation
AFTER INSERT OR UPDATE OR DELETE ON qmenux_identity.memberships
FOR EACH ROW EXECUTE FUNCTION qmenux_identity.revoke_authorization_sessions();
CREATE TRIGGER user_status_session_revocation
AFTER UPDATE OF status ON qmenux_identity.users
FOR EACH ROW EXECUTE FUNCTION qmenux_identity.revoke_authorization_sessions();

INSERT INTO qmenux.schema_migrations(version) VALUES ('0004_tenant_memberships');
