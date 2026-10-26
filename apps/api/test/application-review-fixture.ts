import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Client } from 'pg';
import { exerciseApplicationApproval } from './application-approval-fixture.js';
import { exerciseDecisionRecovery } from './decision-recovery-fixture.js';
import { exerciseReviewBff } from './review-bff-fixture.js';
import { withOperatorHttp } from './operator-http-fixture.js';
import { OperatorAuthorization } from '../src/operator-authorization.js';
import { Database } from '../src/database.js';
import { IdentityStore } from '../src/identity-store.js';
import { OnboardingApplications } from '../src/onboarding-applications.js';
import { OperatorAccess } from '../src/operator-access.js';
import { OperatorApplicationReview } from '../src/operator-application-review.js';
import { OperatorPasskeys } from '../src/operator-passkeys.js';

const secret=()=>randomBytes(32).toString('base64url');
const status=(value:number)=>(error:{getStatus?:()=>number})=>error.getStatus?.()===value;
const code=(value:string)=>(error:{code?:string})=>error.code===value;

export async function exerciseApplicationReview(database:Database,owner:Client,passkeys:OperatorPasskeys,
  context:{assertion:()=>string;browser:string;session:string;csrf:string;proof:string;operatorId:string},
  authenticate:(options:Awaited<ReturnType<OperatorPasskeys['beginAuthentication']>>)=>Promise<unknown>) {
  const sql=(direction:string)=>readFileSync(new URL(`../../../../infrastructure/database/migrations/0020_application_rejection.${direction}.sql`,import.meta.url),'utf8');
  const migrate=async(direction:string,commit=true)=>{await owner.query('BEGIN');try{await owner.query(sql(direction));await owner.query(commit?'COMMIT':'ROLLBACK');}catch(error){await owner.query('ROLLBACK');throw error;}};
  await migrate('up',false);await migrate('up');await migrate('down');await migrate('up');await assert.rejects(migrate('up'),code('P0001'));
  assert.equal((await owner.query('SELECT count(*) FROM qmenux_operator.step_up_events WHERE transaction_id IS NOT NULL')).rows[0].count,'0','Historical events gain no retroactive transaction authority');
  await owner.query('BEGIN');try{await owner.query("INSERT INTO qmenux.schema_migrations(version) VALUES('0021_synthetic_future')");await assert.rejects(owner.query(sql('down')),code('P0001'));}finally{await owner.query('ROLLBACK');}
  const review=new OperatorApplicationReview(database,new OperatorAccess(),passkeys),applications=new OnboardingApplications(database),identities=new IdentityStore(database);
  const applicant=secret(),applicantCsrf=secret(),other=secret(),otherCsrf=secret();
  const user=await identities.createAdminSession('google','synthetic-reviewed-applicant',applicant,applicantCsrf);assert(user);
  await identities.createAdminSession('microsoft','synthetic-review-other',other,otherCsrf);
  const draft=await applications.create(applicant,applicantCsrf,{name:'Synthetic review café',idempotencyKey:randomUUID()});
  const pending=await applications.submit(applicant,applicantCsrf,draft.id,{revision:1});
  const unsubmitted=await applications.create(other,otherCsrf,{name:'Synthetic private draft',idempotencyKey:randomUUID()});
  const canary=await applications.create(applicant,applicantCsrf,{name:'Synthetic unreviewed café',idempotencyKey:randomUUID()});
  const canaryPending=await applications.submit(applicant,applicantCsrf,canary.id,{revision:1});
  const args=()=>[context.assertion(),context.browser,context.session,context.csrf,context.proof] as const;
  const listed=await review.list(...args(),{});assert(listed.items.some(item=>item.id===pending.id));assert(!listed.items.some(item=>item.id===unsubmitted.id));
  assert(listed.items.every(item=>item.status==='PENDING_APPROVAL'));assert(!JSON.stringify(listed).includes(user));
  const paged:string[]=[];let after:string|null=null;
  do{const page=await review.list(...args(),{limit:1,...(after?{after}:{})});paged.push(...page.items.map(item=>item.id));after=page.nextCursor;}while(after);
  assert.equal(new Set(paged).size,paged.length);assert(paged.includes(pending.id));
  await assert.rejects(review.list(context.assertion(),context.browser,context.session,secret(),context.proof,{}),status(403));
  await assert.rejects(review.list(context.assertion(),context.browser,applicant,applicantCsrf,context.proof,{}),status(403));
  const command={revision:pending.revision,reason:' Synthetic reason: café "révision" ☕ ',requestId:randomUUID()};
  const consent=async(id=pending.id,input=command)=>{const options=await review.beginReject(...args(),id,input);return review.finishReject(...args(),id,input,options.challenge,await authenticate(options));};
  const reject=(token:unknown,id=pending.id,input=command)=>review.reject(...args(),token,id,input);
  await assert.rejects(reject(context.proof),status(403));
  for(const input of [{...command,reason:''},{...command,reason:'x\ny'},{...command,revision:0},{...command,requestId:'bad'},{...command,actorId:context.operatorId}])await assert.rejects(review.beginReject(...args(),pending.id,input),status(400));
  const raw=await database.begin();try{await assert.rejects(raw.query('SELECT * FROM qmenux_onboarding.reject_application($1,$2,$3,$4)',[pending.id,command.requestId,pending.revision,command.reason.trim()]),code('28000'));await raw.query('ROLLBACK');}finally{raw.release();}
  const stale={...command,revision:1};const staleProof=await consent(pending.id,stale);await assert.rejects(reject(staleProof,pending.id,stale),status(409));
  const missing=randomUUID();const absentProof=await consent(missing);await assert.rejects(reject(absentProof,missing),status(404));
  const draftCommand={...command,revision:1,requestId:randomUUID()};const draftProof=await consent(unsubmitted.id,draftCommand);await assert.rejects(reject(draftProof,unsubmitted.id,draftCommand),status(409));
  const evidence=await consent();
  await assert.rejects(reject(evidence,pending.id,{...command,reason:'Changed reason'}),status(403));
  await owner.query("ALTER TABLE qmenux_onboarding.application_events ADD CONSTRAINT synthetic_review_failure CHECK(actor_kind<>'OPERATOR') NOT VALID");
  try{await assert.rejects(reject(evidence),status(503));}finally{await owner.query('ALTER TABLE qmenux_onboarding.application_events DROP CONSTRAINT synthetic_review_failure');}
  assert.equal((await applications.list(applicant,{})).items.find(item=>item.id===pending.id)!.status,'PENDING_APPROVAL');
  const results=await Promise.all(Array.from({length:4},()=>reject(evidence)));assert(results.every(row=>row.status==='REJECTED'&&row.revision===3));
  assert.deepEqual(await reject(undefined),results[0],'Confirmed retry is an authenticated read, not another mutation');
  const historical=await database.begin();try{await assert.rejects(historical.query('SELECT * FROM qmenux_onboarding.reject_application($1,$2,$3,$4)',[pending.id,command.requestId,pending.revision,command.reason.trim()]),code('28000'));await historical.query('ROLLBACK');}finally{historical.release();}

  await assert.rejects(reject(undefined,pending.id,{...command,reason:'Conflicting retry'}),status(409));
  await assert.rejects(reject(undefined,unsubmitted.id),status(409));
  const events=(await owner.query('SELECT actor_id,actor_kind,revision,previous,current FROM qmenux_onboarding.application_events WHERE application_id=$1 ORDER BY revision',[pending.id])).rows;
  assert.equal(events.length,3);assert.equal(events[2].actor_kind,'OPERATOR');assert.equal(events[2].actor_id,context.operatorId);
  assert.equal(events[2].previous.status,'PENDING_APPROVAL');assert.equal(events[2].current.status,'REJECTED');assert.equal(events[2].current.rejection_reason,command.reason.trim());
  assert.equal((await applications.list(applicant,{})).items.find(item=>item.id===pending.id)!.status,'REJECTED');
  assert.equal((await applications.submit(applicant,applicantCsrf,pending.id,{revision:pending.revision})).status,'REJECTED');
  await assert.rejects(applications.edit(applicant,applicantCsrf,pending.id,{revision:3,name:'Cannot reopen'}),status(409));
  assert(!(await applications.list(other,{})).items.some(item=>item.id===pending.id));assert(!(await review.list(...args(),{})).items.some(item=>item.id===pending.id));
  await owner.query('BEGIN');try{
    await owner.query("SELECT set_config('app.onboarding_actor',$1,true)",[user]);
    await assert.rejects(owner.query("UPDATE qmenux_onboarding.applications SET status='REJECTED',reviewed_at=now(),reviewed_by=$2,review_request_id=$3,rejection_reason='forged' WHERE id=$1",[canaryPending.id,context.operatorId,randomUUID()]),code('42501'));
  }finally{await owner.query('ROLLBACK');}
  const direct=await database.begin();try{await assert.rejects(direct.query('SELECT * FROM qmenux_onboarding.applications'),code('42501'));await direct.query('ROLLBACK');}finally{direct.release();}
  await withOperatorHttp(passkeys,new OperatorAuthorization(new OperatorAccess(),database),context.assertion,context.browser,async(send,apiOrigin)=>{
    const authority={assertion:context.assertion(),browser:context.browser,session:context.session,csrf:context.csrf,proof:context.proof};
    const key=process.env.OPERATOR_REVIEW_SECRET!;
    process.env.OPERATOR_REVIEW_ENABLED='false';assert.equal((await send('review/list',authority)).status,503);process.env.OPERATOR_REVIEW_ENABLED='true';
    assert.equal((await send('review/list',authority,'POST',{authorization:`Bearer ${process.env.OPERATOR_BFF_SECRET}`})).status,401);
    process.env.OPERATOR_REVIEW_SECRET=process.env.OPERATOR_BFF_SECRET;assert.equal((await send('review/list',authority)).status,503);process.env.OPERATOR_REVIEW_SECRET=key;
    for(const action of ['list','decisions','rejection/start','rejection/finish','reject','approval/start','approval/finish','approve']){
      for(const method of ['GET','HEAD','OPTIONS'])assert.equal((await send(`review/${action}`,{},method)).status,405);
      assert.equal((await send(`review/${action}`,{...authority,actorId:context.operatorId})).status,400);
    }
    assert.equal((await send('review/list?tenant=selected',authority)).status,400);
    const listed=await send('review/list',{...authority,limit:20});assert.equal(listed.status,200);assert.equal(listed.cache,'no-store');assert.equal(listed.cookie,undefined);
    const command={id:canaryPending.id,revision:canaryPending.revision,reason:'Synthetic HTTP rejection',requestId:randomUUID()};
    const started=await send('review/rejection/start',{...authority,...command});assert.equal(started.status,200);
    const options=started.data.options as Awaited<ReturnType<OperatorPasskeys['beginAuthentication']>>;
    const signed=JSON.stringify(await authenticate(options));
    const finished=await send('review/rejection/finish',{...authority,...command,challenge:options.challenge,response:signed});assert.equal(finished.status,200);assert.equal(finished.data.expiresIn,120);
    assert.match(finished.data.stepUp as string,/^[A-Za-z0-9_-]{43}$/);assert.equal(finished.cookie,undefined);
    assert.equal((await send('review/reject',{...authority,...command,stepUp:finished.data.stepUp,reason:'Changed HTTP reason'})).status,403);
    const rejected=await send('review/reject',{...authority,...command,stepUp:finished.data.stepUp});assert.equal(rejected.status,200);
    assert.equal((rejected.data.application as {status:string}).status,'REJECTED');
    assert.deepEqual((await send('review/reject',{...authority,...command})).data,rejected.data);
    assert.equal((await send('review/reject',{...authority,...command,reason:'Conflicting HTTP retry'})).status,409);
    const bffDraft=await applications.create(applicant,applicantCsrf,{name:'Synthetic BFF review café',idempotencyKey:randomUUID()});
    const bffPending=await applications.submit(applicant,applicantCsrf,bffDraft.id,{revision:1});
    await exerciseReviewBff(apiOrigin,authority,{id:bffPending.id,revision:bffPending.revision,reason:'Synthetic combined BFF reason',requestId:randomUUID()},authenticate);
    assert.equal((await applications.list(applicant,{})).items.find(item=>item.id===bffPending.id)!.status,'REJECTED');

  },review);
  await assert.rejects(migrate('down'),code('P0001'));
  const foreignPending=await applications.submit(other,otherCsrf,unsubmitted.id,{revision:1});
  await exerciseDecisionRecovery(database,owner,review,context,foreignPending);
  await exerciseApplicationApproval(database,owner,review,passkeys,context,applicant,applicantCsrf,authenticate);
  await withOperatorHttp(passkeys,new OperatorAuthorization(new OperatorAccess(),database),context.assertion,context.browser,async send=>{
    const authority={assertion:context.assertion(),browser:context.browser,session:context.session,csrf:context.csrf,proof:context.proof};
    const result=await send('review/decisions',{...authority,limit:1});assert.equal(result.status,200);assert.equal(result.cache,'no-store');
    const data=result.data as {items:{id:string;reason:string;requestId:string;reviewedAt:string}[];nextCursor:string};assert.equal(data.items.length,1);assert(data.items[0]!.reason);assert.equal(new Date(data.items[0]!.reviewedAt).toISOString(),data.items[0]!.reviewedAt);
    const next=await send('review/decisions',{...authority,after:data.nextCursor,limit:1});assert.equal(next.status,200);assert.notEqual((next.data.items as {id:string}[])[0]!.id,data.items[0]!.id);
  },review);
}
