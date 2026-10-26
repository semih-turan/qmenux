import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Client } from 'pg';
import { Database } from '../src/database.js';
import { IdentityStore } from '../src/identity-store.js';
import { OnboardingApplications } from '../src/onboarding-applications.js';
import { OperatorAccess } from '../src/operator-access.js';
import { OperatorAuthorization } from '../src/operator-authorization.js';
import { OperatorApplicationReview } from '../src/operator-application-review.js';
import { OperatorPasskeys } from '../src/operator-passkeys.js';
import { TenantAuthorization } from '../src/tenant-authorization.js';
import { TenantTransactions } from '../src/tenant-transactions.js';
import { withOperatorHttp } from './operator-http-fixture.js';
import { exerciseReviewBff } from './review-bff-fixture.js';

const code=(value:string)=>(error:{code?:string})=>error.code===value;
const status=(value:number)=>(error:{getStatus?:()=>number})=>error.getStatus?.()===value;
export async function exerciseApplicationApproval(database:Database,owner:Client,review:OperatorApplicationReview,passkeys:OperatorPasskeys,
  context:{assertion:()=>string;browser:string;session:string;csrf:string;proof:string;operatorId:string},applicant:string,applicantCsrf:string,
  authenticate:(options:Awaited<ReturnType<OperatorPasskeys['beginAuthentication']>>)=>Promise<unknown>) {
  const sql=(direction:string)=>readFileSync(new URL(`../../../../infrastructure/database/migrations/0022_application_approval.${direction}.sql`,import.meta.url),'utf8');
  const migrate=async(direction:string,commit=true)=>{await owner.query('BEGIN');try{await owner.query(sql(direction));await owner.query(commit?'COMMIT':'ROLLBACK');}catch(error){await owner.query('ROLLBACK');throw error;}};
  const tenants=(await owner.query('SELECT * FROM qmenux.tenants ORDER BY id')).rows,members=(await owner.query('SELECT * FROM qmenux_identity.memberships ORDER BY tenant_id,user_id')).rows;
  const events=(await owner.query('SELECT * FROM qmenux_onboarding.application_events ORDER BY application_id,revision')).rows;
  await migrate('up',false);await migrate('up');await migrate('down');await migrate('up');await assert.rejects(migrate('up'),code('P0001'));
  assert.deepEqual((await owner.query('SELECT * FROM qmenux_onboarding.application_events ORDER BY application_id,revision')).rows,events);
  await owner.query('BEGIN');try{await owner.query("INSERT INTO qmenux.schema_migrations(version) VALUES('0023_synthetic_future')");await assert.rejects(owner.query(sql('down')),code('P0001'));}finally{await owner.query('ROLLBACK');}
  const applications=new OnboardingApplications(database),identities=new IdentityStore(database);
  const pending=async(name:string)=>{const draft=await applications.create(applicant,applicantCsrf,{name,idempotencyKey:randomUUID()});return applications.submit(applicant,applicantCsrf,draft.id,{revision:1});};
  const first=await pending('Synthetic approved café');const command={revision:first.revision,reason:'Synthetic approval: café "vérifié" ☕',requestId:randomUUID()};
  const args=()=>[context.assertion(),context.browser,context.session,context.csrf,context.proof] as const;
  const consent=async(id=first.id,input=command)=>{const start=await review.beginApprove(...args(),id,input);return review.finishApprove(...args(),id,input,start.challenge,await authenticate(start));};
  await assert.rejects(review.approve(...args(),context.proof,first.id,command),status(403));
  const direct=async()=>{const client=await database.begin();try{
    await assert.rejects(client.query('SELECT * FROM qmenux_onboarding.approve_application($1,$2,$3,$4)',[first.id,command.requestId,command.revision,command.reason]),code('28000'));
  }finally{await client.query('ROLLBACK');client.release();}};
  await direct();
  const stale={...command,revision:1,requestId:randomUUID()};
  await assert.rejects(review.approve(...args(),await consent(first.id,stale),first.id,stale),status(409));
  const missing=randomUUID(),absent={...command,requestId:randomUUID()};
  await assert.rejects(review.approve(...args(),await consent(missing,absent),missing,absent),status(404));
  const draft=await applications.create(applicant,applicantCsrf,{name:'Synthetic unsubmitted approval',idempotencyKey:randomUUID()});
  const draftCommand={...command,revision:1,requestId:randomUUID()};
  await assert.rejects(review.approve(...args(),await consent(draft.id,draftCommand),draft.id,draftCommand),status(409));
  const rejecting=await review.beginReject(...args(),first.id,command);
  const rejectionProof=await review.finishReject(...args(),first.id,command,rejecting.challenge,await authenticate(rejecting));
  await assert.rejects(review.approve(...args(),rejectionProof,first.id,command),status(403));
  await owner.query('BEGIN');try{
    const applicantId=(await identities.readAdminSession(applicant))!.id;
    await owner.query("SELECT set_config('app.onboarding_actor',$1,true)",[applicantId]);
    await assert.rejects(owner.query("UPDATE qmenux_onboarding.applications SET status='APPROVED',reviewed_by=$2,review_request_id=$3,approval_reason='forged' WHERE id=$1",[first.id,context.operatorId,randomUUID()]),code('42501'));
  }finally{await owner.query('ROLLBACK');}
  assert.equal((await applications.list(applicant,{})).items.find(row=>row.id===first.id)!.status,'PENDING_APPROVAL');

  const proof=await consent();await assert.rejects(review.reject(...args(),proof,first.id,command),status(403));
  await assert.rejects(review.approve(...args(),proof,first.id,{...command,reason:'Different command'}),status(403));
  await owner.query("ALTER TABLE qmenux_onboarding.application_events ADD CONSTRAINT synthetic_approval_failure CHECK(current->>'status'<>'APPROVED') NOT VALID");
  try{await assert.rejects(review.approve(...args(),proof,first.id,command),status(503));}finally{await owner.query('ALTER TABLE qmenux_onboarding.application_events DROP CONSTRAINT synthetic_approval_failure');}
  const results=await Promise.all(Array.from({length:4},()=>review.approve(...args(),proof,first.id,command)));assert(results.every(row=>row.status==='APPROVED'&&row.revision===3));
  assert.deepEqual(await review.approve(...args(),undefined,first.id,command),results[0]);
  await assert.rejects(review.reject(...args(),undefined,first.id,command),status(409));
  await assert.rejects(review.approve(...args(),undefined,first.id,{...command,reason:'Changed retry'}),status(409));
  const audit=(await owner.query('SELECT actor_id,actor_kind,current FROM qmenux_onboarding.application_events WHERE application_id=$1 ORDER BY revision',[first.id])).rows;
  assert.equal(audit.length,3);assert.equal(audit[2].actor_id,context.operatorId);assert.equal(audit[2].actor_kind,'OPERATOR');assert.equal(audit[2].current.approval_reason,command.reason);assert.equal(audit[2].current.rejection_reason,null);
  assert.equal((await applications.list(applicant,{})).items.find(row=>row.id===first.id)!.status,'APPROVED');
  assert.equal((await applications.submit(applicant,applicantCsrf,first.id,{revision:2})).status,'APPROVED');
  await assert.rejects(applications.edit(applicant,applicantCsrf,first.id,{revision:3,name:'Cannot reopen approval'}),status(409));
  assert((await review.allDecisions(...args(),{})).items.some(row=>row.id===first.id&&row.status==='APPROVED'));assert(!(await review.decisions(...args(),{})).items.some(row=>row.id===first.id));
  await direct(); // Committed historical step-up evidence cannot authorize a new transaction.
  const expected=(await owner.query("SELECT id FROM qmenux_onboarding.applications WHERE reviewed_by=$1 AND status IN ('APPROVED','REJECTED') ORDER BY reviewed_at DESC,id DESC",[context.operatorId])).rows.map(row=>row.id);
  const recovered:string[]=[];let after:string|null=null;
  do{const page=await review.allDecisions(...args(),{limit:1,...(after?{after}:{})});recovered.push(...page.items.map(row=>row.id));after=page.nextCursor;}while(after);
  assert.deepEqual(recovered,expected);
  const foreign=(await owner.query('SELECT id FROM qmenux_onboarding.applications WHERE reviewed_by<>$1 LIMIT 1',[context.operatorId])).rows[0];assert(foreign);
  assert.deepEqual(await review.allDecisions(...args(),{after:foreign.id}),{items:[],nextCursor:null});
  await assert.rejects(review.allDecisions(context.assertion(),context.browser,context.session,'x'.repeat(43),context.proof,{}),status(403));
  await assert.rejects(review.allDecisions(...args(),{operatorId:context.operatorId}),status(400));
  const privileges=(await owner.query(`SELECT p.proname,p.prosecdef,p.proconfig,has_function_privilege('qmenux_runtime',p.oid,'EXECUTE') AS runtime,
    EXISTS(SELECT FROM aclexplode(p.proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS public
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname='qmenux_onboarding' AND p.proname IN ('approval_operation','replay_approval','approve_application','list_decisions'))
      OR (n.nspname='qmenux_operator' AND p.proname='approval_actor')`)).rows;
  assert.equal(privileges.length,5);
  for(const row of privileges){assert.equal(row.public,false);assert.equal(row.runtime,row.proname!=='approval_operation');
    assert.equal(row.prosecdef,row.proname!=='approval_operation');assert.deepEqual(row.proconfig,['search_path=pg_catalog, pg_temp']);}

  assert.equal((await identities.readAdminSession(applicant))!.status,'REGISTERED');
  const authorization=new TenantAuthorization(new TenantTransactions(database),identities);let worked=false;
  await assert.rejects(authorization.run('t003-cafe-a.qmenux.com',applicant,'catalog:write',async()=>true,async()=>{worked=true;return true;},'admin',applicantCsrf),status(403));assert.equal(worked,false);
  await withOperatorHttp(passkeys,new OperatorAuthorization(new OperatorAccess(),database),context.assertion,context.browser,async(send,apiOrigin)=>{
    const authority={assertion:context.assertion(),browser:context.browser,session:context.session,csrf:context.csrf,proof:context.proof};
    const target=await pending('Synthetic HTTP approved restaurant'),body={id:target.id,revision:target.revision,reason:'Synthetic HTTP approval',requestId:randomUUID()};
    const start=await send('review/approval/start',{...authority,...body});assert.equal(start.status,200);
    const options=start.data.options as Awaited<ReturnType<OperatorPasskeys['beginAuthentication']>>;
    const finish=await send('review/approval/finish',{...authority,...body,challenge:options.challenge,response:JSON.stringify(await authenticate(options))});assert.equal(finish.status,200);
    const commit=await send('review/approve',{...authority,...body,stepUp:finish.data.stepUp});assert.equal(commit.status,200);assert.equal((commit.data.application as {status:string}).status,'APPROVED');
    assert.deepEqual((await send('review/approve',{...authority,...body})).data,commit.data);
    const bff=await pending('Synthetic BFF approved café');await exerciseReviewBff(apiOrigin,authority,{id:bff.id,revision:bff.revision,reason:'Synthetic BFF approval',requestId:randomUUID()},authenticate,true);
  },review);
  await assert.rejects(migrate('down'),code('P0001'));
  assert.deepEqual((await owner.query('SELECT * FROM qmenux.tenants ORDER BY id')).rows,tenants);assert.deepEqual((await owner.query('SELECT * FROM qmenux_identity.memberships ORDER BY tenant_id,user_id')).rows,members);
}
