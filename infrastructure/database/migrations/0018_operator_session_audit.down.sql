SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations',0));
DO $guard$ BEGIN
IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations) IS DISTINCT FROM ARRAY['0001_tenant_catalog','0002_tenant_resolution','0003_identity_sessions','0004_tenant_memberships','0005_operator_sessions','0006_auth_expiry','0007_microsoft_identity','0008_apple_identity','0009_admin_audience','0010_draft_product_events','0011_admin_tenant_membership','0012_draft_menu_structure','0013_onboarding_applications','0014_operator_passkeys','0015_operator_logout','0016_operator_browser_sessions','0017_operator_challenge_restart','0018_operator_session_audit'] THEN RAISE EXCEPTION 'Unexpected migration versions'; END IF;
END $guard$;

LOCK TABLE qmenux_operator.sessions,qmenux_operator.session_events IN ACCESS EXCLUSIVE MODE;
SET LOCAL row_security=off;
DO $data$ BEGIN
  IF EXISTS(SELECT FROM qmenux_operator.session_events) OR EXISTS(SELECT FROM qmenux_operator.sessions) THEN
    RAISE EXCEPTION 'Refusing populated session audit rollback';
  END IF;
END $data$;
DROP TRIGGER session_lifecycle ON qmenux_operator.sessions;
DROP TRIGGER immutable_session_identity ON qmenux_operator.sessions;
DROP TRIGGER session_no_truncate ON qmenux_operator.sessions;
DROP TABLE qmenux_operator.session_events;
DROP FUNCTION qmenux_operator.record_session_event(),qmenux_operator.session_identity_immutable(),qmenux_operator.session_event_immutable();
ALTER TABLE qmenux_operator.sessions DROP COLUMN audit_id;
DELETE FROM qmenux.schema_migrations WHERE version='0018_operator_session_audit';
