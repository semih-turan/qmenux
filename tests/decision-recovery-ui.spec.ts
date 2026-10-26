import {expect,test,type Page} from '@playwright/test';

const id='00000000-0000-4000-8000-000000000001',operatorId='00000000-0000-4000-8000-000000000009';
const application={id,requestedName:'Test Kafe',status:'PENDING_APPROVAL',revision:2,createdAt:'2026-10-26T00:00:00.000Z',submittedAt:'2026-10-26T00:01:00.000Z'};
const decision={...application,status:'REJECTED',revision:3,reason:'Kaydedilen sentetik gerekçe',requestId:'00000000-0000-4000-8000-000000000002',reviewedAt:'2026-10-26T00:02:00.000Z'};
const history=(page:Page)=>page.getByRole('region',{name:'Ret kararlarım',exact:true});
async function operator(page:Page,identity=()=>operatorId) {
 await page.route('**/api/operator/me',route=>route.fulfill({json:{operator:{id:identity(),role:'PLATFORM_ADMIN'}}}));
 await page.route('**/api/operator-review/applications',route=>route.fulfill({json:{items:[],nextCursor:null}}));
}

test('own decisions survive reload on the server and cached private notes reset when verified operator changes',async({page})=>{
 let current=operatorId;await operator(page,()=>current);
 await page.route('**/api/operator-review/decisions',route=>route.fulfill({json:{items:current===operatorId?[decision]:[],nextCursor:null}}));
 await page.goto('http://127.0.0.1:3002');await history(page).getByRole('button',{name:'Ret kararlarımı yükle'}).click();
 await expect(history(page).getByText('Ret gerekçesi: '+decision.reason,{exact:true})).toBeVisible();await expect(history(page).getByRole('button',{name:'Ret kararlarımı yükle'})).toBeFocused();
 await page.reload();await expect(history(page).getByText('Ret gerekçesi: '+decision.reason,{exact:true})).toHaveCount(0);
 await history(page).getByRole('button',{name:'Ret kararlarımı yükle'}).click();await expect(history(page).getByText('İşlem referansı: '+decision.requestId,{exact:true})).toBeVisible();
 for(const width of [320,375,390,430]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 current='00000000-0000-4000-8000-000000000008';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(history(page).getByText('Ret gerekçesi: '+decision.reason,{exact:true})).toHaveCount(0);
 await history(page).getByRole('button',{name:'Ret kararlarımı yükle'}).click();await expect(history(page).getByText('Bu hesap için kaydedilen ret kararı bulunamadı.',{exact:true})).toBeVisible();
});

test('decision recovery has honest offline/empty states and bounded pagination',async({page})=>{
 await operator(page);let failed=true;
 await page.route('**/api/operator-review/decisions**',async route=>{
  if(failed){await route.abort('internetdisconnected');return;}
  const after=new URL(route.request().url()).searchParams.get('after');
  const items=after?[{...decision,id:'00000000-0000-4000-8000-000000000006'}]:Array.from({length:5},(_,n)=>({...decision,id:`00000000-0000-4000-8000-${String(n+1).padStart(12,'0')}`}));
  await route.fulfill({json:{items,nextCursor:after?null:items.at(-1)!.id}});
 });
 await page.goto('http://127.0.0.1:3002');await history(page).getByRole('button',{name:'Ret kararlarımı yükle'}).click();await expect(history(page).getByRole('status')).toContainText('Kararlar yüklenemedi');
 failed=false;await history(page).getByRole('button',{name:'Ret kararlarımı yükle'}).click();await expect(history(page).getByRole('listitem')).toHaveCount(5);
 await history(page).getByRole('button',{name:'Daha fazla ret kararı'}).click();await expect(history(page).getByRole('listitem')).toHaveCount(6);
 await expect(history(page).getByRole('button',{name:'Daha fazla ret kararı'})).toHaveCount(0);await expect(history(page).getByText(/Listede kayıt bulunmaması/)).toBeVisible();
});

test('only an exact recorded decision resolves an uncertain command without another write',async({page})=>{
 await operator(page);let command:{id:string;revision:number;reason:string;requestId:string}|undefined,commits=0,matches=false;
 await page.addInitScript(()=>{Object.defineProperty(document,'cookie',{get:()=>`__Host-qmenux_operator_csrf=${'c'.repeat(43)}`});Object.defineProperty(navigator.credentials,'get',{value:async()=>({type:'public-key',toJSON:()=>({id:'a2V5',rawId:'a2V5',type:'public-key',response:{clientDataJSON:'Y2xpZW50',authenticatorData:'YXV0aA',signature:'c2ln',userHandle:null},clientExtensionResults:{}})})});});
 await page.unroute('**/api/operator-review/applications');
 await page.route('**/api/operator-review/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/applications'))await route.fulfill({json:{items:[application],nextCursor:null}});
  else if(path.endsWith('/decisions'))await route.fulfill({json:{items:[{...decision,...command,revision:command!.revision+1,reason:matches?command!.reason:'Another reason',status:'REJECTED'}],nextCursor:null}});
  else if(path.endsWith('/start')){command=route.request().postDataJSON();await route.fulfill({json:{options:{challenge:'a'.repeat(42)+'A',timeout:60000,rpId:'superman.qmenux.com',userVerification:'required',allowCredentials:[{type:'public-key',id:'a2V5'}]}}});}
  else if(path.endsWith('/finish'))await route.fulfill({json:{status:'verified'}});
  else{commits++;await route.fulfill({status:503,json:{status:'unavailable'}});}
 });
 await page.goto('http://127.0.0.1:3002');await page.getByRole('button',{name:'Test Kafe başvurusunu incele'}).click();await page.getByRole('textbox',{name:'Ret gerekçesi'}).fill(decision.reason);
 await page.getByRole('button',{name:'Geçiş anahtarıyla ret işlemini doğrula'}).click();await page.getByRole('button',{name:'Reddetmeyi onayla',exact:true}).click();
 await history(page).getByRole('button',{name:'Ret kararlarımı yükle'}).click();await expect(history(page).getByRole('button',{name:'Bu kayıtla sonucu doğrula'})).toHaveCount(0);
  matches=true;await history(page).getByRole('button',{name:'Ret kararlarımı yükle'}).click();await history(page).getByRole('button',{name:'Bu kayıtla sonucu doğrula'}).click();
 await expect(page.getByRole('status',{name:'Başvuru inceleme durumu'})).toContainText('kaydedilen karardan doğrulandı');expect(commits).toBe(1);
});
