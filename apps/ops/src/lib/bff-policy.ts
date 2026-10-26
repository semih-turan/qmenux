import { isIP } from 'node:net';
import { timingSafeEqual } from 'node:crypto';

/**
 * Pure request policy for the operator BFF. Kept free of Next.js imports so it is unit-tested directly.
 * Mirrors apps/admin/src/lib/bff-policy.ts with an operator-only allowlist and its own cookie names.
 */

/** Only the platform-control area is reachable from this browser; tenant, onboarding and dev-IdP routes never are. */
const ALLOWED_ROOTS = new Set(['control']);
/**
 * MFA verification rotates the session token, which must land in the httpOnly cookie, so it goes
 * through /auth/mfa (a server route) and is never proxied raw to the browser.
 */
const DENIED_SECOND = new Set(['mfa']);
const SEGMENT_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** Maps /bff/<segments> to an upstream /v1 path, or null when it is not allowed. */
export function upstreamPath(segments: readonly string[]): string | null {
  if (segments.length === 0 || segments.length > 8) return null;
  if (!ALLOWED_ROOTS.has(segments[0]!)) return null;
  if (segments[1] && DENIED_SECOND.has(segments[1])) return null;
  if (!segments.every((s) => SEGMENT_RE.test(s))) return null;
  return `/v1/${segments.join('/')}`;
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated requests: unsafe methods need the exact ops Origin
 * and a custom header (which a cross-site form cannot send without a CORS preflight).
 */
export function csrfOk(method: string, origin: string | null, bffHeader: string | null, opsOrigin: string): boolean {
  if (SAFE.has(method.toUpperCase())) return true;
  return origin === opsOrigin && bffHeader === '1';
}

/** Same rule as the API: a relative path on this host only. */
export function safeReturnTo(v: string | null | undefined): string | null {
  if (!v || v.length > 300) return null;
  return /^\/(?![/\\])[^\\\s]*$/.test(v) ? v : null;
}

/** The end-user IP as seen by the Vercel edge (x-vercel-forwarded-for is set by the platform, not the client). */
export function edgeClientIp(h: { get(name: string): string | null }, trustForwardedFor: boolean): string | null {
  const vercel = h.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  if (vercel && isIP(vercel)) return vercel;
  if (!trustForwardedFor) return null;
  const fwd = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd && isIP(fwd) ? fwd : null;
}

/** OAuth state from the callback must equal the value bound to this browser at /auth/start. */
export function stateMatches(cookieState: string | undefined, returned: string | null): boolean {
  if (!cookieState || !returned) return false;
  const a = Buffer.from(cookieState);
  const b = Buffer.from(returned);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface CookieNames {
  session: string;
  flow: string;
}

/**
 * Distinct names from the admin PWA so a session can never be mistaken for the other audience
 * (the API rejects it anyway). `__Host-` requires Secure, which local http cannot use; both are
 * host-only (no Domain attribute), so nothing is shared across *.qmenux.com.
 */
export function cookieNames(secure: boolean): CookieNames {
  return secure ? { session: '__Host-qx_ops', flow: '__Host-qx_opsflow' } : { session: 'qx_ops', flow: 'qx_opsflow' };
}

/** Operator calls are small JSON documents; there are no uploads on this host. */
export const MAX_BODY_BYTES = 64 * 1024;

export function forwardableContentType(ct: string | null): 'json' | null {
  if (!ct) return null;
  return ct.split(';')[0]!.trim().toLowerCase() === 'application/json' ? 'json' : null;
}
