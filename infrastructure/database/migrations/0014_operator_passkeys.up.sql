-- Additive local passkey prerequisite. No operator, enrollment grant or credential is seeded.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations',0));
DO $guard$ BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations) IS DISTINCT FROM ARRAY['0001_tenant_catalog','0002_tenant_resolution','0003_identity_sessions','0004_tenant_memberships','0005_operator_sessions','0006_auth_expiry','0007_microsoft_identity','0008_apple_identity','0009_admin_audience','0010_draft_product_events','0011_admin_tenant_membership','0012_draft_menu_structure','0013_onboarding_applications'] THEN
    RAISE EXCEPTION 'Unexpected migration versions';
  END IF;
END $guard$;

CREATE TABLE qmenux_operator.passkey_grants (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^[0-9a-f]{64}$'),
  operator_id uuid NOT NULL REFERENCES qmenux_operator.operators(id),
  audience text NOT NULL CHECK(audience ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
  consumed_at timestamptz,
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '10 minutes')
);
CREATE TABLE qmenux_operator.passkeys (
  id text PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 1024 AND id ~ '^[A-Za-z0-9_-]+$'),
  operator_id uuid NOT NULL REFERENCES qmenux_operator.operators(id),
  audience text NOT NULL CHECK(audience ~ '^[a-f0-9]{64}$'),
  public_key bytea NOT NULL CHECK(octet_length(public_key) BETWEEN 32 AND 4096),
  counter bigint NOT NULL CHECK(counter BETWEEN 0 AND 4294967295),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX one_active_operator_passkey ON qmenux_operator.passkeys(operator_id,audience) WHERE status='ACTIVE';
CREATE TABLE qmenux_operator.passkey_challenges (
  challenge_hash text PRIMARY KEY CHECK(challenge_hash ~ '^[0-9a-f]{64}$'),
  operator_id uuid NOT NULL REFERENCES qmenux_operator.operators(id),
  audience text NOT NULL CHECK(audience ~ '^[a-f0-9]{64}$'),
  browser_hash text NOT NULL CHECK(browser_hash ~ '^[0-9a-f]{64}$'),
  grant_hash text REFERENCES qmenux_operator.passkey_grants(token_hash),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes'
);
CREATE INDEX passkey_challenges_operator ON qmenux_operator.passkey_challenges(operator_id,audience);
CREATE TABLE qmenux_operator.passkey_proofs (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^[0-9a-f]{64}$'),
  operator_id uuid NOT NULL REFERENCES qmenux_operator.operators(id),
  credential_id text NOT NULL REFERENCES qmenux_operator.passkeys(id),
  audience text NOT NULL CHECK(audience ~ '^[a-f0-9]{64}$'),
  browser_hash text NOT NULL CHECK(browser_hash ~ '^[0-9a-f]{64}$'),
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',
  UNIQUE(operator_id,audience)
);
CREATE TABLE qmenux_operator.passkey_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES qmenux_operator.operators(id),
  credential_id text NOT NULL REFERENCES qmenux_operator.passkeys(id),
  kind text NOT NULL CHECK(kind IN ('REGISTERED','AUTHENTICATED','REVOKED')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION qmenux_operator.passkey_event_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $f$
BEGIN RAISE EXCEPTION 'Passkey events are append-only' USING ERRCODE='42501'; END $f$;
CREATE TRIGGER immutable_passkey_events BEFORE UPDATE OR DELETE OR TRUNCATE ON qmenux_operator.passkey_events
FOR EACH STATEMENT EXECUTE FUNCTION qmenux_operator.passkey_event_immutable();

CREATE FUNCTION qmenux_operator.passkey_registration(issuer text,subject text,audience text,grant_hash text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
  SELECT o.id FROM qmenux_operator.operators o JOIN qmenux_operator.passkey_grants g ON g.operator_id=o.id
  WHERE o.issuer=$1 AND o.subject=$2 AND o.status='ACTIVE' AND o.role='PLATFORM_ADMIN'
    AND g.audience=$3 AND g.token_hash=$4 AND g.expires_at>clock_timestamp() AND g.consumed_at IS NULL
    AND NOT EXISTS(SELECT FROM qmenux_operator.passkeys k WHERE k.operator_id=o.id AND k.audience=$3 AND k.status='ACTIVE')
$f$;
CREATE FUNCTION qmenux_operator.passkey_credentials(issuer text,subject text,audience text)
RETURNS TABLE(id text,operator_id uuid,public_key bytea,counter bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
  SELECT k.id,k.operator_id,k.public_key,k.counter FROM qmenux_operator.passkeys k JOIN qmenux_operator.operators o ON o.id=k.operator_id
  WHERE o.issuer=$1 AND o.subject=$2 AND o.status='ACTIVE' AND o.role='PLATFORM_ADMIN' AND k.audience=$3 AND k.status='ACTIVE'
$f$;
CREATE FUNCTION qmenux_operator.passkey_begin(issuer text,subject text,audience text,browser_hash text,challenge_hash text,grant_hash text)
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
CREATE FUNCTION qmenux_operator.passkey_consume(issuer text,subject text,audience text,browser_hash text,challenge_hash text,registration boolean)
RETURNS TABLE(operator_id uuid,grant_hash text) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
  DELETE FROM qmenux_operator.passkey_challenges c USING qmenux_operator.operators o
  WHERE o.id=c.operator_id AND o.issuer=$1 AND o.subject=$2 AND o.status='ACTIVE' AND o.role='PLATFORM_ADMIN'
    AND c.audience=$3 AND c.browser_hash=$4 AND c.challenge_hash=$5 AND (c.grant_hash IS NOT NULL)=$6 AND c.expires_at>clock_timestamp()
  RETURNING c.operator_id,c.grant_hash
$f$;
CREATE FUNCTION qmenux_operator.passkey_register(issuer text,subject text,audience text,grant_hash text,credential_id text,public_key bytea,counter bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE oid uuid;
BEGIN
  SELECT o.id INTO oid FROM qmenux_operator.operators o WHERE o.issuer=$1 AND o.subject=$2 FOR UPDATE;
  IF oid IS NULL OR qmenux_operator.passkey_registration($1,$2,$3,$4) IS DISTINCT FROM oid THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE='28000';
  END IF;
  UPDATE qmenux_operator.passkey_grants g SET consumed_at=clock_timestamp() WHERE g.token_hash=$4;
  INSERT INTO qmenux_operator.passkeys(id,operator_id,audience,public_key,counter) VALUES($5,oid,$3,$6,$7);
  INSERT INTO qmenux_operator.passkey_events(operator_id,credential_id,kind) VALUES(oid,$5,'REGISTERED');
END $f$;
CREATE FUNCTION qmenux_operator.passkey_authenticate(issuer text,subject text,audience text,credential_id text,previous_counter bigint,new_counter bigint,proof_hash text,browser_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE oid uuid;
BEGIN
  SELECT o.id INTO oid FROM qmenux_operator.operators o WHERE o.issuer=$1 AND o.subject=$2 AND o.status='ACTIVE' AND o.role='PLATFORM_ADMIN' FOR UPDATE;
  IF oid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='28000'; END IF;
  UPDATE qmenux_operator.passkeys k SET counter=$6 WHERE k.id=$4 AND k.operator_id=oid AND k.audience=$3 AND k.status='ACTIVE'
    AND k.counter=$5 AND (($5=0 AND $6=0) OR $6>$5);
  IF NOT FOUND THEN RAISE EXCEPTION 'Credential changed' USING ERRCODE='28000'; END IF;
  DELETE FROM qmenux_operator.passkey_proofs p WHERE p.operator_id=oid AND p.audience=$3;
  INSERT INTO qmenux_operator.passkey_proofs(token_hash,operator_id,credential_id,audience,browser_hash) VALUES($7,oid,$4,$3,$8);
  INSERT INTO qmenux_operator.passkey_events(operator_id,credential_id,kind) VALUES(oid,$4,'AUTHENTICATED');
END $f$;
CREATE FUNCTION qmenux_operator.passkey_proof(issuer text,subject text,audience text,token_hash text,browser_hash text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
  SELECT EXISTS(SELECT FROM qmenux_operator.passkey_proofs p JOIN qmenux_operator.passkeys k ON k.id=p.credential_id
    JOIN qmenux_operator.operators o ON o.id=p.operator_id
    WHERE o.issuer=$1 AND o.subject=$2 AND o.status='ACTIVE' AND o.role='PLATFORM_ADMIN' AND k.status='ACTIVE'
      AND k.operator_id=o.id AND k.audience=$3 AND p.audience=$3 AND p.token_hash=$4 AND p.browser_hash=$5 AND p.expires_at>clock_timestamp())
$f$;
CREATE FUNCTION qmenux_operator.passkey_invalidate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
BEGIN
  DELETE FROM qmenux_operator.passkey_proofs WHERE operator_id=OLD.id;
  DELETE FROM qmenux_operator.passkey_challenges WHERE operator_id=OLD.id;
  UPDATE qmenux_operator.passkey_grants SET consumed_at=COALESCE(consumed_at,clock_timestamp()) WHERE operator_id=OLD.id;
  RETURN NULL;
END $f$;
CREATE TRIGGER operator_passkey_invalidation AFTER UPDATE ON qmenux_operator.operators
FOR EACH ROW EXECUTE FUNCTION qmenux_operator.passkey_invalidate();
CREATE FUNCTION qmenux_operator.passkey_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
BEGIN
  IF TG_OP='DELETE' OR TG_OP='TRUNCATE' THEN RAISE EXCEPTION 'Credential history must be retained' USING ERRCODE='42501'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.operator_id IS DISTINCT FROM OLD.operator_id OR NEW.audience IS DISTINCT FROM OLD.audience
    OR NEW.public_key IS DISTINCT FROM OLD.public_key OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.counter<OLD.counter
    OR (OLD.status='REVOKED' AND NEW.status<>'REVOKED') THEN RAISE EXCEPTION 'Credential identity is immutable' USING ERRCODE='42501'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    DELETE FROM qmenux_operator.passkey_proofs WHERE operator_id=OLD.operator_id;
    DELETE FROM qmenux_operator.passkey_challenges WHERE operator_id=OLD.operator_id;
    DELETE FROM qmenux_operator.sessions WHERE operator_id=OLD.operator_id;
    UPDATE qmenux_operator.passkey_grants SET consumed_at=COALESCE(consumed_at,clock_timestamp()) WHERE operator_id=OLD.operator_id;
    INSERT INTO qmenux_operator.passkey_events(operator_id,credential_id,kind) VALUES(OLD.operator_id,OLD.id,'REVOKED');
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER passkey_change BEFORE UPDATE OR DELETE ON qmenux_operator.passkeys FOR EACH ROW EXECUTE FUNCTION qmenux_operator.passkey_change();
CREATE TRIGGER passkey_no_truncate BEFORE TRUNCATE ON qmenux_operator.passkeys FOR EACH STATEMENT EXECUTE FUNCTION qmenux_operator.passkey_change();

ALTER TABLE qmenux_operator.passkey_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux_operator.passkey_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE qmenux_operator.passkeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux_operator.passkeys FORCE ROW LEVEL SECURITY;
ALTER TABLE qmenux_operator.passkey_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux_operator.passkey_challenges FORCE ROW LEVEL SECURITY;
ALTER TABLE qmenux_operator.passkey_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux_operator.passkey_proofs FORCE ROW LEVEL SECURITY;
ALTER TABLE qmenux_operator.passkey_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux_operator.passkey_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON qmenux_operator.passkey_grants,qmenux_operator.passkeys,qmenux_operator.passkey_challenges,qmenux_operator.passkey_proofs,qmenux_operator.passkey_events FROM PUBLIC,qmenux_runtime;
DO $acl$ DECLARE f regprocedure;
BEGIN FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='qmenux_operator' AND p.proname LIKE 'passkey_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,qmenux_runtime',f); END LOOP;
END $acl$;
GRANT EXECUTE ON FUNCTION qmenux_operator.passkey_registration(text,text,text,text),qmenux_operator.passkey_credentials(text,text,text),
  qmenux_operator.passkey_begin(text,text,text,text,text,text),qmenux_operator.passkey_consume(text,text,text,text,text,boolean),
  qmenux_operator.passkey_register(text,text,text,text,text,bytea,bigint),qmenux_operator.passkey_authenticate(text,text,text,text,bigint,bigint,text,text),
  qmenux_operator.passkey_proof(text,text,text,text,text) TO qmenux_runtime;
INSERT INTO qmenux.schema_migrations(version) VALUES('0014_operator_passkeys');
