SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
DO $guard$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations)
    IS DISTINCT FROM ARRAY['0001_tenant_catalog', '0002_tenant_resolution'] THEN
    RAISE EXCEPTION 'Rollback refused: unexpected migration versions';
  END IF;
END
$guard$;
DROP FUNCTION qmenux.resolve_tenant_slug(text);
DELETE FROM qmenux.schema_migrations WHERE version = '0002_tenant_resolution';
