'use client';

const decode=(value:string)=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),char=>char.charCodeAt(0));
const encode=(value:ArrayBuffer)=>btoa(Array.from(new Uint8Array(value),byte=>String.fromCharCode(byte)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export function serialize(credential:PublicKeyCredential) {
  if(typeof credential.toJSON==='function')return credential.toJSON();
  const response=credential.response;
  const common={id:credential.id,rawId:encode(credential.rawId),type:credential.type,clientExtensionResults:credential.getClientExtensionResults()};
  if('attestationObject' in response){const attestation=response as AuthenticatorAttestationResponse;return {...common,response:{clientDataJSON:encode(response.clientDataJSON),attestationObject:encode(attestation.attestationObject),...(typeof attestation.getTransports==='function'?{transports:attestation.getTransports()}:{})}};}
  const assertion=response as AuthenticatorAssertionResponse;
  return {...common,response:{clientDataJSON:encode(response.clientDataJSON),authenticatorData:encode(assertion.authenticatorData),signature:encode(assertion.signature),userHandle:assertion.userHandle?encode(assertion.userHandle):null}};
}
export async function ceremony(value:unknown,registration:boolean,signal:AbortSignal):Promise<PublicKeyCredential> {
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
export const supported=()=>window.isSecureContext&&typeof PublicKeyCredential!=='undefined'&&!!navigator.credentials?.get&&!!navigator.credentials?.create;

