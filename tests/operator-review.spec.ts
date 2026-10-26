import {expect,test} from '@playwright/test';
import {handleOperatorReview} from '../apps/superadmin-pwa/src/lib/operator-review';
import {handleOperatorAuth,names,origin} from '../apps/superadmin-pwa/src/lib/operator-auth';

const id='00000000-0000-4000-8000-000000000001',key='r'.repeat(43),authKey='a'.repeat(43),csrf='c'.repeat(43),challenge='a'.repeat(42)+'A',stepUp='u'.repeat(43);
const command={id,revision:2,reason:'Synthetic reason',requestId:'00000000-0000-4000-8000-000000000002'};
const application={id,requestedName:'Synthetic café',status:'PENDING_APPROVAL',revision:2,createdAt:'2026-10-26T00:00:00.000Z',submittedAt:'2026-10-26T00:01:00.000Z'};
const options={challenge,timeout:60000,rpId:'superman.qmenux.com',userVerification:'required',allowCredentials:[{id:'a2V5',type:'public-key'}]};
const full=`${names.session}=${'s'.repeat(43)}; ${names.browser}=${'b'.repeat(43)}; ${names.csrf}=${csrf}; ${names.proof}=${'m'.repeat(43)}`;
const env={...process.env},fetchBefore=globalThis.fetch;
let calls:{url:string;body:Record<string,unknown>;headers:Headers}[];let upstream:()=>Response;
function request(action='applications',body?:object,headers:Record<string,string>={}) {
 return new Request(`${origin}/api/operator-review/${action}`,{method:body?'POST':'GET',headers:{host:'superman.qmenux.com',origin,'cf-access-jwt-assertion':'signed.access.assertion',cookie:full,'content-type':'application/json','x-qmenux-request':'1','x-csrf-token':csrf,...headers},...(body?{body:JSON.stringify(body)}:{})});
}
test.beforeEach(()=>{
 process.env.OPERATOR_BFF_ENABLED='true';process.env.OPERATOR_PASSKEY_ENABLED='true';process.env.OPERATOR_REVIEW_ENABLED='true';process.env.OPERATOR_BFF_SECRET=authKey;process.env.OPERATOR_REVIEW_SECRET=key;
 delete process.env.VERCEL_ENV;delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
 calls=[];upstream=()=>Response.json({items:[application],nextCursor:null});
 globalThis.fetch=async(input,init)=>{calls.push({url:String(input),body:JSON.parse(init!.body as string),headers:new Headers(init!.headers)});expect(init).toMatchObject({method:'POST',cache:'no-store',redirect:'error'});return upstream();};
});
test.afterEach(()=>{globalThis.fetch=fetchBefore;for(const name of Object.keys(process.env))if(!(name in env))delete process.env[name];Object.assign(process.env,env);});

test('review BFF denies disabled/reused authority, wrong host, CSRF, body authority and invalid commands before API work',async()=>{
 for(const [name,value] of [['OPERATOR_REVIEW_ENABLED','false'],['OPERATOR_REVIEW_SECRET',authKey],['VERCEL_ENV','preview'],['NODE_TLS_REJECT_UNAUTHORIZED','0']] as const){const old=process.env[name];process.env[name]=value;expect((await handleOperatorReview(request())).status).toBe(503);if(old===undefined)delete process.env[name];else process.env[name]=old;}
 expect((await handleOperatorReview(request('applications',undefined,{cookie:''}))).status).toBe(401);
 expect((await handleOperatorReview(request('rejection/start',command,{origin:'https://admin.qmenux.com'}))).status).toBe(400);
 expect((await handleOperatorReview(request('rejection/start',command,{'x-csrf-token':'x'.repeat(43)}))).status).toBe(400);
 for(const bad of [{...command,stepUp},{...command,reason:''},{...command,revision:'2'},{...command,requestId:'bad'}])expect((await handleOperatorReview(request('rejection/start',bad))).status).toBe(400);
 expect((await handleOperatorReview(request('applications?tenant=selected'))).status).toBe(400);expect(calls).toHaveLength(0);
});

test('review BFF projects pending rows, hides proof in cookies, preserves uncertain commits and sends exact authority only to fixed API',async()=>{
 upstream=()=>Response.json({items:[{...application,applicant_id:id}],nextCursor:null,secret:key});
 expect(await (await handleOperatorReview(request())).json()).toEqual({items:[application],nextCursor:null});
 expect(calls[0]!.url).toBe('https://api.qmenux.com/v1/internal/operator-review/list');expect(calls[0]!.headers.get('authorization')).toBe(`Bearer ${key}`);expect(calls[0]!.headers.has('cookie')).toBe(false);
 upstream=()=>Response.json({options});const start=await handleOperatorReview(request('rejection/start',command));expect(start.status).toBe(200);
 expect(start.cookies.get(names.reviewChallenge)).toMatchObject({value:challenge,httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:120});
 upstream=()=>Response.json({stepUp,expiresIn:120,secret:key});
 const finish=await handleOperatorReview(request('rejection/finish',{...command,response:'{}'},{cookie:`${full}; ${names.reviewChallenge}=${challenge}`}));
 expect(await finish.json()).toEqual({status:'verified'});expect(finish.cookies.get(names.reviewProof)).toMatchObject({value:stepUp,httpOnly:true,maxAge:120});
 expect(finish.cookies.get(names.reviewChallenge)!.maxAge).toBe(0);expect(finish.headers.get('set-cookie')).not.toContain('Domain=');
 upstream=()=>Response.json({status:'private failure'},{status:503});
 const failed=await handleOperatorReview(request('reject',command,{cookie:`${full}; ${names.reviewProof}=${stepUp}`}));expect(failed.status).toBe(503);expect(failed.headers.has('set-cookie')).toBe(false);
 upstream=()=>Response.json({application:{...application,status:'REJECTED',revision:3,rejection_reason:'private'}});
 const result=await handleOperatorReview(request('reject',command));expect(await result.json()).toEqual({application:{...application,status:'REJECTED',revision:3}});
 expect(calls.at(-1)!.body).not.toHaveProperty('stepUp');expect(result.cookies.get(names.reviewProof)!.maxAge).toBe(0);expect(result.cookies.get(names.session)).toBeUndefined();
});

test('review BFF rejects poisoned options/results and preserves safe domain errors without leaking upstream details',async()=>{
 upstream=()=>Response.json({options:{...options,rpId:'qmenux.com'}});expect((await handleOperatorReview(request('rejection/start',command))).status).toBe(503);
 upstream=()=>new Response('{',{headers:{'content-type':'application/json'}});expect((await handleOperatorReview(request())).status).toBe(503);
 for(const status of [403,404,409]){upstream=()=>Response.json({private:'details'},{status});const res=await handleOperatorReview(request('reject',command));expect(res.status).toBe(status);expect(await res.text()).not.toContain('details');}
 upstream=()=>Response.json({application:{...application,status:'REJECTED',revision:2}});expect((await handleOperatorReview(request('reject',command))).status).toBe(503);
});

test('actual superadmin app keeps review routes unregistered',async({request})=>{
 expect((await request.get('http://127.0.0.1:3002/api/operator-review/applications')).status()).toBe(404);
 expect((await request.get('http://127.0.0.1:3002/api/operator-review/decisions')).status()).toBe(404);
 expect((await request.post('http://127.0.0.1:3002/api/operator-review/reject',{data:command})).status()).toBe(404);
});


test('browser keeps review proof HttpOnly and host-only, clears it on confirmation and clears all operator cookies on logout',async({page,context})=>{
 await context.addCookies(full.split('; ').map(entry=>{const [name,value]=entry.split('=');return {name:name!,value:value!,url:origin,secure:true,httpOnly:name!==names.csrf,sameSite:'Strict' as const};}));
 upstream=()=>{const url=calls.at(-1)!.url;if(url.endsWith('/rejection/start'))return Response.json({options});if(url.endsWith('/rejection/finish'))return Response.json({stepUp,expiresIn:120});if(url.endsWith('/logout'))return Response.json({status:'signed_out'});return Response.json({application:{...application,status:'REJECTED',revision:3}});};
 await page.route(`${origin}/**`,async route=>{
  const incoming=route.request();if(!incoming.url().includes('/api/')){await route.fulfill({contentType:'text/html',body:'<main>Synthetic review cookie fixture</main>'});return;}
  const req=new Request(incoming.url(),{method:incoming.method(),headers:{...await incoming.allHeaders(),host:'superman.qmenux.com','cf-access-jwt-assertion':'signed.access.assertion'},...(incoming.postData()?{body:incoming.postData()}:{} )});
  const response=incoming.url().includes('/api/operator-review/')?await handleOperatorReview(req):await handleOperatorAuth(req);
  const headers:Record<string,string>={};response.headers.forEach((value,name)=>{headers[name]=value;});if(response.headers.getSetCookie().length)headers['set-cookie']=response.headers.getSetCookie().join('\n');
  await route.fulfill({status:response.status,headers,body:await response.text()});
 });
 await page.goto(origin);
 const post=(path:string,body:object)=>page.evaluate(async({path,body})=>(await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-QMenuX-Request':'1','X-CSRF-Token':document.cookie.split('=')[1]!},body:JSON.stringify(body)})).json(),{path,body});
 await post('/api/operator-review/rejection/start',command);expect(await post('/api/operator-review/rejection/finish',{...command,response:'{}'})).toEqual({status:'verified'});
 expect(await page.evaluate(()=>document.cookie)).toBe(`${names.csrf}=${csrf}`);
 expect((await context.cookies()).find(cookie=>cookie.name===names.reviewProof)).toMatchObject({value:stepUp,httpOnly:true,secure:true,sameSite:'Strict',domain:'superman.qmenux.com'});
 expect(await context.cookies('https://admin.qmenux.com')).toHaveLength(0);expect(await context.cookies('https://api.qmenux.com')).toHaveLength(0);
 await post('/api/operator-review/reject',command);expect((await context.cookies()).some(cookie=>cookie.name===names.reviewProof)).toBe(false);expect((await context.cookies()).some(cookie=>cookie.name===names.session)).toBe(true);
 await post('/api/operator-review/rejection/start',command);await post('/api/operator-review/rejection/finish',{...command,response:'{}'});
 expect(await post('/api/operator/logout',{})).toEqual({status:'signed_out'});expect(await context.cookies()).toHaveLength(0);
});


test('decision recovery projects only validated own decision fields and rejects selectors or incomplete records',async()=>{
 const decision={...application,status:'REJECTED',revision:3,reviewedAt:'2026-10-26T00:02:00.000Z',reason:'Private own reason',requestId:command.requestId};
 upstream=()=>Response.json({items:[{...decision,reviewed_by:id,applicant_id:id,token:key}],nextCursor:null});
 expect(await (await handleOperatorReview(request('decisions'))).json()).toEqual({items:[decision],nextCursor:null});
 expect(calls[0]!.url).toBe('https://api.qmenux.com/v1/internal/operator-review/decisions');
 expect(calls[0]!.body.limit).toBe(5);
 upstream=()=>Response.json({items:Array.from({length:5},(_,n)=>({...decision,id:`00000000-0000-4000-8000-${String(n+1).padStart(12,'0')}`,reason:'界'.repeat(1000),requestedName:'店'.repeat(200)})),nextCursor:'00000000-0000-4000-8000-000000000005'});
 expect((await handleOperatorReview(request('decisions'))).status).toBe(200);
 expect((await handleOperatorReview(request('decisions?operatorId='+id))).status).toBe(400);
 for(const bad of [{...decision,status:'PENDING_APPROVAL'},{...decision,reason:''},{...decision,reviewedAt:'yesterday'},{...decision,requestId:'bad'}]){
  upstream=()=>Response.json({items:[bad],nextCursor:null});expect((await handleOperatorReview(request('decisions'))).status).toBe(503);
 }
});


test('approval transport uses its own purpose, keeps proof private and accepts only the matching terminal decision',async()=>{
 upstream=()=>Response.json({options});const start=await handleOperatorReview(request('approval/start',command));expect(start.status).toBe(200);
 expect(calls.at(-1)!.url).toBe('https://api.qmenux.com/v1/internal/operator-review/approval/start');
 upstream=()=>Response.json({stepUp,expiresIn:120});const finish=await handleOperatorReview(request('approval/finish',{...command,response:'{}'},{cookie:`${full}; ${names.reviewChallenge}=${challenge}`}));expect(await finish.json()).toEqual({status:'verified'});
 upstream=()=>Response.json({application:{...application,status:'REJECTED',revision:3}});expect((await handleOperatorReview(request('approve',command))).status).toBe(503);
 upstream=()=>Response.json({application:{...application,status:'APPROVED',revision:3,approval_reason:'private'}});const result=await handleOperatorReview(request('approve',command,{cookie:`${full}; ${names.reviewProof}=${stepUp}`}));
 expect(await result.json()).toEqual({application:{...application,status:'APPROVED',revision:3}});expect(result.cookies.get(names.reviewProof)!.maxAge).toBe(0);
});
