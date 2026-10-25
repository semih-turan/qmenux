-- Run only on qmenux-dev/neondb after confirming the branch in Neon Console.
-- NOLOGIN keeps credential activation separate from privilege verification.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
CREATE ROLE qmenux_runtime NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
  NOCREATEDB NOCREATEROLE NOREPLICATION;

SAVEPOINT before_probe;
-- A non-superuser creator needs explicit SET permission; rollback removes it.
GRANT qmenux_runtime TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
CREATE SCHEMA qmenux_runtime_probe;
REVOKE ALL ON SCHEMA qmenux_runtime_probe FROM PUBLIC;
CREATE TABLE qmenux_runtime_probe.items (id integer PRIMARY KEY, tenant_id uuid NOT NULL);
INSERT INTO qmenux_runtime_probe.items VALUES
  (1, '00000000-0000-4000-8000-000000000001'),
  (2, '00000000-0000-4000-8000-000000000002');
ALTER TABLE qmenux_runtime_probe.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux_runtime_probe.items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON qmenux_runtime_probe.items USING (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
) WITH CHECK (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
);
GRANT USAGE ON SCHEMA qmenux_runtime_probe TO qmenux_runtime;
GRANT SELECT, INSERT ON qmenux_runtime_probe.items TO qmenux_runtime;
SET LOCAL ROLE qmenux_runtime;
DO $probe$
BEGIN
  IF current_user <> 'qmenux_runtime' OR EXISTS (
    SELECT FROM pg_roles WHERE rolname = current_user
      AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication OR rolcanlogin)
  ) OR EXISTS (
    SELECT FROM pg_class WHERE oid = 'qmenux_runtime_probe.items'::regclass
      AND relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
  ) THEN
    RAISE EXCEPTION 'Unsafe probe role';
  END IF;
  PERFORM set_config('app.tenant_id', '', true);
  IF (SELECT count(*) FROM qmenux_runtime_probe.items) <> 0 THEN
    RAISE EXCEPTION 'Missing context exposed rows';
  END IF;
  BEGIN
    INSERT INTO qmenux_runtime_probe.items VALUES (3, '00000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Missing context allowed insert';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('app.tenant_id', '00000000-0000-4000-8000-000000000001', true);
  IF (SELECT array_agg(id ORDER BY id) FROM qmenux_runtime_probe.items) IS DISTINCT FROM ARRAY[1] THEN
    RAISE EXCEPTION 'Tenant A isolation failed';
  END IF;
  BEGIN
    INSERT INTO qmenux_runtime_probe.items VALUES (3, '00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'Cross-tenant insert allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO qmenux_runtime_probe.items VALUES (3, '00000000-0000-4000-8000-000000000001');
    IF (SELECT count(*) FROM qmenux_runtime_probe.items) <> 2 THEN
      RAISE EXCEPTION 'Own-tenant insert failed';
    END IF;
    RAISE SQLSTATE 'P1001' USING MESSAGE = 'intentional insert rollback';
  EXCEPTION WHEN SQLSTATE 'P1001' THEN NULL;
  END;
  IF (SELECT array_agg(id ORDER BY id) FROM qmenux_runtime_probe.items) IS DISTINCT FROM ARRAY[1] THEN
    RAISE EXCEPTION 'Insert rollback failed';
  END IF;
  PERFORM set_config('app.tenant_id', 'invalid-uuid', true);
  BEGIN
    PERFORM count(*) FROM qmenux_runtime_probe.items;
    RAISE EXCEPTION 'Invalid context accepted';
  EXCEPTION WHEN invalid_text_representation THEN NULL;
  END;
  PERFORM set_config('app.tenant_id', '00000000-0000-4000-8000-000000000002', true);
  IF (SELECT array_agg(id ORDER BY id) FROM qmenux_runtime_probe.items) IS DISTINCT FROM ARRAY[2] THEN
    RAISE EXCEPTION 'Tenant B isolation failed';
  END IF;
END
$probe$;
RESET ROLE;
ROLLBACK TO SAVEPOINT before_probe;
DO $cleanup$
BEGIN
  IF to_regnamespace('qmenux_runtime_probe') IS NOT NULL
    OR NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL THEN
    RAISE EXCEPTION 'Probe schema or tenant context survived rollback';
  END IF;
END
$cleanup$;
COMMIT;
SELECT rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole,
  rolreplication, rolinherit, 'PASS: RLS probe rolled back; role retained without login' AS result
FROM pg_roles WHERE rolname = 'qmenux_runtime';
