/** Money is stored as integer minor units (kuruş). Never floats. */
export type Currency = 'TRY';

export const MAX_PRICE_MINOR = 10_000_000_00;

/** Accepts "45", "45,5", "1.234,50", "1234.50", "₺45", "45 TL". Returns null when invalid. */
export function parsePriceToMinor(input: string): number | null {
  const s = input.trim().replace(/\s|₺|TL/gi, '');
  if (!s) return null;
  let normalized: string;
  if (/,\d{1,2}$/.test(s)) normalized = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) normalized = s.replace(/\./g, '');
  else normalized = s;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole = '0', frac = ''] = normalized.split('.');
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor <= MAX_PRICE_MINOR ? minor : null;
}

// Whole liras drop the kuruş ("₺45"); anything else always shows two digits ("₺45,50", never "₺45,5").
const fmtWhole = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtKurus = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatMinor(minor: number): string {
  return (minor % 100 === 0 ? fmtWhole : fmtKurus).format(minor / 100);
}

/** Same rule without the currency sign, for an editable price field ("1.249,90"). */
export function formatMinorPlain(minor: number): string {
  const digits = minor % 100 === 0 ? 0 : 2;
  return (minor / 100).toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
