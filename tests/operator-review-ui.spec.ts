import {expect,test,type Page} from '@playwright/test';

const application={id:'00000000-0000-4000-8000-000000000001',requestedName:'Test Kafe',status:'PENDING_APPROVAL',revision:2,createdAt:'2026-10-26T00:00:00.000Z',submittedAt:'2026-10-26T00:01:00.000Z'};
const options={challenge:'a'.repeat(42)+'A',timeout:60000,rpId:'superman.qmenux.com',userVerification:'required',allowCredentials:[{type:'public-key',id:'a2V5'}]};
async function operator(page:Page,expired=()=>false) {
 await page.route('**/api/operator/me',route=>route.fulfill({status:expired()?403:200,json:expired()?{status:'forbidden'}:{operator:{id:application.id,role:'PLATFORM_ADMIN'}}}));
 await page.addInitScript(()=>{
  Object.defineProperty(document,'cookie',{get:()=>`__Host-qmenux_operator_csrf=${'c'.repeat(43)}`});
  Object.defineProperty(navigator.credentials,'get',{value:async()=>{
   if((window as unknown as {cancel:boolean}).cancel)throw new DOMException('Canceled','NotAllowedError');
   return {type:'public-key',toJSON:()=>({id:'a2V5',rawId:'a2V5',type:'public-key',response:{clientDataJSON:'Y2xpZW50',authenticatorData:'YXV0aA',signature:'c2ln',userHandle:null},clientExtensionResults:{}})};
  }});
 });
}
const panel=(page:Page)=>page.getByRole('region',{name:'Bekleyen başvurular',exact:true});
async function choose(page:Page) {
 await page.goto('http://127.0.0.1:3002');await page.getByRole('button',{name:'Test Kafe başvurusunu incele'}).click();
 await panel(page).getByRole('textbox',{name:'Ret gerekçesi'}).fill('Sentetik ret gerekçesi');
}

test('mobile review requires explicit confirmation after verification and retries an uncertain result with the same frozen command',async({page})=>{
 await operator(page);let rejected=false,attempts=0;const commands:unknown[]=[];
 await page.route('**/api/operator-review/**',async route=>{
  const url=route.request().url(),body=route.request().postDataJSON();
  if(url.endsWith('/applications')){await route.fulfill({json:{items:rejected?[]:[application],nextCursor:null}});return;}
  if(url.endsWith('/rejection/start')){commands.push(body);await route.fulfill({json:{options}});return;}
  if(url.endsWith('/rejection/finish')){expect(body).toMatchObject(commands[0] as Record<string,unknown>);expect(body).not.toHaveProperty('proof');await route.fulfill({json:{status:'verified'}});return;}
  commands.push(body);attempts++;if(attempts===1){await route.fulfill({status:503,json:{status:'unavailable'}});return;}
  rejected=true;await route.fulfill({json:{application:{...application,status:'REJECTED',revision:3}}});
 });
 await choose(page);
 for(const width of [320,375,390,430]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);for(const button of await panel(page).getByRole('button').all())expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);}
 await panel(page).getByRole('textbox').press('Enter');await expect(panel(page).getByRole('button',{name:'Reddetmeyi onayla',exact:true})).toBeVisible();await expect(panel(page).getByRole('button',{name:'Reddetmeyi onayla',exact:true})).toBeFocused();expect(attempts).toBe(0);
 await expect(panel(page).getByRole('textbox')).toBeDisabled();await expect(panel(page).getByText('Ret gerekçesi: Sentetik ret gerekçesi',{exact:true})).toBeVisible();await panel(page).getByRole('button',{name:'Reddetmeyi onayla',exact:true}).click();
 await expect(panel(page).getByRole('status')).toContainText('reddedilmiş olabilir');await expect(panel(page).getByRole('textbox')).toHaveValue('Sentetik ret gerekçesi');
 await panel(page).getByRole('button',{name:'Aynı işlemin sonucunu tekrar kontrol et'}).click();
 await expect(panel(page).getByRole('status')).toContainText('reddedildiği doğrulandı');expect(attempts).toBe(2);expect(commands[1]).toEqual(commands[0]);expect(commands[2]).toEqual(commands[0]);
});

test('canceling native review verification sends no finish or rejection and retains the editable reason',async({page})=>{
 await operator(page);let finishes=0,commits=0;
 await page.route('**/api/operator-review/**',async route=>{
  const url=route.request().url();if(url.endsWith('/applications')){await route.fulfill({json:{items:[application],nextCursor:null}});return;}
  if(url.endsWith('/finish'))finishes++;if(url.endsWith('/reject'))commits++;await route.fulfill({json:{options}});
 });
 await choose(page);await page.evaluate(()=>{(window as unknown as {cancel:boolean}).cancel=true;});
 await panel(page).getByRole('button',{name:'Geçiş anahtarıyla ret işlemini doğrula'}).click();
 await expect(panel(page).getByRole('status')).toContainText('Başvuru reddedilmedi');await expect(panel(page).getByRole('textbox')).toBeEnabled();await expect(panel(page).getByRole('textbox')).toBeFocused();expect(finishes).toBe(0);expect(commits).toBe(0);
});

test('a review conflict retains the reason and requires reselecting the refreshed revision and fresh verification',async({page})=>{
 await operator(page);let revision=2,attempts=0;const starts:{revision:number;requestId:string}[]=[];
 await page.route('**/api/operator-review/**',async route=>{
  const url=route.request().url();if(url.endsWith('/applications')){await route.fulfill({json:{items:[{...application,revision}],nextCursor:null}});return;}
  if(url.endsWith('/rejection/start')){starts.push(route.request().postDataJSON());await route.fulfill({json:{options}});return;}
  if(url.endsWith('/rejection/finish')){await route.fulfill({json:{status:'verified'}});return;}
  attempts++;if(attempts===1){revision=3;await route.fulfill({status:409,json:{status:'conflict'}});return;}await route.fulfill({json:{application:{...application,status:'REJECTED',revision:4}}});
 });
 await choose(page);await panel(page).getByRole('button',{name:'Geçiş anahtarıyla ret işlemini doğrula'}).click();await panel(page).getByRole('button',{name:'Reddetmeyi onayla',exact:true}).click();
 await expect(panel(page).getByRole('status')).toContainText('gerekçeniz korunuyor');await expect(panel(page).getByRole('textbox')).toHaveValue('Sentetik ret gerekçesi');
 await expect(panel(page).getByRole('button',{name:'Geçiş anahtarıyla ret işlemini doğrula'})).toBeDisabled();
 await panel(page).getByRole('button',{name:'Başvuruları yenile'}).click();await panel(page).getByRole('button',{name:'Test Kafe başvurusunu incele'}).click();
 await panel(page).getByRole('button',{name:'Geçiş anahtarıyla ret işlemini doğrula'}).click();await panel(page).getByRole('button',{name:'Reddetmeyi onayla',exact:true}).click();
 await expect(panel(page).getByRole('status')).toContainText('reddedildiği doğrulandı');expect(starts.map(item=>item.revision)).toEqual([2,3]);expect(starts[0]!.requestId).not.toBe(starts[1]!.requestId);
});

test('an uncertain command survives expired MFA and explicit reauthentication without a new rejection payload',async({page})=>{
 let expired=false;await operator(page,()=>expired);let attempts=0;const commits:unknown[]=[];
 await page.route('**/api/operator/authentication/**',async route=>{if(route.request().url().endsWith('/start'))await route.fulfill({json:{options}});else{expired=false;await route.fulfill({json:{status:'signed_in'}});}});
 await page.route('**/api/operator-review/**',async route=>{
  const url=route.request().url();if(url.endsWith('/applications')){await route.fulfill({json:{items:[application],nextCursor:null}});return;}
  if(url.endsWith('/rejection/start')){await route.fulfill({json:{options}});return;}if(url.endsWith('/rejection/finish')){await route.fulfill({json:{status:'verified'}});return;}
  commits.push(route.request().postDataJSON());attempts++;await route.fulfill(attempts===1?{status:503,json:{status:'unavailable'}}:{json:{application:{...application,status:'REJECTED',revision:3}}});
 });
 await choose(page);await panel(page).getByRole('button',{name:'Geçiş anahtarıyla ret işlemini doğrula'}).click();await panel(page).getByRole('button',{name:'Reddetmeyi onayla',exact:true}).click();
 await expect(panel(page).getByRole('status')).toContainText('reddedilmiş olabilir');expired=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(panel(page).getByRole('status')).toContainText('Platform oturumunu yenilemeniz');await expect(panel(page).getByRole('textbox')).toHaveValue('Sentetik ret gerekçesi');
 await page.getByRole('button',{name:'Geçiş anahtarıyla doğrula',exact:true}).click();await expect(panel(page).getByRole('button',{name:'Aynı işlemin sonucunu tekrar kontrol et'})).toBeEnabled();
 await panel(page).getByRole('button',{name:'Aynı işlemin sonucunu tekrar kontrol et'}).click();await expect(panel(page).getByRole('status')).toContainText('reddedildiği doğrulandı');expect(commits[1]).toEqual(commits[0]);
});


test('a failed verification start can be closed safely without a rejection request',async({page})=>{
 await operator(page);let commits=0;
 await page.route('**/api/operator-review/**',async route=>{
  if(route.request().url().endsWith('/applications'))await route.fulfill({json:{items:[application],nextCursor:null}});
  else{if(route.request().url().endsWith('/reject'))commits++;await route.fulfill({status:503,json:{status:'unavailable'}});}
 });
 await choose(page);await panel(page).getByRole('button',{name:'Geçiş anahtarıyla ret işlemini doğrula'}).click();
 await expect(panel(page).getByRole('status')).toContainText('Doğrulama tamamlanamadı');await panel(page).getByRole('button',{name:'İncelemeyi kapat'}).click();await expect(panel(page).getByRole('textbox')).toHaveCount(0);expect(commits).toBe(0);
});
