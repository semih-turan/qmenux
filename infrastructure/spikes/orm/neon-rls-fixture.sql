CREATE SCHEMA qmenux_rls_probe;
REVOKE ALL ON SCHEMA qmenux_rls_probe FROM PUBLIC;
CREATE TABLE qmenux_rls_probe.items (
  id integer PRIMARY KEY,
  tenant_id uuid NOT NULL,
  label text NOT NULL
);
INSERT INTO qmenux_rls_probe.items VALUES
  (1, '00000000-0000-4000-8000-000000000001', 'synthetic A'),
  (2, '00000000-0000-4000-8000-000000000002', 'synthetic B');
ALTER TABLE qmenux_rls_probe.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux_rls_probe.items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON qmenux_rls_probe.items USING (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
) WITH CHECK (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
);
GRANT USAGE ON SCHEMA qmenux_rls_probe TO qmenux_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON qmenux_rls_probe.items TO qmenux_runtime;
