import { describe, expect, it } from 'vitest';
import { cleanLandingUrl, clientEventId, landingFrom, landingKey } from '../src/lib/landing';

const TOKEN = 'tbl_AbCdEfGhIjKlMnOpQrSt';

describe('landingFrom', () => {
  it('reads a table QR token', () => {
    expect(landingFrom(`?t=${TOKEN}`)).toEqual({ source: 'table', tableToken: TOKEN });
  });
  it('reads the general QR marker', () => {
    expect(landingFrom('?src=qr')).toEqual({ source: 'qr' });
  });
  it('counts a malformed table token as a QR scan, never as a table', () => {
    expect(landingFrom('?t=short')).toEqual({ source: 'qr' });
    expect(landingFrom(`?t=${TOKEN}%3Cscript%3E`)).toEqual({ source: 'qr' });
    expect(landingFrom(`?t=${'a'.repeat(65)}`)).toEqual({ source: 'qr' });
  });
  it('treats everything else as a direct visit', () => {
    expect(landingFrom('')).toEqual({ source: 'direct' });
    expect(landingFrom('?src=instagram')).toEqual({ source: 'direct' });
  });
});

describe('cleanLandingUrl', () => {
  it('drops the tracking parameters and keeps the rest', () => {
    expect(cleanLandingUrl('/', `?t=${TOKEN}`, '')).toBe('/');
    expect(cleanLandingUrl('/', '?src=qr&lang=tr', '#c-hot')).toBe('/?lang=tr#c-hot');
    expect(cleanLandingUrl('/', '', '#menu')).toBe('/#menu');
  });
});

describe('landingKey', () => {
  it('separates table scans per table and shares the key for one visit', () => {
    expect(landingKey({ source: 'table', tableToken: TOKEN })).toBe(`qx_landed:table:${TOKEN}`);
    expect(landingKey({ source: 'qr' })).toBe('qx_landed:qr');
    expect(landingKey({ source: 'direct' })).toBe('qx_landed');
  });
});

describe('clientEventId', () => {
  it('matches the API format and does not repeat', () => {
    const a = clientEventId();
    expect(a).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(clientEventId()).not.toBe(a);
  });
});
