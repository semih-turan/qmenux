'use client';

import { Button } from '@qmenux/ui/button';
import { TextField } from '@qmenux/ui/text-field';
import { useEffect, useRef, useState } from 'react';

type State='loading'|'unavailable'|'ready'|'authenticated';
type Phase='idle'|'starting'|'key'|'finishing'|'logout';
class RequestError extends Error { constructor(readonly status:number){super('Operator request failed');} }
async function request(action:string,body?:object,signal?:AbortSignal) {
  const csrf=document.cookie.split(';').map(value=>value.trim()).filter(value=>value.startsWith('__Host-qmenux_operator_csrf='));
  const response=await fetch(`/api/operator/${action}`,{method:body?'POST':'GET',cache:'no-store',signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(15000)]),
    ...(body?{headers:{'Content-Type':'application/json','X-QMenuX-Request':'1',...(csrf.length===1?{'X-CSRF-Token':csrf[0]!.slice('__Host-qmenux_operator_csrf='.length)}:{})},body:JSON.stringify(body)}:{})});
  if(!response.ok)throw new RequestError(response.status);
  return response.json();
}
async function readSession(signal:AbortSignal):Promise<{state:State;mayHaveSession:boolean}> {
  try {
    const data=await request('me',undefined,signal);
    if(data.operator?.role!=='PLATFORM_ADMIN'||typeof data.operator.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.operator.id))throw new Error();
    return {state:'authenticated',mayHaveSession:true};
  }catch(error){
    if(error instanceof RequestError && [401,403].includes(error.status))return {state:'ready',mayHaveSession:error.status===403};
    throw error;
  }
}
const decode=(value:string)=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),char=>char.charCodeAt(0));
const encode=(value:ArrayBuffer)=>btoa(Array.from(new Uint8Array(value),byte=>String.fromCharCode(byte)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function serialize(credential:PublicKeyCredential) {
  if(typeof credential.toJSON==='function')return credential.toJSON();
  const response=credential.response;
  const common={id:credential.id,rawId:encode(credential.rawId),type:credential.type,clientExtensionResults:credential.getClientExtensionResults()};
  if('attestationObject' in response){const attestation=response as AuthenticatorAttestationResponse;return {...common,response:{clientDataJSON:encode(response.clientDataJSON),attestationObject:encode(attestation.attestationObject),...(typeof attestation.getTransports==='function'?{transports:attestation.getTransports()}:{})}};}
  const assertion=response as AuthenticatorAssertionResponse;
  return {...common,response:{clientDataJSON:encode(response.clientDataJSON),authenticatorData:encode(assertion.authenticatorData),signature:encode(assertion.signature),userHandle:assertion.userHandle?encode(assertion.userHandle):null}};
}
async function ceremony(value:unknown,registration:boolean,signal:AbortSignal):Promise<PublicKeyCredential> {
  const options=value as PublicKeyCredentialCreationOptionsJSON & PublicKeyCredentialRequestOptionsJSON;
  if(!options||typeof options.challenge!=='string'||options.timeout!==60000)throw new Error();
  let credential:Credential|null;
  if(registration){
    if(options.rp?.id!=='superman.qmenux.com'||options.authenticatorSelection?.userVerification!=='required'||options.attestation!=='none')throw new Error();
    const publicKey:PublicKeyCredentialCreationOptions={challenge:decode(options.challenge),timeout:60000,
      rp:{id:'superman.qmenux.com',name:'QMenuX platform'},user:{id:decode(options.user.id),name:'QMenuX operator',displayName:''},
      pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],attestation:'none',
      authenticatorSelection:{residentKey:'preferred',userVerification:'required'},extensions:{credProps:true}};
    credential=await navigator.credentials.create({publicKey,signal});
  }else{
    if(options.rpId!=='superman.qmenux.com'||options.userVerification!=='required')throw new Error();
    const publicKey:PublicKeyCredentialRequestOptions={challenge:decode(options.challenge),timeout:60000,rpId:'superman.qmenux.com',userVerification:'required',
      allowCredentials:options.allowCredentials?.map(item=>({id:decode(item.id),type:'public-key'}))};
    credential=await navigator.credentials.get({publicKey,signal});
  }
  if(!credential||credential.type!=='public-key')throw new Error();
  return credential as PublicKeyCredential;
}
const supported=()=>window.isSecureContext&&typeof PublicKeyCredential!=='undefined'&&!!navigator.credentials?.get&&!!navigator.credentials?.create;

export default function OperatorSignIn() {
  const [state,setState]=useState<State>('loading'),[phase,setPhase]=useState<Phase>('idle');
  const [capable,setCapable]=useState(false),[mayHaveSession,setMayHaveSession]=useState(false);
  const [grant,setGrant]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState(false);
  const current=useRef<AbortController|null>(null),login=useRef<HTMLButtonElement>(null);
  const busy=phase!=='idle';
  useEffect(()=>{
    const controller=new AbortController();
    void readSession(controller.signal).then(result=>{if(!controller.signal.aborted){setState(result.state);setMayHaveSession(result.mayHaveSession);setCapable(supported());}})
      .catch(()=>{if(!controller.signal.aborted){setState('unavailable');setCapable(supported());}});
    return ()=>{controller.abort();current.current?.abort();};
  },[]);
  useEffect(()=>{
    if(state!=='authenticated'||phase!=='idle')return;
    const controller=new AbortController();let checking=false;
    const verify=()=>{
      if(checking||document.visibilityState==='hidden')return;checking=true;
      void readSession(controller.signal).then(result=>{if(!controller.signal.aborted){setState(result.state);setMayHaveSession(result.mayHaveSession);if(result.state!=='authenticated')setMessage('Oturum veya ek doğrulama yenilenmeli.');}})
        .catch(()=>{if(!controller.signal.aborted){setState('unavailable');setMessage('Oturum doğrulanamadı; bağlantınızı kontrol edin.');}}).finally(()=>{checking=false;});
    };
    const timer=window.setInterval(verify,60000);window.addEventListener('focus',verify);document.addEventListener('visibilitychange',verify);
    return ()=>{controller.abort();window.clearInterval(timer);window.removeEventListener('focus',verify);document.removeEventListener('visibilitychange',verify);};
  },[state,phase]);
  async function submit(registration=false) {
    const controller=new AbortController();current.current=controller;setPhase('starting');setMessage('');setError(false);
    const code=grant;if(registration)setGrant('');
    try {
      if(!supported()||(registration&&!/^[A-Za-z0-9_-]{43}$/.test(code)))throw new Error();
      const kind=registration?'registration':'authentication';
      const started=await request(`${kind}/start`,registration?{grant:code}:{},controller.signal);
      setPhase('key');const credential=await ceremony(started.options,registration,controller.signal);
      if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
      setPhase('finishing');const response=JSON.stringify(serialize(credential));if(response.length>16384)throw new Error();
      const finished=await request(`${kind}/finish`,{response},controller.signal);
      if(registration){if(finished.status!=='registered')throw new Error();setState('ready');setMessage('Geçiş anahtarı kaydedildi. Giriş için ayrıca doğrulayın.');}
      else{if(finished.status!=='signed_in')throw new Error();const confirmed=await readSession(controller.signal);if(confirmed.state!=='authenticated')throw new Error();setState('authenticated');setMayHaveSession(true);setMessage('Platform oturumu doğrulandı.');}
    }catch(cause){
      setState('ready');setError(true);
      setMessage(cause instanceof DOMException&&['AbortError','NotAllowedError'].includes(cause.name)?'İşlem iptal edildi veya süre doldu. Yeni bir işlem başlatabilirsiniz.'
        :cause instanceof RequestError&&cause.status===403?'Erişim doğrulanamadı. Yetkinizi ve gerekirse bağımsız kayıt izninizi kontrol edin.'
          :'İşlem doğrulanamadı. Bağlantınızı kontrol edip yeni bir işlem başlatın.');
    }finally{setPhase('idle');current.current=null;window.requestAnimationFrame(()=>login.current?.focus());}
  }
  async function logout() {
    setPhase('logout');setMessage('');setError(false);
    try{const data=await request('logout',{});if(data.status!=='signed_out')throw new Error();setMayHaveSession(false);setState('ready');setMessage('Çıkış doğrulandı.');}
    catch{setState('ready');setError(true);setMessage('Çıkış doğrulanamadı. Oturumunuz açık olabilir; bağlantınızı kontrol edip tekrar deneyin.');}
    finally{setPhase('idle');}
  }
  return <section aria-label="Platform hesap erişimi" aria-busy={busy||state==='loading'}>
    {state==='loading'&&<p role="status">Platform erişimi doğrulanıyor…</p>}
    {state==='unavailable'&&<><p role="status">Platform yönetimi henüz kullanıma açılmadı veya bağlantı kurulamadı.</p><Button onClick={()=>window.location.reload()}>Yeniden kontrol et</Button></>}
    {message&&<p role={error?'alert':'status'}>{message}</p>}
    {(state==='ready'||state==='authenticated')&&<>
      <h2>{state==='authenticated'?'Platform oturumu doğrulandı':'Platform erişimi'}</h2>
      <p>Kurumsal erişim ve yetkili platform hesabı gerekir. Geçiş anahtarı doğrulaması işletme veya lisans etkinleştirmez.</p>
      {!capable&&<p role="status">Geçiş anahtarı destekleyen güncel ve güvenli bir tarayıcı gerekir.</p>}
      <div className="operator-actions"><Button ref={login} disabled={busy||!capable} onClick={()=>void submit()}>{phase==='starting'?'Doğrulama başlatılıyor…':phase==='key'?'Geçiş anahtarı bekleniyor…':phase==='finishing'?'Sonuç doğrulanıyor…':state==='authenticated'?'Doğrulamayı yenile':'Geçiş anahtarıyla doğrula'}</Button>
        {phase==='key'&&<Button onClick={()=>current.current?.abort()}>İşlemi iptal et</Button>}</div>
      {state==='ready'&&<details><summary>İlk geçiş anahtarını kaydet</summary><p>Yalnızca bağımsız olarak verilen, kısa süreli kayıt izniyle kullanılabilir. Kayıt oturum açmaz.</p>
        <form onSubmit={event=>{event.preventDefault();void submit(true);}}>
          <TextField id="operator-grant" label="Kayıt izin kodu" type="password" value={grant} maxLength={43} minLength={43} pattern="[A-Za-z0-9_-]{43}" required autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={busy||!capable} onChange={event=>setGrant(event.target.value)}/>
          <Button type="submit" disabled={busy||!capable||!/^[A-Za-z0-9_-]{43}$/.test(grant)}>Geçiş anahtarını kaydet</Button>
        </form></details>}
    </>}
    {mayHaveSession&&<Button disabled={busy} onClick={()=>void logout()}>{phase==='logout'?'Çıkış doğrulanıyor…':'Çıkış yap'}</Button>}
  </section>;
}
