/*
 * QMenuX guest menu service worker (UI_UX.md "PWA", D-MENU-05).
 *
 * Keeps one thing offline: the last menu page this phone saw for this host, plus the static assets it
 * needs to start. The network always wins when it answers; the saved copy is only served when the
 * network fails, times out or errors, and it is served with data-qx-offline="1" so the page shows the
 * "saved copy from <time>, prices may have changed" banner. A gate, an unavailable or a missing menu
 * replaces the saved copy, so a closed or geofenced menu is never shown from the cache.
 *
 * Same-origin GET only: route handlers, POSTs, RSC requests and cross-origin images pass straight through.
 */
const VERSION = 'v1';
const PAGE_CACHE = `qx-menu-page-${VERSION}`;
const STATIC_CACHE = `qx-menu-static-${VERSION}`;
const PAGE_KEY = '/';
const NAV_TIMEOUT_MS = 4000;
const MAX_STATIC = 60;
const KEEP_HEADERS = ['content-type', 'content-security-policy', 'x-content-type-options', 'referrer-policy', 'x-frame-options', 'permissions-policy'];
const DROP_STATES = new Set(['UNAVAILABLE', 'NOT_FOUND', 'GEOFENCE']);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGE_CACHE, STATIC_CACHE]);
      for (const key of await caches.keys()) {
        if (key.startsWith('qx-menu-') && !keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(navigate(event));
    return;
  }
  if (url.pathname.startsWith('/_next/static/')) event.respondWith(staticAsset(req));
});

function stateOf(html) {
  const m = /data-qx-state="([A-Z_]+)"/.exec(html);
  return m ? m[1] : null;
}

async function savePage(html, res) {
  const headers = new Headers();
  for (const name of KEEP_HEADERS) {
    const v = res.headers.get(name);
    if (v) headers.set(name, v);
  }
  const cache = await caches.open(PAGE_CACHE);
  await cache.put(PAGE_KEY, new Response(html, { status: 200, headers }));
  await precacheAssets(html);
}

/** The saved page must be able to start offline, so the scripts and styles it names are fetched now. */
async function precacheAssets(html) {
  const urls = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])].slice(0, MAX_STATIC);
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(
    urls.map(async (u) => {
      if (await cache.match(u)) return;
      try {
        const res = await fetch(u, { credentials: 'same-origin' });
        if (res.ok) await cache.put(u, res);
      } catch {
        /* next visit tries again */
      }
    }),
  );
  await trimStatic(new Set(urls));
}

/** Old builds' assets are dropped first; whatever the current page needs is always kept. */
async function trimStatic(needed) {
  const cache = await caches.open(STATIC_CACHE);
  const keys = await cache.keys();
  let extra = keys.length - MAX_STATIC;
  for (const k of keys) {
    if (extra <= 0) break;
    if (!needed.has(new URL(k.url).pathname)) {
      await cache.delete(k);
      extra -= 1;
    }
  }
}

async function savedCopy() {
  const cache = await caches.open(PAGE_CACHE);
  const res = await cache.match(PAGE_KEY);
  if (!res) return null;
  const html = (await res.text()).replace('data-qx-offline="0"', 'data-qx-offline="1"');
  return new Response(html, { status: 200, headers: res.headers });
}

async function forgetPage() {
  const cache = await caches.open(PAGE_CACHE);
  await cache.delete(PAGE_KEY);
}

/** Resolves with the network response after deciding what it means for the saved copy. */
async function fromNetwork(req) {
  const res = await fetch(req);
  if (res.status === 404) {
    await forgetPage();
    return { res, usable: true };
  }
  if (!(res.headers.get('content-type') || '').includes('text/html')) return { res, usable: res.ok };
  const html = await res.clone().text();
  const state = stateOf(html);
  if (res.ok && state === 'OK') {
    await savePage(html, res);
    return { res, usable: true };
  }
  if (state && DROP_STATES.has(state)) {
    await forgetPage();
    return { res, usable: true };
  }
  // ERROR page or a server error: the saved menu is more useful than "try again".
  return { res, usable: false };
}

async function navigate(event) {
  const network = fromNetwork(event.request);
  // Even when the saved copy is shown first, the network result still refreshes it for next time.
  event.waitUntil(network.catch(() => {}));
  const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), NAV_TIMEOUT_MS));
  let first;
  try {
    first = await Promise.race([network, timeout]);
  } catch {
    return (await savedCopy()) || offlineFallback();
  }
  if (first === 'timeout') {
    const saved = await savedCopy();
    if (saved) return saved;
    try {
      first = await network;
    } catch {
      return offlineFallback();
    }
  }
  if (first.usable) return first.res;
  return (await savedCopy()) || first.res;
}

async function staticAsset(req) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  // Build output under /_next/static is content-hashed, so a cached copy never goes stale.
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

function offlineFallback() {
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Bağlantı yok</title><style>
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#F7F5F0;color:#252420;text-align:center}
main{max-width:420px;display:grid;gap:12px}h1{margin:0;font-size:1.5rem;line-height:1.2}p{margin:0;color:#5C5850}
button{margin-top:8px;min-height:48px;padding:0 20px;border:0;border-radius:12px;background:#252420;color:#F7F5F0;font:inherit;font-weight:600}
</style></head><body><main><h1>Bağlantı yok</h1><p>Menüyü açmak için internet bağlantısı gerekiyor. Bağlantınızı kontrol edip tekrar deneyin ya da personelden basılı menü isteyin.</p><button type="button" onclick="location.reload()">Tekrar dene</button></main></body></html>`;
  return new Response(html, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
