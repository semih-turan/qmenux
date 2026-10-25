import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { request, type IncomingMessage } from 'node:http';
import { Body, Controller, Get, Header, Module, NotFoundException, Param, Patch, Req } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Client } from 'pg';
import { readSecretCookie } from '../src/auth.controller.js';
import { Database } from '../src/database.js';
import { IdentityStore, secretHash } from '../src/identity-store.js';
import { TenantAuthorization } from '../src/tenant-authorization.js';
import { TenantTransactions } from '../src/tenant-transactions.js';

const a = 'a0000000-0000-4000-8000-000000000001';
const b = 'a0000000-0000-4000-8000-000000000002';
const productA = 'e0000000-0000-4000-8000-000000000001';
const productB = 'e0000000-0000-4000-8000-000000000002';
const hostA = 't003-cafe-a.qmenux.com';
const hostB = 't003-restaurant-b.qmenux.com';
const secret = () => randomBytes(32).toString('base64url');
const denied = (error: { getStatus?: () => number }) => error.getStatus?.() === 403;

// Used only by private local/isolated Neon tests with known synthetic fixtures.
export async function exerciseMemberships(database: Database, owner: Client, httpDeadlineMs = 5000): Promise<void> {
  const identities = new IdentityStore(database);
  const authorization = new TenantAuthorization(new TenantTransactions(database), identities);
  const initial = secret();
  const userId = await identities.createSession('qmenux-rbac-owner', initial);
  assert(userId);
  let worked = false;
  const work = async () => { worked = true; return true; };
  await assert.rejects(authorization.run(hostA, initial, 'catalog:read', async () => true, work), denied);
  assert.equal(worked, false);
  await owner.query('INSERT INTO qmenux_identity.memberships(tenant_id,user_id,role) VALUES ($1,$2,$3)', [a,userId,'OWNER']);
  assert.equal((await owner.query('SELECT status FROM qmenux_identity.memberships WHERE user_id=$1',[userId])).rows[0].status,'PENDING');
  assert.equal(await identities.readSession(initial),undefined);
  const pending = secret(); await identities.createSession('qmenux-rbac-owner',pending);
  await assert.rejects(authorization.run(hostA,pending,'catalog:read',async()=>true,work),denied);
  await owner.query("UPDATE qmenux_identity.memberships SET status='ACTIVE' WHERE user_id=$1",[userId]);
  assert.equal(await identities.readSession(pending),undefined);
  // Same user has different roles in two businesses; neither is a platform role.
  await owner.query("INSERT INTO qmenux_identity.memberships(tenant_id,user_id,role,status) VALUES ($1,$2,'EDITOR','ACTIVE')",[b,userId]);
  let ownerToken=secret();await identities.createSession('qmenux-rbac-owner',ownerToken);
  const editorId=await identities.createSession('qmenux-rbac-editor',secret());assert(editorId);
  await owner.query("INSERT INTO qmenux_identity.memberships(tenant_id,user_id,role,status) VALUES ($1,$2,'EDITOR','ACTIVE')",[a,editorId]);
  let editorToken=secret();await identities.createSession('qmenux-rbac-editor',editorToken);
  const outsiderToken=secret();await identities.createSession('qmenux-rbac-outsider',outsiderToken);
  const policy=async()=>true; // Test-only entitlement; no production license is fabricated.

  @Controller('authorization-probe')
  class ProbeController {
    @Get('products')
    @Header('Cache-Control','no-store')
    list(@Req() req: IncomingMessage) {
      return authorization.run(req.headers.host,readSecretCookie(req.headers.cookie,'__Host-qmenux_session'),'catalog:read',policy,
        async(client,tenant)=>({role:tenant.role,products:(await client.query('SELECT id FROM qmenux.products ORDER BY id')).rows}));
    }
    @Patch('products/:id')
    update(@Req() req: IncomingMessage,@Param('id') id:string,@Body() body:{name:string}) {
      return authorization.run(req.headers.host,readSecretCookie(req.headers.cookie,'__Host-qmenux_session'),'catalog:write',policy,
        async(client)=>{
          const row=(await client.query('UPDATE qmenux.products SET name=$1 WHERE id=$2 RETURNING id',[body.name,id])).rows[0];
          if(!row)throw new NotFoundException();return row;
        });
    }
    @Get('manage-membership')
    manage(@Req() req: IncomingMessage) {
      return authorization.run(req.headers.host,readSecretCookie(req.headers.cookie,'__Host-qmenux_session'),'membership:manage',policy,
        async(_client,tenant)=>({role:tenant.role}));
    }
  }
  @Module({controllers:[ProbeController]})
  class ProbeModule {}
  const app=await NestFactory.create(ProbeModule,{logger:false});await app.listen(0,'127.0.0.1');
  const origin=await app.getUrl();
  const send=(host:string,token:string|undefined,path='products',method='GET',headers:Record<string,string>={})=>
    new Promise<{status:number;body:unknown}>((resolve,reject)=>{
      const req=request(`${origin}/authorization-probe/${path}`,{method,headers:{host,'content-type':'application/json',
        ...(token?{cookie:`__Host-qmenux_session=${token}`}:{ }),...headers}},res=>{
        let text='';res.setEncoding('utf8');res.on('data',chunk=>{text+=chunk;});
        res.on('end',()=>{try{resolve({status:res.statusCode!,body:JSON.parse(text)});}catch(error){reject(error);}});
      });
      req.on('error',reject);req.setTimeout(httpDeadlineMs,()=>req.destroy(new Error('Membership test deadline')));
      req.end(method==='PATCH'?JSON.stringify({name:'Synthetic authorized edit',tenant_id:b,role:'OWNER',user_id:userId}):undefined);
    });
  try{
    assert.deepEqual(await send(hostA,ownerToken),{status:200,body:{role:'OWNER',products:[{id:productA}]}});
    assert.deepEqual(await send(hostB,ownerToken),{status:200,body:{role:'EDITOR',products:[{id:productB}]}});
    assert.equal((await send(hostA,ownerToken,'manage-membership')).status,200);
    assert.equal((await send(hostB,ownerToken,'manage-membership')).status,403);
    assert.equal((await send(hostA,editorToken,'manage-membership')).status,403);
    assert.equal((await send(hostB,editorToken)).status,403);
    assert.equal((await send(hostA,outsiderToken)).status,403);
    assert.equal((await send(hostA,undefined,'products','GET',{authorization:`Bearer ${ownerToken}`,'x-user-id':userId,'x-role':'OWNER'})).status,403);
    assert.deepEqual(await send(hostA,editorToken,`products?tenant_id=${b}`,'GET',{'x-tenant-id':b,'x-role':'OWNER','x-forwarded-host':hostB}),
      {status:200,body:{role:'EDITOR',products:[{id:productA}]}});
    assert.equal((await send('admin.qmenux.com',ownerToken)).status,404);
    assert.equal((await send('t003-pending.qmenux.com',ownerToken)).status,404);
    assert.equal((await send(hostA,editorToken,`products/${productB}`,'PATCH')).status,404);
    assert.equal((await send(hostA,editorToken,`products/${productA}`,'PATCH')).status,200);
    assert.notEqual((await owner.query('SELECT name FROM qmenux.products WHERE id=$1',[productB])).rows[0].name,'Synthetic authorized edit');
    worked=false;
    for(const token of [undefined,null,[],42,'invalid',secret()]){
      await assert.rejects(authorization.run(hostA,token,'catalog:write',policy,work),denied);
    }
    for(const permission of ['platform:admin','license:grant','menu:publish','toString','__proto__']){
      await assert.rejects(authorization.run(hostA,ownerToken,permission as never,policy,work),denied);
    }
    for(const entitlement of [undefined,async()=>false,async()=> 'true']){
      await assert.rejects(authorization.run(hostA,ownerToken,'catalog:write',entitlement as never,work),denied);
    }
    assert.equal(worked,false);
    await assert.rejects(authorization.run(hostA,ownerToken,'catalog:write',policy,async(client)=>{
      await client.query('UPDATE qmenux.products SET name=$1 WHERE id=$2',['rolled back',productA]);
      throw new Error('Synthetic failure');
    }),(error:{getResponse:()=>unknown})=>JSON.stringify(error.getResponse())==='{"status":"unavailable"}');
    assert.notEqual((await owner.query('SELECT name FROM qmenux.products WHERE id=$1',[productA])).rows[0].name,'rolled back');
    for(let i=0;i<20;i++){
      const expected=i%2===0?'OWNER':'EDITOR';
      const result:string=await authorization.run(i%2===0?hostA:hostB,ownerToken,'catalog:read',policy,async(client,tenant)=>{
        assert(Object.isFrozen(tenant));assert.equal(tenant.userId,userId);assert.equal(tenant.role,expected);
        assert.equal((await client.query("SELECT current_setting('app.tenant_id') AS id")).rows[0].id,tenant.id);
        return tenant.role;
      });assert.equal(result,expected);
    }
    const batch=await Promise.all(Array.from({length:20},(_,i)=>send(i%2===0?hostA:hostB,editorToken)));
    assert.deepEqual(batch.map(r=>r.status),Array.from({length:20},(_,i)=>i%2===0?200:403));
    const client=await database.begin();
    try{
      assert.deepEqual((await client.query('SELECT * FROM qmenux_identity.tenant_membership($1)',[secretHash(ownerToken)])).rows,[]);
      await client.query('ROLLBACK');
    }finally{client.release();}
    for(const query of ['SELECT * FROM qmenux_identity.memberships',
      "INSERT INTO qmenux_identity.memberships(tenant_id,user_id,role,status) VALUES ('a0000000-0000-4000-8000-000000000003','"+userId+"','OWNER','ACTIVE')",
      "UPDATE qmenux_identity.memberships SET role='OWNER'",'DELETE FROM qmenux_identity.memberships']){
      const c=await database.begin();
      try{await assert.rejects(c.query(query),(e:{code:string})=>e.code==='42501');}
      finally{await c.query('ROLLBACK');c.release();}
    }
    await owner.query("UPDATE qmenux_identity.memberships SET role='EDITOR' WHERE tenant_id=$1 AND user_id=$2",[a,userId]);
    assert.equal(await identities.readSession(ownerToken),undefined);
    assert.equal((await send(hostA,ownerToken)).status,403);
    ownerToken=secret();await identities.createSession('qmenux-rbac-owner',ownerToken);
    assert.equal((await send(hostA,ownerToken,'manage-membership')).status,403);
    for(const status of ['SUSPENDED','REVOKED']){
      await owner.query('UPDATE qmenux_identity.memberships SET status=$1 WHERE user_id=$2',[status,editorId]);
      assert.equal(await identities.readSession(editorToken),undefined);
      editorToken=secret();await identities.createSession('qmenux-rbac-editor',editorToken);
      assert.equal((await send(hostA,editorToken)).status,403);
    }
    await owner.query("UPDATE qmenux_identity.users SET status='SUSPENDED' WHERE id=$1",[userId]);
    assert.equal(await identities.readSession(ownerToken),undefined);
    await owner.query("UPDATE qmenux_identity.users SET status='REGISTERED' WHERE id=$1",[userId]);
    assert.equal((await send(hostA,ownerToken)).status,403);
    ownerToken=secret();await identities.createSession('qmenux-rbac-owner',ownerToken);
    await owner.query("UPDATE qmenux_identity.sessions SET expires_at=now()-interval '1 minute' WHERE token_hash=$1",[secretHash(ownerToken)]);
    assert.equal((await send(hostA,ownerToken)).status,403);
    await owner.query('DELETE FROM qmenux_identity.memberships WHERE user_id=$1',[userId]);
    assert.equal(await identities.readSession(ownerToken),undefined);
    const check=await owner.query(`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='qmenux_identity.memberships'::regclass`);
    assert.deepEqual(check.rows,[{relrowsecurity:true,relforcerowsecurity:true}]);
    const fn=await owner.query(`SELECT prosecdef,proconfig,
      has_function_privilege('qmenux_runtime',oid,'EXECUTE') AS runtime_execute,
      EXISTS(SELECT FROM aclexplode(proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS public_execute
      FROM pg_proc WHERE oid='qmenux_identity.tenant_membership(text)'::regprocedure`);
    assert.deepEqual(fn.rows,[{prosecdef:true,proconfig:['search_path=pg_catalog, pg_temp'],runtime_execute:true,public_execute:false}]);
  }finally{await app.close();}
}
