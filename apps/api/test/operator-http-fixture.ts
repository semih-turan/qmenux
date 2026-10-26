import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { request } from 'node:http';
import { Module } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import { AdminAuthErrors } from '../src/admin-auth.controller.js';
import { OperatorProvisioningController } from '../src/operator-provisioning.controller.js';
import { TenantProvisioning } from '../src/tenant-provisioning.js';
import { OperatorReviewController } from '../src/operator-review.controller.js';
import { OperatorApplicationReview } from '../src/operator-application-review.js';
import { OperatorAuthController } from '../src/operator-auth.controller.js';
import { OperatorAuthorization } from '../src/operator-authorization.js';
import { OperatorPasskeys } from '../src/operator-passkeys.js';

type HttpResult={status:number;data:Record<string,unknown>;cache?:string;cookie?:string[]};
type Send=(action:string,body?:object|string,method?:string,headers?:Record<string,string|string[]>)=>Promise<HttpResult>;

export async function withOperatorHttp<T>(passkeys: OperatorPasskeys, authorization: OperatorAuthorization, assertion: () => string,
  browser: string, exercise:(send:Send,origin:string)=>Promise<T>,review?:OperatorApplicationReview,provisioning?:TenantProvisioning) {
  const env={...process.env}, key=randomBytes(32).toString('base64url');
  process.env.OPERATOR_BFF_ENABLED='true';process.env.OPERATOR_BFF_SECRET=key;
  if(review){process.env.OPERATOR_REVIEW_ENABLED='true';process.env.OPERATOR_REVIEW_SECRET=randomBytes(32).toString('base64url');}
  if(provisioning){process.env.OPERATOR_PROVISIONING_ENABLED='true';process.env.OPERATOR_PROVISIONING_SECRET=randomBytes(32).toString('base64url');}
  const provisionKey=process.env.OPERATOR_PROVISIONING_SECRET;
  const reviewKey=process.env.OPERATOR_REVIEW_SECRET;
  @Module({ controllers:[OperatorAuthController,...(review?[OperatorReviewController]:[]),...(provisioning?[OperatorProvisioningController]:[])],providers:[{provide:APP_FILTER,useClass:AdminAuthErrors},
    {provide:OperatorPasskeys,useValue:passkeys},{provide:OperatorAuthorization,useValue:authorization},...(review?[{provide:OperatorApplicationReview,useValue:review}]:[]),...(provisioning?[{provide:TenantProvisioning,useValue:provisioning}]:[])] })
  class FixtureModule {}
  const app=await NestFactory.create(FixtureModule,{logger:false,rawBody:true});app.setGlobalPrefix('v1');await app.listen(0,'127.0.0.1');
  const origin=await app.getUrl();
  const send:Send=(action,body={assertion:assertion(),browser},method='POST',headers={})=>
    new Promise<HttpResult>( (resolve,reject)=>{
      const payload=['GET','HEAD'].includes(method)?'':typeof body==='string'?body:JSON.stringify(body);
      const reviewing=action.startsWith('review/'),settingUp=action.startsWith('provisioning/');
      const path=settingUp?'operator-provisioning/'+action.slice('provisioning/'.length):reviewing?'operator-review/'+action.slice(7):'operator-auth/'+action;
      const req=request(`${origin}/v1/internal/${path}`,{method,headers:{authorization:`Bearer ${settingUp?provisionKey:reviewing?reviewKey:key}`,'content-type':'application/json','content-length':String(Buffer.byteLength(payload)),...headers}},res=>{
        let raw='';res.setEncoding('utf8');res.on('data',part=>{raw+=part;});res.on('end',()=>resolve({status:res.statusCode!,data:raw?JSON.parse(raw):{},cache:res.headers['cache-control'],cookie:res.headers['set-cookie']}));
      });req.on('error',reject);req.setTimeout(5000,()=>req.destroy(new Error('Operator HTTP test timeout')));req.end(payload);
    });
  try { return await exercise(send,origin); } finally {
    await app.close();for(const name of Object.keys(process.env))if(!(name in env))delete process.env[name];Object.assign(process.env,env);
  }
}

export async function exerciseOperatorHttp(passkeys: OperatorPasskeys, authorization: OperatorAuthorization, assertion: () => string,
  browser: string, authenticate: (options: Awaited<ReturnType<OperatorPasskeys['beginAuthentication']>>) => Promise<unknown>) {
  return withOperatorHttp(passkeys,authorization,assertion,browser,async send=>{
    const key=process.env.OPERATOR_BFF_SECRET!;
    for(const value of [undefined,'false','TRUE']) {
      if(value===undefined)delete process.env.OPERATOR_BFF_ENABLED;else process.env.OPERATOR_BFF_ENABLED=value;
      assert.equal((await send('authentication/start')).status,503);
    }
    process.env.OPERATOR_BFF_ENABLED='true';
    for(const value of [undefined,'short','é'.repeat(43)]) {
      if(value===undefined)delete process.env.OPERATOR_BFF_SECRET;else process.env.OPERATOR_BFF_SECRET=value;
      assert.equal((await send('authentication/start')).status,503);
    }
    process.env.OPERATOR_BFF_SECRET=key;
    process.env.VERCEL_ENV='preview';assert.equal((await send('authentication/start')).status,503);delete process.env.VERCEL_ENV;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';assert.equal((await send('authentication/start')).status,503);delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    for(const reused of ['ADMIN_BFF_SECRET','ADMIN_ONBOARDING_SECRET','CRON_SECRET']) {
      const before=process.env[reused];process.env[reused]=key;assert.equal((await send('authentication/start')).status,503);
      if(before===undefined)delete process.env[reused];else process.env[reused]=before;
    }
    for(const action of ['registration/start','registration/finish','authentication/start','authentication/finish','me','logout']) {
      for(const method of ['GET','HEAD','OPTIONS'])assert.equal((await send(action,{},method)).status,405,`${action}/${method}`);
      assert.equal((await send(action,{},'POST',{authorization:''})).status,401);
      assert.equal((await send(action,{assertion:assertion(),browser,tenant:'selected'})).status,400);
    }
    assert.equal((await send('authentication/start',`{"assertion":"${assertion()}","browser":"${browser}","browser":"${browser}"}`)).status,400);
    assert.equal((await send('authentication/start?target=other')).status,400);
    assert.equal((await send('authentication/start',{},'POST',{authorization:[`Bearer ${key}`,`Bearer ${key}`]})).status,401);
    for(const response of ['{','{"id":"a","id":"b"}','{"id": "a"}']) {
      assert.equal((await send('authentication/finish',{assertion:assertion(),browser,challenge:'c'.repeat(43),response})).status,400);
    }
    const credentials=async()=>{
      const started=await send('authentication/start');assert.equal(started.status,200);assert.equal(started.cache,'no-store');assert.equal(started.cookie,undefined);
      const options=started.data.options as Awaited<ReturnType<OperatorPasskeys['beginAuthentication']>>;
      const finished=await send('authentication/finish',{assertion:assertion(),browser,challenge:options.challenge,response:JSON.stringify(await authenticate(options))});
      assert.equal(finished.status,200);assert.equal(finished.cookie,undefined);
      for(const name of ['session','csrf','proof'])assert.match(finished.data[name] as string,/^[A-Za-z0-9_-]{43}$/);
      assert.equal(finished.data.expiresIn,900);assert.equal(finished.data.mfaExpiresIn,300);return finished.data;
    };
    const pair=await credentials();const body={assertion:assertion(),browser,session:pair.session,csrf:pair.csrf,proof:pair.proof};
    const me=await send('me',body);assert.equal(me.status,200);assert.equal((me.data.operator as {role:string}).role,'PLATFORM_ADMIN');
    assert.equal((await send('me',{...body,csrf:'x'.repeat(43)})).status,403);
    assert.equal((await send('logout',{...body,csrf:'x'.repeat(43)})).status,403);
    assert.equal((await send('me',body)).status,200);
    assert.equal((await send('logout',body)).status,200);assert.equal((await send('logout',body)).status,200);
    assert.equal((await send('me',body)).status,403);
    return (await credentials()).proof as string;
  });
}
