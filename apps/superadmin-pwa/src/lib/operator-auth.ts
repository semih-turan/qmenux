import { randomBytes, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const origin='https://superman.qmenux.com';
export const proofPattern=/^[A-Za-z0-9_-]{43}$/;
export const names={session:'__Host-qmenux_operator_session',csrf:'__Host-qmenux_operator_csrf',proof:'__Host-qmenux_operator_mfa',browser:'__Host-qmenux_operator_browser',authentication:'__Host-qmenux_operator_authentication_challenge',registration:'__Host-qmenux_operator_registration_challenge',reviewChallenge:'__Host-qmenux_operator_review_challenge',reviewProof:'__Host-qmenux_operator_review_proof'};
export class AuthError extends Error {
  constructor(readonly status: number) { super('Auth request failed'); }
}
export function fail(status: number): never { throw new AuthError(status); }
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
export const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });

export function cookie(req: Request, name: string): string | undefined {
  const entries = (req.headers.get('cookie') ?? '').split(';').map(value => value.trim())
    .filter(value => value.split('=')[0] === name);
  if (!entries.length) return undefined;
  if (entries.length !== 1) fail(400);
  const value = entries[0]!.slice(name.length + 1);
  if (!proofPattern.test(value)) fail(400);
  return value;
}
export function setCookie(res: NextResponse, name: string, value: string, maxAge: number, httpOnly = true) {
  res.cookies.set(name, value, { secure: true, httpOnly, sameSite: 'strict', path: '/', maxAge });
}
export async function boundedJson(body: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal, flat = false): Promise<unknown> {
  if (!body) fail(400);
  const reader = body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      if (signal.aborted) fail(503);
      const part = await reader.read();
      if (signal.aborted) fail(503);
      if (part.done) break;
      length += part.value.byteLength;
      if (length > limit) fail(413);
      chunks.push(part.value);
    }
    try {
      const raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
      const value: unknown = JSON.parse(raw);
      if (flat) {
        if (!value || typeof value !== 'object' || Array.isArray(value)
          || Object.values(value).some(item => typeof item !== 'string' && (typeof item !== 'number' || !Number.isFinite(item)))) fail(400);
        const keys = new Set<string>();
        for (const match of raw.matchAll(/"(?:\\.|[^"\\])*"\s*:?/g)) {
          const token = match[0].trim();
          if (!token.endsWith(':')) continue;
          const key = JSON.parse(token.slice(0,-1)) as string;
          if (keys.has(key)) fail(400);
          keys.add(key);
        }
      }
      return value;
    } catch { fail(400); }
  } finally {
    signal.removeEventListener('abort', cancel);
    void reader.cancel().catch(() => {});
  }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(503);
  return value as Record<string, unknown>;
}

export function settings(review=false): string {
  if(review){settings();const key=process.env.OPERATOR_REVIEW_SECRET;if(process.env.OPERATOR_REVIEW_ENABLED!=='true'||!key||!proofPattern.test(key)||[process.env.OPERATOR_BFF_SECRET,process.env.ADMIN_BFF_SECRET,process.env.ADMIN_ONBOARDING_SECRET,process.env.CRON_SECRET].includes(key))fail(503);return key;}
  const key=process.env.OPERATOR_BFF_SECRET;
  if(process.env.OPERATOR_BFF_ENABLED!=='true' || process.env.OPERATOR_PASSKEY_ENABLED!=='true'
    || process.env.VERCEL_ENV==='preview' || process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0' || !key || !proofPattern.test(key)
    || [process.env.ADMIN_BFF_SECRET,process.env.ADMIN_ONBOARDING_SECRET,process.env.CRON_SECRET,process.env.OPERATOR_REVIEW_SECRET].includes(key)) fail(503);
  return key;
}
export async function call(key:string,action:string,body:Record<string,string|number>,review=false) {
  const accepted=review?[400,401,403,404,409]:[400,401,403];
  try {
    const signal=AbortSignal.timeout(10000);
    const response=await fetch(`https://api.qmenux.com/v1/internal/${review?'operator-review':'operator-auth'}/${action}`,{method:'POST',cache:'no-store',redirect:'error',signal,
      headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!response.ok) {void response.body?.cancel().catch(()=>{});fail(accepted.includes(response.status)?response.status:503);}
    if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')){void response.body?.cancel().catch(()=>{});fail(503);}
    try { return object(await boundedJson(response.body,32768,signal)); } catch { fail(503); }
  } catch(error) {if(error instanceof AuthError && accepted.includes(error.status))throw error;fail(503);}
}
export function options(value:unknown,registration:boolean,forbidden:string[]) {
  const row=object(value);
  const credential=(value:unknown)=>{
    const item=object(value);
    if(typeof item.id!=='string' || !/^[A-Za-z0-9_-]{1,1024}$/.test(item.id) || item.type!=='public-key' || forbidden.includes(item.id) || Buffer.from(item.id,'base64url').toString('base64url')!==item.id)fail(503);
    return {id:item.id,type:'public-key' as const};
  };
  if(typeof row.challenge!=='string' || !proofPattern.test(row.challenge) || Buffer.from(row.challenge,'base64url').toString('base64url')!==row.challenge || forbidden.includes(row.challenge)
    || row.timeout!==60000)fail(503);
  if(!registration) {
    if(row.rpId!=='superman.qmenux.com' || row.userVerification!=='required' || !Array.isArray(row.allowCredentials) || row.allowCredentials.length!==1)fail(503);
    return {challenge:row.challenge,timeout:60000,rpId:row.rpId,userVerification:'required',allowCredentials:row.allowCredentials.map(credential)};
  }
  const rp=object(row.rp),user=object(row.user),selection=object(row.authenticatorSelection);
  if(rp.id!=='superman.qmenux.com' || row.attestation!=='none' || selection.userVerification!=='required'
    || selection.residentKey!=='preferred' || typeof user.id!=='string'
    || Buffer.from(user.id,'base64url').toString('base64url')!==user.id
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(Buffer.from(user.id,'base64url').toString('utf8'))
    || !Array.isArray(row.pubKeyCredParams) || row.pubKeyCredParams.length!==2
    || row.pubKeyCredParams.some((item,index)=>{const value=object(item);return value.type!=='public-key'||value.alg!==[-7,-257][index];}))fail(503);
  return {challenge:row.challenge,timeout:60000,rp:{id:rp.id,name:'QMenuX platform'},user:{id:user.id,name:'QMenuX operator',displayName:''},
    pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],attestation:'none',
    authenticatorSelection:{residentKey:'preferred',userVerification:'required'},extensions:{credProps:true}};
}

// No route file registers this handler before the privileged-route review gate.
export async function handleOperatorAuth(req:Request):Promise<NextResponse> {
  let finishing:'authentication'|'registration'|undefined;
  try {
    const url=new URL(req.url),action=url.pathname.slice('/api/operator/'.length);
    if(!url.pathname.startsWith('/api/operator/') || !['authentication/start','authentication/finish','registration/start','registration/finish','me','logout'].includes(action))return json({status:'invalid_request'},404);
    const method=action==='me'?'GET':'POST';
    if(req.method!==method){const res=json({status:'invalid_request'},405);res.headers.set('Allow',method);return res;}
    const key=settings();
    if(url.origin!==origin || req.headers.get('host')!=='superman.qmenux.com' || url.search || url.hash)fail(400);
    const assertion=req.headers.get('cf-access-jwt-assertion');
    if(!assertion || assertion.length>8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(assertion))fail(401);
    let browser=cookie(req,names.browser),csrf=cookie(req,names.csrf);
    const session=cookie(req,names.session),proof=cookie(req,names.proof);
    let body:Record<string,unknown>={};
    if(method==='POST') {
      if(req.headers.get('origin')!==origin || req.headers.get('x-qmenux-request')!=='1'
        || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers.get('content-type')??'') || req.headers.has('content-encoding'))fail(400);
      body=object(await boundedJson(req.body,32768,AbortSignal.timeout(5000),true));
      if(browser || csrf) {
        const header=req.headers.get('x-csrf-token');
        if(!browser || !csrf || !header || !proofPattern.test(header) || !timingSafeEqual(Buffer.from(header),Buffer.from(csrf)))fail(400);
      } else if(!action.endsWith('/start'))fail(401);
    }
    if(action.endsWith('/start')) {
      const registration=action==='registration/start';
      if(Object.keys(body).length!==(registration?1:0) || (registration && (typeof body.grant!=='string'||!proofPattern.test(body.grant))))fail(400);
      browser??=randomBytes(32).toString('base64url');csrf??=randomBytes(32).toString('base64url');
      const data=await call(key,action,{assertion,browser,...(registration?{grant:body.grant as string}:{})});
      const result=options(data.options,registration,[key,browser,csrf,...[session,proof,body.grant].filter((value):value is string=>typeof value==='string')]);
      const res=json({options:result});
      setCookie(res,names.browser,browser,900);setCookie(res,names.csrf,csrf,900,false);
      setCookie(res,names[registration?'registration':'authentication'],result.challenge,300);
      return res;
    }
    if(!browser || !csrf)fail(401);
    if(action.endsWith('/finish')) {
      const registration=action==='registration/finish',challenge=cookie(req,names[registration?'registration':'authentication']);
      if(!challenge)fail(401);
      if(Object.keys(body).length!==1 || typeof body.response!=='string' || body.response.length>16384)fail(400);
      try {if(JSON.stringify(JSON.parse(body.response))!==body.response)fail(400);}catch{fail(400);}
      finishing=registration?'registration':'authentication';
      const data=await call(key,action,{assertion,browser,challenge,response:body.response,...(!registration && session?{previousSession:session}:{})});
      if(registration){if(data.status!=='registered')fail(503);const res=json({status:'registered'});setCookie(res,names.registration,'',0);return res;}
      const values=[data.session,data.csrf,data.proof];
      if(values.some(value=>typeof value!=='string'||!proofPattern.test(value)||[key,browser,session,proof,csrf,challenge].includes(value))
        || new Set(values).size!==3 || data.expiresIn!==900 || data.mfaExpiresIn!==300)fail(503);
      const res=json({status:'signed_in'});
      setCookie(res,names.session,data.session as string,900);setCookie(res,names.csrf,data.csrf as string,900,false);
      // Retain the expired proof reference for confirmed logout; API freshness always governs authorization.
      setCookie(res,names.proof,data.proof as string,900);setCookie(res,names.browser,browser,900);
      setCookie(res,names.authentication,'',0);return res;
    }
    if(Object.keys(body).length)fail(400);
    if(!session || !proof)fail(401);
    const data=await call(key,action,{assertion,browser,session,csrf,proof});
    if(action==='me') {
      const operator=object(data.operator);
      if(typeof operator.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operator.id)||operator.role!=='PLATFORM_ADMIN')fail(503);
      return json({operator:{id:operator.id,role:'PLATFORM_ADMIN'}});
    }
    if(data.status!=='signed_out')fail(503);
    const res=json({status:'signed_out'});for(const name of Object.values(names))setCookie(res,name,'',0,name!==names.csrf);return res;
  } catch(error) {
    const status=error instanceof AuthError?error.status:503;
    const res=json({status:status===503?'unavailable':status===401?'unauthorized':status===403?'forbidden':'invalid_request'},status);
    if(finishing)setCookie(res,names[finishing],'',0);return res;
  }
}
