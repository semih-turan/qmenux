import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { Client, Pool } from 'pg';
import { Database } from '../../../apps/api/dist/src/database.js';
import { TenantTransactions } from '../../../apps/api/dist/src/tenant-transactions.js';

const a='a0000000-0000-4000-8000-000000000001';
const b='a0000000-0000-4000-8000-000000000002';
const ids=[a,b,'a0000000-0000-4000-8000-000000000003'];
const hosts=['t003-cafe-a.qmenux.com','t003-restaurant-b.qmenux.com'];
const sql=(name)=>readFileSync(new URL(`../../database/${name}`,import.meta.url),'utf8');
let owner;
let database;
let seeded=false;
let stage='configuration';
const status=(expected)=>(error)=>error.getStatus?.()===expected;

try {
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
  owner=new Client({connectionString:process.env.DATABASE_DIRECT_URL,...limits});
  await owner.connect();
  stage='development migration';
  assert.equal((await owner.query('SELECT count(*) FROM qmenux.tenants')).rows[0].count,'0');
  const versions=(await owner.query('SELECT version FROM qmenux.schema_migrations ORDER BY version')).rows.map(r=>r.version);
  if(versions.length===1){
    assert.deepEqual(versions,['0001_tenant_catalog']);
    const up=sql('migrations/0002_tenant_resolution.up.sql');
    const down=sql('migrations/0002_tenant_resolution.down.sql');
    await owner.query('BEGIN');await owner.query(up);await owner.query('ROLLBACK');
    assert.equal((await owner.query("SELECT to_regprocedure('qmenux.resolve_tenant_slug(text)') IS NULL AS absent")).rows[0].absent,true);
    await owner.query('BEGIN');await owner.query(up);await owner.query('COMMIT');
    await owner.query('BEGIN');await owner.query(down);await owner.query('COMMIT');
    await owner.query('BEGIN');await owner.query(up);await owner.query('COMMIT');
  }else assert.deepEqual(versions,versions.length===3
    ? ['0001_tenant_catalog','0002_tenant_resolution','0003_identity_sessions']
    : ['0001_tenant_catalog','0002_tenant_resolution']);
  stage='synthetic fixture';
  await owner.query('BEGIN');await owner.query(sql('t003-fixture.sql'));await owner.query('COMMIT');seeded=true;
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,...limits});
  database=new Database(pool);
  const transactions=new TenantTransactions(database);
  const own=async(c)=>(await c.query('SELECT tenant_id FROM qmenux.products')).rows;
  stage='authorization and RLS';
  assert.deepEqual(await transactions.run(hosts[0],async(t)=>t.id===a,own),[{tenant_id:a}]);
  await assert.rejects(transactions.run(hosts[1],async(t)=>t.id===a,own),status(403));
  for(const host of ['admin.qmenux.com','unknown.qmenux.com','t003-pending.qmenux.com']){
    await assert.rejects(transactions.run(host,async()=>true,own),status(404));
  }
  assert.deepEqual(await transactions.run(hosts[0],async()=>true,async(c)=>(await c.query('SELECT id FROM qmenux.products WHERE tenant_id=$1',[b])).rows),[]);
  assert.equal(await transactions.run(hosts[0],async()=>true,async(c)=>(await c.query('UPDATE qmenux.products SET name=$1 WHERE tenant_id=$2',['denied',b])).rowCount),0);
  await assert.rejects(transactions.run(hosts[0],async()=>true,async(c)=>{
    await c.query('INSERT INTO qmenux.products(tenant_id,id,category_id,name,price_minor) VALUES ($1,$2,$3,$4,$5)',
      [b,'e0000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000002','denied',0]);
  }),status(503));
  await assert.rejects(transactions.run(hosts[0],async()=>true,async(c)=>{
    await c.query('INSERT INTO qmenux.products(tenant_id,id,category_id,name,price_minor) VALUES ($1,$2,$3,$4,$5)',
      [a,'e0000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000001','rollback',0]);
    throw new Error('Synthetic rollback');
  }),status(503));
  assert.equal((await owner.query('SELECT count(*) FROM qmenux.products')).rows[0].count,'2');
  stage='reused and overlapping transactions';
  const backends=new Set();
  for(let i=0;i<20;i++){
    const result=await transactions.run(hosts[i%2],async()=>true,async(c)=>{
      backends.add((await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      return own(c);
    });
    assert.deepEqual(result,[{tenant_id:i%2===0?a:b}]);
  }
  let arrived=0;let open=()=>{};const gate=new Promise(resolve=>{open=resolve;});
  const timer=setTimeout(open,5000);
  try{
    const results=await Promise.all(hosts.map(host=>transactions.run(host,async()=>true,async(c)=>{
      arrived++;if(arrived===2)open();await gate;return own(c);
    })));
    assert.equal(arrived,2);assert.deepEqual(results,[[{tenant_id:a}],[{tenant_id:b}]]);
  }finally{clearTimeout(timer);}
  assert.equal((await pool.query("SELECT NULLIF(current_setting('app.tenant_id',true),'') AS tenant")).rows[0].tenant,null);
  console.log(JSON.stringify({result:'PASS',serialTransactions:20,observedBackends:backends.size,overlappingTransactions:2,productionTenantRoutes:0}));
}catch(error){
  console.error(`T003 Neon FAIL: ${stage} (${/^[0-9A-Z]{5}$/.test(error.code??'')?error.code:'CHECK_FAILED'}); details hidden`);
  process.exitCode=1;
}finally{
  await database?.onModuleDestroy();
  if(owner){
    try{
      await owner.query('ROLLBACK');
      if(seeded){
        await owner.query('BEGIN');
        for(const table of ['products','categories','menus','branches']) await owner.query(`DELETE FROM qmenux.${table} WHERE tenant_id=ANY($1::uuid[])`,[ids]);
        await owner.query('DELETE FROM qmenux.tenants WHERE id=ANY($1::uuid[])',[ids]);
        await owner.query('COMMIT');
        assert.equal((await owner.query('SELECT count(*) FROM qmenux.tenants')).rows[0].count,'0');
        console.log('Synthetic T003 data removed; migration retained: PASS');
      }
    }catch{console.error('T003 fixture cleanup failed; inspect development branch');process.exitCode=1;}
    await owner.end();
  }
}
