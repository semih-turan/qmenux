'use client';

import { Button } from '@qmenux/ui/button';
import { TextField } from '@qmenux/ui/text-field';
import { useEffect,useRef,useState } from 'react';
import { ceremony,serialize } from '../lib/operator-credentials';
import DecisionHistory from './decision-history';
import { reviewApplication,uuidPattern,type ReviewApplication,type ReviewDecision } from '../lib/review-model';

type Command={id:string;revision:number;reason:string;requestId:string};
type Phase='idle'|'starting'|'key'|'verifying'|'confirm'|'committing'|'uncertain'|'fresh';
class RequestError extends Error {constructor(readonly status:number){super('Review request failed');}}
async function request(action:string,body?:object,signal?:AbortSignal) {
  const csrf=document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('__Host-qmenux_operator_csrf='))?.split('=')[1];
  const response=await fetch(`/api/operator-review/${action}`,{method:body?'POST':'GET',cache:'no-store',signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(15000)]),
    ...(body?{headers:{'Content-Type':'application/json','X-QMenuX-Request':'1',...(csrf?{'X-CSRF-Token':csrf}:{})},body:JSON.stringify(body)}:{})});
  if(!response.ok)throw new RequestError(response.status);return response.json();
}
async function readPage(after?:string,signal?:AbortSignal) {
  const data=await request(`applications${after?`?after=${encodeURIComponent(after)}`:''}`,undefined,signal);
  if(!Array.isArray(data.items)||data.items.length>20||(data.nextCursor!==null&&(typeof data.nextCursor!=='string'||!uuidPattern.test(data.nextCursor))))throw new Error();
  const items=(data.items as unknown[]).map(reviewApplication);if(items.some(item=>item.status!=='PENDING_APPROVAL'))throw new Error();
  return {items,nextCursor:data.nextCursor as string|null};
}

export default function ApplicationReview({available,capable,onBusyChange}:{available:boolean;capable:boolean;onBusyChange:(busy:boolean)=>void}) {
  const [items,setItems]=useState<ReviewApplication[]>([]),[cursor,setCursor]=useState<string|null>(null),[ready,setReady]=useState(false);
  const [selected,setSelected]=useState<ReviewApplication|null>(null),[reason,setReason]=useState(''),[command,setCommand]=useState<Command|null>(null);
  const [mayHaveCommitted,setMayHaveCommitted]=useState(false);
  const [phase,setPhase]=useState<Phase>('idle'),[loading,setLoading]=useState(false),[conflict,setConflict]=useState(false),[message,setMessage]=useState('');
  const current=useRef<AbortController|null>(null),input=useRef<HTMLInputElement>(null),actionButton=useRef<HTMLButtonElement>(null),refreshButton=useRef<HTMLButtonElement>(null);
  const busy=loading||['starting','key','verifying','committing'].includes(phase);
  useEffect(()=>{onBusyChange(busy);return ()=>onBusyChange(false);},[busy,onBusyChange]);
  useEffect(()=>{
    if(!available)return;
    const controller=new AbortController();
    void readPage(undefined,controller.signal).then(data=>{if(!controller.signal.aborted){setItems(data.items);setCursor(data.nextCursor);setReady(true);}})
      .catch(()=>{if(!controller.signal.aborted){setReady(false);setMessage('Başvurular yüklenemedi. Erişiminizi ve bağlantınızı kontrol edip tekrar deneyin.');}});
    return ()=>controller.abort();
  },[available]);
  useEffect(()=>()=>current.current?.abort(),[]);
  async function refresh(after?:string) {
    setLoading(true);setMessage('');
    try{const data=await readPage(after);setItems(old=>after?[...old,...data.items.filter(item=>!old.some(row=>row.id===item.id))]:data.items);setCursor(data.nextCursor);setReady(true);}
    catch{setMessage('Başvurular yüklenemedi. Erişiminizi ve bağlantınızı kontrol edip tekrar deneyin.');}
    finally{setLoading(false);}
  }
  function choose(application:ReviewApplication) {
    if(selected?.id!==application.id)setReason('');setSelected(application);setConflict(false);setMessage('');
    window.requestAnimationFrame(()=>input.current?.focus());
  }
  async function verify(existing?:Command) {
    if(!selected)return;
    // shortcut: uncommitted commands remain in memory; use recorded decisions after reload and review recovery before reissuing an unresolved command.
    const next=existing??{id:selected.id,revision:selected.revision,reason:reason.trim(),requestId:crypto.randomUUID()};
    const controller=new AbortController();current.current=controller;setCommand(next);setPhase('starting');setMessage('');
    try{
      const start=await request('rejection/start',next,controller.signal);setPhase('key');
      const credential=await ceremony(start.options,false,controller.signal);if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
      setPhase('verifying');const response=JSON.stringify(serialize(credential));if(response.length>16384)throw new Error();
      const finish=await request('rejection/finish',{...next,response},controller.signal);if(finish.status!=='verified')throw new Error();
      setPhase('confirm');window.requestAnimationFrame(()=>actionButton.current?.focus());setMessage('Doğrulama tamamlandı. İşletme adını ve gerekçeyi kontrol edip reddetmeyi ayrıca onaylayın.');
    }catch(error){
      if(error instanceof DOMException&&['AbortError','NotAllowedError'].includes(error.name)){if(existing){setPhase('fresh');window.requestAnimationFrame(()=>actionButton.current?.focus());setMessage('Doğrulama iptal edildi. Önceki işlemin bilgileri korunuyor; aynı işlemi yeniden doğrulayın.');}else{setCommand(null);setPhase('idle');setMessage('Doğrulama iptal edildi veya süresi doldu. Başvuru reddedilmedi.');window.requestAnimationFrame(()=>input.current?.focus());}}
      else{setPhase('fresh');window.requestAnimationFrame(()=>actionButton.current?.focus());setMessage('Doğrulama tamamlanamadı. Oturumunuzu ve bağlantınızı kontrol edip yeniden doğrulayın.');}
    }finally{current.current=null;}
  }
  function confirmed(application:ReviewApplication,recorded=false) {
    setItems(old=>old.filter(item=>item.id!==application.id));setSelected(null);setCommand(null);setReason('');setMayHaveCommitted(false);setPhase('idle');
    setMessage(recorded?'Başvurunun reddedildiği kaydedilen karardan doğrulandı. İşletme erişimi veya lisans verilmedi.':'Başvurunun reddedildiği doğrulandı. İşletme erişimi veya lisans verilmedi.');window.requestAnimationFrame(()=>refreshButton.current?.focus());
  }
  function recorded(decision:ReviewDecision) {
    if(!command||decision.id!==command.id||decision.requestId!==command.requestId||decision.revision!==command.revision+1||decision.reason!==command.reason)return;
    confirmed(decision,true);
  }
  async function commit() {
    if(!command)return;setMayHaveCommitted(true);setPhase('committing');setMessage('');
    try{
      const data=await request('reject',command),application=reviewApplication(data.application);
      if(application.id!==command.id||application.status!=='REJECTED'||application.revision!==command.revision+1)throw new Error();
      confirmed(application);
    }catch(error){
      if(error instanceof RequestError&&[404,409].includes(error.status)){setCommand(null);setMayHaveCommitted(false);setConflict(true);setPhase('idle');setMessage('Başvuru değişmiş veya artık incelemede olmayabilir. Listeyi yenileyip güncel başvuruyu tekrar seçin; gerekçeniz korunuyor.');}
      else if(error instanceof RequestError&&[401,403].includes(error.status)){setPhase('fresh');setMessage('Sonuç doğrulanamadı. Platform oturumunu yenileyip aynı işlemi yeniden doğrulayın.');}
      else{setPhase('uncertain');setMessage('Sonuç doğrulanamadı; başvuru reddedilmiş olabilir. Aynı işlemin sonucunu tekrar kontrol edin.');}
      window.requestAnimationFrame(()=>{if(error instanceof RequestError&&[404,409].includes(error.status))refreshButton.current?.focus();else actionButton.current?.focus();});
    }
  }
  return <section aria-labelledby="review-title" aria-busy={busy}>
    <h2 id="review-title">Bekleyen başvurular</h2><p>Başvuruyu inceleyip gerekçeyle reddedebilirsiniz. Onay ve lisans verme henüz kullanıma açılmadı.</p>
    <p role="status" aria-label="Başvuru inceleme durumu" aria-live="polite">{!available?'Platform oturumunu yenilemeniz gerekiyor. Devam eden işlem bilgileri bu ekranda korunuyor.':message||(!ready?'Başvurular yükleniyor…':'')}</p>
    <Button ref={refreshButton} disabled={!available||busy} onClick={()=>void refresh()}>Başvuruları yenile</Button>
    {available&&ready&&<>{items.length===0&&<p>İnceleme bekleyen başvuru yok.</p>}
      <ul className="review-list">{items.map(item=><li key={item.id}><h3>{item.requestedName}</h3><Button disabled={busy||!!command} onClick={()=>choose(item)} aria-label={`${item.requestedName} başvurusunu incele`}>İncele</Button></li>)}</ul>
      {cursor&&<Button disabled={busy||!!command} onClick={()=>void refresh(cursor)}>Daha fazla başvuru</Button>}</>}
    {selected&&<form onSubmit={event=>{event.preventDefault();void verify();}}>
      <h3>İncelenen başvuru: {selected.requestedName}</h3><p>Reddetmek işletme veya lisans etkinleştirmez.</p>
      <TextField ref={input} id="rejection-reason" label="Ret gerekçesi" value={command?.reason??reason} maxLength={1000} required autoComplete="off" disabled={!available||busy||!!command} onChange={event=>setReason(event.target.value)}/>
      {command&&<p className="review-reason"><strong>Ret gerekçesi:</strong> {command.reason}</p>}
      {!command&&<Button type="submit" disabled={!available||!capable||busy||conflict||!reason.trim()}>Geçiş anahtarıyla ret işlemini doğrula</Button>}
      {phase==='key'&&<Button onClick={()=>current.current?.abort()}>Ret doğrulamasını iptal et</Button>}
      {phase==='confirm'&&<Button ref={actionButton} disabled={!available||busy} onClick={()=>void commit()}>Reddetmeyi onayla</Button>}
      {phase==='uncertain'&&<Button ref={actionButton} disabled={!available||busy} onClick={()=>void commit()}>Aynı işlemin sonucunu tekrar kontrol et</Button>}
      {phase==='fresh'&&command&&<Button ref={actionButton} disabled={!available||!capable||busy} onClick={()=>void verify(command)}>Aynı ret işlemini yeniden doğrula</Button>}
      {!busy&&phase!=='uncertain'&&!(phase==='fresh'&&mayHaveCommitted)&&<Button onClick={()=>{setSelected(null);setCommand(null);setReason('');setMayHaveCommitted(false);setPhase('idle');}}>İncelemeyi kapat</Button>}
    </form>}
    {command&&mayHaveCommitted&&<p className="review-reason">Belirsiz işlemin referansı: {command.requestId}</p>}
    <DecisionHistory available={available} command={mayHaveCommitted&&!busy?command:null} onRecorded={recorded}/>
  </section>;
}
