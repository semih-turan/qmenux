import 'server-only';

function required(name: string): string {
  const v = process.env[name];
  if (!v || v === 'replace-me') throw new Error(`${name} is not configured`);
  return v;
}

/** Server-side settings only. Nothing here may be exposed through NEXT_PUBLIC_*. */
export function serverEnv() {
  const apiOrigin = required('QX_API_ORIGIN');
  const rootDomain = process.env.QX_ROOT_DOMAIN ?? 'qmenux.localhost';
  return {
    apiOrigin,
    // Server-to-server address of the same API. Node on Windows cannot resolve *.localhost subdomains,
    // so local development may point this at http://127.0.0.1:4000; it is never sent to the browser.
    apiInternalOrigin: process.env.QX_API_INTERNAL_ORIGIN || apiOrigin,
    bffKey: required('QX_BFF_SHARED_KEY'),
    rootDomain,
    // Menus are served over https everywhere except local *.localhost development.
    secure: !(rootDomain.endsWith('.localhost') || rootDomain === 'localhost'),
    // Only trust x-forwarded-for behind a proxy we control; on Vercel x-vercel-forwarded-for is used.
    trustForwardedFor: process.env.QX_TRUST_FORWARDED_FOR === '1',
  };
}
