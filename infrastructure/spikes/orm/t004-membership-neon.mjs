import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { Client, Pool } from 'pg';
import { Database } from '../../../apps/api/dist/src/database.js';
import { exerciseMemberships } from '../../../apps/api/dist/test/membership-fixture.js';

const sql=(name)=>readFileSync(new URL(`../../database/${name}`,import.meta.url),'utf8');
const subjects=['qmenux-rbac-owner','qmenux-rbac-editor','qmenux-rbac-outsider'];
const tenants=[1,2,3].map(n=>`a0000000-0000-4000-8000-${String(n).padStart(12,'0')}`);
let owner,database,seeded=false;
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
  const limits={connectionTimeoutMillis:30000,query_timeout:10000,enableChannelBinding:true};
  owner=new Client({connectionString:process.env.DATABASE_DIRECT_URL,...limits});await owner.connect();
  stage='empty development preflight';
  assert.equal((await owner.query('SELECT count(*) FROM qmenux.tenants')).rows[0].count,'0');
  for(const table of ['users','external_identities','login_attempts','sessions']){
    assert.equal((await owner.query(`SELECT count(*) FROM qmenux_identity.${table}`)).rows[0].count,'0');
  }
  const versions=(await owner.query('SELECT version FROM qmenux.schema_migrations ORDER BY version')).rows.map(r=>r.version);
  const expected=['0001_tenant_catalog','0002_tenant_resolution','0003_identity_sessions','0004_tenant_memberships','0005_operator_sessions','0006_auth_expiry','0007_microsoft_identity','0008_apple_identity','0009_admin_audience'];
  assert([3,4,5,6,7,8,9].includes(versions.length));assert.deepEqual(versions,expected.slice(0,versions.length));
  stage='direct membership migration';
  if(versions.length===3){
    const up=sql('migrations/0004_tenant_memberships.up.sql'),down=sql('migrations/0004_tenant_memberships.down.sql');
    await owner.query('BEGIN');await owner.query(up);await owner.query('ROLLBACK');
    assert.equal((await owner.query("SELECT to_regclass('qmenux_identity.memberships') IS NULL AS absent")).rows[0].absent,true);
    await owner.query('BEGIN');await owner.query(up);await owner.query('COMMIT');
    await owner.query('BEGIN');await owner.query(down);await owner.query('COMMIT');
    await owner.query('BEGIN');await owner.query(up);await owner.query('COMMIT');
  }
  assert.equal((await owner.query('SELECT count(*) FROM qmenux_identity.memberships')).rows[0].count,'0');
  stage='synthetic catalog';
  await owner.query('BEGIN');await owner.query(sql('t003-fixture.sql'));await owner.query('COMMIT');seeded=true;
  database=new Database(new Pool({connectionString:process.env.DATABASE_URL,max:2,...limits}));
  stage='production authorization service and private HTTP fixture';
  // Same cases as root CI; allow bounded cross-region latency, never contact an IdP.
  await exerciseMemberships(database,owner,30000);
  stage='data-bearing rollback refusal';
  await owner.query('BEGIN');
  await assert.rejects(owner.query(sql('migrations/0004_tenant_memberships.down.sql')),e=>e.code==='P0001');
  await owner.query('ROLLBACK');
  console.log('PASS: tenant OWNER/EDITOR isolation, mandatory entitlement, private HTTP/RLS, revocation, 20 serial and 20 concurrent requests');
}catch(error){
  const line=error.stack?.match(/membership-fixture\.js:(\d+):\d+/)?.[1];
  const reason=error.message==='Membership test deadline'?'HTTP deadline':error.code==='ERR_ASSERTION'?'assertion':'operation';
  console.error(`FAIL: ${stage}; ${reason}${line?` at fixture line ${line}`:''}; details redacted`);process.exitCode=1;
}finally{
  if(database)try{await database.onModuleDestroy();}catch{process.exitCode=1;}
  if(owner){
    if(seeded)try{
      await owner.query('ROLLBACK');await owner.query('BEGIN');
      const users=(await owner.query('SELECT user_id FROM qmenux_identity.external_identities WHERE subject=ANY($1::text[])',[subjects])).rows.map(r=>r.user_id);
      await owner.query('DELETE FROM qmenux_identity.memberships WHERE user_id=ANY($1::uuid[])',[users]);
      await owner.query('DELETE FROM qmenux_identity.sessions WHERE user_id=ANY($1::uuid[])',[users]);
      await owner.query('DELETE FROM qmenux_identity.external_identities WHERE subject=ANY($1::text[])',[subjects]);
      await owner.query('DELETE FROM qmenux_identity.users WHERE id=ANY($1::uuid[])',[users]);
      for(const table of ['products','categories','menus','branches']){
        await owner.query(`DELETE FROM qmenux.${table} WHERE tenant_id=ANY($1::uuid[])`,[tenants]);
      }
      await owner.query('DELETE FROM qmenux.tenants WHERE id=ANY($1::uuid[])',[tenants]);
      for(const table of ['memberships','users','external_identities','login_attempts','sessions']){
        assert.equal((await owner.query(`SELECT count(*) FROM qmenux_identity.${table}`)).rows[0].count,'0');
      }
      assert.equal((await owner.query('SELECT count(*) FROM qmenux.tenants')).rows[0].count,'0');
      await owner.query('COMMIT');console.log('PASS: all synthetic memberships, identities and catalogs removed; migration 0004 retained');
    }catch{console.error('FAIL: fixture cleanup; inspect isolated development branch');process.exitCode=1;}
    await owner.end();
  }
}
