import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_PROVIDERS } from '@qmenux/contracts';
import { stateMatches } from '@/lib/bff-policy';
import { serverEnv } from '@/lib/env';
import { upstream } from '@/lib/upstream';

type Ctx = { params: Promise<{ provider: string }> };

/**
 * Completes the OIDC flow. The API refuses non-operators (FORBIDDEN) and operators without TOTP
 * (MFA_NOT_ENROLLED); a successful callback yields an ops session that is NOT yet MFA-verified,
 * so the browser always lands on /mfa next. Nothing is activated or granted from this redirect.
 */
async function finish(req: NextRequest, provider: string, p: { code: string | null; state: string | null; error: string | null }) {
  const env = serverEnv();
  const fail = (code: string) => {
    const r = NextResponse.redirect(`${env.opsOrigin}/login?error=${encodeURIComponent(code)}`, 303);
    r.cookies.delete(env.cookies.flow);
    return r;
  };
  if (!(AUTH_PROVIDERS as readonly string[]).includes(provider)) return fail('PROVIDER_UNAVAILABLE');
  if (p.error) return fail(p.error === 'access_denied' ? 'CANCELLED' : 'IDP_ERROR');
  if (!p.code || !stateMatches(req.cookies.get(env.cookies.flow)?.value, p.state)) return fail('FLOW_INVALID');

  const res = await upstream('/v1/auth/callback', {
    method: 'POST',
    contentType: 'application/json',
    body: JSON.stringify({ provider, audience: 'ops', code: p.code, state: p.state }),
    reqHeaders: req.headers,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: string };
    return fail(res.status === 429 ? 'RATE_LIMITED' : (body.code ?? 'FLOW_INVALID'));
  }
  const s = (await res.json()) as { sessionToken: string; expiresInS: number; returnTo: string | null; mfaRequired?: boolean };
  const next = s.returnTo ?? '/';
  const out = NextResponse.redirect(`${env.opsOrigin}/mfa?returnTo=${encodeURIComponent(next)}`, 303);
  out.cookies.delete(env.cookies.flow);
  out.cookies.set(env.cookies.session, s.sessionToken, { httpOnly: true, secure: env.secure, sameSite: 'lax', path: '/', maxAge: s.expiresInS });
  return out;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { provider } = await ctx.params;
  const q = req.nextUrl.searchParams;
  return finish(req, provider, { code: q.get('code'), state: q.get('state'), error: q.get('error') });
}

/** Apple uses response_mode=form_post. The state binding authenticates this request, not the Origin. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { provider } = await ctx.params;
  const form = await req.formData().catch(() => null);
  const get = (k: string) => form?.get(k)?.toString() ?? null;
  return finish(req, provider, { code: get('code'), state: get('state'), error: get('error') });
}
