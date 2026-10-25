SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations',0));
DO $guard$ BEGIN
IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations) IS DISTINCT FROM ARRAY['0001_tenant_catalog','0002_tenant_resolution','0003_identity_sessions','0004_tenant_memberships','0005_operator_sessions','0006_auth_expiry','0007_microsoft_identity','0008_apple_identity','0009_admin_audience','0010_draft_product_events','0011_admin_tenant_membership','0012_draft_menu_structure','0013_onboarding_applications','0014_operator_passkeys','0015_operator_logout'] THEN RAISE EXCEPTION 'Unexpected migration versions'; END IF;
END $guard$;

ALTER TABLE qmenux_operator.sessions ADD COLUMN csrf_hash text CHECK(csrf_hash ~ '^[0-9a-f]{64}$');
CREATE OR REPLACE FUNCTION qmenux_operator.read_session(issuer text, subject text, audience text, token_hash text)
RETURNS TABLE(id uuid, role text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  SELECT o.id, o.role FROM qmenux_operator.sessions s JOIN qmenux_operator.operators o ON o.id = s.operator_id
  WHERE o.issuer = $1 AND o.subject = $2 AND s.audience = $3 AND s.token_hash = $4 AND s.expires_at > now()
    AND s.csrf_hash IS NULL AND o.status = 'ACTIVE' AND o.role = 'PLATFORM_ADMIN'
$f$;
CREATE OR REPLACE FUNCTION qmenux_operator.revoke_session(issuer text, subject text, audience text, token_hash text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DELETE FROM qmenux_operator.sessions s USING qmenux_operator.operators o
  WHERE o.id = s.operator_id AND o.issuer = $1 AND o.subject = $2 AND s.audience = $3 AND s.token_hash = $4 AND s.csrf_hash IS NULL
$f$;

CREATE FUNCTION qmenux_operator.create_browser_session(issuer text,subject text,audience text,token_hash text,previous_hash text,csrf_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE oid uuid;
BEGIN
IF $6 IS NULL OR $6 !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid proof' USING ERRCODE='28000'; END IF;
oid:=qmenux_operator.create_session($1,$2,$3,$4,$5);
IF oid IS NOT NULL THEN UPDATE qmenux_operator.sessions s SET csrf_hash=$6 WHERE s.token_hash=$4; END IF;
RETURN oid;
END $f$;
CREATE FUNCTION qmenux_operator.read_browser_session(issuer text,subject text,audience text,token_hash text,csrf_hash text)
RETURNS TABLE(id uuid,role text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
SELECT o.id,o.role FROM qmenux_operator.sessions s JOIN qmenux_operator.operators o ON o.id=s.operator_id
WHERE o.issuer=$1 AND o.subject=$2 AND s.audience=$3 AND s.token_hash=$4 AND s.csrf_hash=$5 AND s.expires_at>now()
AND o.status='ACTIVE' AND o.role='PLATFORM_ADMIN'
$f$;
CREATE FUNCTION qmenux_operator.revoke_browser_session(issuer text,subject text,audience text,token_hash text,csrf_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
BEGIN
IF EXISTS(SELECT FROM qmenux_operator.sessions s JOIN qmenux_operator.operators o ON o.id=s.operator_id
WHERE o.issuer=$1 AND o.subject=$2 AND s.audience=$3 AND s.token_hash=$4 AND s.csrf_hash IS DISTINCT FROM $5) THEN RETURN false; END IF;
DELETE FROM qmenux_operator.sessions s USING qmenux_operator.operators o
WHERE o.id=s.operator_id AND o.issuer=$1 AND o.subject=$2 AND s.audience=$3 AND s.token_hash=$4 AND s.csrf_hash=$5;
RETURN true;
END $f$;
REVOKE ALL ON FUNCTION qmenux_operator.create_browser_session(text,text,text,text,text,text),qmenux_operator.read_browser_session(text,text,text,text,text),qmenux_operator.revoke_browser_session(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qmenux_operator.create_browser_session(text,text,text,text,text,text),qmenux_operator.read_browser_session(text,text,text,text,text),qmenux_operator.revoke_browser_session(text,text,text,text,text) TO qmenux_runtime;
INSERT INTO qmenux.schema_migrations(version) VALUES('0016_operator_browser_sessions');
