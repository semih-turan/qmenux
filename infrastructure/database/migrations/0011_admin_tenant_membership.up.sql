-- Atomic, additive identity-owned contract; no membership or license is granted.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
DO $guard$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations)
    IS DISTINCT FROM ARRAY['0001_tenant_catalog', '0002_tenant_resolution', '0003_identity_sessions', '0004_tenant_memberships', '0005_operator_sessions', '0006_auth_expiry', '0007_microsoft_identity', '0008_apple_identity', '0009_admin_audience', '0010_draft_product_events'] THEN
    RAISE EXCEPTION 'Expected migrations 0001 through 0010';
  END IF;
END
$guard$;
CREATE FUNCTION qmenux_identity.admin_tenant_membership(token_hash text, csrf_hash text)
RETURNS TABLE("userId" uuid, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $membership$
  SELECT u.id, m.role FROM qmenux_identity.sessions s
    JOIN qmenux_identity.users u ON u.id = s.user_id
    JOIN qmenux_identity.memberships m ON m.user_id = u.id
  WHERE s.audience = 'admin' AND s.token_hash = $1 AND s.expires_at > now()
    AND u.status = 'REGISTERED' AND m.status = 'ACTIVE'
    AND ($2 IS NULL OR s.csrf_hash = $2)
    -- The definer may bypass RLS; the tenant predicate is mandatory too.
    AND m.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
$membership$;
REVOKE ALL ON FUNCTION qmenux_identity.admin_tenant_membership(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qmenux_identity.admin_tenant_membership(text,text) TO qmenux_runtime;
INSERT INTO qmenux.schema_migrations(version) VALUES ('0011_admin_tenant_membership');
