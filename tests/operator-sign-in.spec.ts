import { expect, test, type Page } from '@playwright/test';

const id='00000000-0000-4000-8000-000000000001';
const authentication={challenge:'a'.repeat(42)+'A',timeout:60000,rpId:'superman.qmenux.com',userVerification:'required',allowCredentials:[{type:'public-key',id:'a2V5'}]};
const registration={challenge:authentication.challenge,timeout:60000,rp:{id:'superman.qmenux.com',name:'QMenuX platform'},user:{id:Buffer.from(id).toString('base64url'),name:'QMenuX operator',displayName:''},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],attestation:'none',authenticatorSelection:{residentKey:'preferred',userVerification:'required'}};
async function browserKeys(page:Page) {
  await page.addInitScript(()=>{
    Object.defineProperty(document,'cookie',{get:()=>`__Host-qmenux_operator_csrf=${'c'.repeat(43)}`});
    const credential=()=>{
      const buffer=new TextEncoder().encode('key').buffer;
      return {id:'a2V5',rawId:buffer,type:'public-key',response:{clientDataJSON:buffer,authenticatorData:buffer,signature:buffer,userHandle:null},getClientExtensionResults:()=>({})};
    };
    Object.defineProperty(navigator.credentials,'get',{value:async(options:CredentialRequestOptions)=>{
      const flags=window as unknown as {cancel?:boolean;wait?:boolean};
      if(flags.cancel)throw new DOMException('Cancelled','NotAllowedError');
      if(flags.wait)return new Promise((_,reject)=>options.signal!.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError'))));
      return credential();
    }});
    Object.defineProperty(navigator.credentials,'create',{value:async()=>({...credential(),toJSON:()=>({id:'a2V5',rawId:'a2V5',type:'public-key',response:{attestationObject:'YXR0ZXN0',clientDataJSON:'Y2xpZW50'},clientExtensionResults:{}})})});
  });
}

test('mobile operator signs in with native API serialization fallback and only confirms checked identity; logout failure is honest',async({page})=>{
  await browserKeys(page);let signed=false,logoutFails=true;
  await page.route('**/api/operator/**',async route=>{
    const action=new URL(route.request().url()).pathname.split('/api/operator/')[1];
    if(action==='me'){await route.fulfill({status:signed?200:401,json:signed?{operator:{id,role:'PLATFORM_ADMIN'}}:{status:'unauthorized'}});return;}
    expect(route.request().headers()['x-csrf-token']).toBe('c'.repeat(43));expect(route.request().headers()['x-qmenux-request']).toBe('1');
    const body=route.request().postDataJSON();
    if(action==='authentication/start'){expect(body).toEqual({});await route.fulfill({json:{options:authentication}});return;}
    if(action==='authentication/finish'){
      const response=JSON.parse(body.response);expect(response.response.signature).toBe('a2V5');expect(response.response.userHandle).toBeNull();
      expect(body).not.toHaveProperty('session');expect(body).not.toHaveProperty('assertion');signed=true;await route.fulfill({json:{status:'signed_in'}});return;
    }
    if(logoutFails)await route.fulfill({status:503,json:{status:'unavailable'}});else{signed=false;await route.fulfill({json:{status:'signed_out'}});}
  });
  await page.goto('http://127.0.0.1:3002');
  const login=page.getByRole('button',{name:'Geçiş anahtarıyla doğrula',exact:true});await expect(login).toBeEnabled();
  for(const width of [320,375,390,430]){
    await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    for(const button of await page.getByRole('main').getByRole('button').all())expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await login.focus();await page.keyboard.press('Enter');await expect(page.getByRole('heading',{name:'Platform oturumu doğrulandı',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Çıkış yap',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('Oturumunuz açık olabilir');
  await expect(page.getByRole('heading',{name:'Platform oturumu doğrulandı',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Çıkış yap',exact:true})).toBeEnabled();logoutFails=false;
  await page.getByRole('button',{name:'Çıkış yap',exact:true}).click();await expect(login).toBeEnabled();
  await expect(page.getByRole('button',{name:'Çıkış yap',exact:true})).toHaveCount(0);
});

test('canceled or aborted native prompt never sends finish and restores keyboard focus',async({page})=>{
  await browserKeys(page);let finishes=0;
  await page.route('**/api/operator/**',async route=>{
    if(route.request().url().endsWith('/me')){await route.fulfill({status:401,json:{status:'unauthorized'}});return;}
    if(route.request().url().endsWith('/finish'))finishes++;
    await route.fulfill({json:{options:authentication}});
  });
  await page.goto('http://127.0.0.1:3002');await page.evaluate(()=>{(window as unknown as {cancel:boolean}).cancel=true;});
  const login=page.getByRole('button',{name:'Geçiş anahtarıyla doğrula',exact:true});await login.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('İşlem iptal edildi');await expect(login).toBeFocused();
  await page.evaluate(()=>{const flags=window as unknown as {cancel:boolean;wait:boolean};flags.cancel=false;flags.wait=true;});
  await login.click();await page.getByRole('button',{name:'İşlemi iptal et'}).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('İşlem iptal edildi');await expect(login).toBeFocused();expect(finishes).toBe(0);
});

test('enrollment clears its secret and requires separate sign-in without granting access',async({page})=>{
  await browserKeys(page);let authStarts=0;
  await page.route('**/api/operator/**',async route=>{
    const action=route.request().url();
    if(action.endsWith('/me')){await route.fulfill({status:401,json:{status:'unauthorized'}});return;}
    if(action.includes('/authentication/'))authStarts++;
    if(action.endsWith('/registration/start')){expect(route.request().postDataJSON()).toEqual({grant:'g'.repeat(43)});await route.fulfill({json:{options:registration}});}
    else await route.fulfill({json:{status:'registered'}});
  });
  await page.goto('http://127.0.0.1:3002');await page.getByText('İlk geçiş anahtarını kaydet',{exact:true}).click();
  const input=page.getByLabel('Kayıt izin kodu',{exact:true});await expect(input).toHaveAttribute('type','password');
  await input.fill('g'.repeat(43));await input.press('Enter');await expect(page.getByRole('status')).toContainText('Giriş için ayrıca doğrulayın');
  await expect(input).toHaveValue('');expect(authStarts).toBe(0);await expect(page.getByRole('heading',{name:'Platform oturumu doğrulandı',exact:true})).toHaveCount(0);
});

test('unsupported browser, offline requests and unregistered routes never imply verified access',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(window,'PublicKeyCredential',{value:undefined}));
  await page.route('**/api/operator/me',route=>route.fulfill({status:401,json:{status:'unauthorized'}}));
  await page.goto('http://127.0.0.1:3002');await expect(page.getByRole('status')).toContainText('güncel ve güvenli');
  await expect(page.getByRole('button',{name:'Geçiş anahtarıyla doğrula',exact:true})).toBeDisabled();
  await page.unroute('**/api/operator/me');await page.route('**/api/operator/me',route=>route.abort('internetdisconnected'));
  await page.reload();await expect(page.getByRole('status')).toContainText('bağlantı kurulamadı');
  await expect(page.getByRole('button',{name:'Yeniden kontrol et'})).toBeVisible();await expect(page.getByRole('main').getByRole('button')).toHaveCount(1);
});

test('returning to the app rechecks expired MFA before retaining authenticated presentation',async({page})=>{
  await browserKeys(page);let expired=false;
  await page.route('**/api/operator/me',route=>route.fulfill({status:expired?403:200,json:expired?{status:'forbidden'}:{operator:{id,role:'PLATFORM_ADMIN'}}}));
  await page.goto('http://127.0.0.1:3002');await expect(page.getByRole('heading',{name:'Platform oturumu doğrulandı',exact:true})).toBeVisible();
  expired=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button',{name:'Geçiş anahtarıyla doğrula',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Platform oturumu doğrulandı',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Çıkış yap',exact:true})).toBeVisible();
});
