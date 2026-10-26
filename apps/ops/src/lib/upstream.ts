import 'server-only';
import { cookies, headers } from 'next/headers';
import { edgeClientIp } from './bff-policy';
import { serverEnv } from './env';

export interface Problem {
  status: number;
  code: string;
  title: string;
  errors?: { path: string; message: string }[];
}

/** Calls the API from the Next server with the session as a Bearer token and the BFF key. */
export async function upstream(path: string, init: { method?: string; body?: BodyInit | null; contentType?: string; token?: string | null; reqHeaders?: Headers } = {}) {
  const env = serverEnv();
  const h = new Headers({ accept: 'application/json', 'x-qx-bff-key': env.bffKey });
  if (process.env.VERCEL_ENV === 'preview' && process.env.QX_API_PROTECTION_BYPASS) h.set('x-vercel-protection-bypass', process.env.QX_API_PROTECTION_BYPASS);
  if (init.contentType) h.set('content-type', init.contentType);
  if (init.token) h.set('authorization', `Bearer ${init.token}`);
  const ip = edgeClientIp(init.reqHeaders ?? (await headers()), env.trustForwardedFor);
  if (ip) h.set('x-qx-client-ip', ip);
  return fetch(`${env.apiInternalOrigin}${path}`, { method: init.method ?? 'GET', headers: h, body: init.body ?? null, cache: 'no-store', redirect: 'manual' });
}

export async function sessionToken(): Promise<string | null> {
  return (await cookies()).get(serverEnv().cookies.session)?.value ?? null;
}

/** For server components: JSON result, or a Problem with the HTTP status. */
export async function serverGet<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; problem: Problem }> {
  const token = await sessionToken();
  if (!token) return { ok: false, problem: { status: 401, code: 'UNAUTHENTICATED', title: 'Oturum gerekli' } };
  const res = await upstream(path, { token });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) return { ok: false, problem: { status: res.status, code: String(body.code ?? 'HTTP_ERROR'), title: String(body.title ?? 'Hata') } };
  return { ok: true, data: body as T };
}
