import { describe, expect, it } from 'vitest';
import { LEGAL, NAV, SITE } from '../src/lib/site';

describe('site config', () => {
  it('links login to the admin host, never to a second identity store', () => {
    expect(SITE.adminOrigin).toMatch(/^https?:\/\/admin\./);
    expect(SITE.origin).not.toBe(SITE.adminOrigin);
  });
  it('lists every public and legal page once', () => {
    const all = [...NAV, ...LEGAL].map((n) => n.href);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual(expect.arrayContaining(['/fiyatlandirma', '/kvkk-aydinlatma', '/cerez-politikasi']));
  });
});
