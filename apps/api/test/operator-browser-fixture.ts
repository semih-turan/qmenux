/// <reference lib="dom" />
import assert from 'node:assert/strict';
import type { Browser } from '@playwright/test';
import type { Client } from 'pg';
import { tsImport } from 'tsx/esm/api';
import { OperatorAuthorization } from '../src/operator-authorization.js';
import { OperatorPasskeys } from '../src/operator-passkeys.js';
import { withOperatorHttp } from './operator-http-fixture.js';

export async function exerciseOperatorBrowser(passkeys:OperatorPasskeys,authorization:OperatorAuthorization,
  assertion:()=>string,browser:Browser,owner:Client,id:string,grant:string,nativeFetch:typeof fetch) {
  // Load the real sibling BFF with installed test tooling, without changing application compilation or routing.
  const {handleOperatorAuth}=await tsImport(new URL('../../../superadmin-pwa/src/lib/operator-auth.ts',import.meta.url).href,import.meta.url) as
    {handleOperatorAuth:(request:Request)=>Promise<Response>};
  await withOperatorHttp(passkeys,authorization,assertion,'unused',async(_send,apiOrigin)=>{
    const previousFetch=globalThis.fetch;
    const context=await browser.newContext();
    let apiCalls=0,failLogout=false;
    globalThis.fetch=async(input,init)=>{
      const url=new URL(String(input));
      if(url.origin!=='https://api.qmenux.com')return previousFetch(input,init);
      assert(url.pathname.startsWith('/v1/internal/operator-auth/'));assert.equal(init?.redirect,'error');
      apiCalls++;
      if(failLogout&&url.pathname.endsWith('/logout'))throw new Error('Synthetic network interruption');
      return nativeFetch(`${apiOrigin}${url.pathname}`,init);
    };
    try {
      const page=await context.newPage();
      await page.route('https://superman.qmenux.com/**',async route=>{
        const incoming=route.request();
        if(!incoming.url().includes('/api/operator/')){await route.fulfill({contentType:'text/html',body:'<main>Combined operator fixture</main>'});return;}
        const response=await handleOperatorAuth(new Request(incoming.url(),{method:incoming.method(),
          headers:{...await incoming.allHeaders(),host:'superman.qmenux.com','cf-access-jwt-assertion':assertion()},
          ...(incoming.postData()?{body:incoming.postData()}:{} )}));
        const headers:Record<string,string>={};response.headers.forEach((value,name)=>{headers[name]=value;});
        if(response.headers.getSetCookie().length)headers['set-cookie']=response.headers.getSetCookie().join('\n');
        await route.fulfill({status:response.status,headers,body:await response.text()});
      });
      await page.goto('https://superman.qmenux.com');
      const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');
      await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,
        hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
      const call=(action:string,body?:object,csrf?:string)=>page.evaluate(async({action,body,csrf})=>{
        const token=csrf??document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('__Host-qmenux_operator_csrf='))?.split('=')[1];
        const response=await fetch(`/api/operator/${action}`,body?{method:'POST',headers:{'Content-Type':'application/json','X-QMenuX-Request':'1',...(token?{'X-CSRF-Token':token}:{})},body:JSON.stringify(body)}:{});
        return {status:response.status,data:await response.json(),cache:response.headers.get('cache-control')};
      },{action,body,csrf});
      const count=async(table:string)=>(await owner.query(`SELECT count(*) FROM qmenux_operator.${table} WHERE operator_id=$1`,[id])).rows[0].count;
      const start=await call('registration/start',{grant});assert.equal(start.status,200);assert.equal(start.cache,'no-store');
      const registration=await page.evaluate(async options=>{
        const credential=await navigator.credentials.create({publicKey:PublicKeyCredential.parseCreationOptionsFromJSON(options)});
        return JSON.stringify((credential as PublicKeyCredential).toJSON());
      },start.data.options);
      const registered=await call('registration/finish',{response:registration});
      assert.equal(registered.status,200);assert.deepEqual(registered.data,{status:'registered'});
      assert.equal(await count('sessions'),'0');assert.equal(await count('passkey_proofs'),'0');
      assert.equal((await context.cookies()).some(cookie=>cookie.name==='__Host-qmenux_operator_session'),false);
      assert.equal((await owner.query('SELECT consumed_at IS NOT NULL AS spent FROM qmenux_operator.passkey_grants WHERE operator_id=$1',[id])).rows[0].spent,true);
      assert.equal((await call('registration/finish',{response:registration})).status,401);
      const authenticate=async()=>{
        const started=await call('authentication/start',{});assert.equal(started.status,200);
        const response=await page.evaluate(async options=>{
          const credential=await navigator.credentials.get({publicKey:PublicKeyCredential.parseRequestOptionsFromJSON(options)});
          return JSON.stringify((credential as PublicKeyCredential).toJSON());
        },started.data.options);
        const finished=await call('authentication/finish',{response});
        assert.equal(finished.status,200);assert.deepEqual(finished.data,{status:'signed_in'});
        assert.equal((await call('authentication/finish',{response})).status,401);
      };
      await authenticate();
      assert.equal(await count('sessions'),'1');assert.equal(await count('passkey_proofs'),'1');
      const me=await call('me');assert.equal(me.status,200);assert.deepEqual(me.data,{operator:{id,role:'PLATFORM_ADMIN'}});
      const cookies=await context.cookies();
      for(const cookie of cookies){assert.equal(cookie.domain,'superman.qmenux.com');assert.equal(cookie.secure,true);assert.equal(cookie.sameSite,'Strict');assert.equal(cookie.httpOnly,cookie.name!=='__Host-qmenux_operator_csrf');}
      assert.match(await page.evaluate(()=>document.cookie),/^__Host-qmenux_operator_csrf=[A-Za-z0-9_-]{43}$/);
      assert.equal((await context.cookies('https://admin.qmenux.com')).length,0);assert.equal((await context.cookies('https://api.qmenux.com')).length,0);
      assert.equal((await call('logout',{},'x'.repeat(43))).status,400);assert.equal((await call('me')).status,200);
      const csrfCookie=cookies.find(cookie=>cookie.name==='__Host-qmenux_operator_csrf')!;
      await context.addCookies([{...csrfCookie,value:'x'.repeat(43)}]);
      assert.equal((await call('me')).status,403);assert.equal((await call('logout',{})).status,403);
      assert.equal(await count('sessions'),'1');assert.equal(await count('passkey_proofs'),'1');
      await context.addCookies([csrfCookie]);assert.equal((await call('me')).status,200);
      const beforeLogout=await context.cookies();
      failLogout=true;assert.equal((await call('logout',{})).status,503);failLogout=false;
      assert.deepEqual(await context.cookies(),beforeLogout);assert.equal((await call('me')).status,200);

      await owner.query("UPDATE qmenux_operator.passkey_proofs SET expires_at=clock_timestamp()-interval '1 second' WHERE operator_id=$1",[id]);
      assert.equal((await call('me')).status,403);
      const logout=await call('logout',{});assert.equal(logout.status,200);assert.deepEqual(logout.data,{status:'signed_out'});
      assert.equal((await context.cookies()).length,0);assert.equal(await count('passkey_proofs'),'0');
      assert.equal(await count('sessions'),'0');
      assert.equal((await call('me')).status,401);
      await authenticate();assert.equal((await call('me')).status,200);
      await owner.query("UPDATE qmenux_operator.operators SET status='SUSPENDED' WHERE id=$1",[id]);
      assert.equal((await call('me')).status,403);assert.equal(await count('passkey_proofs'),'0');
      assert(apiCalls>=12);
    }finally{globalThis.fetch=previousFetch;await context.close();}
  });
}
