import { expect, test } from '@playwright/test';
import { handleOnboarding } from '../apps/admin-pwa/src/lib/admin-onboarding';

const origin = 'https://admin.qmenux.com', id = '00000000-0000-4000-8000-000000000001';
const session = 's'.repeat(43), csrf = 'c'.repeat(43), key = 'o'.repeat(43);
const row = { id, requestedName: 'Test Kafe', status: 'DRAFT', revision: 1, createdAt: '2026-10-26T00:00:00.000Z', submittedAt: null };
const originalFetch = globalThis.fetch;
const envNames = ['ADMIN_AUTH_ENABLED', 'ADMIN_ONBOARDING_ENABLED', 'ADMIN_BFF_SECRET', 'ADMIN_ONBOARDING_SECRET', 'VERCEL_ENV', 'CRON_SECRET', 'NODE_TLS_REJECT_UNAUTHORIZED'] as const;
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
let calls: { url: string; init?: RequestInit }[];
let upstream: () => Response;
function request(method = 'GET', suffix = '', body?: string, extra: Record<string,string> = {}) {
  return new Request(`${origin}/api/onboarding/applications${suffix}`, { method,
    headers: { host: 'admin.qmenux.com', cookie: `__Host-qmenux_admin_session=${session}; __Host-qmenux_admin_csrf=${csrf}`,
      origin, 'content-type': 'application/json', 'x-qmenux-request': '1', 'x-csrf-token': csrf, ...extra },
    ...(body === undefined ? {} : { body }) });
}
const create = () => request('POST', '', JSON.stringify({ name: 'Test Kafe', idempotencyKey: id }));
test.beforeEach(() => {
  process.env.ADMIN_AUTH_ENABLED = 'true'; process.env.ADMIN_ONBOARDING_ENABLED = 'true';
  process.env.ADMIN_BFF_SECRET = 'k'.repeat(43); process.env.ADMIN_ONBOARDING_SECRET = key;
  delete process.env.VERCEL_ENV; delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  calls = []; upstream = () => Response.json({ application: row });
  globalThis.fetch = (async (input, init) => { calls.push({ url: String(input), init }); return upstream(); }) as typeof fetch;
});
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const name of envNames) { if (originalEnv[name] === undefined) delete process.env[name]; else process.env[name] = originalEnv[name]; }
});

test('application BFF denies disabled, preview, reused credentials and foreign authority before API calls', async () => {
  for (const [name, value] of [['ADMIN_AUTH_ENABLED','false'], ['ADMIN_ONBOARDING_ENABLED','false'],
    ['ADMIN_ONBOARDING_SECRET','invalid'], ['ADMIN_ONBOARDING_SECRET','k'.repeat(43)], ['CRON_SECRET', key],
    ['VERCEL_ENV','preview'], ['NODE_TLS_REJECT_UNAUTHORIZED','0']] as const) {
    const before = process.env[name]; process.env[name] = value;
    expect((await handleOnboarding(create())).status).toBe(503);
    if (before === undefined) delete process.env[name]; else process.env[name] = before;
  }
  expect((await handleOnboarding(request('GET','',undefined,{ host:'other.qmenux.com' }))).status).toBe(400);
  for (const cookie of ['', `__Host-qmenux_session=${session}`, `__Host-qmenux_operator_session=${session}`]) {
    expect((await handleOnboarding(request('GET','',undefined,{cookie}))).status).toBe(401);
  }
  expect((await handleOnboarding(request('GET','',undefined,{cookie:`__Host-qmenux_admin_session=${session}; __Host-qmenux_admin_session=${session}`}))).status).toBe(400);
  for (const method of ['PUT','HEAD','OPTIONS','DELETE']) {
    const res = await handleOnboarding(request(method)); expect(res.status).toBe(405); expect(res.headers.get('allow')).toBe('GET, POST');
  }
  expect((await handleOnboarding(request('POST','/approve','{}'))).status).toBe(404);
  expect(calls).toHaveLength(0);
});

test('application mutations reject cross-origin, unbound proof, duplicate JSON, unknown fields and oversized input', async () => {
  const invalidHeaders: Record<string,string>[] = [{origin:'https://cafe.qmenux.com'}, {'x-csrf-token':'x'.repeat(43)}, {'x-qmenux-request':'1, 1'},
    {'content-type':'text/plain'}, {'content-encoding':'gzip'}];
  for (const headers of invalidHeaders) {
    expect((await handleOnboarding(request('POST','',JSON.stringify({name:'Kafe',idempotencyKey:id}),headers))).status).toBe(400);
  }
  for (const body of ['null','[]', '{bad', `{"name":"Kafe","name":"Other","idempotencyKey":"${id}"}`,
    `{"name":"Kafe","na\\u006de":"Other","idempotencyKey":"${id}"}`,
    JSON.stringify({name:'Kafe',idempotencyKey:id,session}), JSON.stringify({name:'Kafe',idempotencyKey:id,tenant:id}),
    JSON.stringify({name:'Kafe',idempotencyKey:2}), JSON.stringify({name:' '.repeat(200),idempotencyKey:id})]) {
    expect((await handleOnboarding(request('POST','',body))).status).toBe(400);
  }
  expect((await handleOnboarding(request('POST','',' '.repeat(2049)))).status).toBe(413);
  expect((await handleOnboarding(request('PATCH',`/${id}`,JSON.stringify({name:'Kafe',revision:'1'})))).status).toBe(400);
  expect((await handleOnboarding(request('GET',`?after=${id}&after=${id}`))).status).toBe(400);
  expect((await handleOnboarding(request('GET','?tenant=other'))).status).toBe(400);
  expect(calls).toHaveLength(0);
});

test('application BFF pins all four operations, forwards only bound proofs and sanitizes projections', async () => {
  upstream = () => Response.json({ items:[{...row, applicant:'private'}], nextCursor:null, session });
  expect(await (await handleOnboarding(request())).json()).toEqual({items:[row],nextCursor:null});
  expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({session,limit:20});
  upstream = () => Response.json({ application:{...row, session, tenant:id} });
  expect(await (await handleOnboarding(create())).json()).toEqual({application:row});
  expect(JSON.parse(calls[1]!.init!.body as string)).toEqual({session,csrf,name:'Test Kafe',idempotencyKey:id});
  expect((await handleOnboarding(request('PATCH',`/${id}`,JSON.stringify({name:'Test Kafe',revision:1})))).status).toBe(200);
  upstream = () => Response.json({application:{...row,status:'PENDING_APPROVAL',revision:2,submittedAt:row.createdAt}});
  expect((await handleOnboarding(request('POST',`/${id}/submit`,JSON.stringify({revision:1})))).status).toBe(200);
  upstream=()=>Response.json({application:{...row,status:'APPROVED',revision:3,submittedAt:row.createdAt,approval_reason:'private'}});
  expect(await (await handleOnboarding(request('POST',`/${id}/submit`,JSON.stringify({revision:1})))).json()).toEqual({application:{...row,status:'APPROVED',revision:3,submittedAt:row.createdAt}});
  const rejected={...row,status:'REJECTED',revision:3,submittedAt:row.createdAt};
  upstream=()=>Response.json({application:{...rejected,rejection_reason:'private review reason',reviewed_by:id}});
  expect(await (await handleOnboarding(request('POST',`/${id}/submit`,JSON.stringify({revision:1})))).json()).toEqual({application:rejected});

  expect(calls.map(call=>call.url)).toEqual(['list','drafts',`drafts/${id}/edit`,`drafts/${id}/submit`,`drafts/${id}/submit`,`drafts/${id}/submit`].map(path=>`https://api.qmenux.com/v1/internal/admin-onboarding/${path}`));
  for (const call of calls) {
    expect(call.init).toMatchObject({method:'POST',cache:'no-store',redirect:'error'});
    const headers = new Headers(call.init!.headers); expect(headers.get('authorization')).toBe(`Bearer ${key}`); expect(headers.has('cookie')).toBe(false);
  }
});

test('application BFF rejects poisoned response state, identity, cursors and oversized responses; preserves safe conflicts', async () => {
  for (const application of [{...row,id:'00000000-0000-4000-8000-000000000002'}, {...row,status:'ACTIVE'}, {...row,createdAt:'yesterday'}, {...row,revision:0}]) {
    upstream = () => Response.json({application});
    expect((await handleOnboarding(request('PATCH',`/${id}`,JSON.stringify({name:'Kafe',revision:1})))).status).toBe(503);
  }
  for (const data of [{items:[row,row],nextCursor:null}, {items:[row],nextCursor:id}, {items:[{...row,status:'PENDING_APPROVAL'}],nextCursor:null}]) {
    upstream = () => Response.json(data); expect((await handleOnboarding(request())).status).toBe(503);
  }
  upstream = () => new Response('{', {headers:{'content-type':'application/json'}});
  expect((await handleOnboarding(create())).status).toBe(503);
  upstream = () => Response.json({application:row,private:'x'.repeat(33_000)});
  expect((await handleOnboarding(create())).status).toBe(503);
  for (const status of [400,401,404,409,500,302]) {
    upstream = () => new Response('private credentials', {status});
    const before = calls.length, res = await handleOnboarding(create());
    expect(res.status).toBe(status >= 500 || status === 302 ? 503 : status);
    expect(await res.text()).not.toContain('private'); expect(res.headers.has('set-cookie')).toBe(false);
    expect(res.headers.get('cache-control')).toBe('no-store'); expect(calls.length).toBe(before+1);
  }
});

test('real application handler uses browser host cookies and CSRF while keeping server credentials out of browser JSON', async ({ page,context }) => {
  await context.addCookies([
    {name:'__Host-qmenux_admin_session',value:session,url:origin,httpOnly:true,secure:true,sameSite:'Lax'},
    {name:'__Host-qmenux_admin_csrf',value:csrf,url:origin,httpOnly:false,secure:true,sameSite:'Lax'},
  ]);
  await page.route(`${origin}/**`, async route => {
    const incoming=route.request();
    if (!incoming.url().includes('/api/onboarding/')) { await route.fulfill({contentType:'text/html',body:'<main>Application cookie test</main>'}); return; }
    const response=await handleOnboarding(new Request(incoming.url(),{method:incoming.method(),
      headers:{...await incoming.allHeaders(),host:'admin.qmenux.com'},...(incoming.postData()?{body:incoming.postData()}:{} )}));
    const headers:Record<string,string>={}; response.headers.forEach((value,name)=>{headers[name]=value;});
    await route.fulfill({status:response.status,headers,body:await response.text()});
  });
  await page.goto(origin);
  expect(await page.evaluate(()=>document.cookie)).toBe(`__Host-qmenux_admin_csrf=${csrf}`);
  const result=await page.evaluate(async id=>{
    const csrf=document.cookie.split('=')[1]!;
    const response=await fetch('/api/onboarding/applications',{method:'POST',headers:{'Content-Type':'application/json','X-QMenuX-Request':'1','X-CSRF-Token':csrf},body:JSON.stringify({name:'Test Kafe',idempotencyKey:id})});
    return {status:response.status,data:await response.json()};
  },id);
  expect(result).toEqual({status:200,data:{application:row}});
  expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({session,csrf,name:'Test Kafe',idempotencyKey:id});
  expect(await context.cookies('https://cafe.qmenux.com')).toHaveLength(0);
  expect(await context.cookies('https://api.qmenux.com')).toHaveLength(0);
});
