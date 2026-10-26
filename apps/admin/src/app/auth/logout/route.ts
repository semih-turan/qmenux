import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv } from '@/lib/env';
import { upstream } from '@/lib/upstream';

export async function POST(req: NextRequest) {
  const env = serverEnv();
  if (req.headers.get('origin') !== env.adminOrigin) return new NextResponse(null, { status: 403 });
  const token = req.cookies.get(env.cookies.session)?.value;
  // Revoke server-side; the cookie is cleared regardless so the browser never keeps a dead session.
  if (token) await upstream('/v1/auth/logout', { method: 'POST', token, reqHeaders: req.headers }).catch(() => null);
  const out = NextResponse.redirect(`${env.adminOrigin}/login`, 303);
  out.cookies.delete(env.cookies.session);
  return out;
}
