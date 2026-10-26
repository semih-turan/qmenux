SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations',0));
DO $guard$ BEGIN
IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations) IS DISTINCT FROM ARRAY['0001_tenant_catalog','0002_tenant_resolution','0003_identity_sessions','0004_tenant_memberships','0005_operator_sessions','0006_auth_expiry','0007_microsoft_identity','0008_apple_identity','0009_admin_audience','0010_draft_product_events','0011_admin_tenant_membership','0012_draft_menu_structure','0013_onboarding_applications','0014_operator_passkeys','0015_operator_logout','0016_operator_browser_sessions','0017_operator_challenge_restart','0018_operator_session_audit','0019_operator_step_up'] THEN RAISE EXCEPTION 'Unexpected migration versions'; END IF;
END $guard$;


LOCK TABLE qmenux_operator.step_up_challenges,qmenux_operator.step_up_proofs,qmenux_operator.step_up_events IN ACCESS EXCLUSIVE MODE;
SET LOCAL row_security=off;
DO $data$ BEGIN
IF EXISTS(SELECT FROM qmenux_operator.step_up_challenges) OR EXISTS(SELECT FROM qmenux_operator.step_up_proofs) OR EXISTS(SELECT FROM qmenux_operator.step_up_events) THEN
 RAISE EXCEPTION 'Refusing populated step-up rollback'; END IF;
END $data$;
DROP FUNCTION qmenux_operator.step_up_begin(text,text,text,text,text,text,text,text,text),qmenux_operator.step_up_consume_challenge(text,text,text,text,text,text,text,text,text),
 qmenux_operator.step_up_verify(text,text,text,text,text,text,text,text,text,bigint,bigint,text,text,uuid,uuid),
 qmenux_operator.step_up_use(text,text,text,text,text,text,text,text,text,text,uuid,uuid),qmenux_operator.step_up_actor(text,text,text,text,text,text,text);
DROP TABLE qmenux_operator.step_up_events,qmenux_operator.step_up_proofs,qmenux_operator.step_up_challenges;
DELETE FROM qmenux.schema_migrations WHERE version='0019_operator_step_up';
