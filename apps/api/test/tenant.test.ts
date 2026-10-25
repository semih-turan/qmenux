import 'reflect-metadata';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { request, type IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Body, Controller, Get, Header, Module, NotFoundException, Param, Patch, Req } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Client, Pool } from 'pg';
import { Database } from '../src/database.js';
import { tenantSlug, TenantTransactions } from '../src/tenant-transactions.js';
import { exerciseAuth } from './auth-fixture.js';
import { exerciseMemberships } from './membership-fixture.js';
import { exerciseOperators } from './operator-fixture.js';
import { exerciseAuthExpiry } from './auth-expiry-fixture.js';
import { exerciseMicrosoftIdentity } from './microsoft-identity-fixture.js';
import { exerciseAppleIdentity } from './apple-identity-fixture.js';
import { exerciseAdminTenant } from './admin-tenant-fixture.js';
import { exerciseDraftCatalog } from './draft-catalog-fixture.js';
import { exerciseAdminAudience } from './admin-audience-fixture.js';

const a = 'a0000000-0000-4000-8000-000000000001';
const b = 'a0000000-0000-4000-8000-000000000002';
const productA = 'e0000000-0000-4000-8000-000000000001';
const productB = 'e0000000-0000-4000-8000-000000000002';
const hostA = 't003-cafe-a.qmenux.com';
const hostB = 't003-restaurant-b.qmenux.com';
const sql = (file: string) => readFileSync(new URL(`../../../../infrastructure/database/${file}`, import.meta.url), 'utf8');

test('canonical tenant hostname parsing rejects spoofing, reserved and ambiguous hosts', () => {
  assert.equal(tenantSlug(hostA.toUpperCase()), 't003-cafe-a');
  for (const host of [undefined, null, [hostA], '', 'qmenux.com', 'localhost', 'qmenux-api.vercel.app',
    ...['admin','superman','api','www','auth','assets','qmenux','workspace','control'].map((s) => `${s}.qmenux.com`),
    'xn--test.qmenux.com', 'a.b.qmenux.com', `${hostA}.evil.test`, `${hostA}:443`, `${hostA}.`,
    `https://${hostA}`, `user@${hostA}`, ` ${hostA}`, `${hostA},${hostB}`, 'Kafe.qmenux.com',
    'café.qmenux.com', `a\r\n${hostA}`, '-a.qmenux.com', 'a-.qmenux.com', `${'a'.repeat(64)}.qmenux.com`]) {
    assert.throws(() => tenantSlug(host), NotFoundException);
  }
});

test('HTTP authorization, draft catalog audit, application-schema RLS and pooled tenant cleanup', { timeout: 60000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qmenux-t003-'));
  const socket = join(dir, 'socket');
  mkdirSync(socket, { mode: 0o700 });
  const env: NodeJS.ProcessEnv = { ...process.env, PGHOST: socket, PGPORT: '5432', PGUSER: 'neondb_owner', PGDATABASE: 'neondb' };
  for (const name of ['PGOPTIONS','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGPASSWORD','PGHOSTADDR']) delete env[name];
  const command = (name: string, args: string[], input?: string) => execFileSync(name, args, { env, input, stdio: ['pipe','pipe','pipe'] });
  let started = false;
  let owner: Client | undefined;
  let database: Database | undefined;
  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;
  try {
    command('initdb', ['-D',join(dir,'data'),'-U','qmenux_test_owner','--auth=trust','--no-locale','--encoding=UTF8']);
    command('pg_ctl', ['-D',join(dir,'data'),'-l',join(dir,'server.log'),'-o',`-c listen_addresses='' -k '${socket}'`,'start']);
    started = true;
    command('createdb', ['-U','qmenux_test_owner','neondb']);
    command('psql', ['-X','-v','ON_ERROR_STOP=1','-U','qmenux_test_owner'], `
      CREATE ROLE neondb_owner LOGIN CREATEROLE BYPASSRLS;
      CREATE ROLE qmenux_runtime LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
      ALTER DATABASE neondb OWNER TO neondb_owner;`);
    owner = new Client({ host: socket, port: 5432, user: 'neondb_owner', database: 'neondb' });
    await owner.connect();
    for (const version of ['0001_tenant_catalog', '0002_tenant_resolution']) {
      await owner.query('BEGIN');
      await owner.query(sql(`migrations/${version}.up.sql`));
      await owner.query('COMMIT');
    }
    await owner.query('BEGIN');
    await assert.rejects(owner.query(sql('migrations/0002_tenant_resolution.up.sql')), (e: {code:string}) => e.code === 'P0001');
    await owner.query('ROLLBACK');
    await owner.query('BEGIN');
    await owner.query(sql('migrations/0002_tenant_resolution.down.sql'));
    await owner.query('COMMIT');
    assert.equal((await owner.query("SELECT to_regprocedure('qmenux.resolve_tenant_slug(text)') IS NULL AS absent")).rows[0].absent,true);
    await owner.query('BEGIN');
    await owner.query(sql('migrations/0002_tenant_resolution.up.sql'));
    await owner.query('COMMIT');
    await owner.query(sql('t003-fixture.sql'));
    const functionCheck = await owner.query(`SELECT prosecdef, proconfig,
      has_function_privilege('qmenux_runtime',oid,'EXECUTE') AS runtime_execute,
      EXISTS (SELECT FROM aclexplode(proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS public_execute
      FROM pg_proc WHERE oid='qmenux.resolve_tenant_slug(text)'::regprocedure`);
    assert.deepEqual(functionCheck.rows, [{ prosecdef: true, proconfig: ['search_path=pg_catalog, pg_temp'], runtime_execute: true, public_execute: false }]);
    const pool = new Pool({ host: socket, port: 5432, user: 'qmenux_runtime', database: 'neondb', max: 2,
      connectionTimeoutMillis: 2000, query_timeout: 5000 });
    database = new Database(pool);
    const transactions = new TenantTransactions(database);

    // Test-only trusted principal A. This controller is never part of AppModule.
    @Controller('probe/products')
    class ProbeController {
      @Get()
      @Header('Cache-Control','no-store')
      list(@Req() req: IncomingMessage) {
        return transactions.run(req.headers.host, async (t) => t.id === a,
          async (c) => (await c.query('SELECT id FROM qmenux.products ORDER BY id')).rows);
      }
      @Get(':id')
      get(@Req() req: IncomingMessage, @Param('id') id: string) {
        return transactions.run(req.headers.host, async (t) => t.id === a, async (c) => {
          const row = (await c.query('SELECT id FROM qmenux.products WHERE id=$1',[id])).rows[0];
          if (!row) throw new NotFoundException();
          return row;
        });
      }
      @Patch(':id')
      update(@Req() req: IncomingMessage, @Param('id') id: string, @Body() body: { name: string }) {
        return transactions.run(req.headers.host, async (t) => t.id === a, async (c) => {
          const row = (await c.query('UPDATE qmenux.products SET name=$1 WHERE id=$2 RETURNING id',[body.name,id])).rows[0];
          if (!row) throw new NotFoundException();
          return row;
        });
      }
    }
    @Module({ controllers: [ProbeController] })
    class FixtureModule {}
    app = await NestFactory.create(FixtureModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    const send = (host: string, path = '', headers: Record<string,string> = {}, method = 'GET', body?: unknown) =>
      new Promise<{ status: number; body: unknown }>((resolve, reject) => {
        const r = request(`${origin}/probe/products${path}`, { method, headers: { host, 'content-type':'application/json', ...headers } }, (res) => {
          let text = ''; res.setEncoding('utf8'); res.on('data',(chunk: string) => { text += chunk; });
          res.on('end',() => { try { resolve({ status: res.statusCode!, body: JSON.parse(text) }); } catch (e) { reject(e); } });
        });
        r.on('error',reject); r.setTimeout(5000,() => r.destroy(new Error('HTTP test timeout')));
        r.end(body === undefined ? undefined : JSON.stringify(body));
      });
    assert.deepEqual(await send(hostA), { status:200, body:[{id:productA}] });
    assert.deepEqual(await send(hostA,`?tenant_id=${b}`,{'x-tenant-id':b,'x-forwarded-host':hostB,'forwarded':`host=${hostB}`}),
      { status:200, body:[{id:productA}] });
    assert.equal((await send(hostB,'',{'x-tenant-id':a,'x-forwarded-host':hostA})).status,403);
    for (const host of ['admin.qmenux.com','qmenux-api.vercel.app','unknown.qmenux.com','t003-pending.qmenux.com']) {
      assert.equal((await send(host,'',{'x-forwarded-host':hostA})).status,404);
    }
    assert.equal((await send(hostA,`/${productB}`)).status,404);
    assert.equal((await send(hostA,`/${productB}`,{},'PATCH',{name:'denied',tenant_id:b})).status,404);
    assert.deepEqual((await owner.query('SELECT name FROM qmenux.products WHERE id=$1',[productB])).rows,[{name:'Synthetic draft B'}]);
    assert.equal((await send(hostA,`/${productA}`,{},'PATCH',{name:'Allowed synthetic update',tenant_id:b})).status,200);

    let called = false;
    await assert.rejects(transactions.run(hostA,undefined as never,async () => { called=true; }), (e: {getStatus:()=>number}) => e.getStatus() === 403);
    await assert.rejects(transactions.run(hostA,async () => false,async () => { called=true; }), (e: {getStatus:()=>number}) => e.getStatus() === 403);
    assert.equal(called,false);
    const unsafePool=new Pool({host:socket,port:5432,user:'neondb_owner',database:'neondb'});
    const unsafe=new Database(unsafePool);
    try { await assert.rejects(unsafe.begin(),(e:{getStatus:()=>number})=>e.getStatus()===503); }
    finally { await unsafe.onModuleDestroy(); }
    await assert.rejects(transactions.run(hostA,async () => true,async (c) => {
      await c.query('INSERT INTO qmenux.products(tenant_id,id,category_id,name,price_minor) VALUES ($1,$2,$3,$4,$5)',
        [a,'e0000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000001','rollback',0]);
      throw new Error('Synthetic internal SQL/parameter error');
    }), (e: {getResponse:()=>unknown}) => JSON.stringify(e.getResponse()) === '{"status":"unavailable"}');
    assert.equal((await owner.query("SELECT count(*) FROM qmenux.products WHERE name='rollback'")).rows[0].count,'0');
    const backends = new Set<number>();
    for (let i=0;i<20;i++) {
      const expected=i%2===0?a:b;
      const result=await transactions.run(i%2===0?hostA:hostB,async (t)=>t.id===expected,async (c)=>{
        backends.add((await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
        return (await c.query('SELECT tenant_id FROM qmenux.products')).rows;
      });
      assert.deepEqual(result,[{tenant_id:expected}]);
    }
    assert.equal(backends.size,1);
    let arrived=0; let open=()=>{};
    const gate=new Promise<void>((resolve)=>{open=resolve;});
    const timer=setTimeout(open,3000);
    try {
      const results=await Promise.all([hostA,hostB].map((host)=>transactions.run(host,async()=>true,async(c)=>{
        arrived++;if(arrived===2)open();await gate;
        return (await c.query('SELECT tenant_id FROM qmenux.products')).rows;
      })));
      assert.equal(arrived,2);
      assert.deepEqual(results,[[{tenant_id:a}],[{tenant_id:b}]]);
    } finally {clearTimeout(timer);}
    assert.equal((await pool.query("SELECT NULLIF(current_setting('app.tenant_id',true),'') AS tenant")).rows[0].tenant,null);
    const batch=await Promise.all(Array.from({length:20},(_,i)=>send(i%2===0?hostA:hostB)));
    assert(batch.every((r,i)=>i%2===0?r.status===200&&JSON.stringify(r.body)===JSON.stringify([{id:productA}]):r.status===403));
    await owner.query('BEGIN');
    await owner.query(sql('migrations/0003_identity_sessions.up.sql'));
    await owner.query('ROLLBACK');
    assert.equal((await owner.query("SELECT to_regnamespace('qmenux_identity') IS NULL AS absent")).rows[0].absent,true);
    await owner.query('BEGIN');
    await owner.query(sql('migrations/0003_identity_sessions.up.sql'));
    await owner.query('COMMIT');
    await owner.query('BEGIN');
    await owner.query(sql('migrations/0003_identity_sessions.down.sql'));
    await owner.query('COMMIT');
    await owner.query('BEGIN');
    await owner.query(sql('migrations/0003_identity_sessions.up.sql'));
    await owner.query('COMMIT');
    await exerciseAuth(database, owner);
    await owner.query('BEGIN');
    await assert.rejects(owner.query(sql('migrations/0003_identity_sessions.down.sql')), (e: {code:string})=>e.code==='P0001');
    await owner.query('ROLLBACK');
    await owner.query('BEGIN');
    await owner.query(sql('migrations/0004_tenant_memberships.up.sql'));
    await owner.query('ROLLBACK');
    assert.equal((await owner.query("SELECT to_regclass('qmenux_identity.memberships') IS NULL AS absent")).rows[0].absent,true);
    await owner.query('BEGIN');
    await owner.query(sql('migrations/0004_tenant_memberships.up.sql'));
    await owner.query('COMMIT');
    await owner.query('BEGIN');
    await owner.query(sql('migrations/0004_tenant_memberships.down.sql'));
    await owner.query('COMMIT');
    await owner.query('BEGIN');
    await owner.query(sql('migrations/0004_tenant_memberships.up.sql'));
    await owner.query('COMMIT');
    await exerciseMemberships(database,owner);
    await owner.query('BEGIN');
    await assert.rejects(owner.query(sql('migrations/0004_tenant_memberships.down.sql')), (e:{code:string})=>e.code==='P0001');
    await owner.query('ROLLBACK');
    const operatorUp = sql('migrations/0005_operator_sessions.up.sql');
    const operatorDown = sql('migrations/0005_operator_sessions.down.sql');
    await owner.query('BEGIN'); await owner.query(operatorUp); await owner.query('ROLLBACK');
    assert.equal((await owner.query("SELECT to_regnamespace('qmenux_operator') IS NULL AS absent")).rows[0].absent, true);
    await owner.query('BEGIN'); await owner.query(operatorUp); await owner.query('COMMIT');
    await owner.query('BEGIN'); await owner.query(operatorDown); await owner.query('COMMIT');
    await owner.query('BEGIN'); await owner.query(operatorUp); await owner.query('COMMIT');
    await owner.query('BEGIN');
    await assert.rejects(owner.query(operatorUp), (e: { code: string }) => e.code === 'P0001');
    await owner.query('ROLLBACK');
    await exerciseOperators(database, owner);
    await owner.query('BEGIN');
    await assert.rejects(owner.query(operatorDown), (e: { code: string }) => e.code === 'P0001');
    await owner.query('ROLLBACK');
    const expiryUp = sql('migrations/0006_auth_expiry.up.sql');
    await owner.query('BEGIN'); await owner.query(expiryUp); await owner.query('ROLLBACK');
    assert.equal((await owner.query("SELECT to_regprocedure('qmenux_identity.cleanup_expired()') IS NULL AS absent")).rows[0].absent, true);
    await owner.query('BEGIN'); await owner.query(expiryUp); await owner.query('COMMIT');
    await owner.query('BEGIN');
    await assert.rejects(owner.query(expiryUp), (e: { code: string }) => e.code === 'P0001');
    await owner.query('ROLLBACK');
    await exerciseAuthExpiry(database, owner);
    await exerciseMicrosoftIdentity(database, owner);
    await exerciseAuth(database, owner, 'microsoft');
    await exerciseAuthExpiry(database, owner);
    await exerciseAppleIdentity(database, owner);
    await exerciseAuth(database, owner, 'apple');
    await exerciseMicrosoftIdentity(database, owner);
    await exerciseAuthExpiry(database, owner);
    await exerciseAdminAudience(database, owner);
    await exerciseAppleIdentity(database, owner);
    await exerciseMicrosoftIdentity(database, owner);
    for (const provider of ['google','microsoft','apple'] as const) await exerciseAuth(database, owner, provider);
    await exerciseAuthExpiry(database, owner);
    await exerciseDraftCatalog(database, owner);
    await exerciseAdminTenant(database, owner);
  } finally {
    await app?.close();
    await database?.onModuleDestroy();
    await owner?.end();
    if(started)command('pg_ctl',['-D',join(dir,'data'),'stop','-m','fast']);
    rmSync(dir,{recursive:true,force:true});
  }
});
