-- Local development only. No tenant, membership, approval or license is created.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
DO $guard$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations)
    IS DISTINCT FROM ARRAY['0001_tenant_catalog', '0002_tenant_resolution', '0003_identity_sessions', '0004_tenant_memberships', '0005_operator_sessions', '0006_auth_expiry', '0007_microsoft_identity', '0008_apple_identity', '0009_admin_audience', '0010_draft_product_events', '0011_admin_tenant_membership', '0012_draft_menu_structure'] THEN
    RAISE EXCEPTION 'Unexpected migration versions';
  END IF;
END
$guard$;

CREATE FUNCTION qmenux_identity.bound_admin_session(token_hash text,csrf_hash text) RETURNS uuid
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $identity$
  SELECT s.user_id FROM qmenux_identity.sessions s JOIN qmenux_identity.users u ON u.id=s.user_id
  WHERE s.audience='admin' AND s.token_hash=$1 AND s.csrf_hash=$2 AND s.expires_at>now() AND u.status='REGISTERED'
$identity$;
REVOKE ALL ON FUNCTION qmenux_identity.bound_admin_session(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qmenux_identity.bound_admin_session(text,text) TO qmenux_runtime;
CREATE SCHEMA qmenux_onboarding;
REVOKE ALL ON SCHEMA qmenux_onboarding FROM PUBLIC;
GRANT USAGE ON SCHEMA qmenux_onboarding TO qmenux_runtime;
CREATE TABLE qmenux_onboarding.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL,
  request_key uuid NOT NULL,
  initial_name text NOT NULL,
  requested_name text NOT NULL CHECK (length(requested_name) BETWEEN 1 AND 200
    AND requested_name=btrim(requested_name) AND requested_name !~ '[[:cntrl:]]'),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_APPROVAL')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  submitted_at timestamptz,
  UNIQUE(applicant_id,request_key),
  CHECK ((status='DRAFT' AND submitted_at IS NULL) OR (status='PENDING_APPROVAL' AND submitted_at IS NOT NULL))
);
CREATE INDEX applications_applicant_id ON qmenux_onboarding.applications(applicant_id,id);
CREATE TABLE qmenux_onboarding.application_events (
  application_id uuid NOT NULL REFERENCES qmenux_onboarding.applications(id) DEFERRABLE INITIALLY DEFERRED,
  revision integer NOT NULL CHECK (revision>0),
  actor_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  previous jsonb,
  current jsonb NOT NULL,
  PRIMARY KEY(application_id,revision)
);
-- Pre-tenant applicant records: no direct runtime table access or permissive row policy.
ALTER TABLE qmenux_onboarding.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux_onboarding.applications FORCE ROW LEVEL SECURITY;
ALTER TABLE qmenux_onboarding.application_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux_onboarding.application_events FORCE ROW LEVEL SECURITY;
CREATE FUNCTION qmenux_onboarding.record_application_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET timezone = 'UTC' AS $audit$
DECLARE actor uuid; prior jsonb;
BEGIN
  actor:=NULLIF(current_setting('app.onboarding_actor',true),'')::uuid;
  IF actor IS NULL OR actor IS DISTINCT FROM NEW.applicant_id THEN
    RAISE EXCEPTION 'Trusted applicant context required' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.applicant_id IS DISTINCT FROM OLD.applicant_id
      OR NEW.request_key IS DISTINCT FROM OLD.request_key OR NEW.initial_name IS DISTINCT FROM OLD.initial_name
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Application identity is immutable' USING ERRCODE='42501';
    END IF;
    IF (to_jsonb(NEW)-'revision'-'updated_at')=(to_jsonb(OLD)-'revision'-'updated_at') THEN RETURN OLD; END IF;
    IF OLD.status<>'DRAFT' THEN RAISE EXCEPTION 'Submitted application is immutable' USING ERRCODE='42501'; END IF;
    NEW.revision:=OLD.revision+1; NEW.updated_at:=clock_timestamp(); prior:=to_jsonb(OLD);
  ELSE NEW.revision:=1;
  END IF;
  INSERT INTO qmenux_onboarding.application_events(application_id,revision,actor_id,previous,current)
    VALUES (NEW.id,NEW.revision,actor,prior,to_jsonb(NEW));
  RETURN NEW;
END
$audit$;
REVOKE ALL ON FUNCTION qmenux_onboarding.record_application_change() FROM PUBLIC;
CREATE TRIGGER application_change BEFORE INSERT OR UPDATE ON qmenux_onboarding.applications
  FOR EACH ROW EXECUTE FUNCTION qmenux_onboarding.record_application_change();
CREATE FUNCTION qmenux_onboarding.reject_event_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $immutable$
BEGIN RAISE EXCEPTION 'Application events are append-only' USING ERRCODE='42501'; END
$immutable$;
REVOKE ALL ON FUNCTION qmenux_onboarding.reject_event_change() FROM PUBLIC;
CREATE TRIGGER immutable_application_events BEFORE UPDATE OR DELETE OR TRUNCATE ON qmenux_onboarding.application_events
  FOR EACH STATEMENT EXECUTE FUNCTION qmenux_onboarding.reject_event_change();

CREATE FUNCTION qmenux_onboarding.create_draft(session_hash text,csrf_hash text,request_key uuid,name text)
RETURNS TABLE(id uuid,"requestedName" text,status text,revision integer,"createdAt" timestamptz,"submittedAt" timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $create$
DECLARE uid uuid; target qmenux_onboarding.applications%ROWTYPE;
BEGIN
  uid:=qmenux_identity.bound_admin_session($1,$2);
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='28000'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('onboarding:'||uid::text||':'||$3::text,0));
  -- Avoid firing the INSERT audit trigger for a replay that will hit a uniqueness conflict.
  SELECT a.* INTO target FROM qmenux_onboarding.applications a WHERE a.applicant_id=uid AND a.request_key=$3 FOR UPDATE;
  IF FOUND THEN
    IF target.initial_name IS DISTINCT FROM $4 THEN RAISE EXCEPTION 'Conflicting retry' USING ERRCODE='23505'; END IF;
  ELSE
    PERFORM set_config('app.onboarding_actor',uid::text,true);
    INSERT INTO qmenux_onboarding.applications(applicant_id,request_key,initial_name,requested_name) VALUES(uid,$3,$4,$4)
      RETURNING applications.* INTO target;
  END IF;
  RETURN QUERY SELECT a.id,a.requested_name,a.status,a.revision,a.created_at,a.submitted_at FROM qmenux_onboarding.applications a WHERE a.id=target.id AND a.applicant_id=uid;
END
$create$;
CREATE FUNCTION qmenux_onboarding.edit_draft(session_hash text,csrf_hash text,application_id uuid,expected_revision integer,name text)
RETURNS TABLE(id uuid,"requestedName" text,status text,revision integer,"createdAt" timestamptz,"submittedAt" timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $edit$
DECLARE uid uuid; target qmenux_onboarding.applications%ROWTYPE;
BEGIN
  uid:=qmenux_identity.bound_admin_session($1,$2);
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='28000'; END IF;
  SELECT a.* INTO target FROM qmenux_onboarding.applications a WHERE a.id=$3 AND a.applicant_id=uid FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF target.status<>'DRAFT' OR target.revision<>$4 THEN RAISE EXCEPTION 'Conflicting edit' USING ERRCODE='23505'; END IF;
  PERFORM set_config('app.onboarding_actor',uid::text,true);
  UPDATE qmenux_onboarding.applications a SET requested_name=$5 WHERE a.id=target.id AND a.applicant_id=uid;
  RETURN QUERY SELECT a.id,a.requested_name,a.status,a.revision,a.created_at,a.submitted_at FROM qmenux_onboarding.applications a WHERE a.id=target.id AND a.applicant_id=uid;
END
$edit$;
CREATE FUNCTION qmenux_onboarding.submit_draft(session_hash text,csrf_hash text,application_id uuid,expected_revision integer)
RETURNS TABLE(id uuid,"requestedName" text,status text,revision integer,"createdAt" timestamptz,"submittedAt" timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $submit$
DECLARE uid uuid; target qmenux_onboarding.applications%ROWTYPE;
BEGIN
  uid:=qmenux_identity.bound_admin_session($1,$2);
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='28000'; END IF;
  SELECT a.* INTO target FROM qmenux_onboarding.applications a WHERE a.id=$3 AND a.applicant_id=uid FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF target.status='DRAFT' THEN
    IF target.revision<>$4 THEN RAISE EXCEPTION 'Conflicting submission' USING ERRCODE='23505'; END IF;
    PERFORM set_config('app.onboarding_actor',uid::text,true);
    UPDATE qmenux_onboarding.applications a SET status='PENDING_APPROVAL',submitted_at=clock_timestamp() WHERE a.id=target.id AND a.applicant_id=uid;
  END IF;
  RETURN QUERY SELECT a.id,a.requested_name,a.status,a.revision,a.created_at,a.submitted_at FROM qmenux_onboarding.applications a WHERE a.id=target.id AND a.applicant_id=uid;
END
$submit$;
CREATE FUNCTION qmenux_onboarding.list_applications(session_hash text,after_id uuid,page_limit integer)
RETURNS TABLE(id uuid,"requestedName" text,status text,revision integer,"createdAt" timestamptz,"submittedAt" timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $list$
DECLARE uid uuid;
BEGIN
  SELECT u.id INTO uid FROM qmenux_identity.read_admin_session($1) u;
  IF uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='28000'; END IF;
  IF $3 IS NULL OR $3<1 OR $3>101 THEN RAISE EXCEPTION 'Invalid limit' USING ERRCODE='22023'; END IF;
  RETURN QUERY SELECT a.id,a.requested_name,a.status,a.revision,a.created_at,a.submitted_at FROM qmenux_onboarding.applications a
    WHERE a.applicant_id=uid AND ($2 IS NULL OR a.id>$2) ORDER BY a.id LIMIT $3;
END
$list$;
REVOKE ALL ON FUNCTION qmenux_onboarding.create_draft(text,text,uuid,text),qmenux_onboarding.edit_draft(text,text,uuid,integer,text),
  qmenux_onboarding.submit_draft(text,text,uuid,integer),qmenux_onboarding.list_applications(text,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qmenux_onboarding.create_draft(text,text,uuid,text),qmenux_onboarding.edit_draft(text,text,uuid,integer,text),
  qmenux_onboarding.submit_draft(text,text,uuid,integer),qmenux_onboarding.list_applications(text,uuid,integer) TO qmenux_runtime;
INSERT INTO qmenux.schema_migrations(version) VALUES ('0013_onboarding_applications');
