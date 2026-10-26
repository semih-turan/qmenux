import { NextResponse, type NextRequest } from 'next/server';
import { safeReturnTo } from '@/lib/bff-policy';
import { serverEnv } from '@/lib/env';
import { upstream } from '@/lib/upstream';

/** Starts an OIDC flow. The API keeps the PKCE verifier and nonce; this browser only holds the state binding. */
export async function POST(req: NextRequest) {
  const env = serverEnv();
  if (req.headers.get('origin') !== env.adminOrigin) return new NextResponse(null, { status: 403 });
  const form = await req.formData();
  const provider = String(form.get('provider') ?? '');
  const returnTo = safeReturnTo(form.get('returnTo')?.toString());
  const res = await upstream('/v1/auth/flows', {
    method: 'POST',
    contentType: 'application/json',
    body: JSON.stringify({ provider, audience: 'admin', ...(returnTo ? { returnTo } : {}) }),
    reqHeaders: req.headers,
  });
  if (!res.ok) {
    const p = (await res.json().catch(() => ({}))) as { code?: string };
    const code = res.status === 429 ? 'RATE_LIMITED' : (p.code ?? 'FLOW_FAILED');
    return NextResponse.redirect(`${env.adminOrigin}/login?error=${encodeURIComponent(code)}`, 303);
  }
  const { authorizationUrl, state } = (await res.json()) as { authorizationUrl: string; state: string };
  const out = NextResponse.redirect(authorizationUrl, 303);
  out.cookies.set(env.cookies.flow, state, {
    httpOnly: true,
    secure: env.secure,
    // Apple returns with a cross-site form POST, which drops Lax cookies; this cookie only binds state.
    sameSite: env.secure ? 'none' : 'lax',
    path: '/',
    maxAge: 600,
  });
  return out;
}
