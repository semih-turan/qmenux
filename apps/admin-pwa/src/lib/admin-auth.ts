import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { origin, proofPattern, sessionName, csrfName, AuthError, fail, headers, json, cookie, setCookie, config, boundedJson, object, call, mutationHeaders, csrfProof } from './admin-server';

const providers = ['google', 'microsoft', 'apple'] as const;
type Provider = typeof providers[number];
const loginName = (provider: Provider) => `__Host-qmenux_admin_${provider}_login`;
const authorizationEndpoints: Record<Provider, string> = {
  google: 'https://accounts.google.com/o/oauth2/v2/auth',
  microsoft: 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/oauth2/v2.0/authorize',
  apple: 'https://appleid.apple.com/auth/authorize',
};
function identity(data: Record<string, unknown>) {
  const user = object(data.user);
  if (typeof user.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)
    || user.status !== 'REGISTERED' || data.tenantAccess !== false) fail(503);
  return { user: { id: user.id, status: 'REGISTERED' }, tenantAccess: false };
}
async function mutation(req: Request) {
  mutationHeaders(req);
  // Both mutations accept only an empty JSON object: no browser-selected API arguments.
  const value = await boundedJson(req.body, 256, AbortSignal.timeout(5_000));
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length) fail(400);
}
function authorizationUrl(value: unknown, provider: Provider): string {
  if (typeof value !== 'string' || value.length > 8192) fail(503);
  const url = new URL(value);
  if (`${url.origin}${url.pathname}` !== authorizationEndpoints[provider] || url.username || url.password || url.hash
    || url.searchParams.get('redirect_uri') !== `${origin}/api/auth/${provider}/callback`
    || url.searchParams.get('response_type') !== 'code' || !proofPattern.test(url.searchParams.get('state') ?? '')
    || !proofPattern.test(url.searchParams.get('nonce') ?? '') || !url.searchParams.get('client_id')
    || (provider !== 'apple' && (url.searchParams.get('code_challenge_method') !== 'S256'
      || !proofPattern.test(url.searchParams.get('code_challenge') ?? '')))
    || (provider === 'apple' && url.searchParams.get('response_mode') !== 'query')) fail(503);
  for (const name of url.searchParams.keys()) if (url.searchParams.getAll(name).length !== 1) fail(503);
  return url.href;
}

export async function handleAuth(req: Request): Promise<NextResponse> {
  let callback: Provider | undefined;
  try {
    const url = new URL(req.url);
    const path = url.pathname.slice('/api/auth/'.length);
    const parts = path.split('/');
    const provider = providers.find(value => value === parts[0]);
    const action = provider && parts.length === 2 ? parts[1] : undefined;
    const method = action === 'start' || path === 'logout' ? 'POST'
      : action === 'callback' || path === 'me' || path === 'providers' ? 'GET' : undefined;
    if (!method) return json({ status: 'invalid_request' }, 404);
    if (req.method !== method) {
      const res = json({ status: 'invalid_request' }, 405);
      res.headers.set('Allow', method);
      return res;
    }
    const key = config();
    if (url.origin !== origin || req.headers.get('host') !== 'admin.qmenux.com' || url.hash) fail(400);
    if (action === 'callback') callback = provider;
    if (action !== 'callback' && url.search) fail(400);
    if (path === 'providers') {
      const data = await call(key, 'auth/providers');
      if (!Array.isArray(data.providers) || data.providers.length !== 3) fail(503);
      return json({ providers: providers.map(id => {
        const entries = (data.providers as unknown[]).map(object).filter(item => item.id === id);
        if (entries.length !== 1 || typeof entries[0]!.enabled !== 'boolean') fail(503);
        return { id, enabled: entries[0]!.enabled };
      }) });
    }
    if (action === 'start' && provider) {
      await mutation(req);
      const browser = randomBytes(32).toString('base64url');
      const data = await call(key, `internal/admin-auth/${provider}/start`, { browser });
      if (data.expiresIn !== 300) fail(503);
      const res = json({ redirect: authorizationUrl(data.url, provider) });
      setCookie(res, loginName(provider), browser, 300);
      return res;
    }
    if (callback) {
      const params = url.searchParams;
      const state = params.get('state'), code = params.get('code'), error = params.get('error');
      if ([...params.keys()].some(name => !['state', 'code', 'error'].includes(name) || params.getAll(name).length !== 1)
        || !state || !proofPattern.test(state) || !!code === !!error
        || (code !== null && (!code || code.length > 2048 || [...code].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)))
        || (error !== null && !['access_denied', 'user_cancelled_authorize', 'server_error', 'temporarily_unavailable',
          'invalid_request', 'unauthorized_client', 'unsupported_response_type', 'invalid_scope'].includes(error))) fail(400);
      const browser = cookie(req, loginName(callback));
      if (!browser) fail(401);
      const previous = cookie(req, sessionName);
      const data = await call(key, `internal/admin-auth/${callback}/finish`, {
        browser, state, ...(code ? { code } : { error: error! }), ...(previous ? { previousSession: previous } : {}),
      });
      identity(data);
      if (typeof data.session !== 'string' || !proofPattern.test(data.session)
        || typeof data.csrf !== 'string' || !proofPattern.test(data.csrf) || data.expiresIn !== 3600) fail(503);
      const res = new NextResponse(null, { status: 303, headers: { ...headers, Location: `${origin}/` } });
      setCookie(res, loginName(callback), '', 0);
      setCookie(res, sessionName, data.session, 3600);
      setCookie(res, csrfName, data.csrf, 3600, false);
      return res;
    }
    if (path === 'logout') await mutation(req);
    const session = cookie(req, sessionName);
    if (!session) fail(401);
    if (path === 'me') return json(identity(await call(key, 'internal/admin-auth/me', { session })));
    const csrf = csrfProof(req);
    const data = await call(key, 'internal/admin-auth/logout', { session, csrf });
    if (data.status !== 'signed_out') fail(503);
    const res = json({ status: 'signed_out' });
    setCookie(res, sessionName, '', 0);
    setCookie(res, csrfName, '', 0, false);
    return res;
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 503;
    const res = json({ status: status === 503 ? 'unavailable' : status === 401 ? 'unauthorized' : 'invalid_request' }, status);
    if (callback) setCookie(res, loginName(callback), '', 0);
    return res;
  }
}
