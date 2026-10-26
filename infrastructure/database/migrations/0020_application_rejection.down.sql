SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations',0));
DO $guard$ BEGIN
IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations) IS DISTINCT FROM ARRAY['0001_tenant_catalog','0002_tenant_resolution','0003_identity_sessions','0004_tenant_memberships','0005_operator_sessions','0006_auth_expiry','0007_microsoft_identity','0008_apple_identity','0009_admin_audience','0010_draft_product_events','0011_admin_tenant_membership','0012_draft_menu_structure','0013_onboarding_applications','0014_operator_passkeys','0015_operator_logout','0016_operator_browser_sessions','0017_operator_challenge_restart','0018_operator_session_audit','0019_operator_step_up','0020_application_rejection'] THEN RAISE EXCEPTION 'Unexpected migration versions'; END IF;
END $guard$;



LOCK TABLE qmenux_onboarding.applications,qmenux_onboarding.application_events,qmenux_operator.step_up_events IN ACCESS EXCLUSIVE MODE;
SET LOCAL row_security=off;
DO $data$ BEGIN
 IF EXISTS(SELECT FROM qmenux_onboarding.applications WHERE status='REJECTED' OR reviewed_by IS NOT NULL)
 OR EXISTS(SELECT FROM qmenux_onboarding.application_events WHERE actor_kind='OPERATOR')
 OR EXISTS(SELECT FROM qmenux_operator.step_up_events WHERE transaction_id IS NOT NULL) THEN RAISE EXCEPTION 'Refusing reviewed history rollback'; END IF;
END $data$;
DROP FUNCTION qmenux_onboarding.list_pending(text,text,text,text,text,text,text,uuid,integer),qmenux_onboarding.replay_rejection(text,text,text,text,text,text,text,uuid,uuid,integer,text),qmenux_onboarding.reject_application(uuid,uuid,integer,text);
CREATE OR REPLACE FUNCTION qmenux_onboarding.record_application_change() RETURNS trigger
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

DROP FUNCTION qmenux_onboarding.rejection_operation(uuid,uuid,integer,text),qmenux_operator.review_session(text,text,text,text,text,text,text),qmenux_operator.rejection_actor(text);
DROP INDEX qmenux_operator.consumed_operation_transaction;
ALTER TABLE qmenux_operator.step_up_events DROP COLUMN transaction_id;
ALTER TABLE qmenux_onboarding.application_events DROP COLUMN actor_kind;
DROP INDEX qmenux_onboarding.application_review_request;
ALTER TABLE qmenux_onboarding.applications DROP CONSTRAINT applications_check,DROP CONSTRAINT applications_status_check;
ALTER TABLE qmenux_onboarding.applications DROP COLUMN reviewed_at,DROP COLUMN reviewed_by,DROP COLUMN review_request_id,DROP COLUMN rejection_reason;
ALTER TABLE qmenux_onboarding.applications ADD CONSTRAINT applications_status_check CHECK(status IN ('DRAFT','PENDING_APPROVAL')),
 ADD CONSTRAINT applications_check CHECK((status='DRAFT' AND submitted_at IS NULL) OR (status='PENDING_APPROVAL' AND submitted_at IS NOT NULL));
DELETE FROM qmenux.schema_migrations WHERE version='0020_application_rejection';
