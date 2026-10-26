import { describe, expect, it } from 'vitest';
import { fillDays } from '../src/lib/analytics';
import { PHONE_RE, cleanPhone, formatKm, parseDecimal, toIntlPhone } from '../src/lib/format';

describe('phones', () => {
  it('cleans what people actually type', () => {
    expect(cleanPhone(' 0 (532) 123-45.67 ')).toBe('05321234567');
    expect(PHONE_RE.test(cleanPhone('0532 123 45 67'))).toBe(true);
    expect(PHONE_RE.test(cleanPhone('123'))).toBe(false);
    expect(PHONE_RE.test(cleanPhone('0532abc4567'))).toBe(false);
  });

  it('builds the international form for wa.me', () => {
    expect(toIntlPhone('0532 123 45 67')).toBe('+905321234567');
    expect(toIntlPhone('532 123 45 67')).toBe('+905321234567');
    expect(toIntlPhone('+90 532 123 45 67')).toBe('+905321234567');
    expect(toIntlPhone('0049 30 1234567')).toBe('+49301234567');
    expect(toIntlPhone('212 123 45 67')).toBeNull();
    expect(toIntlPhone('+12')).toBeNull();
    expect(toIntlPhone('')).toBeNull();
  });
});

describe('parseDecimal', () => {
  it('accepts a decimal comma or point', () => {
    expect(parseDecimal('41,0082')).toBe(41.0082);
    expect(parseDecimal(' 28.97 ')).toBe(28.97);
    expect(parseDecimal('-12')).toBe(-12);
  });
  it('rejects anything ambiguous', () => {
    for (const s of ['', 'abc', '1,234.5', '1.2.3', '1e3', ',5', 'Infinity']) expect(parseDecimal(s)).toBeNull();
  });
});

describe('formatKm', () => {
  it('switches to metres below 1 km', () => {
    expect(formatKm(0.25)).toBe('250 m');
    expect(formatKm(1)).toBe('1 km');
    expect(formatKm(1.5)).toBe('1,5 km');
  });
});

describe('fillDays', () => {
  it('returns 30 Istanbul calendar days ending today, zero-filled', () => {
    // 2026-10-25 22:30 UTC is already 26 October in Istanbul (UTC+3).
    const now = new Date('2026-10-25T22:30:00Z');
    const out = fillDays([{ day: '2026-10-26', total: 4 }, { day: '2026-10-01', total: 2 }, { day: '2026-09-01', total: 9 }], now);
    expect(out).toHaveLength(30);
    expect(out.at(-1)).toEqual({ day: '2026-10-26', total: 4 });
    expect(out[0]!.day).toBe('2026-09-27');
    expect(out.find((d) => d.day === '2026-10-01')!.total).toBe(2);
    expect(out.some((d) => d.day === '2026-09-01')).toBe(false);
    expect(out.reduce((s, d) => s + d.total, 0)).toBe(6);
  });
  it('crosses month boundaries without gaps', () => {
    const out = fillDays([], new Date('2026-03-01T12:00:00Z'));
    const days = out.map((d) => d.day);
    expect(days).toContain('2026-02-28');
    expect(new Set(days).size).toBe(30);
  });
});
