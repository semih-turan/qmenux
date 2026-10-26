/** Browser-safe helpers for counting a QR landing once. No identifiers, no cookies. */

const TABLE_TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

export type Landing = { source: 'table'; tableToken: string } | { source: 'qr' } | { source: 'direct' };

/**
 * How the guest arrived, from the landing URL: `?t=<token>` is a table QR, `?src=qr` the general QR,
 * anything else a direct visit. A malformed token still came from a QR code, but is not trusted as a table.
 */
export function landingFrom(search: string): Landing {
  const p = new URLSearchParams(search);
  const t = p.get('t');
  if (t && TABLE_TOKEN_RE.test(t)) return { source: 'table', tableToken: t };
  if (t || p.get('src') === 'qr') return { source: 'qr' };
  return { source: 'direct' };
}

/** The landing URL without the tracking parameters, so a reload is not a second scan and the token leaves the address bar. */
export function cleanLandingUrl(pathname: string, search: string, hash: string): string {
  const p = new URLSearchParams(search);
  p.delete('t');
  p.delete('src');
  const q = p.toString();
  return `${pathname}${q ? `?${q}` : ''}${hash}`;
}

/**
 * Per-tab key that stops the same landing from being sent twice (reload, back/forward, StrictMode).
 * A direct visit after a QR landing in the same tab is the same visit, so it shares the "landed" key.
 */
export function landingKey(l: Landing): string {
  return l.source === 'table' ? `qx_landed:table:${l.tableToken}` : l.source === 'qr' ? 'qx_landed:qr' : 'qx_landed';
}

/** Random, unlinkable id that only lets the API ignore a retried request. */
export function clientEventId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}
