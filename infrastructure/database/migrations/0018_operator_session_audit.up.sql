-- Audit only lifecycle facts, without retaining credentials or inventing a human revoker.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations',0));
DO $guard$ BEGIN
IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations) IS DISTINCT FROM ARRAY['0001_tenant_catalog','0002_tenant_resolution','0003_identity_sessions','0004_tenant_memberships','0005_operator_sessions','0006_auth_expiry','0007_microsoft_identity','0008_apple_identity','0009_admin_audience','0010_draft_product_events','0011_admin_tenant_membership','0012_draft_menu_structure','0013_onboarding_applications','0014_operator_passkeys','0015_operator_logout','0016_operator_browser_sessions','0017_operator_challenge_restart'] THEN RAISE EXCEPTION 'Unexpected migration versions'; END IF;
END $guard$;

LOCK TABLE qmenux_operator.sessions IN ACCESS EXCLUSIVE MODE;
ALTER TABLE qmenux_operator.sessions ADD COLUMN audit_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE;
CREATE TABLE qmenux_operator.session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  operator_id uuid NOT NULL REFERENCES qmenux_operator.operators(id),
  audience text NOT NULL CHECK(audience ~ '^[a-f0-9]{64}$'),
  kind text NOT NULL CHECK(kind IN ('OBSERVED','ISSUED','RETIRED')),
  expires_at timestamptz NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(session_id,kind)
);
CREATE INDEX operator_session_events_subject ON qmenux_operator.session_events(operator_id,occurred_at);
ALTER TABLE qmenux_operator.session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux_operator.session_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON qmenux_operator.session_events FROM PUBLIC,qmenux_runtime;
CREATE FUNCTION qmenux_operator.session_event_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $f$
BEGIN RAISE EXCEPTION 'Session history is append-only' USING ERRCODE='42501'; END $f$;
CREATE TRIGGER immutable_session_events BEFORE UPDATE OR DELETE OR TRUNCATE ON qmenux_operator.session_events
FOR EACH STATEMENT EXECUTE FUNCTION qmenux_operator.session_event_immutable();
CREATE FUNCTION qmenux_operator.session_identity_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $f$
BEGIN
  IF TG_OP='TRUNCATE' THEN RAISE EXCEPTION 'Use bounded session retirement' USING ERRCODE='42501'; END IF;
  IF NEW.audit_id IS DISTINCT FROM OLD.audit_id OR NEW.operator_id IS DISTINCT FROM OLD.operator_id
    OR NEW.audience IS DISTINCT FROM OLD.audience OR NEW.token_hash IS DISTINCT FROM OLD.token_hash THEN
    RAISE EXCEPTION 'Session identity is immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER immutable_session_identity BEFORE UPDATE ON qmenux_operator.sessions
FOR EACH ROW EXECUTE FUNCTION qmenux_operator.session_identity_immutable();
CREATE TRIGGER session_no_truncate BEFORE TRUNCATE ON qmenux_operator.sessions
FOR EACH STATEMENT EXECUTE FUNCTION qmenux_operator.session_identity_immutable();
CREATE FUNCTION qmenux_operator.record_session_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO qmenux_operator.session_events(session_id,operator_id,audience,kind,expires_at)
      VALUES(NEW.audit_id,NEW.operator_id,NEW.audience,'ISSUED',NEW.expires_at);
  ELSE
    INSERT INTO qmenux_operator.session_events(session_id,operator_id,audience,kind,expires_at)
      VALUES(OLD.audit_id,OLD.operator_id,OLD.audience,'RETIRED',OLD.expires_at);
  END IF;
  RETURN NULL;
END $f$;
CREATE TRIGGER session_lifecycle AFTER INSERT OR DELETE ON qmenux_operator.sessions
FOR EACH ROW EXECUTE FUNCTION qmenux_operator.record_session_event();
REVOKE ALL ON FUNCTION qmenux_operator.session_event_immutable(),qmenux_operator.session_identity_immutable(),qmenux_operator.record_session_event() FROM PUBLIC,qmenux_runtime;
-- Existing rows were observed at migration time, not issued at migration time.
INSERT INTO qmenux_operator.session_events(session_id,operator_id,audience,kind,expires_at)
  SELECT audit_id,operator_id,audience,'OBSERVED',expires_at FROM qmenux_operator.sessions;
INSERT INTO qmenux.schema_migrations(version) VALUES('0018_operator_session_audit');
