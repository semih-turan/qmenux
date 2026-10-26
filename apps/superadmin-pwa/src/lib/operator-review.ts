import type { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { AuthError,boundedJson,call,cookie,fail,json,names,object,options,origin,proofPattern,setCookie,settings } from './operator-auth';
import { reviewApplication,reviewDecision,uuidPattern } from './review-model';

// Deliberately unregistered pending named privileged-route review.
export async function handleOperatorReview(req:Request):Promise<NextResponse> {
  let finishing=false,committing=false;
  try{
    const url=new URL(req.url),action=url.pathname.slice('/api/operator-review/'.length);
    if(!url.pathname.startsWith('/api/operator-review/')||!['applications','decisions','rejection/start','rejection/finish','reject','approval/start','approval/finish','approve'].includes(action))return json({status:'invalid_request'},404);
    const reading=action==='applications'||action==='decisions';
    const method=reading?'GET':'POST';if(req.method!==method){const res=json({status:'invalid_request'},405);res.headers.set('Allow',method);return res;}
    const key=settings(true);
    if(url.origin!==origin||req.headers.get('host')!=='superman.qmenux.com'||url.hash)fail(400);
    const assertion=req.headers.get('cf-access-jwt-assertion');if(!assertion||assertion.length>8192||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(assertion))fail(401);
    const browser=cookie(req,names.browser),csrf=cookie(req,names.csrf),session=cookie(req,names.session),proof=cookie(req,names.proof);
    if(!browser||!csrf||!session||!proof)fail(401);
    const authority={assertion,browser,session,csrf,proof},forbidden=[key,process.env.OPERATOR_BFF_SECRET!,browser,csrf,session,proof];
    if(reading){
      const limit=action==='decisions'?5:20;
      const after=url.searchParams.get('after');
      if([...url.searchParams.keys()].some(name=>name!=='after')||url.searchParams.getAll('after').length>1||(after!==null&&!uuidPattern.test(after)))fail(400);
      const data=await call(key,action==='applications'?'list':'decisions',{...authority,limit,...(after?{after:after.toLowerCase()}:{})},true);
      if(!Array.isArray(data.items)||data.items.length>limit)fail(503);
      const items=data.items.map(action==='decisions'?reviewDecision:reviewApplication);
      if((action==='applications'&&items.some(item=>item.status!=='PENDING_APPROVAL'))||new Set(items.map(item=>item.id)).size!==items.length
        ||(data.nextCursor!==null&&(typeof data.nextCursor!=='string'||!uuidPattern.test(data.nextCursor)||items.length!==limit||data.nextCursor!==items.at(-1)?.id)))fail(503);
      const result={items,nextCursor:data.nextCursor};if(forbidden.some(value=>JSON.stringify(result).includes(value)))fail(503);return json(result);
    }
    if(url.search||req.headers.get('origin')!==origin||req.headers.get('x-qmenux-request')!=='1'||req.headers.has('content-encoding')
      ||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers.get('content-type')??''))fail(400);
    const header=req.headers.get('x-csrf-token');if(!header||!proofPattern.test(header)||!timingSafeEqual(Buffer.from(header),Buffer.from(csrf)))fail(400);
    const body=object(await boundedJson(req.body,32768,AbortSignal.timeout(5000),true));
    const fields=['id','revision','reason','requestId',...(action.endsWith('/finish')?['response']:[])];
    if(Object.keys(body).length!==fields.length||fields.some(name=>!Object.hasOwn(body,name))||typeof body.id!=='string'||!uuidPattern.test(body.id)
      ||typeof body.requestId!=='string'||!uuidPattern.test(body.requestId)||!Number.isInteger(body.revision)||(body.revision as number)<1||(body.revision as number)>2147483646
      ||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>1000||/[\x00-\x1f\x7f]/.test(body.reason))fail(400);
    const command={id:body.id.toLowerCase(),revision:body.revision as number,reason:body.reason.trim(),requestId:body.requestId.toLowerCase()};
    if(action.endsWith('/start')){
      const data=await call(key,action,{...authority,...command},true),result=options(data.options,false,forbidden);
      const res=json({options:result});setCookie(res,names.reviewChallenge,result.challenge,120);setCookie(res,names.reviewProof,'',0);return res;
    }
    if(action.endsWith('/finish')){
      const challenge=cookie(req,names.reviewChallenge);if(!challenge)fail(401);
      if(typeof body.response!=='string'||body.response.length>16384)fail(400);
      try{if(JSON.stringify(JSON.parse(body.response))!==body.response)fail(400);}catch{fail(400);}
      finishing=true;const data=await call(key,action,{...authority,...command,challenge,response:body.response},true);
      if(typeof data.stepUp!=='string'||!proofPattern.test(data.stepUp)||[...forbidden,challenge].includes(data.stepUp)||data.expiresIn!==120)fail(503);
      const res=json({status:'verified'});setCookie(res,names.reviewProof,data.stepUp,120);setCookie(res,names.reviewChallenge,'',0);return res;
    }
    const stepUp=cookie(req,names.reviewProof);committing=true;
    const data=await call(key,action,{...authority,...command,...(stepUp?{stepUp}:{})},true),application=reviewApplication(data.application);
    if(application.id!==command.id||application.status!==(action==='approve'?'APPROVED':'REJECTED')||application.revision!==command.revision+1||forbidden.some(value=>JSON.stringify(application).includes(value)))fail(503);
    const res=json({application});setCookie(res,names.reviewProof,'',0);setCookie(res,names.reviewChallenge,'',0);return res;
  }catch(error){
    const status=error instanceof AuthError?error.status:503;
    const res=json({status:status===503?'unavailable':status===401?'unauthorized':status===403?'forbidden':status===404?'not_found':status===409?'conflict':'invalid_request'},status);
    if(finishing)setCookie(res,names.reviewChallenge,'',0);
    if(committing&&[400,401,403,404,409].includes(status))setCookie(res,names.reviewProof,'',0);
    return res;
  }
}
