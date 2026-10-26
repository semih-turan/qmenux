'use client';

import { Button } from '@qmenux/ui/button';
import { useEffect,useRef,useState } from 'react';
import { reviewDecision,uuidPattern,type ReviewDecision } from '../lib/review-model';

type Command={status:'APPROVED'|'REJECTED';id:string;revision:number;reason:string;requestId:string};
export default function DecisionHistory({available,command,onRecorded}:{available:boolean;command:Command|null;onRecorded:(decision:ReviewDecision)=>void}) {
  const [items,setItems]=useState<ReviewDecision[]>([]),[cursor,setCursor]=useState<string|null>(null),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const current=useRef<AbortController|null>(null),reload=useRef<HTMLButtonElement>(null);
  useEffect(()=>()=>current.current?.abort(),[available]);
  async function load(after?:string) {
    const controller=new AbortController();current.current=controller;setBusy(true);setMessage('');
    try{
      const response=await fetch(`/api/operator-review/decisions${after?`?after=${encodeURIComponent(after)}`:''}`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
      if(!response.ok)throw new Error();const data=await response.json();
      if(!Array.isArray(data.items)||data.items.length>5||(data.nextCursor!==null&&(typeof data.nextCursor!=='string'||!uuidPattern.test(data.nextCursor))))throw new Error();
      const rows=(data.items as unknown[]).map(reviewDecision);if(controller.signal.aborted)return;
      setItems(old=>after?[...old,...rows.filter(item=>!old.some(row=>row.id===item.id))]:rows);setCursor(data.nextCursor);setLoaded(true);setMessage('Kararlar yüklendi.');
    }catch{if(!controller.signal.aborted)setMessage('Kararlar yüklenemedi. Oturumunuzu ve bağlantınızı kontrol edip tekrar deneyin.');}
    finally{if(current.current===controller){setBusy(false);current.current=null;window.requestAnimationFrame(()=>reload.current?.focus());}}
  }
  return <section aria-labelledby="decisions-title" aria-busy={busy}>
    <h3 id="decisions-title">Kararlarım</h3><p>Bu platform hesabının kaydedilen kararlarını işletme adı, gerekçe, zaman ve işlem referansıyla kontrol edin. Listede kayıt bulunmaması, belirsiz bir işlemin gerçekleşmediğini kanıtlamaz.</p>
    <p role="status" aria-label="Karar yükleme durumu" aria-live="polite">{!available?'Kararları görmek için platform oturumunu yenileyin.':message||(busy?'Kararlar yükleniyor…':'')}</p>
    <Button ref={reload} disabled={!available||busy} onClick={()=>void load()}>Kararlarımı yükle</Button>
    {available&&loaded&&<>{items.length===0&&<p>Bu hesap için kaydedilen karar bulunamadı.</p>}
      <ul className="review-list">{items.map(item=><li key={item.id}><h4>{item.requestedName}</h4><p>{item.status==='APPROVED'?'Onaylandı — işletme erişimi ve lisans henüz verilmedi':'Reddedildi — işletme erişimi verilmedi'}</p>
        <p>Karar zamanı: <time dateTime={item.reviewedAt}>{new Date(item.reviewedAt).toLocaleString('tr-TR',{dateStyle:'medium',timeStyle:'short'})}</time></p>
        <p className="review-reason">Karar gerekçesi: {item.reason}</p><p className="review-reason">İşlem referansı: {item.requestId}</p>
        {command&&item.status===command.status&&item.id===command.id&&item.requestId===command.requestId&&item.revision===command.revision+1&&item.reason===command.reason&&<Button onClick={()=>onRecorded(item)}>Bu kayıtla sonucu doğrula</Button>}
      </li>)}</ul>
      {cursor&&<Button disabled={busy} onClick={()=>void load(cursor)}>Daha fazla karar</Button>}</>}
  </section>;
}
