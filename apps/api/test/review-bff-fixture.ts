import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
import type { OperatorPasskeys } from '../src/operator-passkeys.js';

const nativeFetch=globalThis.fetch;
// Real BFF + actual private HTTP/PG + native credential. Only the fixed network address is mapped locally.
export async function exerciseReviewBff(apiOrigin:string,authority:{assertion:string;browser:string;session:string;csrf:string;proof:string},
  command:{id:string;revision:number;reason:string;requestId:string},authenticate:(options:Awaited<ReturnType<OperatorPasskeys['beginAuthentication']>>)=>Promise<unknown>,approving=false) {
  const {handleOperatorReview}=await tsImport(new URL('../../../superadmin-pwa/src/lib/operator-review.ts',import.meta.url).href,import.meta.url) as {handleOperatorReview:(req:Request)=>Promise<Response>};
  const jar=new Map([['session',authority.session],['browser',authority.browser],['csrf',authority.csrf],['mfa',authority.proof]].map(([name,value])=>[`__Host-qmenux_operator_${name}`,value!]));
  const previousFetch=globalThis.fetch;let calls=0;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));if(url.origin!=='https://api.qmenux.com')return previousFetch(input,init);
    assert(url.pathname.startsWith('/v1/internal/operator-review/'));assert.equal(init?.redirect,'error');calls++;
    return nativeFetch(`${apiOrigin}${url.pathname}`,init);
  };
  const send=async(action:string,body:object)=>{
    const response=await handleOperatorReview(new Request(`https://superman.qmenux.com/api/operator-review/${action}`,{method:'POST',
      headers:{host:'superman.qmenux.com',origin:'https://superman.qmenux.com','cf-access-jwt-assertion':authority.assertion,
        cookie:[...jar].map(([name,value])=>`${name}=${value}`).join('; '),'content-type':'application/json','x-qmenux-request':'1','x-csrf-token':authority.csrf},body:JSON.stringify(body)}));
    for(const cookie of response.headers.getSetCookie()){
      const pair=cookie.split(';')[0]!,index=pair.indexOf('='),name=pair.slice(0,index),value=pair.slice(index+1);
      if(/max-age=0(?:;|$)/i.test(cookie))jar.delete(name);else jar.set(name,value);
    }
    assert.equal(response.headers.get('cache-control'),'no-store');return {status:response.status,data:await response.json()};
  };
  try{
    const started=await send(approving?'approval/start':'rejection/start',command);assert.equal(started.status,200);
    const finished=await send(approving?'approval/finish':'rejection/finish',{...command,response:JSON.stringify(await authenticate(started.data.options))});
    assert.equal(finished.status,200);assert.deepEqual(finished.data,{status:'verified'});assert(jar.has('__Host-qmenux_operator_review_proof'));
    const committed=await send(approving?'approve':'reject',command);assert.equal(committed.status,200);assert.equal(committed.data.application.status,approving?'APPROVED':'REJECTED');assert.equal(committed.data.application.id,command.id);
    assert.equal(jar.has('__Host-qmenux_operator_review_proof'),false);assert(jar.has('__Host-qmenux_operator_session'));
    assert.deepEqual((await send(approving?'approve':'reject',command)).data,committed.data);
    assert.equal((await send(approving?'approve':'reject',{...command,reason:'Changed bound reason'})).status,409);assert.equal(calls,5);
  }finally{globalThis.fetch=previousFetch;}
}
