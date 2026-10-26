import { foldTr } from './text.js';

/** Labels that may never be used as a tenant slug / subdomain. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin', 'superman', 'api', 'www', 'auth', 'login', 'signup', 'assets', 'static', 'cdn', 'media',
  'mail', 'smtp', 'imap', 'pop', 'ftp', 'ns1', 'ns2', 'dns', 'mx', 'status', 'help', 'support', 'docs',
  'blog', 'app', 'apps', 'dashboard', 'panel', 'control', 'workspace', 'console', 'root', 'system',
  'qmenux', 'qmenu', 'menu', 'billing', 'payment', 'pay', 'webhook', 'webhooks', 'oauth', 'sso', 'id',
  'account', 'accounts', 'security', 'legal', 'kvkk', 'privacy', 'terms', 'test', 'staging', 'preview',
  'dev', 'demo', 'internal', 'ops', 'superadmin', 'localhost',
]);

/** 3–32 chars, lowercase ascii, digits and single hyphens, no leading/trailing hyphen. */
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

export type SlugCheck = { ok: true; slug: string } | { ok: false; reason: 'FORMAT' | 'RESERVED' };

export function normalizeSlug(input: string): string {
  return foldTr(input)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
}

export function checkSlug(slug: string): SlugCheck {
  if (!SLUG_RE.test(slug) || slug.includes('--')) return { ok: false, reason: 'FORMAT' };
  if (RESERVED_SLUGS.has(slug)) return { ok: false, reason: 'RESERVED' };
  return { ok: true, slug };
}
