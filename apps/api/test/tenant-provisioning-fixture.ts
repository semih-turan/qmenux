import assert from 'node:assert/strict';
import { ForbiddenException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import type { Client } from 'pg';
import { Database } from '../src/database.js';
import { IdentityStore } from '../src/identity-store.js';
import { OnboardingApplications } from '../src/onboarding-applications.js';
import { OperatorAccess } from '../src/operator-access.js';
import { OperatorApplicationReview } from '../src/operator-application-review.js';
import { OperatorPasskeys } from '../src/operator-passkeys.js';
import { TenantAuthorization } from '../src/tenant-authorization.js';
import { TenantProvisioning } from '../src/tenant-provisioning.js';
import { TenantTransactions } from '../src/tenant-transactions.js';

const secret=()=>randomBytes(32).toString('base64url');
const code=(value:string)=>(error:{code?:string})=>error.code===value;
const status=(value:number)=>(error:{getStatus?:()=>number})=>error.getStatus?.()===value;

export async function exerciseTenantProvisioning(database:Database,owner:Client,review:OperatorApplicationReview,passkeys:OperatorPasskeys,
  context:{assertion:()=>string;browser:string;session:string;csrf:string;proof:string;operatorId:string},
  authenticate:(options:Awaited<ReturnType<OperatorPasskeys['beginAuthentication']>>)=>Promise<unknown>):Promise<string[]> {
  const sql=(direction:string)=>readFileSync(new URL(`../../../../infrastructure/database/migrations/0023_inactive_tenant_provisioning.${direction}.sql`,import.meta.url),'utf8');
  const migrate=async(direction:string,commit=true)=>{await owner.query('BEGIN');try{await owner.query(sql(direction));await owner.query(commit?'COMMIT':'ROLLBACK');}catch(error){await owner.query('ROLLBACK');throw error;}};
  const tenants=(await owner.query('SELECT * FROM qmenux.tenants ORDER BY id')).rows;
  const members=(await owner.query('SELECT * FROM qmenux_identity.memberships ORDER BY tenant_id,user_id')).rows;
  const events=(await owner.query('SELECT * FROM qmenux_onboarding.application_events ORDER BY application_id,revision')).rows;
  const menuCount=(await owner.query('SELECT count(*) FROM qmenux.menus')).rows[0].count;
  await migrate('up',false);
  assert.equal((await owner.query("SELECT to_regclass('qmenux_onboarding.provisionings') IS NULL AS absent")).rows[0].absent,true);
  await migrate('up');await migrate('down');await migrate('up');await assert.rejects(migrate('up'),code('P0001'));
  await owner.query('BEGIN');try{await owner.query("INSERT INTO qmenux.schema_migrations(version) VALUES('0024_synthetic_future')");await assert.rejects(owner.query(sql('down')),code('P0001'));}finally{await owner.query('ROLLBACK');}
  assert.deepEqual((await owner.query('SELECT * FROM qmenux_onboarding.application_events ORDER BY application_id,revision')).rows,events);
  const identities=new IdentityStore(database),applications=new OnboardingApplications(database);
  const service=new TenantProvisioning(database,new OperatorAccess(),passkeys);
  const args=()=>[context.assertion(),context.browser,context.session,context.csrf,context.proof] as const;
  let applicant=secret(),csrf=secret();
  const user=await identities.createAdminSession('google','synthetic-provision-applicant',applicant,csrf);assert(user);
  const api=secret();await identities.createSession('synthetic-provision-applicant',api);
  const sibling=secret(),siblingCsrf=secret();await identities.createAdminSession('google','synthetic-provision-applicant',sibling,siblingCsrf);
  const approved=async(name:string,submit=true,approve=true)=>{
    const draft=await applications.create(applicant,csrf,{name,idempotencyKey:randomUUID()});
    if(!submit)return draft;
    const pending=await applications.submit(applicant,csrf,draft.id,{revision:1});
    if(!approve)return pending;
    const command={revision:pending.revision,reason:'Synthetic provisioning prerequisite',requestId:randomUUID()};
    const start=await review.beginApprove(...args(),pending.id,command);
    const proof=await review.finishApprove(...args(),pending.id,command,start.challenge,await authenticate(start));
    return review.approve(...args(),proof,pending.id,command);
  };
  const first=await approved('Synthetic provisioning café');
  const command={revision:first.revision,slug:'T041-PROVISION-CAFE',businessName:'Synthetic café "vérifié" ☕',initialBranchName:'Initial branch',reason:'Synthetic explicit setup',requestId:randomUUID()};
  const consent=async(id=first.id,input=command)=>{const start=await service.begin(...args(),id,input);return service.finish(...args(),id,input,start.challenge,await authenticate(start));};
  const provision=(proof:unknown,id=first.id,input=command)=>service.provision(...args(),proof,id,input);
  for(const slug of ['workspace','control','admin','xn--example','a.b','a:443','-cafe','cafe-'])await assert.rejects(service.begin(...args(),first.id,{...command,slug}),status(400));
  for(const input of [{...command,applicantId:user},{...command,role:'OWNER'},{...command,revision:0},{...command,reason:'bad\nreason'}])await assert.rejects(service.begin(...args(),first.id,input),status(400));
  await assert.rejects(provision(context.proof),status(403));
  const approval=await review.beginApprove(...args(),first.id,{revision:3,reason:'Wrong purpose',requestId:command.requestId});
  const wrong=await review.finishApprove(...args(),first.id,{revision:3,reason:'Wrong purpose',requestId:command.requestId},approval.challenge,await authenticate(approval));
  await assert.rejects(provision(wrong),status(403));
  const rejected=await approved('Synthetic rejected provisioning',true,false);
  const rejection={revision:rejected.revision,reason:'Synthetic rejected prerequisite',requestId:randomUUID()};
  const rejectionStart=await review.beginReject(...args(),rejected.id,rejection);
  const rejectionProof=await review.finishReject(...args(),rejected.id,rejection,rejectionStart.challenge,await authenticate(rejectionStart));
  const rejectedResult=await review.reject(...args(),rejectionProof,rejected.id,rejection);
  for(const target of [await approved('Synthetic unsubmitted provisioning',false),await approved('Synthetic pending provisioning',true,false),rejectedResult]) {
    const input={...command,revision:target.revision,requestId:randomUUID()};
    await assert.rejects(provision(await consent(target.id,input),target.id,input),status(409));
  }
  const stale={...command,revision:2};await assert.rejects(provision(await consent(first.id,stale),first.id,stale),status(409));
  const absent=randomUUID();await assert.rejects(provision(await consent(absent),absent),status(404));
  const direct=async()=>{const client=await database.begin();try{
    await client.query("SELECT set_config('app.onboarding_actor',$1,true)",[user]);
    await assert.rejects(client.query('SELECT * FROM qmenux_onboarding.provision_application($1,$2,$3,$4,$5,$6,$7)',
      [first.id,command.requestId,3,'t041-provision-cafe',command.businessName,command.initialBranchName,command.reason]),code('28000'));
  }finally{await client.query('ROLLBACK');client.release();}};
  await direct();
  const evidence=await consent();
  await assert.rejects(provision(evidence,first.id,{...command,businessName:'Changed command'}),status(403));
  await owner.query('ALTER TABLE qmenux_onboarding.provisionings ADD CONSTRAINT synthetic_provision_audit_failure CHECK(false) NOT VALID');
  try{await assert.rejects(provision(evidence),status(503));}finally{await owner.query('ALTER TABLE qmenux_onboarding.provisionings DROP CONSTRAINT synthetic_provision_audit_failure');}
  await owner.query("CREATE FUNCTION qmenux_identity.synthetic_provision_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic commit failure'; END $$");
  await owner.query('CREATE CONSTRAINT TRIGGER zz_synthetic_provision_failure AFTER INSERT ON qmenux_identity.memberships DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION qmenux_identity.synthetic_provision_failure()');
  try{await assert.rejects(provision(evidence),status(503));}finally{
    await owner.query('DROP TRIGGER zz_synthetic_provision_failure ON qmenux_identity.memberships');await owner.query('DROP FUNCTION qmenux_identity.synthetic_provision_failure()');
  }
  assert.deepEqual((await owner.query('SELECT * FROM qmenux.tenants ORDER BY id')).rows,tenants);
  assert.deepEqual((await owner.query('SELECT * FROM qmenux_identity.memberships ORDER BY tenant_id,user_id')).rows,members);
  assert.equal((await owner.query('SELECT count(*) FROM qmenux_onboarding.provisionings')).rows[0].count,'0');
  assert(await identities.readAdminSession(applicant));assert(await identities.readAdminSession(sibling));assert(await identities.readSession(api));
  const results=await Promise.all(Array.from({length:4},()=>provision(evidence)));
  assert(results.every(result=>JSON.stringify(result)===JSON.stringify(results[0])));
  const result=results[0]!;assert.equal(result.applicationId,first.id);assert.equal(result.slug,'t041-provision-cafe');
  assert.equal(await identities.readAdminSession(applicant),undefined);assert.equal(await identities.readAdminSession(sibling),undefined);assert.equal(await identities.readSession(api),undefined);
  assert.deepEqual(await provision(undefined),result);
  await assert.rejects(provision(undefined,first.id,{...command,reason:'Changed retry'}),status(409));
  await assert.rejects(provision(undefined,first.id,{...command,requestId:randomUUID()}),status(409));
  await direct();
  applicant=secret();csrf=secret();await identities.createAdminSession('google','synthetic-provision-applicant',applicant,csrf);
  const authorization=new TenantAuthorization(new TenantTransactions(database),identities);let worked=false;
  await assert.rejects(authorization.run(`${result.slug}.qmenux.com`,applicant,'catalog:write',async()=>true,async()=>{worked=true;},'admin',csrf),status(404));assert.equal(worked,false);
  const next=await approved('Synthetic second setup');const conflict={...command,revision:next.revision,requestId:randomUUID()};
  await assert.rejects(provision(await consent(next.id,conflict),next.id,conflict),status(409));
  const second={...conflict,slug:'t041-provision-second',requestId:randomUUID()};const secondProof=await consent(next.id,second);
  await owner.query('BEGIN');
  let suspended:Promise<unknown>|undefined;
  try{
    await owner.query("UPDATE qmenux_identity.users SET status='SUSPENDED' WHERE id=$1",[user]);
    suspended=provision(secondProof,next.id,second).then(()=>new Error('Concurrent suspension must deny provisioning'),error=>error);
    const deadline=Date.now()+3000;let waiting=false;
    while(Date.now()<deadline){
      waiting=(await owner.query("SELECT EXISTS(SELECT FROM pg_locks WHERE NOT granted AND locktype='transactionid' AND transactionid::text=pg_current_xact_id_if_assigned()::text) AS waiting")).rows[0].waiting;
      if(waiting)break;await setTimeout(10);
    }
    assert(waiting,'Provisioning must wait for the applicant status transaction lock');
    await owner.query('COMMIT');
    assert((await suspended) instanceof ForbiddenException);
  }finally{await owner.query('ROLLBACK');await suspended;}
  assert.equal((await owner.query('SELECT count(*) FROM qmenux_onboarding.provisionings')).rows[0].count,'1');
  await owner.query("UPDATE qmenux_identity.users SET status='REGISTERED' WHERE id=$1",[user]);
  assert.equal(await identities.readAdminSession(applicant),undefined);
  const secondResult=await provision(secondProof,next.id,second);
  const ids=[result.tenantId,secondResult.tenantId];assert.equal(new Set(ids).size,2);
  const mapped=(await owner.query('SELECT * FROM qmenux_onboarding.provisionings ORDER BY created_at')).rows;
  assert.equal(mapped.length,2);assert(mapped.every(row=>row.applicant_id===user&&row.operator_id===context.operatorId));
  const created=(await owner.query('SELECT * FROM qmenux.tenants WHERE id=ANY($1::uuid[])',[ids])).rows;
  assert.equal(created.length,2);assert(created.every(row=>row.status==='APPROVED'));
  const memberships=(await owner.query('SELECT * FROM qmenux_identity.memberships WHERE tenant_id=ANY($1::uuid[])',[ids])).rows;
  assert.equal(memberships.length,2);assert(memberships.every(row=>row.user_id===user&&row.role==='OWNER'&&row.status==='PENDING'));
  assert.equal((await owner.query('SELECT count(*) FROM qmenux.branches WHERE tenant_id=ANY($1::uuid[])',[ids])).rows[0].count,'2');
  assert.equal((await owner.query('SELECT count(*) FROM qmenux.menus')).rows[0].count,menuCount);
  assert.deepEqual((await owner.query('SELECT * FROM qmenux.tenants ORDER BY id')).rows.filter(row=>!ids.includes(row.id)),tenants);
  assert.deepEqual((await owner.query('SELECT * FROM qmenux_identity.memberships ORDER BY tenant_id,user_id')).rows.filter(row=>!ids.includes(row.tenant_id)),members);
  for(const query of ['UPDATE qmenux_onboarding.provisionings SET reason=reason','DELETE FROM qmenux_onboarding.provisionings','TRUNCATE qmenux_onboarding.provisionings']) {
    await owner.query('BEGIN');try{await assert.rejects(owner.query(query),code('42501'));}finally{await owner.query('ROLLBACK');}
  }
  const metadata=(await owner.query("SELECT relrowsecurity,relforcerowsecurity,has_table_privilege('qmenux_runtime',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS runtime FROM pg_class WHERE oid='qmenux_onboarding.provisionings'::regclass")).rows[0];
  assert.deepEqual(metadata,{relrowsecurity:true,relforcerowsecurity:true,runtime:false});
  const functions=(await owner.query(`SELECT p.proname,p.prosecdef,p.proconfig,has_function_privilege('qmenux_runtime',p.oid,'EXECUTE') AS runtime,
    EXISTS(SELECT FROM aclexplode(p.proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('qmenux','qmenux_identity','qmenux_onboarding','qmenux_operator') AND p.proname IN
    ('provisioning_actor','provisioning_operation','provisioning_permit','provision_inactive','provisioned_inactive','provision_pending_owner','provision_application','replay_provisioning')`)).rows;
  assert.equal(functions.length,8);for(const row of functions){assert.equal(row.public,false);assert.equal(row.runtime,['provision_application','replay_provisioning'].includes(row.proname));
    assert.equal(row.prosecdef,row.proname!=='provisioning_operation');assert.deepEqual(row.proconfig,['search_path=pg_catalog, pg_temp']);}
  for(const query of ['SELECT * FROM qmenux_onboarding.provisionings',
    `SELECT * FROM qmenux_onboarding.provisioning_permit('${first.id}')`,
    `SELECT qmenux.provision_inactive('${first.id}')`, `SELECT qmenux_identity.provision_pending_owner('${first.id}')`]){
    const client=await database.begin();try{await assert.rejects(client.query(query),code('42501'));}finally{await client.query('ROLLBACK');client.release();}
  }
  assert.deepEqual((await owner.query('SELECT * FROM qmenux_onboarding.application_events WHERE application_id=ANY($1::uuid[]) ORDER BY application_id,revision',[events.map(row=>row.application_id)])).rows,events);
  assert.equal((await owner.query("SELECT status FROM qmenux_onboarding.applications WHERE id=$1",[first.id])).rows[0].status,'APPROVED');
  assert.equal((await owner.query("SELECT count(*) FROM qmenux_operator.step_up_events WHERE action='tenant:provision' AND kind='CONSUMED'")).rows[0].count,'2');
  await assert.rejects(migrate('down'),code('P0001'));
  return ids;
}
