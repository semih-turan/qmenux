import { describe, expect, it } from 'vitest';
import { formatStamp, telHref, whatsappHref } from '../src/lib/format';

describe('formatStamp', () => {
  it('prints Türkiye time whatever the machine time zone is', () => {
    expect(formatStamp('2026-10-25T11:30:00.000Z')).toBe('25 Ekim 2026 14:30');
    expect(formatStamp('2026-12-31T21:05:00.000Z')).toBe('1 Ocak 2027 00:05');
  });
  it('prints nothing for an invalid date', () => {
    expect(formatStamp('not a date')).toBe('');
    expect(formatStamp('')).toBe('');
  });
});

describe('whatsappHref', () => {
  it('builds a wa.me link from an E.164 number', () => {
    expect(whatsappHref('+90 532 000 00 00', null)).toBe('https://wa.me/905320000000');
  });
  it('encodes the prefilled message and drops a blank one', () => {
    expect(whatsappHref('+905320000000', 'Merhaba, rezervasyon & bilgi?')).toBe(
      'https://wa.me/905320000000?text=Merhaba%2C%20rezervasyon%20%26%20bilgi%3F',
    );
    expect(whatsappHref('+905320000000', '   ')).toBe('https://wa.me/905320000000');
  });
  it('hides the button rather than linking a broken number', () => {
    expect(whatsappHref('1234567', null)).toBeNull();
    expect(whatsappHref('+1234567890123456', null)).toBeNull();
    expect(whatsappHref('yok', null)).toBeNull();
  });
});

describe('telHref', () => {
  it('keeps digits and a leading plus', () => {
    expect(telHref('+90 (212) 000 00 00')).toBe('tel:+902120000000');
    expect(telHref('+4930123456')).toBe('tel:+4930123456');
  });
  it('dials Turkish national numbers in global form so foreign SIMs can call', () => {
    expect(telHref('0212 000 00 00')).toBe('tel:+902120000000');
    expect(telHref('02165551234')).toBe('tel:+902165551234');
  });
  it('refuses anything that is not a phone number', () => {
    expect(telHref('123')).toBeNull();
    expect(telHref('javascript:alert(1)')).toBeNull();
    expect(telHref('90+212000000')).toBeNull();
  });
});
