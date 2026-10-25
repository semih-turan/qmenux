import { expect, test } from '@playwright/test';
import { handleAuth } from '../apps/admin-pwa/src/lib/admin-auth';

const origin = 'https://admin.qmenux.com';
const session = 's'.repeat(43), csrf = 'c'.repeat(43), state = 't'.repeat(43), browser = 'b'.repeat(43);
const user = { id: '00000000-0000-4000-8000-000000000001', status: 'REGISTERED' };
const sessionCookie = `__Host-qmenux_admin_session=${session}`;
const csrfCookie = `__Host-qmenux_admin_csrf=${csrf}`;
let calls: { url: string; init?: RequestInit }[];
let upstream: (url: string, init?: RequestInit) => Response | Promise<Response>;
const originalFetch = globalThis.fetch;
const originalEnabled = process.env.ADMIN_AUTH_ENABLED, originalKey = process.env.ADMIN_BFF_SECRET;
const request = (path: string, method = 'GET', headers: Record<string, string> = {}, body?: string) =>
  new Request(`${origin}/api/auth/${path}`, { method, headers: { host: 'admin.qmenux.com', ...headers }, ...(body === undefined ? {} : { body }) });
const mutation = (path: string, extra: Record<string, string> = {}, body = '{}') =>
  request(path, 'POST', { origin, 'content-type': 'application/json', 'x-qmenux-request': '1', ...extra }, body);
const callback = (extra = '', cookies = `__Host-qmenux_admin_google_login=${browser}`) =>
  request(`google/callback?state=${state}&code=synthetic-code${extra}`, 'GET', { cookie: cookies });
const authUrl = (provider = 'google') => {
  const base = provider === 'google' ? 'https://accounts.google.com/o/oauth2/v2/auth'
    : provider === 'apple' ? 'https://appleid.apple.com/auth/authorize'
      : 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/oauth2/v2.0/authorize';
  const url = new URL(base);
  Object.entries({ client_id: 'synthetic-client', response_type: 'code', redirect_uri: `${origin}/api/auth/${provider}/callback`,
    state, nonce: 'n'.repeat(43), ...(provider === 'apple' ? { response_mode: 'query' } : { code_challenge: 'p'.repeat(43), code_challenge_method: 'S256' }) })
    .forEach(([key, value]) => url.searchParams.set(key, value));
  return url.href;
};

test.beforeEach(() => {
  process.env.ADMIN_AUTH_ENABLED = 'true'; process.env.ADMIN_BFF_SECRET = 'k'.repeat(43);
  calls = [];
  upstream = () => Response.json({ user, tenantAccess: false });
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init }); return upstream(url, init);
  }) as typeof fetch;
});
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalEnabled === undefined) delete process.env.ADMIN_AUTH_ENABLED; else process.env.ADMIN_AUTH_ENABLED = originalEnabled;
  if (originalKey === undefined) delete process.env.ADMIN_BFF_SECRET; else process.env.ADMIN_BFF_SECRET = originalKey;
});

test('disabled configuration, unsafe TLS, invalid hosts and unsupported methods fail before upstream work', async () => {
  delete process.env.ADMIN_BFF_SECRET;
  expect((await handleAuth(request('providers'))).status).toBe(503);
  process.env.ADMIN_BFF_SECRET = 'invalid';
  expect((await handleAuth(request('providers'))).status).toBe(503);
  process.env.ADMIN_BFF_SECRET = 'k'.repeat(43);
  process.env.ADMIN_AUTH_ENABLED = 'false';
  expect((await handleAuth(request('providers'))).status).toBe(503);
  process.env.ADMIN_AUTH_ENABLED = 'true';
  const environment = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = 'preview';
    expect((await handleAuth(request('providers'))).status).toBe(503);
  } finally { if (environment === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = environment; }
  const tls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    expect((await handleAuth(request('providers'))).status).toBe(503);
  } finally { if (tls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED; else process.env.NODE_TLS_REJECT_UNAUTHORIZED = tls; }
  expect((await handleAuth(request('providers', 'GET', { host: 'evil.example' }))).status).toBe(400);
  expect((await handleAuth(new Request('https://evil.example/api/auth/me', { headers: { host: 'admin.qmenux.com' } }))).status).toBe(400);
  expect((await handleAuth(request('unknown'))).status).toBe(404);
  for (const path of ['google/start', 'google/callback', 'me', 'logout', 'providers']) {
    for (const method of ['HEAD', 'OPTIONS', 'PUT']) {
      const res = await handleAuth(request(path, method));
      expect(res.status).toBe(405); expect(res.headers.get('cache-control')).toBe('no-store');
    }
  }
  expect(calls).toHaveLength(0);
});

test('start requires exact Origin, custom header and bounded empty JSON; rejects sibling and duplicate headers', async () => {
  const invalidHeaders: Record<string, string>[] = [{ origin: 'https://cafe.qmenux.com' }, { origin: 'null' }, { origin: '' },
    { 'x-qmenux-request': '1, 1' }, { origin: `${origin}, ${origin}` }, { 'content-type': 'text/plain' }, { 'content-encoding': 'gzip' }];
  for (const extra of invalidHeaders) {
    expect((await handleAuth(mutation('google/start', extra))).status).toBe(400);
  }
  for (const body of ['[]', '{"tenant":"other"}', '{"returnTo":"https://evil.example"}', 'null', '{bad', ' '.repeat(300)]) {
    expect([400, 413]).toContain((await handleAuth(mutation('google/start', {}, body))).status);
  }
  expect((await handleAuth(mutation('google/start?redirect=https://evil.example'))).status).toBe(400);
  expect(calls).toHaveLength(0);
});

for (const provider of ['google', 'microsoft', 'apple']) {
  test(`${provider} start pins provider and callback, stores random browser proof only in secure HttpOnly cookie`, async () => {
    upstream = () => Response.json({ url: authUrl(provider), expiresIn: 300, ignored: session });
    const res = await handleAuth(mutation(`${provider}/start`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ redirect: authUrl(provider) });
    const proof = res.cookies.get(`__Host-qmenux_admin_${provider}_login`)!.value;
    expect(proof).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(proof).not.toBe(browser);
    const header = res.headers.get('set-cookie')!;
    for (const part of ['Secure', 'HttpOnly', 'SameSite=lax', 'Path=/', 'Max-Age=300']) expect(header).toContain(part);
    expect(header).not.toMatch(/Domain=/i);
    expect(calls[0]!.url).toBe(`https://api.qmenux.com/v1/internal/admin-auth/${provider}/start`);
    expect(calls[0]!.init).toMatchObject({ method: 'POST', redirect: 'error', cache: 'no-store', headers: { Authorization: `Bearer ${'k'.repeat(43)}` } });
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ browser: proof });
  });
}

test('start rejects poisoned authorization endpoints, duplicate params and missing PKCE without setting a cookie', async () => {
  const wrongCallback = new URL(authUrl()); wrongCallback.searchParams.set('redirect_uri', 'https://evil.example');
  const noPkce = new URL(authUrl()); noPkce.searchParams.delete('code_challenge');
  for (const url of ['https://evil.example/auth', wrongCallback.href, `${authUrl()}&state=${state}`, noPkce.href, `${authUrl()}#fragment`]) {
    upstream = () => Response.json({ url, expiresIn: 300 });
    const res = await handleAuth(mutation('google/start'));
    expect(res.status).toBe(503); expect(res.headers.has('set-cookie')).toBe(false);
  }
});

test('callback exchanges browser proof, rotates previous admin session and returns only host cookies and a fixed redirect', async () => {
  upstream = () => Response.json({ session, csrf, expiresIn: 3600, user, tenantAccess: false, token: 'never-forward' });
  const res = await handleAuth(callback('', `__Host-qmenux_admin_google_login=${browser}; ${sessionCookie}; __Host-qmenux_session=${'a'.repeat(43)}`));
  expect(res.status).toBe(303); expect(res.headers.get('location')).toBe(`${origin}/`); expect(await res.text()).toBe('');
  expect(res.cookies.get('__Host-qmenux_admin_session')).toMatchObject({ value: session, httpOnly: true, secure: true, path: '/', maxAge: 3600 });
  expect(res.cookies.get('__Host-qmenux_admin_csrf')).toMatchObject({ value: csrf, httpOnly: false, secure: true });
  expect(res.cookies.get('__Host-qmenux_admin_google_login')!.maxAge).toBe(0);
  expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ browser, state, code: 'synthetic-code', previousSession: session });
  expect(res.headers.get('referrer-policy')).toBe('no-referrer');
});

test('callback rejects duplicate/mixed/unknown/oversized arguments and missing, wrong or duplicate login cookies before finish', async () => {
  for (const extra of [`&state=${state}`, '&error=access_denied', '&id_token=secret', '&returnTo=https://evil.example', '&code=other', '&code=']) {
    const res = await handleAuth(callback(extra)); expect(res.status).toBe(400);
    expect(res.cookies.get('__Host-qmenux_admin_google_login')!.maxAge).toBe(0);
  }
  for (const cookies of ['', '__Host-qmenux_admin_microsoft_login=' + browser, `__Host-qmenux_admin_google_login=${browser}; __Host-qmenux_admin_google_login=${browser}`]) {
    expect([400, 401]).toContain((await handleAuth(callback('', cookies))).status);
  }
  expect((await handleAuth(request(`google/callback?state=${state}&code=${'x'.repeat(2049)}`, 'GET', { cookie: `__Host-qmenux_admin_google_login=${browser}` }))).status).toBe(400);
  expect(calls).toHaveLength(0);
});

test('valid cancellation reaches one-use finish; errors clear login proof without clearing an existing session', async () => {
  upstream = () => Response.json({ status: 'unauthorized', secret: session }, { status: 401 });
  const res = await handleAuth(request(`google/callback?state=${state}&error=access_denied`, 'GET', { cookie: `__Host-qmenux_admin_google_login=${browser}; ${sessionCookie}` }));
  expect(res.status).toBe(401); expect(await res.json()).toEqual({ status: 'unauthorized' });
  expect(res.cookies.get('__Host-qmenux_admin_google_login')!.maxAge).toBe(0);
  expect(res.cookies.get('__Host-qmenux_admin_session')).toBeUndefined();
  expect(calls).toHaveLength(1); expect(JSON.parse(calls[0]!.init!.body as string).error).toBe('access_denied');
});

test('me sanitizes identity and never accepts API or operator cookies as admin authority', async () => {
  for (const name of ['__Host-qmenux_session', '__Host-qmenux_operator_session']) {
    expect((await handleAuth(request('me', 'GET', { cookie: `${name}=${session}` }))).status).toBe(401);
  }
  expect(calls).toHaveLength(0);
  upstream = () => Response.json({ user: { ...user, email: 'private@example.invalid', role: 'PLATFORM_ADMIN' }, tenantAccess: false, session });
  const res = await handleAuth(request('me', 'GET', { cookie: sessionCookie, authorization: 'never-forward' }));
  expect(await res.json()).toEqual({ user, tenantAccess: false });
  expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ session });
  expect(new Headers(calls[0]!.init!.headers).get('cookie')).toBeNull();
});

test('logout requires matching cookie/header and API-bound CSRF; only confirmed revocation clears cookies', async () => {
  const invalidHeaders: Record<string, string>[] = [{ cookie: sessionCookie }, { cookie: `${sessionCookie}; ${csrfCookie}`, 'x-csrf-token': 'x'.repeat(43) },
    { cookie: `${sessionCookie}; ${csrfCookie}; ${csrfCookie}`, 'x-csrf-token': csrf },
    { cookie: `${sessionCookie}; ${sessionCookie}; ${csrfCookie}`, 'x-csrf-token': csrf }];
  for (const extra of invalidHeaders) {
    expect((await handleAuth(mutation('logout', extra))).status).toBe(400);
  }
  expect(calls).toHaveLength(0);
  const req = () => mutation('logout', { cookie: `${sessionCookie}; ${csrfCookie}`, 'x-csrf-token': csrf });
  upstream = () => Response.json({ status: 'unauthorized' }, { status: 401 });
  expect((await handleAuth(req())).headers.has('set-cookie')).toBe(false);
  upstream = () => { throw new Error('private upstream failure'); };
  const failure = await handleAuth(req()); expect(failure.status).toBe(503); expect(failure.headers.has('set-cookie')).toBe(false);
  upstream = () => Response.json({ status: 'signed_out' });
  const res = await handleAuth(req()); expect(await res.json()).toEqual({ status: 'signed_out' });
  expect(res.cookies.get('__Host-qmenux_admin_session')!.maxAge).toBe(0);
  expect(res.cookies.get('__Host-qmenux_admin_csrf')!.maxAge).toBe(0);
  expect(JSON.parse(calls.at(-1)!.init!.body as string)).toEqual({ session, csrf });
});

test('untrusted, malformed, oversized, redirected and timed-out upstream responses are sanitized with no retries', async () => {
  for (const value of [null, { user: { ...user, status: 'ACTIVE' }, tenantAccess: false }, { user, tenantAccess: true }]) {
    upstream = () => Response.json(value);
    expect((await handleAuth(request('me', 'GET', { cookie: sessionCookie }))).status).toBe(503);
  }
  for (const response of [new Response('private failure', { status: 500 }), new Response('secret', { status: 302, headers: { location: 'https://evil.example' } }),
    new Response('{', { headers: { 'content-type': 'application/json' } }), Response.json({ text: 'x'.repeat(17_000) })]) {
    upstream = () => response;
    const res = await handleAuth(request('me', 'GET', { cookie: sessionCookie }));
    expect(res.status).toBe(503); expect(await res.json()).toEqual({ status: 'unavailable' });
    expect(res.headers.has('set-cookie')).toBe(false);
  }
  upstream = async (_url, init) => {
    await new Promise<void>(resolve => init!.signal!.addEventListener('abort', () => resolve(), { once: true }));
    throw new Error('timeout with private details');
  };
  const before = calls.length;
  expect((await handleAuth(request('me', 'GET', { cookie: sessionCookie }))).status).toBe(503);
  expect(calls.length).toBe(before + 1);
});

test('providers returns a closed public allowlist, with no credentials or unrecognized fields', async () => {
  upstream = () => Response.json({ providers: ['google', 'microsoft', 'apple'].map(id => ({ id, enabled: false, secret: session })), secret: csrf });
  const res = await handleAuth(request('providers'));
  expect(await res.json()).toEqual({ providers: ['google', 'microsoft', 'apple'].map(id => ({ id, enabled: false })) });
  expect(new Headers(calls[0]!.init!.headers).has('authorization')).toBe(false);
});

test('browser enforces handler Secure/HttpOnly host cookies and sends bound CSRF on logout', async ({ page, context }) => {
  upstream = (url, init) => {
    if (url.endsWith('/google/start')) return Response.json({ url: authUrl(), expiresIn: 300 });
    if (url.endsWith('/google/finish')) {
      expect(JSON.parse(init!.body as string).browser).toMatch(/^[A-Za-z0-9_-]{43}$/);
      return Response.json({ session, csrf, expiresIn: 3600, user, tenantAccess: false });
    }
    if (url.endsWith('/logout')) {
      expect(JSON.parse(init!.body as string)).toEqual({ session, csrf });
      return Response.json({ status: 'signed_out' });
    }
    throw new Error('Unexpected test API call');
  };
  // Fulfill every canonical-host request locally; no DNS, real IdP, TLS exception or hosted app is involved.
  await page.route(`${origin}/**`, async route => {
    if (!route.request().url().includes('/api/auth/')) { await route.fulfill({ contentType: 'text/html', body: '<main>Test browser</main>' }); return; }
    const incoming = route.request();
    const res = await handleAuth(new Request(incoming.url(), { method: incoming.method(), headers: { ...await incoming.allHeaders(), host: new URL(incoming.url()).host },
      ...(incoming.postData() ? { body: incoming.postData() } : {}) }));
    const output: Record<string, string> = {};
    res.headers.forEach((value, name) => { output[name] = value; });
    if (res.headers.getSetCookie().length) output['set-cookie'] = res.headers.getSetCookie().join('\n');
    await route.fulfill({ status: res.status, headers: output, body: await res.text() });
  });
  await page.goto(`${origin}/`);
  const started = await page.evaluate(async () => {
    const res = await fetch('/api/auth/google/start', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-QMenuX-Request': '1' }, body: '{}' });
    return res.status;
  });
  expect(started).toBe(200);
  const login = (await context.cookies()).find(cookie => cookie.name === '__Host-qmenux_admin_google_login')!;
  expect(login).toMatchObject({ secure: true, httpOnly: true, domain: 'admin.qmenux.com', path: '/', sameSite: 'Lax' });
  expect(await page.evaluate(() => document.cookie)).toBe('');
  await page.goto(`${origin}/api/auth/google/callback?state=${state}&code=synthetic-code`);
  await expect(page).toHaveURL(`${origin}/`);
  const cookies = await context.cookies();
  expect(cookies.find(cookie => cookie.name === '__Host-qmenux_admin_session')).toMatchObject({ secure: true, httpOnly: true, value: session });
  expect(await page.evaluate(() => document.cookie)).toBe(csrfCookie);
  expect(await context.cookies('https://cafe.qmenux.com')).toHaveLength(0);
  expect(await context.cookies('https://api.qmenux.com')).toHaveLength(0);
  const loggedOut = await page.evaluate(async () => {
    const csrf = document.cookie.split('=')[1]!;
    return (await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-QMenuX-Request': '1', 'X-CSRF-Token': csrf }, body: '{}' })).status;
  });
  expect(loggedOut).toBe(200); expect(await context.cookies()).toHaveLength(0);
});
