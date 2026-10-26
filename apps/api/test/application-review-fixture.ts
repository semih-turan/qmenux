import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Client } from 'pg';
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
  await assert.rejects(migrate('down'),code('P0001'));
}
