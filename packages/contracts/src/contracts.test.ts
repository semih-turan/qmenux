import { describe, expect, it } from 'vitest';
import {
  isLikelyBot,
  THEME_IDS,
  ALLERGEN_CODES,
  checkSlug,
  normalizeSlug,
  parseHost,
  parsePriceToMinor,
  formatMinor,
  formatMinorPlain,
  MAX_PRICE_MINOR,
  formatPhone,
  foldTr,
  matchesSearch,
  haversineKm,
  withinRadius,
  effectiveLicenseStatus,
  publicAllergenStatus,
  allergenBucket,
  statusOf,
  can,
  applicationSchema,
  THEME_META,
  THEME_SWATCHES,
  geofenceSchema,
} from './index.js';

describe('catalog constants', () => {
  it('has exactly ten unique public themes', () => {
    expect(THEME_IDS).toHaveLength(10);
    expect(new Set(THEME_IDS).size).toBe(10);
  });
  it('has display metadata for exactly the catalogued themes', () => expect(Object.keys(THEME_META).sort()).toEqual([...THEME_IDS].sort()));
  it('has 14 allergens', () => expect(ALLERGEN_CODES).toHaveLength(14));
  it('has a readable base palette for every theme (ink on bg ≥ 4.5:1)', () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      }) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    expect(Object.keys(THEME_SWATCHES).sort()).toEqual([...THEME_IDS].sort());
    for (const { bg, ink } of Object.values(THEME_SWATCHES)) {
      const [hi, lo] = [lum(bg), lum(ink)].sort((a, b) => b - a) as [number, number];
      expect((hi + 0.05) / (lo + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('slug', () => {
  it('normalizes Turkish names', () => {
    expect(normalizeSlug('Çınaraltı Kahve & Fırın')).toBe('cinaralti-kahve-firin');
    expect(normalizeSlug('İSTANBUL Şişçi')).toBe('istanbul-sisci');
  });
  it('rejects reserved and malformed', () => {
    for (const s of ['admin', 'superman', 'api', 'www', 'control', 'workspace']) {
      expect(checkSlug(s)).toEqual({ ok: false, reason: 'RESERVED' });
    }
    for (const s of ['a', '-abc', 'abc-', 'a--b', 'ABC', 'ab_c']) expect(checkSlug(s).ok).toBe(false);
    expect(checkSlug('kahve-dukkani')).toEqual({ ok: true, slug: 'kahve-dukkani' });
  });
});

describe('parseHost', () => {
  it('maps canonical hosts', () => {
    expect(parseHost('qmenux.com')).toEqual({ kind: 'landing' });
    expect(parseHost('admin.qmenux.com')).toEqual({ kind: 'admin' });
    expect(parseHost('superman.qmenux.com')).toEqual({ kind: 'superman' });
    expect(parseHost('api.qmenux.com')).toEqual({ kind: 'api' });
    expect(parseHost('Kahve-Evi.qmenux.com:443')).toEqual({ kind: 'menu', slug: 'kahve-evi' });
    expect(parseHost('demo-cafe.qmenux.localhost:3000')).toEqual({ kind: 'menu', slug: 'demo-cafe' });
  });
  it('never treats legacy or nested hosts as tenants', () => {
    expect(parseHost('control.qmenux.com')).toEqual({ kind: 'unknown' });
    expect(parseHost('workspace.qmenux.com')).toEqual({ kind: 'unknown' });
    expect(parseHost('a.b.qmenux.com')).toEqual({ kind: 'unknown' });
    expect(parseHost('evil-qmenux.com')).toEqual({ kind: 'unknown' });
    expect(parseHost('kahve.qmenux.com.evil.io')).toEqual({ kind: 'unknown' });
  });
});

describe('money', () => {
  it('parses Turkish formats into kuruş', () => {
    expect(parsePriceToMinor('45')).toBe(4500);
    expect(parsePriceToMinor('45,5')).toBe(4550);
    expect(parsePriceToMinor('1.234,50')).toBe(123450);
    expect(parsePriceToMinor('1.234')).toBe(123400);
    expect(parsePriceToMinor('₺ 99,90')).toBe(9990);
    expect(parsePriceToMinor('12.345.678,99')).toBeNull();
    expect(parsePriceToMinor('-5')).toBeNull();
    expect(parsePriceToMinor('abc')).toBeNull();
    expect(parsePriceToMinor('1e5')).toBeNull();
  });
  it('never shows a single kuruş digit', () => {
    expect(formatMinor(4500)).toBe('₺45');
    expect(formatMinor(4550)).toBe('₺45,50');
    expect(formatMinor(124990)).toBe('₺1.249,90');
    expect(formatMinor(5)).toBe('₺0,05');
    expect(formatMinorPlain(124990)).toBe('1.249,90');
    expect(formatMinorPlain(123400)).toBe('1.234');
  });
  it('round-trips the editable format', () => {
    for (const minor of [0, 5, 4550, 9990, 123400, 124990, 99_999_999, MAX_PRICE_MINOR]) {
      expect(parsePriceToMinor(formatMinorPlain(minor))).toBe(minor);
    }
  });
});

describe('phone display', () => {
  it('groups Turkish numbers and leaves others as stored', () => {
    expect(formatPhone('02165551234')).toBe('0216 555 12 34');
    expect(formatPhone('+905321234567')).toBe('+90 532 123 45 67');
    expect(formatPhone('0216 555 12 34')).toBe('0216 555 12 34');
    expect(formatPhone('+4930123456')).toBe('+4930123456');
    expect(formatPhone('5321234567')).toBe('5321234567');
  });
});

describe('search folding', () => {
  it('handles dotted/dotless i and diacritics', () => {
    expect(foldTr('IĞDIR İçli Köfte')).toBe('igdir icli kofte');
    expect(matchesSearch(['Sütlü Türk Kahvesi'], 'sutlu kahve')).toBe(true);
    expect(matchesSearch(['Çay'], 'kahve')).toBe(false);
  });
});

describe('geo', () => {
  it('computes distances', () => {
    // Taksim → Kadıköy ≈ 5.3 km
    const d = haversineKm({ lat: 41.0369, lng: 28.985 }, { lat: 40.9909, lng: 29.0303 });
    expect(d).toBeGreaterThan(5);
    expect(d).toBeLessThan(7);
    expect(withinRadius({ lat: 41, lng: 29 }, 0.1, { lat: 41.0005, lng: 29 })).toBe(true);
    expect(withinRadius({ lat: 41, lng: 29 }, 0.1, { lat: 41.01, lng: 29 })).toBe(false);
  });
  it('requires center and radius for radius modes', () => {
    expect(geofenceSchema.safeParse({ mode: 'RADIUS' }).success).toBe(false);
    expect(geofenceSchema.safeParse({ mode: 'OFF' }).success).toBe(true);
  });
});

describe('license', () => {
  const end = new Date('2026-11-01T00:00:00Z');
  it('derives grace and expiry', () => {
    expect(effectiveLicenseStatus({ status: 'ACTIVE', endsAt: end }, new Date('2026-10-30T00:00:00Z'), 7)).toBe('ACTIVE');
    expect(effectiveLicenseStatus({ status: 'ACTIVE', endsAt: end }, new Date('2026-11-05T00:00:00Z'), 7)).toBe('GRACE');
    expect(effectiveLicenseStatus({ status: 'ACTIVE', endsAt: end }, new Date('2026-11-09T00:00:00Z'), 7)).toBe('EXPIRED');
    expect(effectiveLicenseStatus({ status: 'REVOKED', endsAt: end }, new Date('2026-10-30T00:00:00Z'), 7)).toBe('REVOKED');
  });
});

describe('allergen safety', () => {
  it('never exposes unverified FREE', () => {
    expect(publicAllergenStatus({ status: 'FREE', verification: 'UNVERIFIED' })).toBe('UNKNOWN');
    expect(publicAllergenStatus({ status: 'CONTAINS', verification: 'UNVERIFIED' })).toBe('UNKNOWN');
    expect(publicAllergenStatus({ status: 'FREE', verification: 'VERIFIED' })).toBe('FREE');
  });

  it('buckets items for an exclusion filter without ever guessing "free"', () => {
    const free = [{ code: 'MILK', status: 'FREE' }, { code: 'GLUTEN', status: 'FREE' }] as const;
    expect(allergenBucket(free, ['MILK', 'GLUTEN'])).toBe('safe');
    expect(allergenBucket(free, [])).toBe('safe');
    // Unrecorded code is UNKNOWN, so the item is uncertain rather than safe.
    expect(allergenBucket(free, ['MILK', 'SESAME'])).toBe('uncertain');
    expect(allergenBucket([], ['MILK'])).toBe('uncertain');
    expect(allergenBucket([{ code: 'MILK', status: 'UNKNOWN' }], ['MILK'])).toBe('uncertain');
    // Any positive claim excludes, even when another excluded code is unknown or listed first.
    expect(allergenBucket([{ code: 'MILK', status: 'MAY_CONTAIN' }], ['MILK'])).toBe('excluded');
    expect(allergenBucket([{ code: 'GLUTEN', status: 'CONTAINS' }], ['SESAME', 'GLUTEN'])).toBe('excluded');
    expect(statusOf([], 'EGGS')).toBe('UNKNOWN');
  });
});

describe('rbac', () => {
  it('staff can only toggle availability', () => {
    expect(can('STAFF', 'availability.write')).toBe(true);
    expect(can('STAFF', 'catalog.write')).toBe(false);
    expect(can('MANAGER', 'settings.write')).toBe(false);
    expect(can('OWNER', 'members.manage')).toBe(true);
  });
});

describe('application schema', () => {
  it('validates input', () => {
    const ok = applicationSchema.safeParse({
      businessName: 'Örnek Kahve',
      slug: 'ornek-kahve',
      businessType: 'COFFEE_SHOP',
      contactPhone: '+905550000000',
      city: 'İzmir',
      acceptedTermsVersion: 'draft-2026-10',
    });
    expect(ok.success).toBe(true);
  });
});

describe('isLikelyBot', () => {
  it('flags crawlers, link previews and headless clients', () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'WhatsApp/2.23.20.0 A',
      'TelegramBot (like TwitterBot)',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
      'curl/8.4.0',
      'python-requests/2.31.0',
    ]) {
      expect(isLikelyBot(ua), ua).toBe(true);
    }
  });
  it('counts real phone and desktop browsers', () => {
    for (const ua of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
    ]) {
      expect(isLikelyBot(ua), ua).toBe(false);
    }
    expect(isLikelyBot(null)).toBe(false);
    expect(isLikelyBot('')).toBe(false);
  });
});
