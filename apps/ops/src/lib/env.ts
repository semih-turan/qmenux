import 'server-only';
import { cookieNames } from './bff-policy';

function required(name: string): string {
  const v = process.env[name];
  if (!v || v === 'replace-me') throw new Error(`${name} is not configured`);
  return v;
}

/** Same derivation as the API's `origin('superman', 3002)`, so both sides agree on the redirect URI. */
function deriveOpsOrigin(): string {
  if (process.env.QX_OPS_ORIGIN) return process.env.QX_OPS_ORIGIN;
  const root = process.env.QX_ROOT_DOMAIN ?? 'qmenux.localhost';
  return root.endsWith('.localhost') || root === 'localhost' ? `http://superman.${root}:3002` : `https://superman.${root}`;
}

/** Server-side settings only. Nothing here may be exposed through NEXT_PUBLIC_*. */
export function serverEnv() {
  const opsOrigin = deriveOpsOrigin();
  const secure = opsOrigin.startsWith('https://');
  const apiOrigin = required('QX_API_ORIGIN');
  return {
    apiOrigin,
    // Server-to-server address of the same API. Node on Windows cannot resolve *.localhost subdomains,
    // so local development may point this at http://127.0.0.1:4000; it is never sent to the browser.
    apiInternalOrigin: process.env.QX_API_INTERNAL_ORIGIN || apiOrigin,
    bffKey: required('QX_BFF_SHARED_KEY'),
    opsOrigin,
    secure,
    cookies: cookieNames(secure),
    // Only trust x-forwarded-for behind a proxy we control; on Vercel x-vercel-forwarded-for is used.
    trustForwardedFor: process.env.QX_TRUST_FORWARDED_FOR === '1',
  };
}
