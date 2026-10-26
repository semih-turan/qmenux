-- QMenuX core schema, roles and row-level security.
-- Runtime code NEVER queries as the migration owner: every transaction runs
-- `SET LOCAL ROLE <qmenux_*>` (see src/db.ts). Tenant-owned tables use FORCE RLS
-- and deny when `app.tenant_id` is missing.

-- ---------------------------------------------------------------- roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qmenux_app') THEN CREATE ROLE qmenux_app NOLOGIN NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qmenux_auth') THEN CREATE ROLE qmenux_auth NOLOGIN NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qmenux_platform') THEN CREATE ROLE qmenux_platform NOLOGIN NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qmenux_public') THEN CREATE ROLE qmenux_public NOLOGIN NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qmenux_worker') THEN CREATE ROLE qmenux_worker NOLOGIN NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qmenux_definer') THEN CREATE ROLE qmenux_definer NOLOGIN NOBYPASSRLS; END IF;
END $$;

-- The connecting login role must be able to SET ROLE into the runtime roles.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['qmenux_app','qmenux_auth','qmenux_platform','qmenux_public','qmenux_worker','qmenux_definer'] LOOP
    EXECUTE format('GRANT %I TO %I', r, current_user);
  END LOOP;
END $$;

CREATE SCHEMA IF NOT EXISTS qx;
REVOKE ALL ON SCHEMA qx FROM PUBLIC;
GRANT USAGE ON SCHEMA qx TO qmenux_app, qmenux_auth, qmenux_platform, qmenux_public, qmenux_worker, qmenux_definer;
ALTER DEFAULT PRIVILEGES IN SCHEMA qx REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ---------------------------------------------------------------- helpers
CREATE FUNCTION qx.current_tenant() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;
CREATE FUNCTION qx.current_user_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;
GRANT EXECUTE ON FUNCTION qx.current_tenant(), qx.current_user_id()
  TO qmenux_app, qmenux_auth, qmenux_platform, qmenux_worker, qmenux_definer;

CREATE FUNCTION qx.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE FUNCTION qx.forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'append-only table %: % forbidden', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege'; END $$;

-- ---------------------------------------------------------------- identity
CREATE TABLE qx.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  email_verified boolean NOT NULL DEFAULT false,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);

CREATE TABLE qx.auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES qx.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google','microsoft','apple','dev')),
  issuer text NOT NULL,
  subject text NOT NULL,
  email_at_link text,
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, issuer, subject)
);

-- Short-lived, single-use OIDC login transactions (state/nonce/PKCE).
CREATE TABLE qx.oidc_flows (
  state_hash text PRIMARY KEY,
  provider text NOT NULL,
  audience text NOT NULL CHECK (audience IN ('admin','ops')),
  code_verifier text NOT NULL,
  nonce text NOT NULL,
  return_to text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE qx.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES qx.users(id) ON DELETE CASCADE,
  audience text NOT NULL CHECK (audience IN ('admin','ops')),
  active_tenant_id uuid,
  mfa_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX sessions_user_idx ON qx.sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE qx.platform_operators (
  user_id uuid PRIMARY KEY REFERENCES qx.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('PLATFORM_ADMIN','PLATFORM_SUPPORT')),
  totp_secret_ciphertext text,
  totp_enrolled_at timestamptz,
  totp_last_step bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);

-- ---------------------------------------------------------------- tenancy
CREATE TABLE qx.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$' AND slug NOT LIKE '%--%'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  tagline text,
  business_type text NOT NULL DEFAULT 'OTHER'
    CHECK (business_type IN ('COFFEE_SHOP','CAFE','BAKERY_PATISSERIE','BRUNCH','RESTAURANT','FAST_FOOD','OTHER')),
  theme_id text NOT NULL DEFAULT 'coffee-minimal'
    CHECK (theme_id IN ('coffee-minimal','botanical-cafe','dark-dining','street-food','classic-bistro',
                        'elegant-serif','mediterranean','japanese-minimal','modern-grid','retro-diner')),
  logo_media_id uuid,
  status text NOT NULL
    CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','ACTIVE','REJECTED','SUSPENDED')),
  suspended_reason text,
  approved_at timestamptz,
  approved_by uuid REFERENCES qx.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE qx.tenant_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_user_id uuid NOT NULL REFERENCES qx.users(id),
  business_name text NOT NULL,
  slug text NOT NULL,
  business_type text NOT NULL,
  contact_phone text NOT NULL,
  city text NOT NULL,
  note text,
  accepted_terms_version text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','WITHDRAWN')),
  tenant_id uuid REFERENCES qx.tenants(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES qx.users(id),
  decision_reason text
);
CREATE UNIQUE INDEX tenant_applications_pending_slug ON qx.tenant_applications (slug) WHERE status = 'PENDING';
CREATE UNIQUE INDEX tenant_applications_pending_user ON qx.tenant_applications (applicant_user_id) WHERE status = 'PENDING';

CREATE TABLE qx.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES qx.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES qx.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('OWNER','MANAGER','STAFF')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX memberships_user_idx ON qx.memberships (user_id) WHERE revoked_at IS NULL;

CREATE TABLE qx.member_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES qx.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('MANAGER','STAFF')),
  token_hash text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES qx.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz
);

-- Manual license grants (no payment gateway in V1).
CREATE TABLE qx.license_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES qx.tenants(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  granted_by uuid NOT NULL REFERENCES qx.users(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES qx.users(id),
  revoke_reason text
);
CREATE INDEX license_grants_tenant_idx ON qx.license_grants (tenant_id, ends_at DESC);

CREATE TABLE qx.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES qx.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  phone text,
  hours_text text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX branches_one_primary ON qx.branches (tenant_id) WHERE is_primary;

CREATE TABLE qx.branch_wifi (
  tenant_id uuid NOT NULL,
  branch_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  ssid text,
  password_ciphertext text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES qx.branches(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE qx.branch_whatsapp (
  tenant_id uuid NOT NULL,
  branch_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  phone_e164 text,
  message text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES qx.branches(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE qx.menu_visibility_policies (
  tenant_id uuid NOT NULL,
  branch_id uuid PRIMARY KEY,
  mode text NOT NULL DEFAULT 'OFF' CHECK (mode IN ('OFF','RADIUS','ADMIN_REGIONS','COMBINED')),
  center_lat double precision CHECK (center_lat BETWEEN -90 AND 90),
  center_lng double precision CHECK (center_lng BETWEEN -180 AND 180),
  radius_m integer CHECK (radius_m BETWEEN 50 AND 50000),
  regions jsonb NOT NULL DEFAULT '[]'::jsonb,
  policy_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  FOREIGN KEY (tenant_id, branch_id) REFERENCES qx.branches(tenant_id, id) ON DELETE CASCADE,
  CHECK (mode NOT IN ('RADIUS','COMBINED') OR (center_lat IS NOT NULL AND center_lng IS NOT NULL AND radius_m IS NOT NULL))
);

-- ---------------------------------------------------------------- catalog
CREATE TABLE qx.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES qx.tenants(id) ON DELETE CASCADE,
  object_key text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  bytes integer NOT NULL CHECK (bytes > 0 AND bytes <= 5242880),
  width integer,
  height integer,
  source_kind text NOT NULL DEFAULT 'UPLOAD' CHECK (source_kind IN ('UPLOAD','IMPORT')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, id)
);

CREATE TABLE qx.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  description text,
  position integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES qx.branches(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX categories_branch_idx ON qx.categories (tenant_id, branch_id, position) WHERE deleted_at IS NULL;

CREATE TABLE qx.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  category_id uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description text,
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  currency text NOT NULL DEFAULT 'TRY' CHECK (currency = 'TRY'),
  tags text[] NOT NULL DEFAULT '{}',
  position integer NOT NULL DEFAULT 0,
  availability text NOT NULL DEFAULT 'AVAILABLE' CHECK (availability IN ('AVAILABLE','SOLD_OUT','HIDDEN')),
  availability_changed_at timestamptz,
  availability_changed_by uuid,
  active_media_id uuid,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES qx.branches(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, category_id) REFERENCES qx.categories(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, active_media_id) REFERENCES qx.media_assets(tenant_id, id)
);
CREATE INDEX products_category_idx ON qx.products (tenant_id, category_id, position) WHERE deleted_at IS NULL;
CREATE INDEX products_status_idx ON qx.products (tenant_id, availability, updated_at);

CREATE TABLE qx.product_allergens (
  tenant_id uuid NOT NULL,
  product_id uuid NOT NULL,
  allergen_code text NOT NULL CHECK (allergen_code IN ('GLUTEN','CRUSTACEANS','EGGS','FISH','PEANUTS','SOY','MILK',
    'TREE_NUTS','CELERY','MUSTARD','SESAME','SULPHITES','LUPIN','MOLLUSCS')),
  status text NOT NULL CHECK (status IN ('CONTAINS','MAY_CONTAIN','FREE','UNKNOWN')),
  verification text NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification IN ('UNVERIFIED','VERIFIED')),
  source text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','IMPORT','AI_SUGGESTION','SUPPLIER')),
  verified_by uuid,
  verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, allergen_code),
  FOREIGN KEY (tenant_id, product_id) REFERENCES qx.products(tenant_id, id) ON DELETE CASCADE,
  -- AI/imported values can never be stored as verified without a human verifier.
  CHECK (verification = 'UNVERIFIED' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
);

CREATE TABLE qx.nutrition_facts (
  tenant_id uuid NOT NULL,
  product_id uuid PRIMARY KEY,
  kcal integer NOT NULL CHECK (kcal BETWEEN 0 AND 10000),
  verification text NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification IN ('UNVERIFIED','VERIFIED')),
  source text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','IMPORT','AI_SUGGESTION','SUPPLIER')),
  verified_by uuid,
  verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, product_id) REFERENCES qx.products(tenant_id, id) ON DELETE CASCADE,
  CHECK (verification = 'UNVERIFIED' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
);

CREATE TABLE qx.price_history (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  product_id uuid NOT NULL,
  old_price_minor bigint,
  new_price_minor bigint NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, product_id) REFERENCES qx.products(tenant_id, id) ON DELETE CASCADE
);

-- Immutable published snapshots; restore creates a new row.
CREATE TABLE qx.menu_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  revision_no integer NOT NULL CHECK (revision_no >= 1),
  snapshot jsonb NOT NULL,
  checksum text NOT NULL,
  note text,
  published_by uuid,
  published_at timestamptz NOT NULL DEFAULT now(),
  restored_from_id uuid REFERENCES qx.menu_revisions(id),
  UNIQUE (tenant_id, branch_id, revision_no),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES qx.branches(tenant_id, id)
);
CREATE TRIGGER menu_revisions_immutable BEFORE UPDATE OR DELETE ON qx.menu_revisions
  FOR EACH ROW EXECUTE FUNCTION qx.forbid_mutation();

CREATE TABLE qx.menu_publications (
  tenant_id uuid NOT NULL,
  branch_id uuid PRIMARY KEY,
  revision_id uuid NOT NULL,
  revision_no integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES qx.branches(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, revision_id) REFERENCES qx.menu_revisions(tenant_id, id)
);

-- ---------------------------------------------------------------- QR & analytics (aggregate only)
CREATE TABLE qx.qr_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 40),
  token_hash text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES qx.branches(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE qx.qr_scan_daily (
  tenant_id uuid NOT NULL REFERENCES qx.tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL,
  table_id uuid,
  source text NOT NULL CHECK (source IN ('qr','table','direct')),
  local_date date NOT NULL,
  valid_count integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX qr_scan_daily_key ON qx.qr_scan_daily
  (tenant_id, branch_id, COALESCE(table_id, '00000000-0000-0000-0000-000000000000'::uuid), source, local_date);

-- Bounded dedupe ledger: random per-browser-session event id, no visitor identity.
CREATE TABLE qx.scan_dedupe (
  client_event_id text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES qx.tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scan_dedupe_created_idx ON qx.scan_dedupe (created_at);

CREATE TABLE qx.analytics_daily (
  tenant_id uuid NOT NULL REFERENCES qx.tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL,
  local_date date NOT NULL,
  metric text NOT NULL CHECK (metric IN ('item_view','category_view','search','wifi_reveal','whatsapp_click','pdf_download')),
  entity_id uuid,
  count integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX analytics_daily_key ON qx.analytics_daily
  (tenant_id, branch_id, local_date, metric, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------------------------------------------------------------- operations
CREATE TABLE qx.audit_logs (
  id bigserial PRIMARY KEY,
  tenant_id uuid,
  actor_user_id uuid,
  actor_kind text NOT NULL CHECK (actor_kind IN ('member','operator','system')),
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_tenant_idx ON qx.audit_logs (tenant_id, created_at DESC);
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON qx.audit_logs
  FOR EACH ROW EXECUTE FUNCTION qx.forbid_mutation();
CREATE TRIGGER price_history_append_only BEFORE UPDATE OR DELETE ON qx.price_history
  FOR EACH ROW EXECUTE FUNCTION qx.forbid_mutation();

CREATE TABLE qx.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES qx.tenants(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text UNIQUE,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','DONE','FAILED')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX outbox_pending_idx ON qx.outbox_events (available_at) WHERE status = 'PENDING';

CREATE TABLE qx.pdf_export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  revision_no integer NOT NULL,
  export_type text NOT NULL CHECK (export_type IN ('MENU_A4','ALLERGEN_A4')),
  include_sold_out boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','READY','FAILED')),
  file_key text,
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  generated_at timestamptz,
  expires_at timestamptz,
  FOREIGN KEY (tenant_id, branch_id) REFERENCES qx.branches(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE qx.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  filename text NOT NULL,
  status text NOT NULL DEFAULT 'VALIDATED' CHECK (status IN ('VALIDATED','APPLIED','DISCARDED')),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  FOREIGN KEY (tenant_id, branch_id) REFERENCES qx.branches(tenant_id, id) ON DELETE CASCADE
);

-- Regulatory rules are seeded PENDING_REVIEW; only APPROVED rules may block publishing.
CREATE TABLE qx.compliance_rules (
  code text PRIMARY KEY,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW','APPROVED','RETIRED')),
  blocking boolean NOT NULL DEFAULT false,
  source_ref text,
  reviewed_by text,
  reviewed_at date,
  CHECK (status <> 'APPROVED' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND source_ref IS NOT NULL))
);

CREATE TABLE qx.rate_limit_buckets (
  bucket_key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL
);

-- ---------------------------------------------------------------- updated_at triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','tenants','branches','branch_wifi','branch_whatsapp','menu_visibility_policies',
                           'categories','products','product_allergens','nutrition_facts','menu_publications'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON qx.%I FOR EACH ROW EXECUTE FUNCTION qx.touch_updated_at()', t || '_touch', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------- RLS: tenant-owned tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['branches','branch_wifi','branch_whatsapp','menu_visibility_policies','media_assets',
                           'categories','products','product_allergens','nutrition_facts','price_history',
                           'menu_revisions','menu_publications','qr_tables','qr_scan_daily','scan_dedupe',
                           'analytics_daily','pdf_export_jobs','import_batches','member_invites'] LOOP
    EXECUTE format('ALTER TABLE qx.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE qx.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON qx.%I TO qmenux_app USING (tenant_id = qx.current_tenant()) WITH CHECK (tenant_id = qx.current_tenant())', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON qx.branches, qx.branch_wifi, qx.branch_whatsapp, qx.menu_visibility_policies,
  qx.media_assets, qx.categories, qx.products, qx.product_allergens, qx.nutrition_facts, qx.qr_tables,
  qx.pdf_export_jobs, qx.import_batches, qx.member_invites, qx.menu_publications TO qmenux_app;
GRANT SELECT, INSERT ON qx.price_history, qx.menu_revisions TO qmenux_app;
GRANT SELECT ON qx.qr_scan_daily, qx.analytics_daily TO qmenux_app;
GRANT USAGE ON SEQUENCE qx.price_history_id_seq, qx.audit_logs_id_seq TO qmenux_app, qmenux_platform, qmenux_auth, qmenux_worker;

-- tenants: members read their own tenant; owners may update branding columns only.
ALTER TABLE qx.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE qx.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON qx.tenants TO qmenux_app USING (id = qx.current_tenant()) WITH CHECK (id = qx.current_tenant());
CREATE POLICY tenant_member_list ON qx.tenants FOR SELECT TO qmenux_auth USING (
  id IN (SELECT m.tenant_id FROM qx.memberships m WHERE m.user_id = qx.current_user_id() AND m.revoked_at IS NULL));
CREATE POLICY platform_all ON qx.tenants TO qmenux_platform USING (true) WITH CHECK (true);
CREATE POLICY definer_read ON qx.tenants FOR SELECT TO qmenux_definer USING (true);
CREATE POLICY worker_read ON qx.tenants FOR SELECT TO qmenux_worker USING (true);
GRANT SELECT ON qx.tenants TO qmenux_app, qmenux_auth, qmenux_definer, qmenux_worker;
GRANT UPDATE (display_name, tagline, business_type, theme_id, logo_media_id) ON qx.tenants TO qmenux_app;
GRANT SELECT, INSERT, UPDATE ON qx.tenants TO qmenux_platform;

-- memberships
ALTER TABLE qx.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE qx.memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON qx.memberships TO qmenux_app USING (tenant_id = qx.current_tenant()) WITH CHECK (tenant_id = qx.current_tenant());
CREATE POLICY own_memberships ON qx.memberships FOR SELECT TO qmenux_auth USING (user_id = qx.current_user_id());
CREATE POLICY platform_all ON qx.memberships TO qmenux_platform USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON qx.memberships TO qmenux_app;
GRANT SELECT ON qx.memberships TO qmenux_auth;
GRANT SELECT, INSERT ON qx.memberships TO qmenux_platform;

-- invites: accepted only through qx.accept_invite() (definer, token-hash lookup).

-- license grants: tenant reads own; only platform writes.
ALTER TABLE qx.license_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE qx.license_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON qx.license_grants FOR SELECT TO qmenux_app USING (tenant_id = qx.current_tenant());
CREATE POLICY platform_all ON qx.license_grants TO qmenux_platform USING (true) WITH CHECK (true);
CREATE POLICY definer_read ON qx.license_grants FOR SELECT TO qmenux_definer USING (true);
GRANT SELECT ON qx.license_grants TO qmenux_app, qmenux_definer;
GRANT SELECT, INSERT, UPDATE ON qx.license_grants TO qmenux_platform;

-- applications: applicant sees/creates own; platform reviews.
ALTER TABLE qx.tenant_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE qx.tenant_applications FORCE ROW LEVEL SECURITY;
CREATE POLICY own_application ON qx.tenant_applications TO qmenux_auth
  USING (applicant_user_id = qx.current_user_id()) WITH CHECK (applicant_user_id = qx.current_user_id() AND status IN ('PENDING','WITHDRAWN'));
CREATE POLICY platform_all ON qx.tenant_applications TO qmenux_platform USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON qx.tenant_applications TO qmenux_auth;
GRANT UPDATE (status) ON qx.tenant_applications TO qmenux_auth;
GRANT SELECT, UPDATE ON qx.tenant_applications TO qmenux_platform;

-- identity tables: auth role only (platform reads users for display).
GRANT SELECT, INSERT, UPDATE ON qx.users, qx.auth_identities, qx.sessions TO qmenux_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON qx.oidc_flows TO qmenux_auth;
GRANT SELECT ON qx.platform_operators TO qmenux_auth;
GRANT UPDATE (totp_secret_ciphertext, totp_enrolled_at, totp_last_step) ON qx.platform_operators TO qmenux_auth;
GRANT SELECT ON qx.users TO qmenux_platform, qmenux_app;
GRANT SELECT ON qx.platform_operators TO qmenux_platform;
-- members need colleagues' display names only through the memberships join in their tenant.
ALTER TABLE qx.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE qx.users FORCE ROW LEVEL SECURITY;
CREATE POLICY auth_all ON qx.users TO qmenux_auth USING (true) WITH CHECK (true);
CREATE POLICY platform_read ON qx.users FOR SELECT TO qmenux_platform USING (true);
CREATE POLICY tenant_colleagues ON qx.users FOR SELECT TO qmenux_app USING (
  id IN (SELECT m.user_id FROM qx.memberships m WHERE m.tenant_id = qx.current_tenant()));

-- platform: cross-tenant aggregate reads and onboarding writes, never catalog contents.
CREATE POLICY platform_read ON qx.qr_scan_daily FOR SELECT TO qmenux_platform USING (true);
CREATE POLICY platform_read ON qx.menu_publications FOR SELECT TO qmenux_platform USING (true);
CREATE POLICY platform_insert ON qx.branches TO qmenux_platform USING (true) WITH CHECK (true);
GRANT SELECT ON qx.qr_scan_daily, qx.menu_publications TO qmenux_platform;
GRANT SELECT, INSERT ON qx.branches TO qmenux_platform;

-- audit logs
ALTER TABLE qx.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE qx.audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_rw ON qx.audit_logs TO qmenux_app USING (tenant_id = qx.current_tenant()) WITH CHECK (tenant_id = qx.current_tenant() AND actor_kind = 'member');
CREATE POLICY platform_all ON qx.audit_logs TO qmenux_platform USING (true) WITH CHECK (actor_kind IN ('operator','system'));
CREATE POLICY auth_insert ON qx.audit_logs FOR INSERT TO qmenux_auth WITH CHECK (tenant_id IS NULL OR tenant_id IN (
  SELECT m.tenant_id FROM qx.memberships m WHERE m.user_id = qx.current_user_id()));
CREATE POLICY worker_insert ON qx.audit_logs FOR INSERT TO qmenux_worker WITH CHECK (actor_kind = 'system');
GRANT SELECT, INSERT ON qx.audit_logs TO qmenux_app, qmenux_platform;
GRANT INSERT ON qx.audit_logs TO qmenux_auth, qmenux_worker;

-- outbox: producers insert in-tenant; worker claims across tenants.
ALTER TABLE qx.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE qx.outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_insert ON qx.outbox_events FOR INSERT TO qmenux_app WITH CHECK (tenant_id = qx.current_tenant());
CREATE POLICY platform_insert ON qx.outbox_events FOR INSERT TO qmenux_platform WITH CHECK (true);
CREATE POLICY worker_all ON qx.outbox_events TO qmenux_worker USING (true) WITH CHECK (true);
GRANT INSERT ON qx.outbox_events TO qmenux_app, qmenux_platform;
GRANT SELECT, UPDATE ON qx.outbox_events TO qmenux_worker;

-- worker housekeeping
CREATE POLICY worker_purge ON qx.scan_dedupe FOR ALL TO qmenux_worker USING (true);
GRANT SELECT, DELETE ON qx.scan_dedupe TO qmenux_worker;
GRANT DELETE ON qx.oidc_flows, qx.rate_limit_buckets TO qmenux_worker;
GRANT SELECT, DELETE ON qx.oidc_flows TO qmenux_worker;
GRANT SELECT ON qx.rate_limit_buckets TO qmenux_worker;

-- compliance rules: global, readable by members, managed by platform.
GRANT SELECT ON qx.compliance_rules TO qmenux_app, qmenux_platform;
GRANT INSERT, UPDATE ON qx.compliance_rules TO qmenux_platform;

-- ---------------------------------------------------------------- definer read model (public)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['branches','branch_wifi','branch_whatsapp','menu_visibility_policies','media_assets',
                           'products','menu_revisions','menu_publications','qr_tables'] LOOP
    EXECUTE format('CREATE POLICY definer_read ON qx.%I FOR SELECT TO qmenux_definer USING (true)', t);
    EXECUTE format('GRANT SELECT ON qx.%I TO qmenux_definer', t);
  END LOOP;
END $$;
CREATE POLICY definer_write ON qx.qr_scan_daily TO qmenux_definer USING (true) WITH CHECK (true);
CREATE POLICY definer_write ON qx.scan_dedupe TO qmenux_definer USING (true) WITH CHECK (true);
CREATE POLICY definer_write ON qx.analytics_daily TO qmenux_definer USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON qx.qr_scan_daily, qx.scan_dedupe, qx.analytics_daily, qx.rate_limit_buckets TO qmenux_definer;

-- Effective license (ACTIVE / GRACE / EXPIRED / REVOKED / NOT_GRANTED) for one tenant.
CREATE FUNCTION qx.license_state(p_tenant uuid, p_grace_days integer) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = qx, pg_temp AS $$
  SELECT CASE
    WHEN g.id IS NULL THEN 'NOT_GRANTED'
    WHEN now() <= g.ends_at THEN 'ACTIVE'
    WHEN now() <= g.ends_at + make_interval(days => p_grace_days) THEN 'GRACE'
    ELSE 'EXPIRED' END
  FROM (SELECT 1) AS one
  LEFT JOIN LATERAL (
    SELECT lg.id, lg.ends_at FROM qx.license_grants lg
    WHERE lg.tenant_id = p_tenant AND lg.revoked_at IS NULL AND lg.starts_at <= now()
    ORDER BY lg.ends_at DESC LIMIT 1) g ON true
$$;

-- Guest read model by slug. Returns only published, public-safe data.
CREATE FUNCTION qx.public_menu(p_slug text, p_grace_days integer, p_geo_ok boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = qx, pg_temp AS $$
DECLARE
  t qx.tenants%ROWTYPE;
  b qx.branches%ROWTYPE;
  pub qx.menu_publications%ROWTYPE;
  rev qx.menu_revisions%ROWTYPE;
  vis qx.menu_visibility_policies%ROWTYPE;
  lic text;
BEGIN
  SELECT * INTO t FROM qx.tenants WHERE slug = p_slug;
  IF NOT FOUND OR t.status NOT IN ('ACTIVE','SUSPENDED') THEN
    RETURN jsonb_build_object('state','UNAVAILABLE','reason','NOT_FOUND');
  END IF;
  IF t.status = 'SUSPENDED' THEN RETURN jsonb_build_object('state','UNAVAILABLE','reason','SUSPENDED'); END IF;
  lic := qx.license_state(t.id, p_grace_days);
  IF lic NOT IN ('ACTIVE','GRACE') THEN RETURN jsonb_build_object('state','UNAVAILABLE','reason','LICENSE_INACTIVE'); END IF;
  SELECT * INTO b FROM qx.branches WHERE tenant_id = t.id AND is_primary;
  SELECT * INTO pub FROM qx.menu_publications WHERE branch_id = b.id;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','UNAVAILABLE','reason','NOT_PUBLISHED'); END IF;
  SELECT * INTO vis FROM qx.menu_visibility_policies WHERE branch_id = b.id;
  IF FOUND AND vis.mode <> 'OFF' AND NOT p_geo_ok THEN
    RETURN jsonb_build_object('state','GEOFENCE_REQUIRED','displayName',t.display_name,'themeId',t.theme_id,
      'geofence', jsonb_build_object('required',true,'mode',vis.mode,'policyVersion',vis.policy_version));
  END IF;
  SELECT * INTO rev FROM qx.menu_revisions WHERE id = pub.revision_id;
  RETURN jsonb_build_object(
    'state','OK',
    'tenant', jsonb_build_object('slug',t.slug,'displayName',t.display_name,'tagline',t.tagline,
      'businessType',t.business_type,'themeId',t.theme_id,
      'logoKey',(SELECT m.object_key FROM qx.media_assets m WHERE m.id = t.logo_media_id AND m.deleted_at IS NULL)),
    'branch', jsonb_build_object('id',b.id,'name',b.name,'address',b.address,'phone',b.phone,'hoursText',b.hours_text),
    'wifi', (SELECT jsonb_build_object('ssid',w.ssid,'passwordCiphertext',w.password_ciphertext)
             FROM qx.branch_wifi w WHERE w.branch_id = b.id AND w.enabled AND w.ssid IS NOT NULL),
    'whatsapp', (SELECT jsonb_build_object('phone',wa.phone_e164,'message',wa.message)
                 FROM qx.branch_whatsapp wa WHERE wa.branch_id = b.id AND wa.enabled AND wa.phone_e164 IS NOT NULL),
    'revision', jsonb_build_object('no',rev.revision_no,'publishedAt',rev.published_at),
    'snapshot', rev.snapshot,
    'availability', COALESCE((SELECT jsonb_object_agg(p.id::text, p.availability)
                              FROM qx.products p WHERE p.tenant_id = t.id AND p.branch_id = b.id), '{}'::jsonb)
  );
END $$;

CREATE FUNCTION qx.public_geofence(p_slug text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = qx, pg_temp AS $$
  SELECT jsonb_build_object('mode',v.mode,'centerLat',v.center_lat,'centerLng',v.center_lng,
                            'radiusM',v.radius_m,'regions',v.regions,'policyVersion',v.policy_version)
  FROM qx.tenants t
  JOIN qx.branches b ON b.tenant_id = t.id AND b.is_primary
  JOIN qx.menu_visibility_policies v ON v.branch_id = b.id
  WHERE t.slug = p_slug AND t.status = 'ACTIVE'
$$;

-- Counts one scan per client event id. Table token is a hash; unknown/revoked tokens count as 'qr'.
CREATE FUNCTION qx.public_record_scan(p_slug text, p_event_id text, p_source text, p_table_token_hash text, p_local_date date)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = qx, pg_temp AS $$
DECLARE
  v_tenant uuid; v_branch uuid; v_table uuid; v_source text := p_source; v_inserted integer;
BEGIN
  IF p_source NOT IN ('qr','table','direct') THEN RETURN false; END IF;
  SELECT t.id, b.id INTO v_tenant, v_branch FROM qx.tenants t
    JOIN qx.branches b ON b.tenant_id = t.id AND b.is_primary
    WHERE t.slug = p_slug AND t.status = 'ACTIVE';
  IF v_tenant IS NULL THEN RETURN false; END IF;
  IF p_table_token_hash IS NOT NULL THEN
    SELECT q.id INTO v_table FROM qx.qr_tables q
      WHERE q.token_hash = p_table_token_hash AND q.tenant_id = v_tenant AND q.active AND q.revoked_at IS NULL;
    v_source := CASE WHEN v_table IS NULL THEN 'qr' ELSE 'table' END;
  ELSIF v_source = 'table' THEN
    v_source := 'qr';
  END IF;
  INSERT INTO qx.scan_dedupe (client_event_id, tenant_id) VALUES (p_event_id, v_tenant) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN RETURN false; END IF;
  INSERT INTO qx.qr_scan_daily (tenant_id, branch_id, table_id, source, local_date, valid_count)
    VALUES (v_tenant, v_branch, v_table, v_source, p_local_date, 1)
  ON CONFLICT (tenant_id, branch_id, COALESCE(table_id, '00000000-0000-0000-0000-000000000000'::uuid), source, local_date)
    DO UPDATE SET valid_count = qx.qr_scan_daily.valid_count + 1;
  RETURN true;
END $$;

CREATE FUNCTION qx.public_record_metric(p_slug text, p_metric text, p_entity uuid, p_local_date date)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = qx, pg_temp AS $$
DECLARE v_tenant uuid; v_branch uuid;
BEGIN
  IF p_metric NOT IN ('item_view','category_view','search','wifi_reveal','whatsapp_click','pdf_download') THEN RETURN false; END IF;
  SELECT t.id, b.id INTO v_tenant, v_branch FROM qx.tenants t
    JOIN qx.branches b ON b.tenant_id = t.id AND b.is_primary WHERE t.slug = p_slug AND t.status = 'ACTIVE';
  IF v_tenant IS NULL THEN RETURN false; END IF;
  -- entity must belong to this tenant, otherwise counted without entity
  IF p_entity IS NOT NULL AND NOT EXISTS (SELECT 1 FROM qx.products p WHERE p.id = p_entity AND p.tenant_id = v_tenant) THEN
    p_entity := NULL;
  END IF;
  INSERT INTO qx.analytics_daily (tenant_id, branch_id, local_date, metric, entity_id, count)
    VALUES (v_tenant, v_branch, p_local_date, p_metric, p_entity, 1)
  ON CONFLICT (tenant_id, branch_id, local_date, metric, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET count = qx.analytics_daily.count + 1;
  RETURN true;
END $$;

-- Fixed-window limiter. Keys are HMACed by the caller (no raw IPs stored).
CREATE FUNCTION qx.rate_limit_hit(p_key text, p_limit integer, p_window_s integer) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = qx, pg_temp AS $$
DECLARE v_hits integer; v_now timestamptz := now();
BEGIN
  INSERT INTO qx.rate_limit_buckets AS r (bucket_key, window_start, hits) VALUES (p_key, v_now, 1)
  ON CONFLICT (bucket_key) DO UPDATE SET
    hits = CASE WHEN r.window_start < v_now - make_interval(secs => p_window_s) THEN 1 ELSE r.hits + 1 END,
    window_start = CASE WHEN r.window_start < v_now - make_interval(secs => p_window_s) THEN v_now ELSE r.window_start END
  RETURNING hits INTO v_hits;
  RETURN v_hits <= p_limit;
END $$;

-- Slug availability without exposing other tenants' rows to the applicant.
CREATE POLICY definer_read ON qx.tenant_applications FOR SELECT TO qmenux_definer USING (true);
GRANT SELECT ON qx.tenant_applications TO qmenux_definer;
CREATE FUNCTION qx.slug_taken(p_slug text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = qx, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM qx.tenants WHERE slug = p_slug)
      OR EXISTS (SELECT 1 FROM qx.tenant_applications WHERE slug = p_slug AND status = 'PENDING')
$$;

-- Invite acceptance: the signed-in user (app.user_id) joins exactly the invite's tenant.
CREATE POLICY definer_rw ON qx.member_invites TO qmenux_definer USING (true) WITH CHECK (true);
CREATE POLICY definer_insert ON qx.memberships FOR INSERT TO qmenux_definer WITH CHECK (true);
CREATE POLICY definer_read ON qx.memberships FOR SELECT TO qmenux_definer USING (true);
CREATE POLICY definer_insert ON qx.audit_logs FOR INSERT TO qmenux_definer WITH CHECK (actor_kind = 'member');
GRANT SELECT, UPDATE ON qx.member_invites TO qmenux_definer;
GRANT SELECT, INSERT ON qx.memberships TO qmenux_definer;
GRANT INSERT ON qx.audit_logs TO qmenux_definer;
GRANT USAGE ON SEQUENCE qx.audit_logs_id_seq TO qmenux_definer;
CREATE FUNCTION qx.accept_invite(p_token_hash text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = qx, pg_temp AS $$
DECLARE v_user uuid := qx.current_user_id(); v_tenant uuid; v_role text;
BEGIN
  IF v_user IS NULL THEN RETURN NULL; END IF;
  UPDATE qx.member_invites SET accepted_at = now()
   WHERE token_hash = p_token_hash AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
   RETURNING tenant_id, role INTO v_tenant, v_role;
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  INSERT INTO qx.memberships (tenant_id, user_id, role) VALUES (v_tenant, v_user, v_role)
    ON CONFLICT (tenant_id, user_id) DO NOTHING;
  INSERT INTO qx.audit_logs (tenant_id, actor_user_id, actor_kind, action, target_type, target_id)
    VALUES (v_tenant, v_user, 'member', 'member.accept_invite', 'user', v_user::text);
  RETURN v_tenant;
END $$;

GRANT CREATE ON SCHEMA qx TO qmenux_definer;
ALTER FUNCTION qx.accept_invite(text) OWNER TO qmenux_definer;
REVOKE ALL ON FUNCTION qx.accept_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qx.accept_invite(text) TO qmenux_auth;
ALTER FUNCTION qx.license_state(uuid, integer) OWNER TO qmenux_definer;
ALTER FUNCTION qx.public_menu(text, integer, boolean) OWNER TO qmenux_definer;
ALTER FUNCTION qx.public_geofence(text) OWNER TO qmenux_definer;
ALTER FUNCTION qx.public_record_scan(text, text, text, text, date) OWNER TO qmenux_definer;
ALTER FUNCTION qx.public_record_metric(text, text, uuid, date) OWNER TO qmenux_definer;
ALTER FUNCTION qx.rate_limit_hit(text, integer, integer) OWNER TO qmenux_definer;
ALTER FUNCTION qx.slug_taken(text) OWNER TO qmenux_definer;
REVOKE ALL ON FUNCTION qx.slug_taken(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qx.slug_taken(text) TO qmenux_auth, qmenux_platform;
REVOKE CREATE ON SCHEMA qx FROM qmenux_definer;
REVOKE ALL ON FUNCTION qx.license_state(uuid, integer), qx.public_menu(text, integer, boolean), qx.public_geofence(text),
  qx.public_record_scan(text, text, text, text, date), qx.public_record_metric(text, text, uuid, date),
  qx.rate_limit_hit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qx.public_menu(text, integer, boolean), qx.public_geofence(text),
  qx.public_record_scan(text, text, text, text, date), qx.public_record_metric(text, text, uuid, date) TO qmenux_public;
GRANT EXECUTE ON FUNCTION qx.rate_limit_hit(text, integer, integer) TO qmenux_public, qmenux_auth, qmenux_app, qmenux_platform;
GRANT EXECUTE ON FUNCTION qx.license_state(uuid, integer) TO qmenux_app, qmenux_platform, qmenux_auth;
