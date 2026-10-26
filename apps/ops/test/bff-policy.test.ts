import { describe, expect, it } from 'vitest';
import { cookieNames, csrfOk, edgeClientIp, forwardableContentType, safeReturnTo, stateMatches, upstreamPath } from '../src/lib/bff-policy';
import { normalizeOtp } from '../src/lib/otp';

const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

describe('upstreamPath (operator BFF)', () => {
  it('maps only the control area to /v1', () => {
    expect(upstreamPath(['control', 'stats'])).toBe('/v1/control/stats');
    expect(upstreamPath(['control', 'tenants', 'abc-123', 'licenses'])).toBe('/v1/control/tenants/abc-123/licenses');
    expect(upstreamPath(['control', 'session'])).toBe('/v1/control/session');
  });

  it('never proxies tenant, onboarding, dev-IdP, auth or public routes', () => {
    for (const root of ['admin', 'me', 'onboarding', 'invites', 'ops', 'dev-idp', 'auth', 'public', 'health']) expect(upstreamPath([root, 'x'])).toBeNull();
  });

  it('keeps MFA verification on the server route (token rotation must land in the cookie)', () => {
    expect(upstreamPath(['control', 'mfa', 'verify'])).toBeNull();
    expect(upstreamPath(['control', 'mfa'])).toBeNull();
  });

  it('rejects traversal, encoded and oversized segments', () => {
    expect(upstreamPath([])).toBeNull();
    expect(upstreamPath(['control', '..'])).toBeNull();
    expect(upstreamPath(['control', 'a/b'])).toBeNull();
    expect(upstreamPath(['control', '%2e%2e'])).toBeNull();
    expect(upstreamPath(['control', 'a b'])).toBeNull();
    expect(upstreamPath(['control', 'x'.repeat(129)])).toBeNull();
    expect(upstreamPath(['control', ...Array(8).fill('a')])).toBeNull();
  });
});

describe('csrfOk', () => {
  const origin = 'https://superman.qmenux.com';
  it('lets safe methods through', () => {
    expect(csrfOk('GET', null, null, origin)).toBe(true);
    expect(csrfOk('head', 'https://evil.example', null, origin)).toBe(true);
  });
  it('needs the exact origin and the custom header for writes', () => {
    expect(csrfOk('POST', origin, '1', origin)).toBe(true);
    expect(csrfOk('POST', origin, null, origin)).toBe(false);
    expect(csrfOk('POST', 'https://admin.qmenux.com', '1', origin)).toBe(false);
    expect(csrfOk('DELETE', 'https://superman.qmenux.com.evil.example', '1', origin)).toBe(false);
    expect(csrfOk('PUT', null, '1', origin)).toBe(false);
  });
});

describe('safeReturnTo', () => {
  it('keeps relative paths on this host', () => {
    expect(safeReturnTo('/')).toBe('/');
    expect(safeReturnTo('/tenants/abc?x=1')).toBe('/tenants/abc?x=1');
  });
  it('drops anything that can leave the host', () => {
    expect(safeReturnTo('//evil.example')).toBeNull();
    expect(safeReturnTo('/\\evil.example')).toBeNull();
    expect(safeReturnTo('https://evil.example')).toBeNull();
    expect(safeReturnTo('javascript:alert(1)')).toBeNull();
    expect(safeReturnTo('/a b')).toBeNull();
    expect(safeReturnTo('')).toBeNull();
    expect(safeReturnTo(null)).toBeNull();
    expect(safeReturnTo(`/${'a'.repeat(300)}`)).toBeNull();
  });
});

describe('edgeClientIp', () => {
  it('prefers the platform header and validates it', () => {
    expect(edgeClientIp(headers({ 'x-vercel-forwarded-for': '203.0.113.7' }), false)).toBe('203.0.113.7');
    expect(edgeClientIp(headers({ 'x-vercel-forwarded-for': 'not-an-ip' }), false)).toBeNull();
  });
  it('ignores x-forwarded-for unless explicitly trusted', () => {
    expect(edgeClientIp(headers({ 'x-forwarded-for': '198.51.100.4' }), false)).toBeNull();
    expect(edgeClientIp(headers({ 'x-forwarded-for': '198.51.100.4, 10.0.0.2' }), true)).toBe('198.51.100.4');
  });
});

describe('stateMatches', () => {
  it('compares in constant time and refuses missing values', () => {
    expect(stateMatches('abc', 'abc')).toBe(true);
    expect(stateMatches('abc', 'abd')).toBe(false);
    expect(stateMatches(undefined, 'abc')).toBe(false);
    expect(stateMatches('abc', null)).toBe(false);
    expect(stateMatches('', '')).toBe(false);
  });
});

describe('cookieNames', () => {
  it('uses __Host- prefixes only when Secure is possible, and never the admin names', () => {
    expect(cookieNames(true)).toEqual({ session: '__Host-qx_ops', flow: '__Host-qx_opsflow' });
    expect(cookieNames(false)).toEqual({ session: 'qx_ops', flow: 'qx_opsflow' });
    expect(cookieNames(false).session).not.toBe('qx_admin');
  });
});

describe('forwardableContentType', () => {
  it('accepts JSON only (no uploads on the operator host)', () => {
    expect(forwardableContentType('application/json; charset=utf-8')).toBe('json');
    expect(forwardableContentType('image/png')).toBeNull();
    expect(forwardableContentType('multipart/form-data; boundary=x')).toBeNull();
    expect(forwardableContentType(null)).toBeNull();
  });
});

describe('normalizeOtp', () => {
  it('accepts six digits with optional spaces', () => {
    expect(normalizeOtp('123456')).toBe('123456');
    expect(normalizeOtp('123 456')).toBe('123456');
    expect(normalizeOtp(' 123456 ')).toBe('123456');
  });
  it('rejects anything else', () => {
    expect(normalizeOtp('12345')).toBeNull();
    expect(normalizeOtp('1234567')).toBeNull();
    expect(normalizeOtp('12345a')).toBeNull();
    expect(normalizeOtp('')).toBeNull();
  });
});
