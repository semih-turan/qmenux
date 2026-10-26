import {expect,test,type Page} from '@playwright/test';

const application={id:'00000000-0000-4000-8000-000000000001',requestedName:'Test Kafe',status:'PENDING_APPROVAL',revision:2,createdAt:'2026-10-26T00:00:00.000Z',submittedAt:'2026-10-26T00:01:00.000Z'};
const options={challenge:'a'.repeat(42)+'A',timeout:60000,rpId:'superman.qmenux.com',userVerification:'required',allowCredentials:[{type:'public-key',id:'a2V5'}]};
async function operator(page:Page) {
 await page.route('**/api/operator/me',route=>route.fulfill({json:{operator:{id:application.id,role:'PLATFORM_ADMIN'}}}));
 await page.addInitScript(()=>{Object.defineProperty(document,'cookie',{get:()=>`__Host-qmenux_operator_csrf=${'c'.repeat(43)}`});Object.defineProperty(navigator.credentials,'get',{value:async()=>{if((window as unknown as {cancel:boolean}).cancel)throw new DOMException('Canceled','NotAllowedError');return {type:'public-key',toJSON:()=>({id:'a2V5',rawId:'a2V5',type:'public-key',response:{clientDataJSON:'Y2xpZW50',authenticatorData:'YXV0aA',signature:'c2ln',userHandle:null},clientExtensionResults:{}})};}});});
}
async function selectApproval(page:Page) {
 await page.goto('http://127.0.0.1:3002');await page.getByRole('button',{name:'Test Kafe başvurusunu incele'}).click();await page.getByRole('button',{name:'Onay kararını seç'}).click();
 await page.getByRole('textbox',{name:'Onay gerekçesi'}).fill('Sentetik onay gerekçesi');
}

test('approval requires selected intent, native verification and separate confirmation; uncertain retry preserves payload without claiming activation',async({page})=>{
 await operator(page);let commits=0;const payloads:unknown[]=[];
 await page.route('**/api/operator-review/**',async route=>{
  const url=route.request().url();if(url.endsWith('/applications')){await route.fulfill({json:{items:[application],nextCursor:null}});return;}
  if(url.endsWith('/approval/start')){payloads.push(route.request().postDataJSON());await route.fulfill({json:{options}});return;}
  if(url.endsWith('/approval/finish')){await route.fulfill({json:{status:'verified'}});return;}
  expect(url.endsWith('/approve')).toBe(true);commits++;payloads.push(route.request().postDataJSON());
  await route.fulfill(commits===1?{status:503,json:{status:'unavailable'}}:{json:{application:{...application,status:'APPROVED',revision:3}}});
 });
 await selectApproval(page);await expect(page.getByRole('button',{name:'Onay kararını seç'})).toHaveAttribute('aria-pressed','true');
 for(const width of [320,375,390,430]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.getByRole('textbox',{name:'Onay gerekçesi'}).press('Enter');const confirm=page.getByRole('button',{name:'Başvuruyu onayla',exact:true});await expect(confirm).toBeFocused();expect(commits).toBe(0);
 await expect(page.getByRole('button',{name:'Ret kararını seç'})).toBeDisabled();await confirm.click();await expect(page.getByRole('status',{name:'Başvuru inceleme durumu'})).toContainText('onaylanmış olabilir');
 await page.getByRole('button',{name:'Aynı işlemin sonucunu tekrar kontrol et'}).click();await expect(page.getByRole('status',{name:'Başvuru inceleme durumu'})).toContainText('onaylandığı doğrulandı');
 await expect(page.getByRole('status',{name:'Başvuru inceleme durumu'})).toContainText('İşletme erişimi veya lisans verilmedi');expect(payloads[1]).toEqual(payloads[0]);expect(payloads[2]).toEqual(payloads[0]);
});

test('canceling approval verification never sends finish or commit and permits an explicit decision change',async({page})=>{
 await operator(page);let finishes=0,commits=0;
 await page.route('**/api/operator-review/**',async route=>{const url=route.request().url();if(url.endsWith('/applications'))await route.fulfill({json:{items:[application],nextCursor:null}});else{if(url.endsWith('/finish'))finishes++;if(url.endsWith('/approve'))commits++;await route.fulfill({json:{options}});}});
 await selectApproval(page);await page.evaluate(()=>{(window as unknown as {cancel:boolean}).cancel=true;});await page.getByRole('button',{name:'Geçiş anahtarıyla onay işlemini doğrula'}).click();
 await expect(page.getByRole('status',{name:'Başvuru inceleme durumu'})).toContainText('Başvuru onaylanmadı');await expect(page.getByRole('textbox',{name:'Onay gerekçesi'})).toBeEnabled();
 await page.getByRole('button',{name:'Ret kararını seç'}).click();await expect(page.getByRole('textbox',{name:'Ret gerekçesi'})).toHaveValue('Sentetik onay gerekçesi');expect(finishes).toBe(0);expect(commits).toBe(0);
});
