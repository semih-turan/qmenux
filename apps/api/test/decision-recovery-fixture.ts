import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Client } from 'pg';
import { Database } from '../src/database.js';
import { OperatorApplicationReview } from '../src/operator-application-review.js';

const code=(value:string)=>(error:{code?:string})=>error.code===value;
const status=(value:number)=>(error:{getStatus?:()=>number})=>error.getStatus?.()===value;
export async function exerciseDecisionRecovery(database:Database,owner:Client,review:OperatorApplicationReview,
  context:{assertion:()=>string;browser:string;session:string;csrf:string;proof:string;operatorId:string},foreignPending:{id:string;revision:number}) {
  const sql=(direction:string)=>readFileSync(new URL(`../../../../infrastructure/database/migrations/0021_decision_recovery.${direction}.sql`,import.meta.url),'utf8');
  const migrate=async(direction:string,commit=true)=>{await owner.query('BEGIN');try{await owner.query(sql(direction));await owner.query(commit?'COMMIT':'ROLLBACK');}catch(error){await owner.query('ROLLBACK');throw error;}};
  const before=(await owner.query('SELECT * FROM qmenux_onboarding.applications ORDER BY id')).rows;
  await migrate('up',false);await migrate('up');await migrate('down');assert.deepEqual((await owner.query('SELECT * FROM qmenux_onboarding.applications ORDER BY id')).rows,before);
  await migrate('up');await assert.rejects(migrate('up'),code('P0001'));
  await owner.query('BEGIN');try{await owner.query("INSERT INTO qmenux.schema_migrations(version) VALUES('0022_synthetic_future')");await assert.rejects(owner.query(sql('down')),code('P0001'));}finally{await owner.query('ROLLBACK');}
  // Foreign decision is owner-seeded fixture data; own decisions above used real native ceremonies.
  const foreign=(await owner.query("INSERT INTO qmenux_operator.operators(issuer,subject,role,status) VALUES('https://synthetic-decision-foreign.cloudflareaccess.com','foreign-reviewer','PLATFORM_ADMIN','ACTIVE') RETURNING id")).rows[0].id;
  await owner.query('BEGIN');try{
    const request=randomUUID();await owner.query("INSERT INTO qmenux_operator.step_up_events(session_id,operator_id,action,target_id,request_id,operation_hash,kind) VALUES($1,$2,'tenant:reject',$3,$4,qmenux_onboarding.rejection_operation($3,$4,$5,'Synthetic foreign reason'),'CONSUMED')",[randomUUID(),foreign,foreignPending.id,request,foreignPending.revision]);
    await owner.query("SELECT * FROM qmenux_onboarding.reject_application($1,$2,$3,'Synthetic foreign reason')",[foreignPending.id,request,foreignPending.revision]);await owner.query('COMMIT');
  }catch(error){await owner.query('ROLLBACK');throw error;}
  const args=()=>[context.assertion(),context.browser,context.session,context.csrf,context.proof] as const;
  const expected=(await owner.query("SELECT id FROM qmenux_onboarding.applications WHERE reviewed_by=$1 AND status='REJECTED' ORDER BY reviewed_at DESC,id DESC",[context.operatorId])).rows.map(row=>row.id);
  assert(expected.length>=3);const all=await review.decisions(...args(),{});assert.deepEqual(all.items.map(row=>row.id),expected);assert(all.items.every(row=>row.reason&&row.requestId&&row.reviewedAt instanceof Date));
  assert(!all.items.some(row=>row.id===foreignPending.id));
  const ids:string[]=[];let after:string|null=null;
  do{const page=await review.decisions(...args(),{limit:1,...(after?{after}:{})});ids.push(...page.items.map(row=>row.id));after=page.nextCursor;}while(after);
  assert.deepEqual(ids,expected);assert.deepEqual(await review.decisions(...args(),{after:foreignPending.id}),{items:[],nextCursor:null});
  assert.deepEqual(await review.decisions(...args(),{after:randomUUID()}),{items:[],nextCursor:null});
  await assert.rejects(review.decisions(context.assertion(),context.browser,context.session,'x'.repeat(43),context.proof,{}),status(403));
  await assert.rejects(review.decisions(...args(),{limit:101}),status(400));await assert.rejects(review.decisions(...args(),{operatorId:foreign}),status(400));
  const metadata=(await owner.query("SELECT p.prosecdef,p.proconfig,has_function_privilege('qmenux_runtime',p.oid,'EXECUTE') AS runtime,EXISTS(SELECT FROM aclexplode(p.proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS public FROM pg_proc p WHERE p.oid='qmenux_onboarding.list_rejections(text,text,text,text,text,text,text,uuid,integer)'::regprocedure")).rows[0];
  assert.deepEqual(metadata,{prosecdef:true,proconfig:['search_path=pg_catalog, pg_temp'],runtime:true,public:false});
  const client=await database.begin();try{await assert.rejects(client.query('SELECT * FROM qmenux_onboarding.applications'),code('42501'));await client.query('ROLLBACK');}finally{client.release();}
  await migrate('down');await assert.rejects(review.decisions(...args(),{}),status(503));await migrate('up');assert.deepEqual((await review.decisions(...args(),{})).items,all.items);
}
