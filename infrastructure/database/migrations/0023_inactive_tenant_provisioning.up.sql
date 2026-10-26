SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
SELECT pg_advisory_xact_lock(hashtextextended('qmenux-schema-migrations',0));
DO $guard$ BEGIN
IF (SELECT array_agg(version ORDER BY version) FROM qmenux.schema_migrations) IS DISTINCT FROM ARRAY['0001_tenant_catalog','0002_tenant_resolution','0003_identity_sessions','0004_tenant_memberships','0005_operator_sessions','0006_auth_expiry','0007_microsoft_identity','0008_apple_identity','0009_admin_audience','0010_draft_product_events','0011_admin_tenant_membership','0012_draft_menu_structure','0013_onboarding_applications','0014_operator_passkeys','0015_operator_logout','0016_operator_browser_sessions','0017_operator_challenge_restart','0018_operator_session_audit','0019_operator_step_up','0020_application_rejection','0021_decision_recovery','0022_application_approval'] THEN RAISE EXCEPTION 'Unexpected migration versions'; END IF;
END $guard$;

ALTER TABLE qmenux_operator.step_up_events DROP CONSTRAINT step_up_events_action_check;
ALTER TABLE qmenux_operator.step_up_events ADD CONSTRAINT step_up_events_action_check
 CHECK(action IN ('tenant:approve','tenant:reject','tenant:provision','license:grant','license:extend','license:suspend','license:revoke','operator:manage'));
CREATE FUNCTION qmenux_operator.provisioning_actor(operation_hash text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
SELECT e.operator_id FROM qmenux_operator.step_up_events e JOIN qmenux_operator.operators o ON o.id=e.operator_id
WHERE e.action='tenant:provision' AND e.kind='CONSUMED' AND e.transaction_id=pg_current_xact_id_if_assigned()
 AND e.operation_hash=$1 AND o.status='ACTIVE' AND o.role='PLATFORM_ADMIN'
$f$;
CREATE FUNCTION qmenux_onboarding.provisioning_operation(application_id uuid,request_id uuid,revision integer,slug text,business_name text,branch_name text,reason text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,pg_temp AS $f$
SELECT encode(sha256(convert_to('["tenant:provision","'||$1::text||'","'||$2::text||'","'||
 encode(sha256(convert_to('['||$3::text||','||to_json($4)::text||','||to_json($5)::text||','||to_json($6)::text||','||to_json($7)::text||']','UTF8')),'hex')||'"]','UTF8')),'hex')
$f$;
CREATE TABLE qmenux_onboarding.provisionings (
 application_id uuid PRIMARY KEY REFERENCES qmenux_onboarding.applications(id),
 tenant_id uuid NOT NULL UNIQUE REFERENCES qmenux.tenants(id) DEFERRABLE INITIALLY DEFERRED,
 branch_id uuid NOT NULL,
 applicant_id uuid NOT NULL,
 operator_id uuid NOT NULL,
 request_id uuid NOT NULL,
 application_revision integer NOT NULL CHECK(application_revision>0),
 slug text NOT NULL CHECK(slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' AND slug NOT LIKE 'xn--%'
  AND slug NOT IN ('admin','superman','api','www','auth','assets','qmenux','workspace','control')),
 business_name text NOT NULL CHECK(length(business_name) BETWEEN 1 AND 200 AND business_name=btrim(business_name) AND business_name !~ '[[:cntrl:]]'),
 branch_name text NOT NULL CHECK(length(branch_name) BETWEEN 1 AND 200 AND branch_name=btrim(branch_name) AND branch_name !~ '[[:cntrl:]]'),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000 AND reason=btrim(reason) AND reason !~ '[[:cntrl:]]'),
 operation_hash text NOT NULL CHECK(operation_hash ~ '^[0-9a-f]{64}$'),
 transaction_id xid8 NOT NULL DEFAULT pg_current_xact_id(),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(operator_id,request_id),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES qmenux.branches(tenant_id,id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE qmenux_onboarding.provisionings ENABLE ROW LEVEL SECURITY;
ALTER TABLE qmenux_onboarding.provisionings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON qmenux_onboarding.provisionings FROM PUBLIC,qmenux_runtime;
CREATE TRIGGER immutable_provisionings BEFORE UPDATE OR DELETE OR TRUNCATE ON qmenux_onboarding.provisionings
 FOR EACH STATEMENT EXECUTE FUNCTION qmenux_onboarding.reject_event_change();
-- VOLATILE: module receivers must see the permit inserted earlier in this SQL statement.
CREATE FUNCTION qmenux_onboarding.provisioning_permit(application_id uuid)
RETURNS SETOF qmenux_onboarding.provisionings LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
SELECT p.* FROM qmenux_onboarding.provisionings p JOIN qmenux_onboarding.applications a ON a.id=p.application_id
WHERE p.application_id=$1 AND p.transaction_id=pg_current_xact_id_if_assigned()
 AND p.operator_id=qmenux_operator.provisioning_actor(p.operation_hash)
 AND a.status='APPROVED' AND a.revision=p.application_revision AND a.applicant_id=p.applicant_id
$f$;
CREATE FUNCTION qmenux.provision_inactive(application_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE permit qmenux_onboarding.provisionings%ROWTYPE;
BEGIN
 SELECT * INTO permit FROM qmenux_onboarding.provisioning_permit($1);
 IF NOT FOUND THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='28000'; END IF;
 INSERT INTO qmenux.tenants(id,slug,name,status) VALUES(permit.tenant_id,permit.slug,permit.business_name,'APPROVED');
 INSERT INTO qmenux.branches(tenant_id,id,name) VALUES(permit.tenant_id,permit.branch_id,permit.branch_name);
END $f$;
CREATE FUNCTION qmenux.provisioned_inactive(application_id uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
SELECT EXISTS(SELECT FROM qmenux_onboarding.provisioning_permit($1) p JOIN qmenux.tenants t ON t.id=p.tenant_id
 JOIN qmenux.branches b ON b.tenant_id=t.id AND b.id=p.branch_id
 WHERE t.status='APPROVED' AND t.slug=p.slug AND t.name=p.business_name AND b.name=p.branch_name)
$f$;
CREATE FUNCTION qmenux_identity.provision_pending_owner(application_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE permit qmenux_onboarding.provisionings%ROWTYPE; user_status text;
BEGIN
 SELECT * INTO permit FROM qmenux_onboarding.provisioning_permit($1);
 IF NOT FOUND OR NOT qmenux.provisioned_inactive($1) THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='28000'; END IF;
 SELECT u.status INTO user_status FROM qmenux_identity.users u WHERE u.id=permit.applicant_id FOR UPDATE;
 IF user_status IS DISTINCT FROM 'REGISTERED' THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='28000'; END IF;
 INSERT INTO qmenux_identity.memberships(tenant_id,user_id,role,status) VALUES(permit.tenant_id,permit.applicant_id,'OWNER','PENDING');
END $f$;
CREATE FUNCTION qmenux_onboarding.provision_application(application_id uuid,request_id uuid,expected_revision integer,desired_slug text,business_name text,branch_name text,reason text)
RETURNS TABLE("applicationId" uuid,"tenantId" uuid,"branchId" uuid,slug text,"createdAt" timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE actor uuid; target qmenux_onboarding.applications%ROWTYPE; digest text;
BEGIN
 digest:=qmenux_onboarding.provisioning_operation($1,$2,$3,$4,$5,$6,$7);
 actor:=qmenux_operator.provisioning_actor(digest);
 IF actor IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='28000'; END IF;
 SELECT a.* INTO target FROM qmenux_onboarding.applications a WHERE a.id=$1 FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF target.status<>'APPROVED' OR target.revision<>$3 OR EXISTS(SELECT FROM qmenux_onboarding.provisionings p WHERE p.application_id=$1)
 THEN RAISE EXCEPTION 'Conflicting provisioning' USING ERRCODE='23505'; END IF;
 INSERT INTO qmenux_onboarding.provisionings(application_id,tenant_id,branch_id,applicant_id,operator_id,request_id,application_revision,slug,business_name,branch_name,reason,operation_hash)
 VALUES($1,gen_random_uuid(),gen_random_uuid(),target.applicant_id,actor,$2,$3,$4,$5,$6,$7,digest);
 PERFORM qmenux.provision_inactive($1);
 PERFORM qmenux_identity.provision_pending_owner($1);
 RETURN QUERY SELECT p.application_id,p.tenant_id,p.branch_id,p.slug,p.created_at FROM qmenux_onboarding.provisionings p WHERE p.application_id=$1;
END $f$;
CREATE FUNCTION qmenux_onboarding.replay_provisioning(issuer text,subject text,audience text,session_hash text,csrf_hash text,mfa_hash text,browser_hash text,
 application_id uuid,request_id uuid,expected_revision integer,desired_slug text,business_name text,branch_name text,reason text)
RETURNS TABLE("applicationId" uuid,"tenantId" uuid,"branchId" uuid,slug text,"createdAt" timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE actor uuid; recorded qmenux_onboarding.provisionings%ROWTYPE;
BEGIN
 actor:=qmenux_operator.review_session($1,$2,$3,$4,$5,$6,$7);
 IF actor IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='28000'; END IF;
 SELECT p.* INTO recorded FROM qmenux_onboarding.provisionings p WHERE p.operator_id=actor AND p.request_id=$9;
 IF FOUND THEN
  IF recorded.application_id<>$8 OR recorded.operation_hash IS DISTINCT FROM qmenux_onboarding.provisioning_operation($8,$9,$10,$11,$12,$13,$14)
  THEN RAISE EXCEPTION 'Conflicting retry' USING ERRCODE='23505'; END IF;
  RETURN QUERY SELECT recorded.application_id,recorded.tenant_id,recorded.branch_id,recorded.slug,recorded.created_at;
 ELSIF EXISTS(SELECT FROM qmenux_onboarding.provisionings p WHERE p.application_id=$8) THEN
  RAISE EXCEPTION 'Conflicting provisioning' USING ERRCODE='23505';
 END IF;
END $f$;
REVOKE ALL ON FUNCTION qmenux_operator.provisioning_actor(text),qmenux_onboarding.provisioning_operation(uuid,uuid,integer,text,text,text,text),
 qmenux_onboarding.provisioning_permit(uuid),qmenux.provision_inactive(uuid),qmenux.provisioned_inactive(uuid),qmenux_identity.provision_pending_owner(uuid),
 qmenux_onboarding.provision_application(uuid,uuid,integer,text,text,text,text),
 qmenux_onboarding.replay_provisioning(text,text,text,text,text,text,text,uuid,uuid,integer,text,text,text,text) FROM PUBLIC,qmenux_runtime;
GRANT EXECUTE ON FUNCTION qmenux_onboarding.provision_application(uuid,uuid,integer,text,text,text,text),
 qmenux_onboarding.replay_provisioning(text,text,text,text,text,text,text,uuid,uuid,integer,text,text,text,text) TO qmenux_runtime;
INSERT INTO qmenux.schema_migrations(version) VALUES('0023_inactive_tenant_provisioning');
