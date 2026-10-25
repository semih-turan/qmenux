-- Atomic direct-owner migration; this is candidate resolution, never authorization.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
DO $previous$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations)
    IS DISTINCT FROM ARRAY['0001_tenant_catalog'] THEN
    RAISE EXCEPTION 'Expected baseline migration only';
  END IF;
END
$previous$;
CREATE FUNCTION qmenux.resolve_tenant_slug(candidate text) RETURNS uuid
LANGUAGE sql STABLE STRICT SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $resolve$
  SELECT id FROM qmenux.tenants WHERE slug = $1 AND status = 'ACTIVE'
$resolve$;
REVOKE ALL ON FUNCTION qmenux.resolve_tenant_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qmenux.resolve_tenant_slug(text) TO qmenux_runtime;
INSERT INTO qmenux.schema_migrations(version) VALUES ('0002_tenant_resolution');
