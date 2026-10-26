import { isIP } from 'node:net';
import { parseHost } from '@qmenux/contracts';

/**
 * Pure request policy for the guest menu server. Kept free of Next.js imports so it is unit-tested
 * directly. The menu has no login: everything here protects tenants from each other and guests
 * from cross-site abuse, not users from each other.
 */

/** Tenant slug from the platform-verified Host header. Never from X-Forwarded-Host or the query string. */
export function menuSlug(host: string | null | undefined, rootDomain: string): string | null {
  const h = parseHost(host, [rootDomain]);
  return h.kind === 'menu' ? h.slug : null;
}

/**
 * Writes must come from a page on this exact host. Browsers always send Origin on POST fetches, so a
 * missing or foreign Origin (another tenant's subdomain included) is refused.
 */
export function sameOrigin(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host.toLowerCase();
  } catch {
    return false;
  }
}

/** The end-user IP as seen by the Vercel edge (x-vercel-forwarded-for is set by the platform, not the client). */
export function edgeClientIp(h: { get(name: string): string | null }, trustForwardedFor: boolean): string | null {
  const vercel = h.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  if (vercel && isIP(vercel)) return vercel;
  if (!trustForwardedFor) return null;
  const fwd = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd && isIP(fwd) ? fwd : null;
}

export const BODY_LIMIT = 2048;

export type BodyResult = { ok: true; value: unknown } | { ok: false; status: 400 | 413 | 415 };

/** Reads a small JSON body without buffering more than `limit` bytes, whatever Content-Length claims. */
export async function readJson(req: Request, limit = BODY_LIMIT): Promise<BodyResult> {
  if (!/^application\/json(;|$)/i.test(req.headers.get('content-type') ?? '')) return { ok: false, status: 415 };
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > limit) return { ok: false, status: 413 };
  if (!req.body) return { ok: false, status: 400 };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return { ok: false, status: 413 };
    }
    chunks.push(value);
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch {
    return { ok: false, status: 400 };
  }
}

/** Host-only cookie that carries the signed geofence pass. `__Host-` requires Secure, so plain http uses the bare name. */
export function geoCookieName(secure: boolean): string {
  return secure ? '__Host-qx_geo' : 'qx_geo';
}
