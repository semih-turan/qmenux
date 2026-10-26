-- Bound passkey step-up only; no business write or public route is enabled.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations',0));
DO $guard$ BEGIN
IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations) IS DISTINCT FROM ARRAY['0001_tenant_catalog','0002_tenant_resolution','0003_identity_sessions','0004_tenant_memberships','0005_operator_sessions','0006_auth_expiry','0007_microsoft_identity','0008_apple_identity','0009_admin_audience','0010_draft_product_events','0011_admin_tenant_membership','0012_draft_menu_structure','0013_onboarding_applications','0014_operator_passkeys','0015_operator_logout','0016_operator_browser_sessions','0017_operator_challenge_restart','0018_operator_session_audit'] THEN RAISE EXCEPTION 'Unexpected migration versions'; END IF;
END $guard$;


CREATE TABLE qmenux_operator.step_up_challenges (
  challenge_hash text PRIMARY KEY CHECK(challenge_hash ~ '^[0-9a-f]{64}$'),
  operator_id uuid NOT NULL REFERENCES qmenux_operator.operators(id),
  session_hash text NOT NULL UNIQUE REFERENCES qmenux_operator.sessions(token_hash) ON DELETE CASCADE,
  mfa_hash text NOT NULL REFERENCES qmenux_operator.passkey_proofs(token_hash) ON DELETE CASCADE,
  browser_hash text NOT NULL CHECK(browser_hash ~ '^[0-9a-f]{64}$'),
  operation_hash text NOT NULL CHECK(operation_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '2 minutes'
);
CREATE TABLE qmenux_operator.step_up_proofs (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^[0-9a-f]{64}$'),
  operator_id uuid NOT NULL REFERENCES qmenux_operator.operators(id),
  session_hash text NOT NULL UNIQUE REFERENCES qmenux_operator.sessions(token_hash) ON DELETE CASCADE,
  mfa_hash text NOT NULL REFERENCES qmenux_operator.passkey_proofs(token_hash) ON DELETE CASCADE,
  browser_hash text NOT NULL CHECK(browser_hash ~ '^[0-9a-f]{64}$'),
  operation_hash text NOT NULL CHECK(operation_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '2 minutes'
);
CREATE TABLE qmenux_operator.step_up_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  operator_id uuid NOT NULL REFERENCES qmenux_operator.operators(id),
  action text NOT NULL CHECK(action IN ('tenant:approve','tenant:reject','license:grant','license:extend','license:suspend','license:revoke','operator:manage')),
  target_id uuid NOT NULL,
  request_id uuid NOT NULL,
  operation_hash text NOT NULL CHECK(operation_hash ~ '^[0-9a-f]{64}$'),
  kind text NOT NULL CHECK(kind IN ('VERIFIED','CONSUMED')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX step_up_events_actor ON qmenux_operator.step_up_events(operator_id,occurred_at);
CREATE TRIGGER immutable_step_up_events BEFORE UPDATE OR DELETE OR TRUNCATE ON qmenux_operator.step_up_events
FOR EACH STATEMENT EXECUTE FUNCTION qmenux_operator.session_event_immutable();
ALTER TABLE qmenux_operator.step_up_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux_operator.step_up_challenges FORCE ROW LEVEL SECURITY;
ALTER TABLE qmenux_operator.step_up_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux_operator.step_up_proofs FORCE ROW LEVEL SECURITY;
ALTER TABLE qmenux_operator.step_up_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux_operator.step_up_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON qmenux_operator.step_up_challenges,qmenux_operator.step_up_proofs,qmenux_operator.step_up_events FROM PUBLIC,qmenux_runtime;

CREATE FUNCTION qmenux_operator.step_up_actor(issuer text,subject text,audience text,session_hash text,csrf_hash text,mfa_hash text,browser_hash text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
SELECT s.id FROM qmenux_operator.read_browser_session($1,$2,$3,$4,$5) s
WHERE qmenux_operator.passkey_proof($1,$2,$3,$6,$7)
$f$;
CREATE FUNCTION qmenux_operator.step_up_begin(issuer text,subject text,audience text,session_hash text,csrf_hash text,mfa_hash text,browser_hash text,operation_hash text,challenge_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE oid uuid;
BEGIN
  SELECT o.id INTO oid FROM qmenux_operator.operators o WHERE o.issuer=$1 AND o.subject=$2 FOR UPDATE;
  IF oid IS NULL OR qmenux_operator.step_up_actor($1,$2,$3,$4,$5,$6,$7) IS DISTINCT FROM oid THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='28000'; END IF;
  DELETE FROM qmenux_operator.step_up_challenges c WHERE c.operator_id=oid AND (c.expires_at<=clock_timestamp() OR c.session_hash=$4);
  IF (SELECT count(*) FROM qmenux_operator.step_up_challenges c WHERE c.operator_id=oid)>=5 THEN RAISE EXCEPTION 'Challenge limit' USING ERRCODE='28000'; END IF;
  DELETE FROM qmenux_operator.step_up_proofs p WHERE p.operator_id=oid AND (p.expires_at<=clock_timestamp() OR p.session_hash=$4);
  INSERT INTO qmenux_operator.step_up_challenges VALUES($9,oid,$4,$6,$7,$8);
END $f$;
CREATE FUNCTION qmenux_operator.step_up_consume_challenge(issuer text,subject text,audience text,session_hash text,csrf_hash text,mfa_hash text,browser_hash text,operation_hash text,challenge_hash text)
RETURNS TABLE(operator_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DELETE FROM qmenux_operator.step_up_challenges c
WHERE c.operator_id=qmenux_operator.step_up_actor($1,$2,$3,$4,$5,$6,$7) AND c.session_hash=$4 AND c.mfa_hash=$6
AND c.browser_hash=$7 AND c.operation_hash=$8 AND c.challenge_hash=$9 AND c.expires_at>clock_timestamp()
RETURNING c.operator_id
$f$;
CREATE FUNCTION qmenux_operator.step_up_verify(issuer text,subject text,audience text,session_hash text,csrf_hash text,mfa_hash text,browser_hash text,operation_hash text,
 credential_id text,previous_counter bigint,new_counter bigint,token_hash text,action text,target_id uuid,request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE oid uuid;
BEGIN
  SELECT o.id INTO oid FROM qmenux_operator.operators o WHERE o.issuer=$1 AND o.subject=$2 FOR UPDATE;
  IF oid IS NULL OR qmenux_operator.step_up_actor($1,$2,$3,$4,$5,$6,$7) IS DISTINCT FROM oid THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='28000'; END IF;
  UPDATE qmenux_operator.passkeys k SET counter=$11 WHERE k.id=$9 AND k.operator_id=oid AND k.audience=$3 AND k.status='ACTIVE'
    AND k.counter=$10 AND (($10=0 AND $11=0) OR $11>$10);
  IF NOT FOUND THEN RAISE EXCEPTION 'Credential changed' USING ERRCODE='28000'; END IF;
  DELETE FROM qmenux_operator.step_up_proofs p WHERE p.session_hash=$4;
  INSERT INTO qmenux_operator.step_up_proofs VALUES($12,oid,$4,$6,$7,$8);
  INSERT INTO qmenux_operator.step_up_events(session_id,operator_id,action,target_id,request_id,operation_hash,kind)
    SELECT s.audit_id,oid,$13,$14,$15,$8,'VERIFIED' FROM qmenux_operator.sessions s WHERE s.token_hash=$4;
END $f$;
CREATE FUNCTION qmenux_operator.step_up_use(issuer text,subject text,audience text,session_hash text,csrf_hash text,mfa_hash text,browser_hash text,operation_hash text,
 token_hash text,action text,target_id uuid,request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE oid uuid;
BEGIN
  SELECT o.id INTO oid FROM qmenux_operator.operators o WHERE o.issuer=$1 AND o.subject=$2 FOR UPDATE;
  IF oid IS NULL OR qmenux_operator.step_up_actor($1,$2,$3,$4,$5,$6,$7) IS DISTINCT FROM oid THEN RETURN NULL; END IF;
  DELETE FROM qmenux_operator.step_up_proofs p WHERE p.token_hash=$9 AND p.operator_id=oid AND p.session_hash=$4
    AND p.mfa_hash=$6 AND p.browser_hash=$7 AND p.operation_hash=$8 AND p.expires_at>clock_timestamp();
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO qmenux_operator.step_up_events(session_id,operator_id,action,target_id,request_id,operation_hash,kind)
    SELECT s.audit_id,oid,$10,$11,$12,$8,'CONSUMED' FROM qmenux_operator.sessions s WHERE s.token_hash=$4;
  RETURN oid;
END $f$;
REVOKE ALL ON FUNCTION qmenux_operator.step_up_actor(text,text,text,text,text,text,text),
 qmenux_operator.step_up_begin(text,text,text,text,text,text,text,text,text),qmenux_operator.step_up_consume_challenge(text,text,text,text,text,text,text,text,text),
 qmenux_operator.step_up_verify(text,text,text,text,text,text,text,text,text,bigint,bigint,text,text,uuid,uuid),
 qmenux_operator.step_up_use(text,text,text,text,text,text,text,text,text,text,uuid,uuid) FROM PUBLIC,qmenux_runtime;
GRANT EXECUTE ON FUNCTION qmenux_operator.step_up_begin(text,text,text,text,text,text,text,text,text),
 qmenux_operator.step_up_consume_challenge(text,text,text,text,text,text,text,text,text),
 qmenux_operator.step_up_verify(text,text,text,text,text,text,text,text,text,bigint,bigint,text,text,uuid,uuid),
 qmenux_operator.step_up_use(text,text,text,text,text,text,text,text,text,text,uuid,uuid) TO qmenux_runtime;
INSERT INTO qmenux.schema_migrations(version) VALUES('0019_operator_step_up');
