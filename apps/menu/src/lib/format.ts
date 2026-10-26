/** Browser-safe display helpers for the guest menu. */

const stamp = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** "25 Ekim 2026 14:30" in Türkiye time on both server and client, so hydration never disagrees. */
export function formatStamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : stamp.format(d);
}

/**
 * wa.me link for the opt-in WhatsApp button (ENGAGEMENT_ANALYTICS.md). The number is stored as E.164;
 * anything that does not reduce to 8–15 digits hides the button instead of producing a broken link.
 */
export function whatsappHref(phone: string, message: string | null): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  const text = message?.trim();
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/**
 * tel: link for the branch phone. A Turkish national number ("0216…") becomes global (+90…, RFC 3966),
 * so guests on a foreign SIM can call it too; anything else is dialled as stored.
 */
export function telHref(phone: string): string | null {
  const v = phone.replace(/[^\d+]/g, '');
  if (/^0\d{10}$/.test(v)) return `tel:+90${v.slice(1)}`;
  return /^\+?\d{7,15}$/.test(v) ? `tel:${v}` : null;
}
