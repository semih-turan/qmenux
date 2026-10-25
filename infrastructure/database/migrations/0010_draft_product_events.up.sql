-- Apply atomically with the direct migration owner; no application data is deleted.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
DO $guard$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations)
    IS DISTINCT FROM ARRAY['0001_tenant_catalog', '0002_tenant_resolution', '0003_identity_sessions', '0004_tenant_memberships', '0005_operator_sessions', '0006_auth_expiry', '0007_microsoft_identity', '0008_apple_identity', '0009_admin_audience'] THEN
    RAISE EXCEPTION 'Expected migrations 0001 through 0009';
  END IF;
END
$guard$;
ALTER TABLE qmenux.products ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);
CREATE TABLE qmenux.product_events (
  tenant_id uuid NOT NULL,
  product_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  actor_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  previous jsonb,
  current jsonb NOT NULL,
  PRIMARY KEY (tenant_id, product_id, revision),
  FOREIGN KEY (tenant_id, product_id) REFERENCES qmenux.products(tenant_id, id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE qmenux.product_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux.product_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON qmenux.product_events USING (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT ON qmenux.product_events TO qmenux_runtime;
REVOKE DELETE ON qmenux.products FROM qmenux_runtime;

CREATE FUNCTION qmenux.record_product_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET timezone = 'UTC' AS $audit$
DECLARE actor uuid;
BEGIN
  actor := NULLIF(current_setting('app.catalog_actor', true), '')::uuid;
  IF actor IS NULL OR NEW.tenant_id IS DISTINCT FROM NULLIF(current_setting('app.tenant_id', true), '')::uuid THEN
    RAISE EXCEPTION 'Trusted catalog context required' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Product identity is immutable' USING ERRCODE = '42501';
    END IF;
    IF (to_jsonb(NEW) - 'revision' - 'updated_at') = (to_jsonb(OLD) - 'revision' - 'updated_at') THEN
      RETURN OLD;
    END IF;
    NEW.revision := OLD.revision + 1;
    NEW.updated_at := clock_timestamp();
    INSERT INTO qmenux.product_events(tenant_id, product_id, revision, actor_id, previous, current)
      VALUES (NEW.tenant_id, NEW.id, NEW.revision, actor, to_jsonb(OLD), to_jsonb(NEW));
  ELSE
    NEW.revision := 1;
    INSERT INTO qmenux.product_events(tenant_id, product_id, revision, actor_id, previous, current)
      VALUES (NEW.tenant_id, NEW.id, NEW.revision, actor, NULL, to_jsonb(NEW));
  END IF;
  RETURN NEW;
END
$audit$;
REVOKE ALL ON FUNCTION qmenux.record_product_change() FROM PUBLIC;
CREATE TRIGGER product_change BEFORE INSERT OR UPDATE ON qmenux.products
  FOR EACH ROW EXECUTE FUNCTION qmenux.record_product_change();
CREATE FUNCTION qmenux.reject_product_event_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $immutable$
BEGIN
  RAISE EXCEPTION 'Product events are append-only' USING ERRCODE = '42501';
END
$immutable$;
REVOKE ALL ON FUNCTION qmenux.reject_product_event_change() FROM PUBLIC;
CREATE TRIGGER immutable_product_events BEFORE UPDATE OR DELETE OR TRUNCATE ON qmenux.product_events
  FOR EACH STATEMENT EXECUTE FUNCTION qmenux.reject_product_event_change();
INSERT INTO qmenux.schema_migrations(version) VALUES ('0010_draft_product_events');
