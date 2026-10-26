/**
 * Phones are stored as bare digits ("02165551234", "+905321234567") but read in groups.
 * Turkish numbers become "0216 555 12 34" / "+90 532 123 45 67"; anything else is shown as stored.
 */
export function formatPhone(stored: string): string {
  const m = /^(\+90|0)(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(stored.replace(/[^\d+]/g, ''));
  if (!m) return stored;
  const [, prefix, a, b, c, d] = m;
  return `${prefix === '0' ? '0' : '+90 '}${a} ${b} ${c} ${d}`;
}
