import { expect, test } from '@playwright/test';
import { handleOperatorAuth } from '../apps/superadmin-pwa/src/lib/operator-auth';

const origin='https://superman.qmenux.com', key='k'.repeat(43), browser='b'.repeat(43), csrf='c'.repeat(43), challenge='a'.repeat(42)+'A';
const session='s'.repeat(43), proof='p'.repeat(43), newCsrf='n'.repeat(43), jwt='signed.access.assertion';
const options={challenge,timeout:60000,rpId:'superman.qmenux.com',userVerification:'required',allowCredentials:[{id:'Y3JlZGVudGlhbA',type:'public-key'}]};
const operator={id:'00000000-0000-4000-8000-000000000001',role:'PLATFORM_ADMIN'};
const cookies=`__Host-qmenux_operator_browser=${browser}; __Host-qmenux_operator_csrf=${csrf}`;
const full=`${cookies}; __Host-qmenux_operator_session=${session}; __Host-qmenux_operator_mfa=${proof}`;
const envNames=['OPERATOR_BFF_ENABLED','OPERATOR_PASSKEY_ENABLED','OPERATOR_BFF_SECRET','ADMIN_BFF_SECRET','ADMIN_ONBOARDING_SECRET','CRON_SECRET','VERCEL_ENV','NODE_TLS_REJECT_UNAUTHORIZED'] as const;
const saved=Object.fromEntries(envNames.map(name=>[name,process.env[name]])), originalFetch=globalThis.fetch;
let calls:{url:string;init?:RequestInit}[];let upstream:()=>Response;
function request(action:string,body='{}',headers:Record<string,string>={},method=action==='me'?'GET':'POST') {
  return new Request(`${origin}/api/operator/${action}`,{method,headers:{host:'superman.qmenux.com',origin,'cf-access-jwt-assertion':jwt,'content-type':'application/json','x-qmenux-request':'1',...headers},...(method==='GET'||method==='HEAD'?{}:{body})});
}
test.beforeEach(()=>{
  process.env.OPERATOR_BFF_ENABLED='true';process.env.OPERATOR_PASSKEY_ENABLED='true';process.env.OPERATOR_BFF_SECRET=key;
  delete process.env.VERCEL_ENV;delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  calls=[];upstream=()=>Response.json({options});
  globalThis.fetch=(async(input,init)=>{calls.push({url:String(input),init});return upstream();}) as typeof fetch;
});
test.afterEach(()=>{globalThis.fetch=originalFetch;for(const name of envNames){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}});

test('operator BFF denies gates, purpose reuse, bad hosts, methods, assertions and forged browser authority before API calls',async()=>{
  for(const [name,value] of [['OPERATOR_BFF_ENABLED','false'],['OPERATOR_PASSKEY_ENABLED','false'],['OPERATOR_BFF_SECRET','bad'],['ADMIN_BFF_SECRET',key],['ADMIN_ONBOARDING_SECRET',key],['CRON_SECRET',key],['VERCEL_ENV','preview'],['NODE_TLS_REJECT_UNAUTHORIZED','0']] as const) {
    const prior=process.env[name];process.env[name]=value;expect((await handleOperatorAuth(request('authentication/start'))).status).toBe(503);
    if(prior===undefined)delete process.env[name];else process.env[name]=prior;
  }
  for(const method of ['GET','HEAD','OPTIONS','PUT'])expect((await handleOperatorAuth(request('authentication/start','{}',{},method))).status).toBe(405);
  for(const extra of [{host:'admin.qmenux.com'},{origin:'https://admin.qmenux.com'},{'x-qmenux-request':'1, 1'},{'content-encoding':'gzip'}] as Record<string,string>[])expect((await handleOperatorAuth(request('authentication/start','{}',extra))).status).toBe(400);
  expect((await handleOperatorAuth(request('authentication/start','{}',{'cf-access-jwt-assertion':''}))).status).toBe(401);
  expect((await handleOperatorAuth(request('authentication/start','{}',{cookie:cookies}))).status).toBe(400);
  expect((await handleOperatorAuth(request('authentication/start','{"assertion":"selected"}'))).status).toBe(400);
  expect((await handleOperatorAuth(request('me','{}',{cookie:`__Host-qmenux_admin_session=${session}`}))).status).toBe(401);
  expect((await handleOperatorAuth(request('approve'))).status).toBe(404);expect(calls).toHaveLength(0);
});

test('operator BFF validates options and turns confirmed credentials into isolated host cookies only',async()=>{
  const start=await handleOperatorAuth(request('authentication/start'));
  expect(start.status).toBe(200);expect(await start.json()).toEqual({options});
  const binding=start.cookies.get('__Host-qmenux_operator_browser')!.value, initialCsrf=start.cookies.get('__Host-qmenux_operator_csrf')!.value;
  expect(start.cookies.get('__Host-qmenux_operator_browser')).toMatchObject({httpOnly:true,secure:true,sameSite:'strict',path:'/'});
  expect(start.headers.get('set-cookie')).not.toContain('Domain=');
  expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({assertion:jwt,browser:binding});
  upstream=()=>Response.json({session,csrf:newCsrf,proof,expiresIn:900,mfaExpiresIn:300,secret:key});
  const res=await handleOperatorAuth(request('authentication/finish',JSON.stringify({response:'{}'}),{
    cookie:`__Host-qmenux_operator_browser=${binding}; __Host-qmenux_operator_csrf=${initialCsrf}; __Host-qmenux_operator_authentication_challenge=${challenge}`,'x-csrf-token':initialCsrf}));
  expect(await res.json()).toEqual({status:'signed_in'});
  expect(res.cookies.get('__Host-qmenux_operator_session')).toMatchObject({value:session,httpOnly:true,secure:true,maxAge:900});
  expect(res.cookies.get('__Host-qmenux_operator_mfa')).toMatchObject({value:proof,httpOnly:true,maxAge:900});
  expect(res.cookies.get('__Host-qmenux_operator_csrf')).toMatchObject({value:newCsrf,httpOnly:false});
  expect(res.cookies.get('__Host-qmenux_operator_authentication_challenge')!.maxAge).toBe(0);
  expect(calls[1]!.url).toBe('https://api.qmenux.com/v1/internal/operator-auth/authentication/finish');
  expect(new Headers(calls[1]!.init!.headers).get('authorization')).toBe(`Bearer ${key}`);
  expect(new Headers(calls[1]!.init!.headers).has('cookie')).toBe(false);
});

test('operator BFF masks poisoned options/credentials, keeps uncertain logout credentials and forwards only minimal identity',async()=>{
  for(const poisoned of [{...options,rpId:'qmenux.com'},{...options,userVerification:'preferred'},{...options,challenge:key}]) {
    upstream=()=>Response.json({options:poisoned});const res=await handleOperatorAuth(request('authentication/start'));expect(res.status).toBe(503);expect(res.headers.has('set-cookie')).toBe(false);
  }
  upstream=()=>new Response('{',{headers:{'content-type':'application/json'}});
  expect((await handleOperatorAuth(request('authentication/start'))).status).toBe(503);
  const finish=()=>request('authentication/finish',JSON.stringify({response:'{}'}),{cookie:`${full}; __Host-qmenux_operator_authentication_challenge=${challenge}`,'x-csrf-token':csrf});
  upstream=()=>Response.json({session,csrf:session,proof,expiresIn:900,mfaExpiresIn:300});
  const bad=await handleOperatorAuth(finish());expect(bad.status).toBe(503);expect(bad.cookies.get('__Host-qmenux_operator_session')).toBeUndefined();
  upstream=()=>Response.json({operator:{...operator,email:'private@example.invalid'},secret:key});
  expect(await (await handleOperatorAuth(request('me','{}',{cookie:full}))).json()).toEqual({operator});
  upstream=()=>Response.json({status:'private failure'},{status:503});
  const failed=await handleOperatorAuth(request('logout','{}',{cookie:full,'x-csrf-token':csrf}));expect(failed.status).toBe(503);expect(failed.headers.has('set-cookie')).toBe(false);
  upstream=()=>Response.json({status:'signed_out'});const good=await handleOperatorAuth(request('logout','{}',{cookie:full,'x-csrf-token':csrf}));
  expect(await good.json()).toEqual({status:'signed_out'});expect(good.cookies.get('__Host-qmenux_operator_session')!.maxAge).toBe(0);
  expect(good.headers.get('cache-control')).toBe('no-store');
});

test('real superadmin app has no registered operator handler',async({request})=>{
  expect((await request.post('http://127.0.0.1:3002/api/operator/authentication/start',{data:{}})).status()).toBe(404);
});

test('operator registration options are projected and enrollment cannot create a browser session',async()=>{
  upstream=()=>Response.json({options:{challenge,timeout:60000,rp:{id:'superman.qmenux.com',name:'private label'},
    user:{id:Buffer.from(operator.id).toString('base64url'),name:'private identity'},
    pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],attestation:'none',
    authenticatorSelection:{residentKey:'preferred',userVerification:'required'},secret:key}});
  const start=await handleOperatorAuth(request('registration/start',JSON.stringify({grant:'g'.repeat(43)})));
  expect(start.status).toBe(200);expect(JSON.stringify(await start.json())).not.toContain('private');
  const binding=start.cookies.get('__Host-qmenux_operator_browser')!.value, nonce=start.cookies.get('__Host-qmenux_operator_csrf')!.value;
  upstream=()=>Response.json({status:'registered',session});
  const finish=await handleOperatorAuth(request('registration/finish',JSON.stringify({response:'{}'}),{
    cookie:`__Host-qmenux_operator_browser=${binding}; __Host-qmenux_operator_csrf=${nonce}; __Host-qmenux_operator_registration_challenge=${challenge}`,'x-csrf-token':nonce}));
  expect(await finish.json()).toEqual({status:'registered'});expect(finish.cookies.get('__Host-qmenux_operator_session')).toBeUndefined();
});

test('browser enforces operator host-only HttpOnly cookies, readable CSRF and confirmed logout',async({page,context})=>{
  upstream=()=>{
    const url=calls.at(-1)!.url;
    if(url.endsWith('/authentication/start'))return Response.json({options});
    if(url.endsWith('/authentication/finish'))return Response.json({session,csrf:newCsrf,proof,expiresIn:900,mfaExpiresIn:300});
    if(url.endsWith('/me'))return Response.json({operator});
    expect(JSON.parse(calls.at(-1)!.init!.body as string).csrf).toBe(newCsrf);return Response.json({status:'signed_out'});
  };
  await page.route(`${origin}/**`,async route=>{
    const incoming=route.request();
    if(!incoming.url().includes('/api/operator/')){await route.fulfill({contentType:'text/html',body:'<main>Operator cookie fixture</main>'});return;}
    const response=await handleOperatorAuth(new Request(incoming.url(),{method:incoming.method(),
      headers:{...await incoming.allHeaders(),host:'superman.qmenux.com','cf-access-jwt-assertion':jwt},...(incoming.postData()?{body:incoming.postData()}:{} )}));
    const headers:Record<string,string>={};response.headers.forEach((value,name)=>{headers[name]=value;});
    if(response.headers.getSetCookie().length)headers['set-cookie']=response.headers.getSetCookie().join('\n');
    await route.fulfill({status:response.status,headers,body:await response.text()});
  });
  await page.goto(origin);
  expect(await page.evaluate(async()=> (await fetch('/api/operator/authentication/start',{method:'POST',headers:{'Content-Type':'application/json','X-QMenuX-Request':'1'},body:'{}'})).status)).toBe(200);
  expect(await page.evaluate(()=>document.cookie)).toMatch(/^__Host-qmenux_operator_csrf=/);
  const signedIn=await page.evaluate(async()=>{
    const csrf=document.cookie.split('=')[1]!;
    return (await fetch('/api/operator/authentication/finish',{method:'POST',headers:{'Content-Type':'application/json','X-QMenuX-Request':'1','X-CSRF-Token':csrf},body:JSON.stringify({response:'{}'})})).json();
  });
  expect(signedIn).toEqual({status:'signed_in'});
  expect(await page.evaluate(()=>document.cookie)).toBe(`__Host-qmenux_operator_csrf=${newCsrf}`);
  expect((await context.cookies()).find(cookie=>cookie.name==='__Host-qmenux_operator_session')).toMatchObject({httpOnly:true,secure:true,sameSite:'Strict',domain:'superman.qmenux.com'});
  expect(await context.cookies('https://admin.qmenux.com')).toHaveLength(0);expect(await context.cookies('https://api.qmenux.com')).toHaveLength(0);
  expect(await page.evaluate(async()=> (await fetch('/api/operator/me')).json())).toEqual({operator});
  expect(await page.evaluate(async()=> (await fetch('/api/operator/logout',{method:'POST',headers:{'Content-Type':'application/json','X-QMenuX-Request':'1','X-CSRF-Token':document.cookie.split('=')[1]!},body:'{}'})).json())).toEqual({status:'signed_out'});
  expect(await context.cookies()).toHaveLength(0);
});
