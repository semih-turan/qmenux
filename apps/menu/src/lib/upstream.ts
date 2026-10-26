import 'server-only';
import { serverEnv } from './env';
import { edgeClientIp } from './policy';

/**
 * Calls the public guest API from the menu server. The BFF key lets the API trust the end-user IP we
 * forward for rate limiting; there is no session and nothing tenant-private is requested.
 */
export async function upstream(
  path: string,
  init: { method?: string; body?: unknown; geoPass?: string | null; reqHeaders: { get(name: string): string | null } },
) {
  const env = serverEnv();
  const h = new Headers({ accept: 'application/json', 'x-qx-bff-key': env.bffKey });
  if (process.env.VERCEL_ENV === 'preview' && process.env.QX_API_PROTECTION_BYPASS) h.set('x-vercel-protection-bypass', process.env.QX_API_PROTECTION_BYPASS);
  if (init.body !== undefined) h.set('content-type', 'application/json');
  if (init.geoPass) h.set('x-qx-geo-pass', init.geoPass);
  const ip = edgeClientIp(init.reqHeaders, env.trustForwardedFor);
  if (ip) h.set('x-qx-client-ip', ip);
  return fetch(`${env.apiInternalOrigin}${path}`, {
    method: init.method ?? 'GET',
    headers: h,
    body: init.body === undefined ? null : JSON.stringify(init.body),
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
  });
}
