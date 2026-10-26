SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations',0));
DO $guard$ BEGIN
IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations) IS DISTINCT FROM ARRAY['0001_tenant_catalog','0002_tenant_resolution','0003_identity_sessions','0004_tenant_memberships','0005_operator_sessions','0006_auth_expiry','0007_microsoft_identity','0008_apple_identity','0009_admin_audience','0010_draft_product_events','0011_admin_tenant_membership','0012_draft_menu_structure','0013_onboarding_applications','0014_operator_passkeys','0015_operator_logout','0016_operator_browser_sessions','0017_operator_challenge_restart','0018_operator_session_audit','0019_operator_step_up','0020_application_rejection','0021_decision_recovery'] THEN RAISE EXCEPTION 'Unexpected migration versions'; END IF;
END $guard$;




DROP FUNCTION qmenux_onboarding.list_rejections(text,text,text,text,text,text,text,uuid,integer);
DROP INDEX qmenux_onboarding.application_decisions_operator;
DELETE FROM qmenux.schema_migrations WHERE version='0021_decision_recovery';
