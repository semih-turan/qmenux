SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations',0));
DO $guard$ BEGIN
IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations) IS DISTINCT FROM ARRAY['0001_tenant_catalog','0002_tenant_resolution','0003_identity_sessions','0004_tenant_memberships','0005_operator_sessions','0006_auth_expiry','0007_microsoft_identity','0008_apple_identity','0009_admin_audience','0010_draft_product_events','0011_admin_tenant_membership','0012_draft_menu_structure','0013_onboarding_applications','0014_operator_passkeys'] THEN RAISE EXCEPTION 'Unexpected migration versions'; END IF;
END $guard$;

CREATE FUNCTION qmenux_operator.revoke_passkey_proof(issuer text,subject text,audience text,proof_hash text,browser_hash text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DELETE FROM qmenux_operator.passkey_proofs p USING qmenux_operator.operators o
WHERE p.operator_id=o.id AND o.issuer=$1 AND o.subject=$2 AND p.audience=$3 AND p.token_hash=$4 AND p.browser_hash=$5
$f$;
REVOKE ALL ON FUNCTION qmenux_operator.revoke_passkey_proof(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qmenux_operator.revoke_passkey_proof(text,text,text,text,text) TO qmenux_runtime;
INSERT INTO qmenux.schema_migrations(version) VALUES('0015_operator_logout');
