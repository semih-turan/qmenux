import type { NextConfig } from 'next';

// Local development keeps one .env at the repo root; on Vercel the variables come from the
// project settings. loadEnvFile never overrides variables that are already set.
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  /* no root .env (CI / Vercel) */
}

const isProd = process.env.NODE_ENV === 'production';

const csp = [
  "default-src 'self'",
  // Next.js App Router injects inline bootstrap scripts; a nonce-based CSP is a follow-up (DECISIONS.md D-ADM-03).
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  // Login posts to /auth/start, which redirects to the identity provider.
  "form-action 'self' https://accounts.google.com https://login.microsoftonline.com https://appleid.apple.com " + (process.env.QX_API_ORIGIN ?? ''),
  "object-src 'none'",
].join('; ');

/**
 * Platform operations PWA (superman.qmenux.com). The hostname is not a secret and proves nothing:
 * every API call carries an ops-audience session that must be MFA-verified, and the API checks the
 * platform role server-side. Nothing confidential is cached (no service worker, no-store on data).
 */
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@qmenux/ui'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }] : []),
        ],
      },
    ];
  },
};

export default config;
