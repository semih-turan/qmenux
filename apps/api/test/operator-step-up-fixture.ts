import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Client, PoolClient } from 'pg';
import { exerciseApplicationReview } from './application-review-fixture.js';
import { Database } from '../src/database.js';
import { secretHash } from '../src/identity-store.js';
import { OperatorAuthorization } from '../src/operator-authorization.js';
import { OperatorPasskeys, type OperatorOperation } from '../src/operator-passkeys.js';

const secret=()=>randomBytes(32).toString('base64url');
const status=(value:number)=>(error:{getStatus?:()=>number})=>error.getStatus?.()===value;
const code=(value:string)=>(error:{code?:string})=>error.code===value;

export async function exerciseOperatorStepUp(database:Database,owner:Client,passkeys:OperatorPasskeys,authorization:OperatorAuthorization,
  identity:{issuer:string;subject:string;audience:string;assertion:()=>string},
  register:(options:Awaited<ReturnType<OperatorPasskeys['beginRegistration']>>)=>Promise<unknown>,
  authenticate:(options:Awaited<ReturnType<OperatorPasskeys['beginAuthentication']>>)=>Promise<unknown>) {
  const sql=(direction:string)=>readFileSync(new URL(`../../../../infrastructure/database/migrations/0019_operator_step_up.${direction}.sql`,import.meta.url),'utf8');
  const migrate=async(direction:string,commit=true)=>{await owner.query('BEGIN');try{await owner.query(sql(direction));await owner.query(commit?'COMMIT':'ROLLBACK');}catch(error){await owner.query('ROLLBACK');throw error;}};
  await migrate('up',false);assert.equal((await owner.query("SELECT to_regclass('qmenux_operator.step_up_events') IS NULL AS absent")).rows[0].absent,true);
  await migrate('up');await migrate('down');await migrate('up');await assert.rejects(migrate('up'),code('P0001'));
  await owner.query('BEGIN');try{await owner.query("INSERT INTO qmenux.schema_migrations(version) VALUES('0020_synthetic_future')");await assert.rejects(owner.query(sql('down')),code('P0001'));}finally{await owner.query('ROLLBACK');}
  const {issuer,subject,audience,assertion}=identity;
  const id=(await owner.query("INSERT INTO qmenux_operator.operators(issuer,subject,role,status) VALUES($1,$2,'PLATFORM_ADMIN','ACTIVE') RETURNING id",[issuer,subject])).rows[0].id as string;
  const browser=secret(),grant=secret();
  await owner.query('INSERT INTO qmenux_operator.passkey_grants(token_hash,operator_id,audience) VALUES($1,$2,$3)',[secretHash(grant),id,audience]);
  const creation=await passkeys.beginRegistration(assertion(),browser,grant);
  await passkeys.finishRegistration(assertion(),browser,creation.challenge,await register(creation));
  const login=async()=>{const options=await passkeys.beginAuthentication(assertion(),browser);return passkeys.finishAuthentication(assertion(),browser,options.challenge,await authenticate(options));};
  let proof=await login();
  const pair=await authorization.signInBrowser(assertion(),passkeys.policy(proof,browser));
  const operation:OperatorOperation={action:'license:grant',targetId:randomUUID(),requestId:randomUUID(),payloadHash:secretHash('synthetic validated command')};
  const begin=(intent=operation)=>passkeys.beginStepUp(assertion(),browser,pair.session,pair.csrf,proof,intent);
  const finish=(challenge:string,response:unknown,intent=operation)=>passkeys.finishStepUp(assertion(),browser,pair.session,pair.csrf,proof,intent,challenge,response);
  const execute=(token:string,intent=operation,work=async(_client:PoolClient,actor:{id:string})=>{assert.equal(actor.id,id);return true;})=>passkeys.runStepUp(assertion(),browser,pair.session,pair.csrf,proof,token,intent,work);
  await assert.rejects(passkeys.beginStepUp(assertion(),browser,pair.session,secret(),proof,operation),status(403));
  for(const bad of [{...operation,action:'platform:read'},{...operation,payloadHash:'bad'},{...operation,targetId:'bad'},{...operation,requestId:'bad'},{...operation,extra:'selected'}])await assert.rejects(begin(bad as OperatorOperation),status(400));
  const ordinary=await passkeys.beginAuthentication(assertion(),browser),ordinaryReply=await authenticate(ordinary);
  await assert.rejects(finish(ordinary.challenge,ordinaryReply),status(403));
  // Replacing the ordinary proof must be explicit; it cannot itself authorize an operation.
  proof=await passkeys.finishAuthentication(assertion(),browser,ordinary.challenge,ordinaryReply);
  await assert.rejects(execute(proof),status(403));
  let options=await begin(),reply=await authenticate(options);
  await assert.rejects(passkeys.finishAuthentication(assertion(),browser,options.challenge,reply),status(403));
  const other=[{...operation,action:'license:revoke' as const},{...operation,targetId:randomUUID()},{...operation,requestId:randomUUID()},{...operation,payloadHash:secretHash('changed command')}];
  for(const intent of other)await assert.rejects(finish(options.challenge,reply,intent),status(403));
  await assert.rejects(passkeys.finishStepUp(assertion(),secret(),pair.session,pair.csrf,proof,operation,options.challenge,reply),status(403));
  const verified=await finish(options.challenge,reply);
  const foreignPair=await authorization.signInBrowser(assertion(),passkeys.policy(proof,browser));
  await assert.rejects(passkeys.runStepUp(assertion(),browser,foreignPair.session,foreignPair.csrf,proof,verified,operation,async()=>true),status(403));
  await assert.rejects(passkeys.runStepUp(assertion(),secret(),pair.session,pair.csrf,proof,verified,operation,async()=>true),status(403));
  await assert.rejects(passkeys.runStepUp(assertion(),browser,pair.session,secret(),proof,verified,operation,async()=>true),status(403));

  assert.equal(await passkeys.policy(verified,browser)({issuer,subject,audience}),false);
  for(const intent of other)await assert.rejects(execute(verified,intent),status(403));
  await assert.rejects(finish(options.challenge,reply),status(403));
  await owner.query('CREATE TABLE qmenux_operator.step_up_fixture_effects(request_id uuid PRIMARY KEY)');
  await owner.query('GRANT INSERT ON qmenux_operator.step_up_fixture_effects TO qmenux_runtime');
  const effect=async(client:PoolClient,actor:{id:string})=>{assert.equal(actor.id,id);assert(Object.isFrozen(actor));await client.query('INSERT INTO qmenux_operator.step_up_fixture_effects VALUES($1)',[operation.requestId]);return true;};
  await owner.query("ALTER TABLE qmenux_operator.step_up_events ADD CONSTRAINT synthetic_consume_failure CHECK(kind<>'CONSUMED') NOT VALID");
  try{await assert.rejects(execute(verified,operation,effect),status(503));}finally{await owner.query('ALTER TABLE qmenux_operator.step_up_events DROP CONSTRAINT synthetic_consume_failure');}
  await assert.rejects(execute(verified,operation,async(client,actor)=>{await effect(client,actor);throw new Error('Synthetic transactional failure');}),status(503));
  assert.equal((await owner.query('SELECT count(*) FROM qmenux_operator.step_up_fixture_effects')).rows[0].count,'0');
  const outcomes=await Promise.allSettled(Array.from({length:4},()=>execute(verified,operation,effect)));
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
  for(const result of outcomes)if(result.status==='rejected')assert(status(403)(result.reason));
  assert.equal((await owner.query('SELECT count(*) FROM qmenux_operator.step_up_fixture_effects')).rows[0].count,'1');
  assert.deepEqual((await owner.query('SELECT kind,count(*) FROM qmenux_operator.step_up_events WHERE operator_id=$1 GROUP BY kind ORDER BY kind',[id])).rows,[{kind:'CONSUMED',count:'1'},{kind:'VERIFIED',count:'1'}]);
  const failed=await begin(),signed=await authenticate(failed),corrupt=structuredClone(signed) as {response:{signature:string}};
  corrupt.response.signature=Buffer.alloc(64).toString('base64url');
  await assert.rejects(finish(failed.challenge,corrupt),status(403));await assert.rejects(finish(failed.challenge,signed),status(403));
  options=await begin();reply=await authenticate(options);
  await owner.query("ALTER TABLE qmenux_operator.step_up_events ADD CONSTRAINT synthetic_verify_failure CHECK(kind<>'VERIFIED') NOT VALID");
  try{await assert.rejects(finish(options.challenge,reply),status(503));}finally{await owner.query('ALTER TABLE qmenux_operator.step_up_events DROP CONSTRAINT synthetic_verify_failure');}
  await assert.rejects(finish(options.challenge,reply),status(403));
  assert.equal((await owner.query('SELECT count(*) FROM qmenux_operator.step_up_proofs WHERE operator_id=$1',[id])).rows[0].count,'0');
  options=await begin();reply=await authenticate(options);
  await owner.query("UPDATE qmenux_operator.step_up_challenges SET expires_at=clock_timestamp()-interval '1 second' WHERE operator_id=$1",[id]);
  await assert.rejects(finish(options.challenge,reply),status(403));
  options=await begin();const token=await finish(options.challenge,await authenticate(options));
  await owner.query("UPDATE qmenux_operator.step_up_proofs SET expires_at=clock_timestamp()-interval '1 second' WHERE operator_id=$1",[id]);
  await assert.rejects(execute(token),status(403));
  options=await begin();const replaced=await finish(options.challenge,await authenticate(options));
  await begin();await assert.rejects(execute(replaced),status(403));
  const sessions=[pair];for(let index=0;index<4;index++)sessions.push(await authorization.signInBrowser(assertion(),passkeys.policy(proof,browser)));
  for(const session of sessions)await passkeys.beginStepUp(assertion(),browser,session.session,session.csrf,proof,operation);
  const sixth=await authorization.signInBrowser(assertion(),passkeys.policy(proof,browser));
  await assert.rejects(passkeys.beginStepUp(assertion(),browser,sixth.session,sixth.csrf,proof,operation),status(403));
  proof=await login();assert.equal((await owner.query('SELECT count(*) FROM qmenux_operator.step_up_challenges WHERE operator_id=$1',[id])).rows[0].count,'0');
  await assert.rejects(migrate('down'),code('P0001'));
  const provisioned=await exerciseApplicationReview(database,owner,passkeys,{assertion,browser,session:pair.session,csrf:pair.csrf,proof,operatorId:id},authenticate);
  options=await begin();const revoked=await finish(options.challenge,await authenticate(options));
  await authorization.signOutBrowser(assertion(),pair.session,pair.csrf,proof,browser);await assert.rejects(execute(revoked),status(403));
  for(const invalidation of ['operator','key']){
    proof=await login();const current=await authorization.signInBrowser(assertion(),passkeys.policy(proof,browser));
    const fresh=await passkeys.beginStepUp(assertion(),browser,current.session,current.csrf,proof,operation);
    const evidence=await passkeys.finishStepUp(assertion(),browser,current.session,current.csrf,proof,operation,fresh.challenge,await authenticate(fresh));
    if(invalidation==='operator')await owner.query("UPDATE qmenux_operator.operators SET status='SUSPENDED' WHERE id=$1",[id]);
    else await owner.query("UPDATE qmenux_operator.passkeys SET status='REVOKED' WHERE operator_id=$1",[id]);
    await assert.rejects(passkeys.runStepUp(assertion(),browser,current.session,current.csrf,proof,evidence,operation,async()=>true),status(403));
    assert.equal((await owner.query('SELECT count(*) FROM qmenux_operator.step_up_proofs WHERE operator_id=$1',[id])).rows[0].count,'0');
    if(invalidation==='operator')await owner.query("UPDATE qmenux_operator.operators SET status='ACTIVE' WHERE id=$1",[id]);
  }
  for(const table of ['step_up_challenges','step_up_proofs','step_up_events']){
    const metadata=(await owner.query("SELECT relrowsecurity,relforcerowsecurity,has_table_privilege('qmenux_runtime',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS allowed FROM pg_class WHERE oid=$1::regclass",[`qmenux_operator.${table}`])).rows[0];
    assert.deepEqual(metadata,{relrowsecurity:true,relforcerowsecurity:true,allowed:false});
    const client=await database.begin();try{await assert.rejects(client.query(`SELECT * FROM qmenux_operator.${table}`),code('42501'));await client.query('ROLLBACK');}finally{client.release();}
  }
  for(const query of ['UPDATE qmenux_operator.step_up_events SET occurred_at=now()','DELETE FROM qmenux_operator.step_up_events','TRUNCATE qmenux_operator.step_up_events']){
    await owner.query('BEGIN');try{await assert.rejects(owner.query(query),code('42501'));}finally{await owner.query('ROLLBACK');}
  }
  const functions=(await owner.query("SELECT p.proname,p.prosecdef,p.proconfig,has_function_privilege('qmenux_runtime',p.oid,'EXECUTE') AS runtime,EXISTS(SELECT FROM aclexplode(p.proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='qmenux_operator' AND p.proname LIKE 'step_up_%'")).rows;
  assert.equal(functions.length,5);for(const row of functions){assert.equal(row.public,false);assert.equal(row.runtime,row.proname!=='step_up_actor');assert.equal(row.prosecdef,true);assert.deepEqual(row.proconfig,['search_path=pg_catalog, pg_temp']);}
  await assert.rejects(migrate('down'),code('P0001'));
  await owner.query('DROP TABLE qmenux_operator.step_up_fixture_effects');
  return provisioned;

}
