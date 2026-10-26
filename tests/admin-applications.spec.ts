import { expect, test, type Page } from '@playwright/test';
import type { Application } from '../apps/admin-pwa/src/lib/onboarding-model';

const id = '00000000-0000-4000-8000-000000000001';
const draft: Application = { id, requestedName: 'Test Kafe', status: 'DRAFT', revision: 1, createdAt: '2026-10-26T00:00:00.000Z', submittedAt: null };
async function signedIn(page: Page) {
  await page.route('**/api/auth/providers', route => route.fulfill({ json: { providers: [] } }));
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { status: 'REGISTERED' }, tenantAccess: false } }));
  await page.addInitScript(() => Object.defineProperty(document, 'cookie', { get: () => `__Host-qmenux_admin_csrf=${'c'.repeat(43)}` }));
}

test('mobile applicant creates, edits and explicitly submits a draft without receiving tenant access', async ({ page }) => {
  await signedIn(page);
  let current: Application | undefined;
  const operations: string[] = [];
  await page.route('**/api/onboarding/applications**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (req.method() === 'GET') { await route.fulfill({ json: { items: current ? [current] : [], nextCursor: null } }); return; }
    expect(req.headers()['x-qmenux-request']).toBe('1'); expect(req.headers()['x-csrf-token']).toBe('c'.repeat(43));
    const body = req.postDataJSON(); operations.push(req.method());
    expect(body).not.toHaveProperty('session'); expect(body).not.toHaveProperty('tenant');
    if (req.method() === 'PATCH') {
      expect(body).toEqual({name:'Test Restoran',revision:1}); current = {...draft,requestedName:body.name,revision:2};
    } else if (path.endsWith('/submit')) {
      expect(body).toEqual({revision:2}); current = {...current!,status:'PENDING_APPROVAL',revision:3,submittedAt:draft.createdAt};
    } else {
      expect(body.name).toBe('Test Kafe'); expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/); current = draft;
    }
    await route.fulfill({json:{application:current}});
  });
  await page.goto('http://127.0.0.1:3001');
  await expect(page.getByText('Henüz başvurunuz yok.')).toBeVisible();
  const input = page.getByRole('textbox',{name:'İşletme adı'});
  for (const width of [320,375,390,430]) {
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    for (const button of await page.getByRole('main').getByRole('button').all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await input.fill('Test Kafe'); await input.press('Tab');
  await expect(page.getByRole('button',{name:'Taslağı kaydet',exact:true})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'Test Kafe',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Test Kafe taslağını düzenle'}).click(); await expect(input).toBeFocused();
  await input.fill('Test Restoran'); await page.getByRole('button',{name:'Değişiklikleri kaydet'}).click();
  await expect(page.getByRole('heading',{name:'Test Restoran',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Test Restoran başvurusunu onaya gönder'}).click();
  await expect(page.getByText('Onay bekliyor — işletme erişimi henüz verilmedi',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Test Restoran başvurusunu onaya gönder'})).toHaveCount(0);
  expect(operations).toEqual(['POST','PATCH','POST']);
});

test('uncertain create retry retains its UUID/name and displays an already submitted result accurately', async ({ page }) => {
  await signedIn(page); const bodies: object[] = [];
  await page.route('**/api/onboarding/applications', async route => {
    if (route.request().method()==='GET') { await route.fulfill({json:{items:[],nextCursor:null}}); return; }
    bodies.push(route.request().postDataJSON());
    if (bodies.length===1) await route.abort('internetdisconnected');
    else await route.fulfill({json:{application:{...draft,status:'PENDING_APPROVAL',revision:2,submittedAt:draft.createdAt}}});
  });
  await page.goto('http://127.0.0.1:3001');
  const input = page.getByRole('textbox',{name:'İşletme adı'});
  await input.fill('Test Kafe'); await page.getByRole('button',{name:'Taslağı kaydet',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('İşlem doğrulanamadı');
  await expect(input).toBeDisabled(); await expect(input).toHaveValue('Test Kafe');
  await expect(page.getByRole('heading',{name:'Test Kafe',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Aynı taslağı tekrar dene'}).click();
  await expect(page.getByRole('heading',{name:'Test Kafe',exact:true})).toBeVisible();
  expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0]); await expect(input).toBeEnabled();
  await expect(page.getByRole('status')).toContainText('Başvurunuz onay bekliyor');
  await expect(page.getByRole('button',{name:'Test Kafe başvurusunu onaya gönder'})).toHaveCount(0);
});

test('conflicting edit preserves input and refreshes only on request; pending submission retry is safe', async ({ page }) => {
  await signedIn(page); let revision = 1, edits = 0, submits = 0;
  await page.route('**/api/onboarding/applications**', async route => {
    const req = route.request();
    if(req.method()==='GET') { await route.fulfill({json:{items:[{...draft,revision}],nextCursor:null}}); return; }
    if(req.method()==='PATCH') {
      edits++; revision=2; await route.fulfill({status:409,json:{status:'conflict'}}); return;
    }
    submits++; expect(req.postDataJSON()).toEqual({revision:2});
    if(submits===1) await route.abort('internetdisconnected');
    else await route.fulfill({json:{application:{...draft,revision:3,status:'PENDING_APPROVAL',submittedAt:draft.createdAt}}});
  });
  await page.goto('http://127.0.0.1:3001');
  await page.getByRole('button',{name:'Test Kafe taslağını düzenle'}).click();
  const input=page.getByRole('textbox',{name:'İşletme adı'}); await input.fill('Unsaved Kafe');
  await page.getByRole('button',{name:'Değişiklikleri kaydet'}).click();
  await expect(page.getByRole('status')).toContainText('Başvuru değişmiş olabilir'); await expect(input).toHaveValue('Unsaved Kafe'); expect(edits).toBe(1);
  await page.getByRole('button',{name:'Listeyi yenile'}).click(); await expect(page.getByRole('button',{name:'Listeyi yenile'})).toBeEnabled();
  await page.getByRole('button',{name:'Düzenlemeyi kapat'}).click();
  await page.getByRole('button',{name:'Test Kafe başvurusunu onaya gönder'}).click();
  await expect(page.getByRole('status')).toContainText('İşlem doğrulanamadı');
  await page.getByRole('button',{name:'Test Kafe başvurusunu onaya gönder'}).click();
  await expect(page.getByText('Onay bekliyor — işletme erişimi henüz verilmedi',{exact:true})).toBeVisible(); expect(submits).toBe(2);
});

test('application unavailable state retries and pages own results; actual unconfigured route stays closed', async ({ page,request }) => {
  const res = await request.get('http://127.0.0.1:3001/api/onboarding/applications');
  expect(res.status()).toBe(503); expect(res.headers()['cache-control']).toBe('no-store'); expect(res.headers()['set-cookie']).toBeUndefined();
  await signedIn(page); let retry=false;
  await page.route('**/api/onboarding/applications**', async route => {
    if(!retry) { await route.fulfill({status:503,json:{status:'unavailable'}}); return; }
    const after=new URL(route.request().url()).searchParams.get('after');
    const items=Array.from({length:after?1:20},(_,index)=>({...draft,id:`00000000-0000-4000-8000-${String((after?21:1)+index).padStart(12,'0')}`,requestedName:`Test Kafe ${(after?21:1)+index}`}));
    await route.fulfill({json:{items,nextCursor:after?null:items.at(-1)!.id}});
  });
  await page.goto('http://127.0.0.1:3001'); await expect(page.getByRole('status')).toContainText('Başvurular yüklenemedi');
  await expect(page.getByRole('textbox')).toHaveCount(0); retry=true; await page.getByRole('button',{name:'Listeyi yenile'}).click();
  await expect(page.getByRole('heading',{name:'Test Kafe 20',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Daha fazla başvuru'}).click();
  await expect(page.getByRole('heading',{name:'Test Kafe 21',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Daha fazla başvuru'})).toHaveCount(0);
});


test('rejected application is terminal and a stale submit reports its authoritative decision',async({page})=>{
  await signedIn(page);let decided=false;
  await page.route('**/api/onboarding/applications**',async route=>{
    if(route.request().method()==='GET'){await route.fulfill({json:{items:[{...draft,status:'PENDING_APPROVAL',revision:2,submittedAt:draft.createdAt}],nextCursor:null}});return;}
    decided=true;await route.fulfill({json:{application:{...draft,status:'REJECTED',revision:3,submittedAt:draft.createdAt}}});
  });
  // A stale draft view may submit after another session has already sent and reviewed it.
  await page.route('**/api/onboarding/applications',route=>route.fulfill({json:{items:[decided?{...draft,status:'REJECTED',revision:3,submittedAt:draft.createdAt}:draft],nextCursor:null}}));
  await page.goto('http://127.0.0.1:3001');await page.getByRole('button',{name:'Test Kafe başvurusunu onaya gönder'}).click();
  await expect(page.getByRole('status')).toContainText('Başvurunuz reddedildi');
  await expect(page.getByText('Reddedildi — işletme erişimi verilmedi',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Test Kafe başvurusunu onaya gönder'})).toHaveCount(0);expect(decided).toBe(true);
  await page.reload();await expect(page.getByText('Reddedildi — işletme erişimi verilmedi',{exact:true})).toBeVisible();
  for(const width of [320,375,390,430]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
});


test('approved application remains read-only and explicitly grants no license or business access',async({page})=>{
 await signedIn(page);await page.route('**/api/onboarding/applications**',route=>route.fulfill({json:{items:[{...draft,status:'APPROVED',revision:3,submittedAt:draft.createdAt}],nextCursor:null}}));
 await page.goto('http://127.0.0.1:3001');await expect(page.getByText('Onaylandı — işletme erişimi ve lisans henüz verilmedi',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Test Kafe başvurusunu onaya gönder'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Test Kafe taslağını düzenle'})).toHaveCount(0);
});
