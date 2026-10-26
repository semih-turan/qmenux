import { describe, expect, it } from 'vitest';
import { BODY_LIMIT, edgeClientIp, geoCookieName, menuSlug, readJson, sameOrigin } from '../src/lib/policy';

const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

function post(body: BodyInit | null, h: Record<string, string> = { 'content-type': 'application/json' }) {
  return new Request('http://demo-kahve.qmenux.localhost:3000/api/scan', { method: 'POST', body, headers: h, duplex: 'half' } as RequestInit);
}

describe('menuSlug', () => {
  it('maps only the explicitly configured Vercel preview host to a valid demo tenant', () => {
    const preview = { host: 'pilot-123.vercel.app', slug: 'demo-kahve' };
    expect(menuSlug(preview.host, 'qmenux.com', preview)).toBe('demo-kahve');
    expect(menuSlug(preview.host, 'qmenux.com')).toBeNull();
    expect(menuSlug('other.vercel.app', 'qmenux.com', preview)).toBeNull();
    expect(menuSlug('pilot-123.vercel.app.evil.example', 'qmenux.com', preview)).toBeNull();
    expect(menuSlug(preview.host, 'qmenux.com', { ...preview, slug: 'admin' })).toBeNull();
    expect(menuSlug(preview.host, 'qmenux.com', { ...preview, slug: '../other' })).toBeNull();
    expect(menuSlug('evil.example', 'qmenux.com', { ...preview, host: 'evil.example' })).toBeNull();
    expect(menuSlug('other.qmenux.com', 'qmenux.com', preview)).toBe('other');
  });
  it('takes the tenant from a menu subdomain', () => {
    expect(menuSlug('demo-kahve.qmenux.com', 'qmenux.com')).toBe('demo-kahve');
    expect(menuSlug('DEMO-KAHVE.qmenux.com', 'qmenux.com')).toBe('demo-kahve');
  });
  it('never serves a menu on the platform hosts', () => {
    for (const h of ['qmenux.com', 'admin.qmenux.com', 'superman.qmenux.com', 'api.qmenux.com', 'evil.example', '', null, undefined]) {
      expect(menuSlug(h, 'qmenux.com'), String(h)).toBeNull();
    }
  });
  it('ignores look-alike parent domains', () => {
    expect(menuSlug('demo-kahve.qmenux.com.evil.example', 'qmenux.com')).toBeNull();
    expect(menuSlug('demo-kahve.notqmenux.com', 'qmenux.com')).toBeNull();
  });
});

describe('sameOrigin', () => {
  const host = 'demo-kahve.qmenux.com';
  it('accepts the page own origin', () => {
    expect(sameOrigin('https://demo-kahve.qmenux.com', host)).toBe(true);
  });
  it('refuses other tenants, missing and malformed origins', () => {
    expect(sameOrigin('https://other.qmenux.com', host)).toBe(false);
    expect(sameOrigin('https://demo-kahve.qmenux.com.evil.example', host)).toBe(false);
    expect(sameOrigin(null, host)).toBe(false);
    expect(sameOrigin('null', host)).toBe(false);
    expect(sameOrigin('https://demo-kahve.qmenux.com', null)).toBe(false);
  });
});

describe('edgeClientIp', () => {
  it('uses the platform header first', () => {
    expect(edgeClientIp(headers({ 'x-vercel-forwarded-for': '203.0.113.7', 'x-forwarded-for': '198.51.100.1' }), true)).toBe('203.0.113.7');
  });
  it('only trusts x-forwarded-for when told to', () => {
    expect(edgeClientIp(headers({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }), false)).toBeNull();
    expect(edgeClientIp(headers({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }), true)).toBe('198.51.100.1');
  });
  it('drops values that are not IP addresses', () => {
    expect(edgeClientIp(headers({ 'x-vercel-forwarded-for': 'localhost' }), false)).toBeNull();
    expect(edgeClientIp(headers({ 'x-forwarded-for': '<script>' }), true)).toBeNull();
  });
});

describe('readJson', () => {
  it('parses a small JSON body', async () => {
    expect(await readJson(post(JSON.stringify({ a: 1 })))).toEqual({ ok: true, value: { a: 1 } });
    expect(await readJson(post('{}', { 'content-type': 'application/json; charset=utf-8' }))).toEqual({ ok: true, value: {} });
  });
  it('refuses other content types with 415', async () => {
    expect(await readJson(post('{}', { 'content-type': 'text/plain' }))).toEqual({ ok: false, status: 415 });
    expect(await readJson(post('{}', { 'content-type': 'application/jsonx' }))).toEqual({ ok: false, status: 415 });
    expect(await readJson(post('{}', {}))).toEqual({ ok: false, status: 415 });
  });
  it('refuses oversized bodies with 413, declared or not', async () => {
    const big = JSON.stringify({ pad: 'x'.repeat(BODY_LIMIT) });
    expect(await readJson(post(big))).toEqual({ ok: false, status: 413 });
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(big));
        c.close();
      },
    });
    expect(await readJson(post(stream))).toEqual({ ok: false, status: 413 });
  });
  it('refuses broken or missing JSON with 400', async () => {
    expect(await readJson(post('{"a":'))).toEqual({ ok: false, status: 400 });
    expect(await readJson(post(null))).toEqual({ ok: false, status: 400 });
  });
});

describe('geoCookieName', () => {
  it('uses the __Host- prefix on https only', () => {
    expect(geoCookieName(true)).toBe('__Host-qx_geo');
    expect(geoCookieName(false)).toBe('qx_geo');
  });
});
