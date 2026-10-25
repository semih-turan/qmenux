SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations',0));
DO $guard$ BEGIN
IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations) IS DISTINCT FROM ARRAY['0001_tenant_catalog','0002_tenant_resolution','0003_identity_sessions','0004_tenant_memberships','0005_operator_sessions','0006_auth_expiry','0007_microsoft_identity','0008_apple_identity','0009_admin_audience','0010_draft_product_events','0011_admin_tenant_membership','0012_draft_menu_structure','0013_onboarding_applications','0014_operator_passkeys','0015_operator_logout','0016_operator_browser_sessions'] THEN RAISE EXCEPTION 'Unexpected migration versions'; END IF;
END $guard$;

LOCK TABLE qmenux_operator.sessions IN ACCESS EXCLUSIVE MODE;
SET LOCAL row_security=off;
DO $data$ BEGIN IF EXISTS(SELECT FROM qmenux_operator.sessions WHERE csrf_hash IS NOT NULL) THEN RAISE EXCEPTION 'Browser sessions prevent rollback'; END IF; END $data$;
DROP FUNCTION qmenux_operator.create_browser_session(text,text,text,text,text,text),qmenux_operator.read_browser_session(text,text,text,text,text),qmenux_operator.revoke_browser_session(text,text,text,text,text);
CREATE OR REPLACE FUNCTION qmenux_operator.read_session(issuer text, subject text, audience text, token_hash text)
RETURNS TABLE(id uuid, role text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  SELECT o.id, o.role FROM qmenux_operator.sessions s JOIN qmenux_operator.operators o ON o.id = s.operator_id
  WHERE o.issuer = $1 AND o.subject = $2 AND s.audience = $3 AND s.token_hash = $4 AND s.expires_at > now()
    AND o.status = 'ACTIVE' AND o.role = 'PLATFORM_ADMIN'
$f$;
CREATE OR REPLACE FUNCTION qmenux_operator.revoke_session(issuer text, subject text, audience text, token_hash text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DELETE FROM qmenux_operator.sessions s USING qmenux_operator.operators o
  WHERE o.id = s.operator_id AND o.issuer = $1 AND o.subject = $2 AND s.audience = $3 AND s.token_hash = $4
$f$;
ALTER TABLE qmenux_operator.sessions DROP COLUMN csrf_hash;
DELETE FROM qmenux.schema_migrations WHERE version='0016_operator_browser_sessions';
