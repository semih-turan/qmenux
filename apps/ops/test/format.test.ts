import { describe, expect, it } from 'vitest';
import { daysUntil, endOfDayIso, formatMonth, plusMonths, toDateInput } from '../src/lib/format';

describe('endOfDayIso', () => {
  it('ends at 23:59:59 local time of the chosen day', () => {
    const iso = endOfDayIso('2026-12-31')!;
    const d = new Date(iso);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(11);
    expect(d.getDate()).toBe(31);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
  });
  it('rejects malformed or impossible dates', () => {
    expect(endOfDayIso('2026-02-30')).toBeNull();
    expect(endOfDayIso('31.12.2026')).toBeNull();
    expect(endOfDayIso('')).toBeNull();
  });
});

describe('plusMonths', () => {
  it('clamps to the last day of the target month', () => {
    expect(plusMonths(new Date(2026, 0, 31), 1)).toBe('2026-02-28');
    expect(plusMonths(new Date(2026, 9, 26), 12)).toBe('2027-10-26');
    expect(plusMonths(new Date(2026, 11, 15), 1)).toBe('2027-01-15');
  });
});

describe('daysUntil', () => {
  const now = new Date(2026, 9, 26, 12).getTime();
  it('counts whole days, negative when past', () => {
    expect(daysUntil(new Date(2026, 9, 28, 12).toISOString(), now)).toBe(2);
    expect(daysUntil(new Date(2026, 9, 24, 12).toISOString(), now)).toBe(-2);
  });
});

describe('formatMonth / toDateInput', () => {
  it('renders Turkish month names and zero-padded inputs', () => {
    expect(formatMonth('2026-10')).toMatch(/Ekim 2026/);
    expect(toDateInput(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
