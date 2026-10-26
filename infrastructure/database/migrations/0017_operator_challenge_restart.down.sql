-- Restore previous future-start behavior; retired challenges are never resurrected.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations',0));
DO $guard$ BEGIN
IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations) IS DISTINCT FROM ARRAY['0001_tenant_catalog','0002_tenant_resolution','0003_identity_sessions','0004_tenant_memberships','0005_operator_sessions','0006_auth_expiry','0007_microsoft_identity','0008_apple_identity','0009_admin_audience','0010_draft_product_events','0011_admin_tenant_membership','0012_draft_menu_structure','0013_onboarding_applications','0014_operator_passkeys','0015_operator_logout','0016_operator_browser_sessions','0017_operator_challenge_restart'] THEN RAISE EXCEPTION 'Unexpected migration versions'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION qmenux_operator.passkey_begin(issuer text,subject text,audience text,browser_hash text,challenge_hash text,grant_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE oid uuid;
BEGIN
  SELECT o.id INTO oid FROM qmenux_operator.operators o WHERE o.issuer=$1 AND o.subject=$2 AND o.status='ACTIVE' AND o.role='PLATFORM_ADMIN' FOR UPDATE;
  IF oid IS NULL OR ($6 IS NOT NULL AND qmenux_operator.passkey_registration($1,$2,$3,$6) IS DISTINCT FROM oid)
    OR ($6 IS NULL AND NOT EXISTS(SELECT FROM qmenux_operator.passkey_credentials($1,$2,$3))) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE='28000';
  END IF;
  DELETE FROM qmenux_operator.passkey_challenges c WHERE c.operator_id=oid AND c.audience=$3 AND c.expires_at<=clock_timestamp();
  IF (SELECT count(*) FROM qmenux_operator.passkey_challenges c WHERE c.operator_id=oid AND c.audience=$3)>=5 THEN
    RAISE EXCEPTION 'Challenge limit' USING ERRCODE='28000';
  END IF;
  INSERT INTO qmenux_operator.passkey_challenges VALUES($5,oid,$3,$4,$6);
END $f$;
DELETE FROM qmenux.schema_migrations WHERE version='0017_operator_challenge_restart';
