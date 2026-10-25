import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { Client, Pool } from 'pg';
import { Database } from '../../../apps/api/dist/src/database.js';
import { IdentityStore, secretHash } from '../../../apps/api/dist/src/identity-store.js';

const sql=(name)=>readFileSync(new URL(`../../database/migrations/0003_identity_sessions.${name}.sql`,import.meta.url),'utf8');
const secret=()=>randomBytes(32).toString('base64url');
const subject='qmenux-t004-synthetic-only';
const state=secret(),browser=secret(),verifier=secret(),nonce=secret();
let owner,database,ready=false;
let stage='configuration';
try{
  process.loadEnvFile(fileURLToPath(new URL('../../../.env.neon-development.local',import.meta.url)));
  process.loadEnvFile(fileURLToPath(new URL('../../../.env.neon-migration.local',import.meta.url)));
  for(const [key,role,pooled] of [['DATABASE_URL','qmenux_runtime',true],['DATABASE_DIRECT_URL','neondb_owner',false]]){
    const u=new URL(process.env[key]);
    assert.equal(u.hostname,`ep-bold-darkness-b8anifaq${pooled?'-pooler':''}.c-14.us-east-1.aws.neon.tech`);
    assert.equal(decodeURIComponent(u.username),role);assert.equal(u.pathname,'/neondb');assert(u.password);
    assert.equal(u.port,'');assert.equal(u.hash,'');
    assert.deepEqual([...u.searchParams],[['sslmode','verify-full'],['channel_binding','require']]);
  }
  assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
  const limits={connectionTimeoutMillis:10000,query_timeout:10000,enableChannelBinding:true};
  owner=new Client({connectionString:process.env.DATABASE_DIRECT_URL,...limits});await owner.connect();
  stage='direct migration';
  assert.equal((await owner.query('SELECT count(*) FROM qmenux.tenants')).rows[0].count,'0');
  const versions=(await owner.query('SELECT version FROM qmenux.schema_migrations ORDER BY version')).rows.map(r=>r.version);
  if(versions.length===2){
    assert.deepEqual(versions,['0001_tenant_catalog','0002_tenant_resolution']);
    await owner.query('BEGIN');await owner.query(sql('up'));await owner.query('ROLLBACK');
    assert.equal((await owner.query("SELECT to_regnamespace('qmenux_identity') IS NULL AS absent")).rows[0].absent,true);
    await owner.query('BEGIN');await owner.query(sql('up'));await owner.query('COMMIT');
    await owner.query('BEGIN');await owner.query(sql('down'));await owner.query('COMMIT');
    await owner.query('BEGIN');await owner.query(sql('up'));await owner.query('COMMIT');
  }else{
    assert([3,4,5,6,7,8,9].includes(versions.length));
    assert.deepEqual(versions,['0001_tenant_catalog','0002_tenant_resolution','0003_identity_sessions','0004_tenant_memberships','0005_operator_sessions','0006_auth_expiry','0007_microsoft_identity','0008_apple_identity','0009_admin_audience'].slice(0,versions.length));
  }
  for(const table of ['users','external_identities','login_attempts','sessions']){
    assert.equal((await owner.query(`SELECT count(*) FROM qmenux_identity.${table}`)).rows[0].count,'0');
  }
  ready=true;
  database=new Database(new Pool({connectionString:process.env.DATABASE_URL,max:2,...limits}));
  const store=new IdentityStore(database);
  stage='one-use browser-bound attempt';
  await store.begin(state,browser,verifier,nonce);
  assert.equal(await store.consume(state,secret()),undefined);
  const consumed=await Promise.all([store.consume(state,browser),store.consume(state,browser)]);
  assert.equal(consumed.filter(Boolean).length,1);
  assert.deepEqual(consumed.find(Boolean),{verifier,nonce});
  stage='hashed sessions, rotation and revocation';
  const first=secret(),second=secret();
  const uid=await store.createSession(subject,first);assert(uid);
  assert.deepEqual(await store.readSession(first),{id:uid,status:'REGISTERED'});
  assert.equal((await owner.query('SELECT token_hash FROM qmenux_identity.sessions')).rows[0].token_hash,secretHash(first));
  assert.equal(await store.createSession(subject,second,first),uid);
  assert.equal(await store.readSession(first),undefined);
  await owner.query("UPDATE qmenux_identity.users SET status='SUSPENDED' WHERE id=$1",[uid]);
  assert.equal(await store.readSession(second),undefined);
  assert.equal(await store.createSession(subject,secret()),null);
  await owner.query("UPDATE qmenux_identity.users SET status='REGISTERED' WHERE id=$1",[uid]);
  await store.revokeSession(second);assert.equal(await store.readSession(second),undefined);
  assert.equal((await owner.query('SELECT count(*) FROM qmenux.tenants')).rows[0].count,'0');
  console.log('PASS: development identity store; one-use race, hashed sessions, rotation, suspension, revocation; no tenant activation');
}catch{
  console.error(`FAIL: ${stage}; details redacted`);process.exitCode=1;
}finally{
  if(database)try{await database.onModuleDestroy();}catch{process.exitCode=1;}
  if(owner){
    if(ready)try{
      await owner.query('ROLLBACK');await owner.query('BEGIN');
      await owner.query('DELETE FROM qmenux_identity.sessions WHERE user_id IN (SELECT user_id FROM qmenux_identity.external_identities WHERE subject=$1)',[subject]);
      const users=(await owner.query('DELETE FROM qmenux_identity.external_identities WHERE subject=$1 RETURNING user_id',[subject])).rows;
      for(const {user_id} of users)await owner.query('DELETE FROM qmenux_identity.users WHERE id=$1',[user_id]);
      await owner.query('DELETE FROM qmenux_identity.login_attempts WHERE state_hash=$1',[secretHash(state)]);
      for(const table of ['users','external_identities','login_attempts','sessions']){
        assert.equal((await owner.query(`SELECT count(*) FROM qmenux_identity.${table}`)).rows[0].count,'0');
      }
      await owner.query('COMMIT');console.log('PASS: all synthetic identity fixtures removed; migration 0003 retained');
    }catch{console.error('FAIL: identity fixture cleanup; inspect development branch');process.exitCode=1;}
    await owner.end();
  }
}
