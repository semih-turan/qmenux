import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Client } from 'pg';
import { Database } from '../src/database.js';

const hash=()=>randomBytes(32).toString('hex');
const code=(value:string)=>(error:{code?:string})=>error.code===value;

export async function exerciseOperatorSessionAudit(database:Database,owner:Client) {
  const sql=(direction:string)=>readFileSync(new URL(`../../../../infrastructure/database/migrations/0018_operator_session_audit.${direction}.sql`,import.meta.url),'utf8');
  const migrate=async(direction:string,commit=true)=>{
    await owner.query('BEGIN');try{await owner.query(sql(direction));await owner.query(commit?'COMMIT':'ROLLBACK');}catch(error){await owner.query('ROLLBACK');throw error;}
  };
  const baselineIssuer='https://synthetic-audit-baseline.cloudflareaccess.com';
  await owner.query("INSERT INTO qmenux_operator.operators(issuer,subject,role,status) VALUES($1,'baseline','PLATFORM_ADMIN','ACTIVE')",[baselineIssuer]);
  await owner.query("SELECT qmenux_operator.create_session($1,'baseline',$2,$3,NULL)",[baselineIssuer,'e'.repeat(64),hash()]);
  const original=(await owner.query('SELECT * FROM qmenux_operator.sessions ORDER BY token_hash')).rows;
  assert(original.length>0,'Populated upgrade must exercise OBSERVED rather than inventing issuance');
  await migrate('up',false);
  assert.equal((await owner.query("SELECT to_regclass('qmenux_operator.session_events') IS NULL AS absent")).rows[0].absent,true);
  // Transaction-only empty drill preserves all preexisting synthetic sessions on rollback.
  await owner.query('BEGIN');
  try{await owner.query('DELETE FROM qmenux_operator.sessions');await owner.query(sql('up'));await owner.query(sql('down'));}
  finally{await owner.query('ROLLBACK');}
  assert.deepEqual((await owner.query('SELECT * FROM qmenux_operator.sessions ORDER BY token_hash')).rows,original);
  await migrate('up');await assert.rejects(migrate('up'),code('P0001'));
  const baseline=(await owner.query('SELECT * FROM qmenux_operator.session_events')).rows;
  assert.equal(baseline.length,original.length);assert(baseline.every(row=>row.kind==='OBSERVED'));
  await owner.query('BEGIN');
  try{await owner.query("INSERT INTO qmenux.schema_migrations(version) VALUES('0019_synthetic_future')");await assert.rejects(owner.query(sql('down')),code('P0001'));}
  finally{await owner.query('ROLLBACK');}
  const issuer='https://synthetic-session-audit.cloudflareaccess.com',subject='session-audit-fixture',audience='f'.repeat(64);
  const id=(await owner.query("INSERT INTO qmenux_operator.operators(issuer,subject,role,status) VALUES($1,$2,'PLATFORM_ADMIN','ACTIVE') RETURNING id",[issuer,subject])).rows[0].id;
  const run=async(query:string,values:unknown[]=[])=>{
    const client=await database.begin();try{const result=await client.query(query,values);await client.query('COMMIT');return result;}
    catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  };
  const issue=(token:string,previous:string|null=null)=>run('SELECT qmenux_operator.create_session($1,$2,$3,$4,$5)',[issuer,subject,audience,token,previous]);
  const events=async()=>(await owner.query('SELECT * FROM qmenux_operator.session_events WHERE operator_id=$1 ORDER BY occurred_at,id',[id])).rows;
  const first=hash();await issue(first);const issued=await events();assert.equal(issued.length,1);assert.equal(issued[0].kind,'ISSUED');
  const session=(await owner.query('SELECT audit_id FROM qmenux_operator.sessions WHERE token_hash=$1',[first])).rows[0];
  assert.equal(session.audit_id,issued[0].session_id);assert.equal(issued[0].audience,audience);
  assert.deepEqual(Object.keys(issued[0]).sort(),['audience','expires_at','id','kind','occurred_at','operator_id','session_id']);
  await owner.query('BEGIN');
  try{await owner.query('SELECT qmenux_operator.create_session($1,$2,$3,$4,NULL)',[issuer,subject,audience,hash()]);}
  finally{await owner.query('ROLLBACK');}
  assert.deepEqual(await events(),issued,'Rolled-back issuance leaves no audit event');
  const second=hash();await issue(second,first);
  assert.deepEqual((await events()).map(row=>row.kind),['ISSUED','RETIRED','ISSUED']);
  await run('SELECT qmenux_operator.revoke_session($1,$2,$3,$4)',[issuer,'foreign',audience,second]);
  assert.equal((await events()).length,3);
  await owner.query('ALTER TABLE qmenux_operator.session_events ADD CONSTRAINT synthetic_audit_failure CHECK(false) NOT VALID');
  try{
    await assert.rejects(issue(hash()),code('23514'));
    await assert.rejects(run('SELECT qmenux_operator.revoke_session($1,$2,$3,$4)',[issuer,subject,audience,second]),code('23514'));
    assert.equal((await owner.query('SELECT count(*) FROM qmenux_operator.sessions WHERE operator_id=$1',[id])).rows[0].count,'1');
    assert.equal((await events()).length,3,'Audit failure rolls back both issuance and retirement');
  }finally{await owner.query('ALTER TABLE qmenux_operator.session_events DROP CONSTRAINT synthetic_audit_failure');}
  for(const query of ['UPDATE qmenux_operator.session_events SET occurred_at=now()','DELETE FROM qmenux_operator.session_events','TRUNCATE qmenux_operator.session_events',
    'TRUNCATE qmenux_operator.sessions',"UPDATE qmenux_operator.sessions SET audit_id=gen_random_uuid() WHERE token_hash=$1"]){
    await owner.query('BEGIN');try{await assert.rejects(owner.query(query,query.includes('$1')?[second]:[]),code('42501'));}finally{await owner.query('ROLLBACK');}
  }
  await owner.query("UPDATE qmenux_operator.sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[second]);
  await run('SELECT qmenux_operator.cleanup_expired()');
  assert.deepEqual((await events()).map(row=>row.kind),['ISSUED','RETIRED','ISSUED','RETIRED']);
  const third=hash();await issue(third);await owner.query("UPDATE qmenux_operator.operators SET status='SUSPENDED' WHERE id=$1",[id]);
  assert.equal((await events()).at(-1).kind,'RETIRED');
  await owner.query("UPDATE qmenux_operator.operators SET status='ACTIVE' WHERE id=$1",[id]);
  assert.equal((await events()).length,6,'Restoration cannot resurrect a session/event');
  const metadata=(await owner.query("SELECT relrowsecurity,relforcerowsecurity,has_table_privilege('qmenux_runtime',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS allowed FROM pg_class WHERE oid='qmenux_operator.session_events'::regclass")).rows[0];
  assert.deepEqual(metadata,{relrowsecurity:true,relforcerowsecurity:true,allowed:false});
  for(const query of ['SELECT * FROM qmenux_operator.session_events',"INSERT INTO qmenux_operator.session_events DEFAULT VALUES",'DELETE FROM qmenux_operator.session_events'])await assert.rejects(run(query),code('42501'));
  const functions=(await owner.query("SELECT p.proname,p.prosecdef,p.proconfig,has_function_privilege('qmenux_runtime',p.oid,'EXECUTE') AS runtime,EXISTS(SELECT FROM aclexplode(p.proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='qmenux_operator' AND p.proname IN ('record_session_event','session_identity_immutable','session_event_immutable')")).rows;
  assert.equal(functions.length,3);for(const row of functions){assert.equal(row.runtime,false);assert.equal(row.public,false);assert.deepEqual(row.proconfig,['search_path=pg_catalog, pg_temp']);assert.equal(row.prosecdef,row.proname==='record_session_event');}
  await assert.rejects(migrate('down'),code('P0001'));
  assert.equal((await events()).length,6,'Populated down preserves history');
}
