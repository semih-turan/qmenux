SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations',0));
DO $guard$ BEGIN
IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations) IS DISTINCT FROM ARRAY['0001_tenant_catalog','0002_tenant_resolution','0003_identity_sessions','0004_tenant_memberships','0005_operator_sessions','0006_auth_expiry','0007_microsoft_identity','0008_apple_identity','0009_admin_audience','0010_draft_product_events','0011_admin_tenant_membership','0012_draft_menu_structure','0013_onboarding_applications','0014_operator_passkeys','0015_operator_logout','0016_operator_browser_sessions','0017_operator_challenge_restart','0018_operator_session_audit','0019_operator_step_up','0020_application_rejection','0021_decision_recovery','0022_application_approval'] THEN RAISE EXCEPTION 'Unexpected migration versions'; END IF;
END $guard$;





LOCK TABLE qmenux_onboarding.applications,qmenux_onboarding.application_events IN ACCESS EXCLUSIVE MODE;
SET LOCAL row_security=off;
DO $data$ BEGIN
 IF EXISTS(SELECT FROM qmenux_onboarding.applications WHERE status='APPROVED' OR approval_reason IS NOT NULL)
 OR EXISTS(SELECT FROM qmenux_onboarding.application_events WHERE current->>'status'='APPROVED' OR previous->>'status'='APPROVED') THEN RAISE EXCEPTION 'Refusing approved history rollback'; END IF;
END $data$;
DROP FUNCTION qmenux_onboarding.replay_approval(text,text,text,text,text,text,text,uuid,uuid,integer,text),qmenux_onboarding.approve_application(uuid,uuid,integer,text),qmenux_onboarding.list_decisions(text,text,text,text,text,text,text,uuid,integer);
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
DROP FUNCTION qmenux_onboarding.approval_operation(uuid,uuid,integer,text),qmenux_operator.approval_actor(text);
DROP INDEX qmenux_onboarding.application_all_decisions_operator;
ALTER TABLE qmenux_onboarding.applications DROP CONSTRAINT applications_status_check,DROP CONSTRAINT applications_check;
ALTER TABLE qmenux_onboarding.applications DROP COLUMN approval_reason;
ALTER TABLE qmenux_onboarding.applications ADD CONSTRAINT applications_status_check CHECK(status IN ('DRAFT','PENDING_APPROVAL','REJECTED')),
 ADD CONSTRAINT applications_check CHECK(
 (status='DRAFT' AND submitted_at IS NULL AND reviewed_at IS NULL AND reviewed_by IS NULL AND review_request_id IS NULL AND rejection_reason IS NULL)
 OR (status='PENDING_APPROVAL' AND submitted_at IS NOT NULL AND reviewed_at IS NULL AND reviewed_by IS NULL AND review_request_id IS NULL AND rejection_reason IS NULL)
 OR (status='REJECTED' AND submitted_at IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND review_request_id IS NOT NULL AND rejection_reason IS NOT NULL));
DELETE FROM qmenux.schema_migrations WHERE version='0022_application_approval';
