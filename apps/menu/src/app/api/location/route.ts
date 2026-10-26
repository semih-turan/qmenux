import { geofenceCheckSchema } from '@qmenux/contracts';
import { cookies } from 'next/headers';
import { serverEnv } from '@/lib/env';
import { geoCookieName } from '@/lib/policy';
import { guestWrite, json, problem } from '@/lib/route';
import { upstream } from '@/lib/upstream';

const REASONS = new Set(['OUTSIDE', 'LOW_ACCURACY', 'REGION_CHECK_UNAVAILABLE']);

/**
 * The guest's coordinates pass straight through to the API, which compares and discards them.
 * Nothing here logs or stores them. The signed pass the API returns goes into an HttpOnly cookie
 * so page scripts never see it.
 */
export async function POST(req: Request) {
  const g = await guestWrite(req, geofenceCheckSchema);
  if (g instanceof Response) return g;
  let res: Response;
  try {
    res = await upstream(`/v1/public/menus/${g.slug}/location-check`, { method: 'POST', body: g.body, reqHeaders: req.headers });
  } catch {
    return problem(502, 'UPSTREAM_UNAVAILABLE');
  }
  if (res.status === 429) return json(429, { ok: false, reason: 'RATE_LIMITED' });
  if (!res.ok) return problem(res.status === 404 ? 404 : 502, res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR');
  const out = (await res.json().catch(() => null)) as { ok?: boolean; pass?: string | null; expiresInS?: number; reason?: string } | null;
  if (!out) return problem(502, 'UPSTREAM_ERROR');
  if (!out.ok) return json(200, { ok: false, reason: out.reason && REASONS.has(out.reason) ? out.reason : 'OUTSIDE' });
  if (out.pass) {
    const env = serverEnv();
    (await cookies()).set(geoCookieName(env.secure), out.pass, {
      httpOnly: true,
      secure: env.secure,
      sameSite: 'lax',
      path: '/',
      maxAge: Math.max(60, Math.min(out.expiresInS ?? 3600, 7200)),
    });
  }
  return json(200, { ok: true });
}
