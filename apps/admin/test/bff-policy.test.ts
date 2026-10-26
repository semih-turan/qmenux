import { describe, expect, it } from 'vitest';
import { cookieNames, csrfOk, edgeClientIp, forwardableContentType, safeReturnTo, stateMatches, upstreamPath } from '../src/lib/bff-policy';

const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

describe('upstreamPath', () => {
  it('maps allowed roots to /v1', () => {
    expect(upstreamPath(['admin', 'products', 'abc-123'])).toBe('/v1/admin/products/abc-123');
    expect(upstreamPath(['me'])).toBe('/v1/me');
    expect(upstreamPath(['onboarding', 'applications'])).toBe('/v1/onboarding/applications');
    expect(upstreamPath(['invites', 'tok_en'])).toBe('/v1/invites/tok_en');
    expect(upstreamPath(['admin', 'imports', 'template.csv'])).toBe('/v1/admin/imports/template.csv');
  });

  it('never proxies operator, dev-IdP, auth or public routes', () => {
    for (const root of ['control', 'ops', 'dev-idp', 'auth', 'public', 'health']) expect(upstreamPath([root, 'x'])).toBeNull();
  });

  it('rejects traversal, encoded and oversized segments', () => {
    expect(upstreamPath([])).toBeNull();
    expect(upstreamPath(['admin', '..'])).toBeNull();
    expect(upstreamPath(['admin', 'a/b'])).toBeNull();
    expect(upstreamPath(['admin', '%2e%2e'])).toBeNull();
    expect(upstreamPath(['admin', 'a.b.c'])).toBeNull();
    expect(upstreamPath(['admin', '.env'])).toBeNull();
    expect(upstreamPath(['admin', 'a b'])).toBeNull();
    expect(upstreamPath(['admin', 'x'.repeat(129)])).toBeNull();
    expect(upstreamPath(['admin', ...Array(8).fill('a')])).toBeNull();
  });
});

describe('csrfOk', () => {
  const origin = 'https://admin.qmenux.com';
  it('lets safe methods through', () => {
    expect(csrfOk('GET', null, null, origin)).toBe(true);
    expect(csrfOk('head', 'https://evil.example', null, origin)).toBe(true);
  });
  it('needs the exact origin and the custom header for writes', () => {
    expect(csrfOk('POST', origin, '1', origin)).toBe(true);
    expect(csrfOk('POST', origin, null, origin)).toBe(false);
    expect(csrfOk('PATCH', 'https://evil.example', '1', origin)).toBe(false);
    expect(csrfOk('DELETE', 'https://admin.qmenux.com.evil.example', '1', origin)).toBe(false);
    expect(csrfOk('PUT', null, '1', origin)).toBe(false);
  });
});

describe('safeReturnTo', () => {
  it('keeps relative paths on this host', () => {
    expect(safeReturnTo('/')).toBe('/');
    expect(safeReturnTo('/menu?tab=1')).toBe('/menu?tab=1');
    expect(safeReturnTo('/more/team#invite')).toBe('/more/team#invite');
  });
  it('drops anything that can leave the host', () => {
    expect(safeReturnTo('//evil.example')).toBeNull();
    expect(safeReturnTo('/\\evil.example')).toBeNull();
    expect(safeReturnTo('/a\\b')).toBeNull();
    expect(safeReturnTo('https://evil.example')).toBeNull();
    expect(safeReturnTo('javascript:alert(1)')).toBeNull();
    expect(safeReturnTo('/a b')).toBeNull();
    expect(safeReturnTo('/a\tb')).toBeNull();
    expect(safeReturnTo('')).toBeNull();
    expect(safeReturnTo(null)).toBeNull();
    expect(safeReturnTo(`/${'a'.repeat(300)}`)).toBeNull();
  });
});

describe('edgeClientIp', () => {
  it('prefers the platform header and validates it', () => {
    expect(edgeClientIp(headers({ 'x-vercel-forwarded-for': '203.0.113.7' }), false)).toBe('203.0.113.7');
    expect(edgeClientIp(headers({ 'x-vercel-forwarded-for': '2001:db8::1, 10.0.0.1' }), false)).toBe('2001:db8::1');
    expect(edgeClientIp(headers({ 'x-vercel-forwarded-for': 'not-an-ip' }), false)).toBeNull();
  });
  it('ignores x-forwarded-for unless explicitly trusted', () => {
    expect(edgeClientIp(headers({ 'x-forwarded-for': '198.51.100.4' }), false)).toBeNull();
    expect(edgeClientIp(headers({ 'x-forwarded-for': '198.51.100.4, 10.0.0.2' }), true)).toBe('198.51.100.4');
    expect(edgeClientIp(headers({ 'x-forwarded-for': '<script>' }), true)).toBeNull();
  });
});

describe('stateMatches', () => {
  it('compares in constant time and refuses missing values', () => {
    expect(stateMatches('abc', 'abc')).toBe(true);
    expect(stateMatches('abc', 'abd')).toBe(false);
    expect(stateMatches('abc', 'abcd')).toBe(false);
    expect(stateMatches(undefined, 'abc')).toBe(false);
    expect(stateMatches('abc', null)).toBe(false);
    expect(stateMatches('', '')).toBe(false);
  });
});

describe('cookieNames', () => {
  it('uses __Host- prefixes only when Secure is possible', () => {
    expect(cookieNames(true).session.startsWith('__Host-')).toBe(true);
    expect(cookieNames(false).session).toBe('qx_admin');
  });
});

describe('forwardableContentType', () => {
  it('accepts JSON and the three image types only', () => {
    expect(forwardableContentType('application/json; charset=utf-8')).toBe('json');
    expect(forwardableContentType('IMAGE/WEBP')).toBe('image');
    expect(forwardableContentType('image/png')).toBe('image');
    expect(forwardableContentType('image/svg+xml')).toBeNull();
    expect(forwardableContentType('multipart/form-data; boundary=x')).toBeNull();
    expect(forwardableContentType('text/html')).toBeNull();
    expect(forwardableContentType(null)).toBeNull();
  });
});
