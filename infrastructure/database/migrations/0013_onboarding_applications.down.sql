-- Remove callers first; never delete applications or events to force rollback.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations', 0));
DO $guard$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations)
    IS DISTINCT FROM ARRAY['0001_tenant_catalog', '0002_tenant_resolution', '0003_identity_sessions', '0004_tenant_memberships', '0005_operator_sessions', '0006_auth_expiry', '0007_microsoft_identity', '0008_apple_identity', '0009_admin_audience', '0010_draft_product_events', '0011_admin_tenant_membership', '0012_draft_menu_structure', '0013_onboarding_applications'] THEN
    RAISE EXCEPTION 'Unexpected migration versions';
  END IF;
END
$guard$;
LOCK TABLE qmenux_onboarding.applications,qmenux_onboarding.application_events IN ACCESS EXCLUSIVE MODE;
SET LOCAL row_security=off;
DO $data_guard$
BEGIN
  IF EXISTS(SELECT FROM qmenux_onboarding.applications) OR EXISTS(SELECT FROM qmenux_onboarding.application_events) THEN
    RAISE EXCEPTION 'Application data prevents rollback';
  END IF;
END
$data_guard$;
DROP FUNCTION qmenux_onboarding.create_draft(text,text,uuid,text);
DROP FUNCTION qmenux_onboarding.edit_draft(text,text,uuid,integer,text);
DROP FUNCTION qmenux_onboarding.submit_draft(text,text,uuid,integer);
DROP FUNCTION qmenux_onboarding.list_applications(text,uuid,integer);
DROP TABLE qmenux_onboarding.application_events;
DROP TABLE qmenux_onboarding.applications;
DROP FUNCTION qmenux_onboarding.record_application_change();
DROP FUNCTION qmenux_onboarding.reject_event_change();
DROP SCHEMA qmenux_onboarding;
DROP FUNCTION qmenux_identity.bound_admin_session(text,text);
DELETE FROM qmenux.schema_migrations WHERE version='0013_onboarding_applications';
