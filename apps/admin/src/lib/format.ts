// Display formatting for the admin panel. Dates render in the device's zone; reports state their own zone.

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const formatCount = (n: number) => n.toLocaleString('tr-TR');

export const ROLE_LABELS_TR = { OWNER: 'Sahip', MANAGER: 'Yönetici', STAFF: 'Personel' } as const;

/** Same rule as the API's phoneSchema, applied after `cleanPhone`. */
export const PHONE_RE = /^\+?[0-9]{10,15}$/;

/** Non-breaking spaces, so an example number in a narrow error line never wraps mid-number. */
export const noWrap = (s: string) => s.replace(/ /g, ' ');

/** "0 (532) 123-45 67" → "05321234567": people type phones with spaces, dashes, dots and brackets. */
export const cleanPhone = (s: string) => s.trim().replace(/[\s().-]/g, '');

/**
 * International form for wa.me links, which need the country code. Turkish local forms are
 * converted ("0532…" / "532…" → "+90532…"); anything else must already start with + or 00.
 * Returns null when the country code cannot be known.
 */
export function toIntlPhone(s: string): string | null {
  const p = cleanPhone(s);
  if (p.startsWith('+')) return PHONE_RE.test(p) ? p : null;
  if (p.startsWith('00')) return toIntlPhone(`+${p.slice(2)}`);
  if (/^0[0-9]{10}$/.test(p)) return `+90${p.slice(1)}`;
  if (/^5[0-9]{9}$/.test(p)) return `+90${p}`;
  return null;
}

/** "41,0082" or "41.0082" → 41.0082; Turkish keyboards type a decimal comma. Null for anything else. */
export function parseDecimal(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Distances under 1 km read better in metres: 0.25 → "250 m", 1.5 → "1,5 km". */
export const formatKm = (km: number) =>
  km < 1 ? `${Math.round(km * 1000).toLocaleString('tr-TR')} m` : `${km.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} km`;
