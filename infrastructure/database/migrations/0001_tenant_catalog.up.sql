-- Execute with psql -X --single-transaction -v ON_ERROR_STOP=1.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
DO $roles$
BEGIN
  IF current_user = 'qmenux_runtime'
    OR NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'qmenux_runtime'
    AND NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR rolinherit))
    OR EXISTS (SELECT FROM pg_auth_members WHERE member = (SELECT oid FROM pg_roles WHERE rolname = 'qmenux_runtime')) THEN
    RAISE EXCEPTION 'A restricted qmenux_runtime role is required';
  END IF;
END
$roles$;

CREATE SCHEMA qmenux;
REVOKE ALL ON SCHEMA qmenux FROM PUBLIC;
CREATE TABLE qmenux.schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE qmenux.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (
    slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
    AND slug NOT LIKE 'xn--%'
    AND slug NOT IN ('admin', 'superman', 'api', 'www', 'auth', 'assets', 'qmenux')
  ),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  status text NOT NULL DEFAULT 'PENDING_APPROVAL'
    CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'REJECTED', 'SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE qmenux.branches (
  tenant_id uuid NOT NULL REFERENCES qmenux.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE TABLE qmenux.menus (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  -- Publication requires the later immutable-revision and entitlement contracts.
  state text NOT NULL DEFAULT 'DRAFT' CONSTRAINT menus_draft_only CHECK (state = 'DRAFT'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES qmenux.branches(tenant_id, id)
);
CREATE TABLE qmenux.categories (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  menu_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, menu_id) REFERENCES qmenux.menus(tenant_id, id)
);
CREATE TABLE qmenux.products (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text NOT NULL DEFAULT '',
  price_minor integer NOT NULL CHECK (price_minor >= 0),
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency = 'TRY'),
  availability text NOT NULL DEFAULT 'AVAILABLE' CHECK (availability IN ('AVAILABLE', 'SOLD_OUT', 'HIDDEN')),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, category_id) REFERENCES qmenux.categories(tenant_id, id)
);
CREATE INDEX menus_branch ON qmenux.menus(tenant_id, branch_id, id);
CREATE INDEX categories_menu_order ON qmenux.categories(tenant_id, menu_id, sort_order, id);
CREATE INDEX products_category_order ON qmenux.products(tenant_id, category_id, sort_order, id);

ALTER TABLE qmenux.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON qmenux.tenants USING (
  id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
) WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE qmenux.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux.branches FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON qmenux.branches USING (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE qmenux.menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux.menus FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON qmenux.menus USING (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE qmenux.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux.categories FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON qmenux.categories USING (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE qmenux.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux.products FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON qmenux.products USING (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT USAGE ON SCHEMA qmenux TO qmenux_runtime;
GRANT SELECT ON qmenux.tenants TO qmenux_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON qmenux.branches, qmenux.categories, qmenux.products TO qmenux_runtime;
GRANT SELECT, DELETE ON qmenux.menus TO qmenux_runtime;
GRANT INSERT (tenant_id, id, branch_id, name, created_at, updated_at) ON qmenux.menus TO qmenux_runtime;
GRANT UPDATE (name, updated_at) ON qmenux.menus TO qmenux_runtime;
INSERT INTO qmenux.schema_migrations(version) VALUES ('0001_tenant_catalog');
