-- Direct-owner atomic migration. No application data is deleted.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
DO $guard$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations)
    IS DISTINCT FROM ARRAY['0001_tenant_catalog', '0002_tenant_resolution', '0003_identity_sessions', '0004_tenant_memberships', '0005_operator_sessions', '0006_auth_expiry', '0007_microsoft_identity', '0008_apple_identity', '0009_admin_audience', '0010_draft_product_events', '0011_admin_tenant_membership'] THEN
    RAISE EXCEPTION 'Unexpected migration versions';
  END IF;
END
$guard$;
ALTER TABLE qmenux.menus ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);
CREATE TABLE qmenux.menu_events (
  tenant_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  actor_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  previous jsonb,
  current jsonb NOT NULL,
  PRIMARY KEY (tenant_id, entity_id, revision),
  FOREIGN KEY (tenant_id, entity_id) REFERENCES qmenux.menus(tenant_id, id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE qmenux.menu_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux.menu_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON qmenux.menu_events USING (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT ON qmenux.menu_events TO qmenux_runtime;
REVOKE DELETE ON qmenux.menus FROM qmenux_runtime;
ALTER TABLE qmenux.categories ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);
CREATE TABLE qmenux.category_events (
  tenant_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  actor_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  previous jsonb,
  current jsonb NOT NULL,
  PRIMARY KEY (tenant_id, entity_id, revision),
  FOREIGN KEY (tenant_id, entity_id) REFERENCES qmenux.categories(tenant_id, id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE qmenux.category_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux.category_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON qmenux.category_events USING (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT ON qmenux.category_events TO qmenux_runtime;
REVOKE DELETE ON qmenux.categories FROM qmenux_runtime;

CREATE FUNCTION qmenux.record_structure_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET timezone = 'UTC' AS $audit$
DECLARE actor uuid; prior jsonb;
BEGIN
  actor := NULLIF(current_setting('app.catalog_actor', true), '')::uuid;
  IF TG_TABLE_SCHEMA <> 'qmenux' OR TG_TABLE_NAME NOT IN ('menus','categories') OR actor IS NULL
    OR NEW.tenant_id IS DISTINCT FROM NULLIF(current_setting('app.tenant_id', true), '')::uuid THEN
    RAISE EXCEPTION 'Trusted catalog context required' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Catalog identity is immutable' USING ERRCODE = '42501';
    END IF;
    IF (to_jsonb(NEW) - 'revision' - 'updated_at') = (to_jsonb(OLD) - 'revision' - 'updated_at') THEN
      RETURN OLD;
    END IF;
    NEW.revision := OLD.revision + 1;
    NEW.updated_at := clock_timestamp();
    prior := to_jsonb(OLD);
  ELSE
    NEW.revision := 1;
  END IF;
  IF TG_TABLE_NAME = 'menus' THEN
    INSERT INTO qmenux.menu_events(tenant_id,entity_id,revision,actor_id,previous,current)
      VALUES (NEW.tenant_id,NEW.id,NEW.revision,actor,prior,to_jsonb(NEW));
  ELSE
    INSERT INTO qmenux.category_events(tenant_id,entity_id,revision,actor_id,previous,current)
      VALUES (NEW.tenant_id,NEW.id,NEW.revision,actor,prior,to_jsonb(NEW));
  END IF;
  RETURN NEW;
END
$audit$;
REVOKE ALL ON FUNCTION qmenux.record_structure_change() FROM PUBLIC;
CREATE TRIGGER menu_change BEFORE INSERT OR UPDATE ON qmenux.menus
  FOR EACH ROW EXECUTE FUNCTION qmenux.record_structure_change();
CREATE TRIGGER category_change BEFORE INSERT OR UPDATE ON qmenux.categories
  FOR EACH ROW EXECUTE FUNCTION qmenux.record_structure_change();
CREATE FUNCTION qmenux.reject_structure_event_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $immutable$
BEGIN
  RAISE EXCEPTION 'Catalog events are append-only' USING ERRCODE = '42501';
END
$immutable$;
REVOKE ALL ON FUNCTION qmenux.reject_structure_event_change() FROM PUBLIC;
CREATE TRIGGER immutable_menu_events BEFORE UPDATE OR DELETE OR TRUNCATE ON qmenux.menu_events
  FOR EACH STATEMENT EXECUTE FUNCTION qmenux.reject_structure_event_change();
CREATE TRIGGER immutable_category_events BEFORE UPDATE OR DELETE OR TRUNCATE ON qmenux.category_events
  FOR EACH STATEMENT EXECUTE FUNCTION qmenux.reject_structure_event_change();
INSERT INTO qmenux.schema_migrations(version) VALUES ('0012_draft_menu_structure');
