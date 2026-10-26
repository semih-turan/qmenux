import { NextResponse, type NextRequest } from 'next/server';
import { csrfOk } from '@/lib/bff-policy';
import { normalizeOtp } from '@/lib/otp';
import { serverEnv } from '@/lib/env';
import { upstream } from '@/lib/upstream';

const problem = (status: number, code: string, title: string, extra: Record<string, string> = {}) =>
  NextResponse.json({ code, title }, { status, headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store', ...extra } });

/**
 * MFA step: forwards the TOTP code to the API, which burns the time-step and rotates the session.
 * The new (MFA-marked) token replaces the cookie here; the browser never sees either token.
 */
export async function POST(req: NextRequest) {
  const env = serverEnv();
  if (!csrfOk(req.method, req.headers.get('origin'), req.headers.get('x-qx-bff'), env.opsOrigin)) return problem(403, 'CSRF', 'İstek reddedildi');
  const token = req.cookies.get(env.cookies.session)?.value;
  if (!token) return problem(401, 'UNAUTHENTICATED', 'Oturum gerekli');
  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === 'string' ? normalizeOtp(body.code) : null;
  if (!code) return problem(400, 'VALIDATION_FAILED', 'Altı haneli kod gerekli');

  const res = await upstream('/v1/control/mfa/verify', { method: 'POST', contentType: 'application/json', body: JSON.stringify({ code }), token, reqHeaders: req.headers });
  if (!res.ok) {
    const p = (await res.json().catch(() => ({}))) as { code?: string; title?: string };
    const retry = res.headers.get('retry-after');
    const out = problem(res.status, p.code ?? 'HTTP_ERROR', p.title ?? 'Doğrulama başarısız', retry ? { 'retry-after': retry } : {});
    if (res.status === 401) out.cookies.delete(env.cookies.session);
    return out;
  }
  const s = (await res.json()) as { sessionToken: string; expiresInS: number };
  const out = NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  out.cookies.set(env.cookies.session, s.sessionToken, { httpOnly: true, secure: env.secure, sameSite: 'lax', path: '/', maxAge: s.expiresInS });
  return out;
}
