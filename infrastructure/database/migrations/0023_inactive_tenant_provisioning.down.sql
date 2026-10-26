SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations',0));
DO $guard$ BEGIN
IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations) IS DISTINCT FROM ARRAY['0001_tenant_catalog','0002_tenant_resolution','0003_identity_sessions','0004_tenant_memberships','0005_operator_sessions','0006_auth_expiry','0007_microsoft_identity','0008_apple_identity','0009_admin_audience','0010_draft_product_events','0011_admin_tenant_membership','0012_draft_menu_structure','0013_onboarding_applications','0014_operator_passkeys','0015_operator_logout','0016_operator_browser_sessions','0017_operator_challenge_restart','0018_operator_session_audit','0019_operator_step_up','0020_application_rejection','0021_decision_recovery','0022_application_approval','0023_inactive_tenant_provisioning'] THEN RAISE EXCEPTION 'Unexpected migration versions'; END IF;
END $guard$;

LOCK TABLE qmenux_onboarding.provisionings,qmenux_operator.step_up_events IN ACCESS EXCLUSIVE MODE;
SET LOCAL row_security=off;
DO $data$ BEGIN
 IF EXISTS(SELECT FROM qmenux_onboarding.provisionings) OR EXISTS(SELECT FROM qmenux_operator.step_up_events WHERE action='tenant:provision')
 THEN RAISE EXCEPTION 'Refusing provisioning history rollback'; END IF;
END $data$;
DROP FUNCTION qmenux_onboarding.replay_provisioning(text,text,text,text,text,text,text,uuid,uuid,integer,text,text,text,text),
 qmenux_onboarding.provision_application(uuid,uuid,integer,text,text,text,text),qmenux_identity.provision_pending_owner(uuid),
 qmenux.provisioned_inactive(uuid),qmenux.provision_inactive(uuid),qmenux_onboarding.provisioning_permit(uuid);
DROP TABLE qmenux_onboarding.provisionings;
DROP FUNCTION qmenux_onboarding.provisioning_operation(uuid,uuid,integer,text,text,text,text),qmenux_operator.provisioning_actor(text);
ALTER TABLE qmenux_operator.step_up_events DROP CONSTRAINT step_up_events_action_check;
ALTER TABLE qmenux_operator.step_up_events ADD CONSTRAINT step_up_events_action_check
 CHECK(action IN ('tenant:approve','tenant:reject','license:grant','license:extend','license:suspend','license:revoke','operator:manage'));
DELETE FROM qmenux.schema_migrations WHERE version='0023_inactive_tenant_provisioning';
