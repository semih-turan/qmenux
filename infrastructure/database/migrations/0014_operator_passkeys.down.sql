-- Additive local passkey prerequisite. No operator, enrollment grant or credential is seeded.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations',0));
DO $guard$ BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations) IS DISTINCT FROM ARRAY['0001_tenant_catalog','0002_tenant_resolution','0003_identity_sessions','0004_tenant_memberships','0005_operator_sessions','0006_auth_expiry','0007_microsoft_identity','0008_apple_identity','0009_admin_audience','0010_draft_product_events','0011_admin_tenant_membership','0012_draft_menu_structure','0013_onboarding_applications','0014_operator_passkeys'] THEN
    RAISE EXCEPTION 'Unexpected migration versions';
  END IF;
END $guard$;
LOCK TABLE qmenux_operator.passkey_grants,qmenux_operator.passkeys,qmenux_operator.passkey_challenges,qmenux_operator.passkey_proofs,qmenux_operator.passkey_events IN ACCESS EXCLUSIVE MODE;
SET LOCAL row_security=off;
DO $data$ BEGIN
  IF EXISTS(SELECT FROM qmenux_operator.passkey_grants) OR EXISTS(SELECT FROM qmenux_operator.passkeys)
    OR EXISTS(SELECT FROM qmenux_operator.passkey_challenges) OR EXISTS(SELECT FROM qmenux_operator.passkey_proofs)
    OR EXISTS(SELECT FROM qmenux_operator.passkey_events) THEN RAISE EXCEPTION 'Refusing populated passkey rollback'; END IF;
END $data$;
DROP TRIGGER operator_passkey_invalidation ON qmenux_operator.operators;
DROP FUNCTION qmenux_operator.passkey_registration(text,text,text,text),qmenux_operator.passkey_credentials(text,text,text),
  qmenux_operator.passkey_begin(text,text,text,text,text,text),qmenux_operator.passkey_consume(text,text,text,text,text,boolean),
  qmenux_operator.passkey_register(text,text,text,text,text,bytea,bigint),qmenux_operator.passkey_authenticate(text,text,text,text,bigint,bigint,text,text),
  qmenux_operator.passkey_proof(text,text,text,text,text),qmenux_operator.passkey_invalidate();
DROP TABLE qmenux_operator.passkey_events,qmenux_operator.passkey_proofs,qmenux_operator.passkey_challenges,qmenux_operator.passkeys,qmenux_operator.passkey_grants;
DROP FUNCTION qmenux_operator.passkey_event_immutable(),qmenux_operator.passkey_change();
DELETE FROM qmenux.schema_migrations WHERE version='0014_operator_passkeys';
