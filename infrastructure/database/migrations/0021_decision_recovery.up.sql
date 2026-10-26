-- Read-only own decision recovery; retain all existing decision/audit records.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations',0));
DO $guard$ BEGIN
IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations) IS DISTINCT FROM ARRAY['0001_tenant_catalog','0002_tenant_resolution','0003_identity_sessions','0004_tenant_memberships','0005_operator_sessions','0006_auth_expiry','0007_microsoft_identity','0008_apple_identity','0009_admin_audience','0010_draft_product_events','0011_admin_tenant_membership','0012_draft_menu_structure','0013_onboarding_applications','0014_operator_passkeys','0015_operator_logout','0016_operator_browser_sessions','0017_operator_challenge_restart','0018_operator_session_audit','0019_operator_step_up','0020_application_rejection'] THEN RAISE EXCEPTION 'Unexpected migration versions'; END IF;
END $guard$;




CREATE INDEX application_decisions_operator ON qmenux_onboarding.applications(reviewed_by,reviewed_at DESC,id DESC) WHERE status='REJECTED';
CREATE FUNCTION qmenux_onboarding.list_rejections(issuer text,subject text,audience text,session_hash text,csrf_hash text,mfa_hash text,browser_hash text,after_id uuid,page_limit integer)
RETURNS TABLE(id uuid,"requestedName" text,status text,revision integer,"createdAt" timestamptz,"submittedAt" timestamptz,"reviewedAt" timestamptz,reason text,"requestId" uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE actor uuid; anchor qmenux_onboarding.applications%ROWTYPE;
BEGIN
 actor:=qmenux_operator.review_session($1,$2,$3,$4,$5,$6,$7);
 IF actor IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='28000'; END IF;
 IF $9 IS NULL OR $9<1 OR $9>101 THEN RAISE EXCEPTION 'Invalid limit' USING ERRCODE='22023'; END IF;
 IF $8 IS NOT NULL THEN
  SELECT a.* INTO anchor FROM qmenux_onboarding.applications a WHERE a.id=$8 AND a.reviewed_by=actor AND a.status='REJECTED';
  IF NOT FOUND THEN RETURN; END IF;
 END IF;
 RETURN QUERY SELECT a.id,a.requested_name,a.status,a.revision,a.created_at,a.submitted_at,a.reviewed_at,a.rejection_reason,a.review_request_id
 FROM qmenux_onboarding.applications a WHERE a.reviewed_by=actor AND a.status='REJECTED'
 AND ($8 IS NULL OR (a.reviewed_at,a.id)<(anchor.reviewed_at,anchor.id)) ORDER BY a.reviewed_at DESC,a.id DESC LIMIT $9;
END $f$;
REVOKE ALL ON FUNCTION qmenux_onboarding.list_rejections(text,text,text,text,text,text,text,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qmenux_onboarding.list_rejections(text,text,text,text,text,text,text,uuid,integer) TO qmenux_runtime;
INSERT INTO qmenux.schema_migrations(version) VALUES('0021_decision_recovery');
