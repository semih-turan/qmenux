import { RESERVED_SLUGS, SLUG_RE } from './slug.js';

export type HostKind =
  | { kind: 'landing' }
  | { kind: 'admin' }
  | { kind: 'superman' }
  | { kind: 'api' }
  | { kind: 'menu'; slug: string }
  | { kind: 'unknown' };

export const DEFAULT_APEX_DOMAINS = ['qmenux.com', 'qmenux.localhost'] as const;

/**
 * Resolves a Host header to its trust zone. Callers must pass the platform-verified
 * host, never a client-supplied X-Forwarded-Host. `workspace`/`control` are NOT canonical.
 */
export function parseHost(
  rawHost: string | null | undefined,
  apexDomains: readonly string[] = DEFAULT_APEX_DOMAINS,
): HostKind {
  if (!rawHost) return { kind: 'unknown' };
  const host = rawHost.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  for (const apex of apexDomains) {
    if (host === apex || host === `www.${apex}`) return { kind: 'landing' };
    if (!host.endsWith(`.${apex}`)) continue;
    const label = host.slice(0, -(apex.length + 1));
    if (label.includes('.')) return { kind: 'unknown' };
    if (label === 'admin') return { kind: 'admin' };
    if (label === 'superman') return { kind: 'superman' };
    if (label === 'api') return { kind: 'api' };
    if (RESERVED_SLUGS.has(label) || !SLUG_RE.test(label)) return { kind: 'unknown' };
    return { kind: 'menu', slug: label };
  }
  return { kind: 'unknown' };
}
