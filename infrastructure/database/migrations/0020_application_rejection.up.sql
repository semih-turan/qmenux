-- Explicit rejection only. No tenant, membership, approval or license is created.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations',0));
DO $guard$ BEGIN
IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations) IS DISTINCT FROM ARRAY['0001_tenant_catalog','0002_tenant_resolution','0003_identity_sessions','0004_tenant_memberships','0005_operator_sessions','0006_auth_expiry','0007_microsoft_identity','0008_apple_identity','0009_admin_audience','0010_draft_product_events','0011_admin_tenant_membership','0012_draft_menu_structure','0013_onboarding_applications','0014_operator_passkeys','0015_operator_logout','0016_operator_browser_sessions','0017_operator_challenge_restart','0018_operator_session_audit','0019_operator_step_up'] THEN RAISE EXCEPTION 'Unexpected migration versions'; END IF;
END $guard$;



ALTER TABLE qmenux_operator.step_up_events ADD COLUMN transaction_id xid8;
ALTER TABLE qmenux_operator.step_up_events ALTER COLUMN transaction_id SET DEFAULT pg_current_xact_id();
CREATE INDEX consumed_operation_transaction ON qmenux_operator.step_up_events(transaction_id,operation_hash) WHERE kind='CONSUMED' AND transaction_id IS NOT NULL;
CREATE FUNCTION qmenux_operator.review_session(issuer text,subject text,audience text,session_hash text,csrf_hash text,mfa_hash text,browser_hash text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
SELECT qmenux_operator.step_up_actor($1,$2,$3,$4,$5,$6,$7)
$f$;
CREATE FUNCTION qmenux_operator.rejection_actor(operation_hash text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
SELECT e.operator_id FROM qmenux_operator.step_up_events e JOIN qmenux_operator.operators o ON o.id=e.operator_id
WHERE e.action='tenant:reject' AND e.kind='CONSUMED' AND e.transaction_id=pg_current_xact_id_if_assigned() AND e.operation_hash=$1
AND o.status='ACTIVE' AND o.role='PLATFORM_ADMIN'
$f$;
REVOKE ALL ON FUNCTION qmenux_operator.review_session(text,text,text,text,text,text,text),qmenux_operator.rejection_actor(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qmenux_operator.review_session(text,text,text,text,text,text,text),qmenux_operator.rejection_actor(text) TO qmenux_runtime;
ALTER TABLE qmenux_onboarding.applications ADD COLUMN reviewed_at timestamptz,ADD COLUMN reviewed_by uuid,
 ADD COLUMN review_request_id uuid,ADD COLUMN rejection_reason text CHECK(length(rejection_reason) BETWEEN 1 AND 1000 AND rejection_reason=btrim(rejection_reason) AND rejection_reason !~ '[[:cntrl:]]');
ALTER TABLE qmenux_onboarding.applications DROP CONSTRAINT applications_status_check,DROP CONSTRAINT applications_check;
ALTER TABLE qmenux_onboarding.applications ADD CONSTRAINT applications_status_check CHECK(status IN ('DRAFT','PENDING_APPROVAL','REJECTED')),
 ADD CONSTRAINT applications_check CHECK(
 (status='DRAFT' AND submitted_at IS NULL AND reviewed_at IS NULL AND reviewed_by IS NULL AND review_request_id IS NULL AND rejection_reason IS NULL)
 OR (status='PENDING_APPROVAL' AND submitted_at IS NOT NULL AND reviewed_at IS NULL AND reviewed_by IS NULL AND review_request_id IS NULL AND rejection_reason IS NULL)
 OR (status='REJECTED' AND submitted_at IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND review_request_id IS NOT NULL AND rejection_reason IS NOT NULL));
CREATE UNIQUE INDEX application_review_request ON qmenux_onboarding.applications(reviewed_by,review_request_id) WHERE reviewed_by IS NOT NULL;
ALTER TABLE qmenux_onboarding.application_events ADD COLUMN actor_kind text NOT NULL DEFAULT 'APPLICANT' CHECK(actor_kind IN ('APPLICANT','OPERATOR'));
CREATE FUNCTION qmenux_onboarding.rejection_operation(application_id uuid,request_id uuid,revision integer,reason text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,pg_temp AS $f$
SELECT encode(sha256(convert_to('["tenant:reject","'||$1::text||'","'||$2::text||'","'||encode(sha256(convert_to($3::text||':'||$4,'UTF8')),'hex')||'"]','UTF8')),'hex')
$f$;
REVOKE ALL ON FUNCTION qmenux_onboarding.rejection_operation(uuid,uuid,integer,text) FROM PUBLIC,qmenux_runtime;
CREATE OR REPLACE FUNCTION qmenux_onboarding.record_application_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET timezone='UTC' AS $f$
DECLARE actor uuid; prior jsonb; actor_type text:='APPLICANT';
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.applicant_id IS DISTINCT FROM OLD.applicant_id OR NEW.request_key IS DISTINCT FROM OLD.request_key
      OR NEW.initial_name IS DISTINCT FROM OLD.initial_name OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'Application identity is immutable' USING ERRCODE='42501'; END IF;
    prior:=to_jsonb(OLD);
  END IF;
  IF TG_OP='UPDATE' AND OLD.status='PENDING_APPROVAL' AND NEW.status='REJECTED' THEN
    actor:=qmenux_operator.rejection_actor(qmenux_onboarding.rejection_operation(OLD.id,NEW.review_request_id,OLD.revision,NEW.rejection_reason));
    IF actor IS NULL OR NEW.reviewed_by IS DISTINCT FROM actor OR NEW.requested_name IS DISTINCT FROM OLD.requested_name
      OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN RAISE EXCEPTION 'Verified rejection required' USING ERRCODE='42501'; END IF;
    actor_type:='OPERATOR';NEW.reviewed_at:=clock_timestamp();
  ELSE
    IF NEW.status NOT IN ('DRAFT','PENDING_APPROVAL') OR NEW.reviewed_at IS NOT NULL OR NEW.reviewed_by IS NOT NULL OR NEW.review_request_id IS NOT NULL OR NEW.rejection_reason IS NOT NULL THEN RAISE EXCEPTION 'Applicant cannot review' USING ERRCODE='42501'; END IF;
    actor:=NULLIF(current_setting('app.onboarding_actor',true),'')::uuid;
    IF actor IS NULL OR actor IS DISTINCT FROM NEW.applicant_id THEN RAISE EXCEPTION 'Trusted applicant context required' USING ERRCODE='42501'; END IF;
    IF TG_OP='UPDATE' THEN
      IF (to_jsonb(NEW)-'revision'-'updated_at')=(to_jsonb(OLD)-'revision'-'updated_at') THEN RETURN OLD; END IF;
      IF OLD.status<>'DRAFT' THEN RAISE EXCEPTION 'Submitted application is immutable' USING ERRCODE='42501'; END IF;
    ELSIF NEW.status<>'DRAFT' THEN RAISE EXCEPTION 'Draft required' USING ERRCODE='42501'; END IF;
  END IF;
  IF TG_OP='UPDATE' THEN NEW.revision:=OLD.revision+1;NEW.updated_at:=clock_timestamp();ELSE NEW.revision:=1;END IF;
  INSERT INTO qmenux_onboarding.application_events(application_id,revision,actor_id,previous,current,actor_kind)
    VALUES(NEW.id,NEW.revision,actor,prior,to_jsonb(NEW),actor_type);
  RETURN NEW;
END $f$;
CREATE FUNCTION qmenux_onboarding.list_pending(issuer text,subject text,audience text,session_hash text,csrf_hash text,mfa_hash text,browser_hash text,after_id uuid,page_limit integer)
RETURNS TABLE(id uuid,"requestedName" text,status text,revision integer,"createdAt" timestamptz,"submittedAt" timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
BEGIN
 IF qmenux_operator.review_session($1,$2,$3,$4,$5,$6,$7) IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='28000'; END IF;
 IF $9 IS NULL OR $9<1 OR $9>101 THEN RAISE EXCEPTION 'Invalid limit' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT a.id,a.requested_name,a.status,a.revision,a.created_at,a.submitted_at FROM qmenux_onboarding.applications a WHERE a.status='PENDING_APPROVAL' AND ($8 IS NULL OR a.id>$8) ORDER BY a.id LIMIT $9;
END $f$;
CREATE FUNCTION qmenux_onboarding.replay_rejection(issuer text,subject text,audience text,session_hash text,csrf_hash text,mfa_hash text,browser_hash text,application_id uuid,request_id uuid,expected_revision integer,reason text)
RETURNS TABLE(id uuid,"requestedName" text,status text,revision integer,"createdAt" timestamptz,"submittedAt" timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE actor uuid; target qmenux_onboarding.applications%ROWTYPE;
BEGIN
 actor:=qmenux_operator.review_session($1,$2,$3,$4,$5,$6,$7);
 IF actor IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='28000'; END IF;
 SELECT a.* INTO target FROM qmenux_onboarding.applications a WHERE a.reviewed_by=actor AND a.review_request_id=$9;
 IF FOUND THEN
  IF target.id<>$8 OR target.revision<>$10+1 OR target.rejection_reason IS DISTINCT FROM $11 THEN RAISE EXCEPTION 'Conflicting retry' USING ERRCODE='23505'; END IF;
  RETURN QUERY SELECT a.id,a.requested_name,a.status,a.revision,a.created_at,a.submitted_at FROM qmenux_onboarding.applications a WHERE a.id=target.id;
 END IF;
END $f$;
CREATE FUNCTION qmenux_onboarding.reject_application(application_id uuid,request_id uuid,expected_revision integer,reason text)
RETURNS TABLE(id uuid,"requestedName" text,status text,revision integer,"createdAt" timestamptz,"submittedAt" timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE actor uuid; target qmenux_onboarding.applications%ROWTYPE;
BEGIN
 actor:=qmenux_operator.rejection_actor(qmenux_onboarding.rejection_operation($1,$2,$3,$4));
 IF actor IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='28000'; END IF;
 SELECT a.* INTO target FROM qmenux_onboarding.applications a WHERE a.id=$1 FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF target.status='REJECTED' AND target.reviewed_by=actor AND target.review_request_id=$2 AND target.revision=$3+1 AND target.rejection_reason=$4 THEN
  RETURN QUERY SELECT a.id,a.requested_name,a.status,a.revision,a.created_at,a.submitted_at FROM qmenux_onboarding.applications a WHERE a.id=target.id;RETURN;
 END IF;
 IF target.status<>'PENDING_APPROVAL' OR target.revision<>$3 THEN RAISE EXCEPTION 'Conflicting review' USING ERRCODE='23505'; END IF;
 UPDATE qmenux_onboarding.applications a SET status='REJECTED',reviewed_by=actor,review_request_id=$2,rejection_reason=$4 WHERE a.id=target.id;
 RETURN QUERY SELECT a.id,a.requested_name,a.status,a.revision,a.created_at,a.submitted_at FROM qmenux_onboarding.applications a WHERE a.id=target.id;
END $f$;
REVOKE ALL ON FUNCTION qmenux_onboarding.list_pending(text,text,text,text,text,text,text,uuid,integer),
 qmenux_onboarding.replay_rejection(text,text,text,text,text,text,text,uuid,uuid,integer,text),qmenux_onboarding.reject_application(uuid,uuid,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qmenux_onboarding.list_pending(text,text,text,text,text,text,text,uuid,integer),
 qmenux_onboarding.replay_rejection(text,text,text,text,text,text,text,uuid,uuid,integer,text),qmenux_onboarding.reject_application(uuid,uuid,integer,text) TO qmenux_runtime;
INSERT INTO qmenux.schema_migrations(version) VALUES('0020_application_rejection');
