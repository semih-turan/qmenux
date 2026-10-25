import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { IdentityProvider } from './identity-store.js';

export type AuthApp = 'api' | 'admin';
const apiOrigins = new Set(['https://api.qmenux.com', 'https://qmenux-api.vercel.app']);

export function authOrigin(): string | undefined {
  const origin = process.env.AUTH_BASE_URL;
  return origin && apiOrigins.has(origin) ? origin : undefined;
}

// Only authenticated server callers select admin; never take this context from a browser parameter.
export function oidcCallback(provider: IdentityProvider, app: AuthApp): string {
  if (!['google', 'microsoft', 'apple'].includes(provider) || !['api', 'admin'].includes(app)) {
    throw new UnauthorizedException();
  }
  if (app === 'admin') return `https://admin.qmenux.com/api/auth/${provider}/callback`;
  const origin = authOrigin();
  if (!origin) throw new ServiceUnavailableException({ status: 'unavailable' });
  return `${origin}/v1/auth/${provider}/callback`;
}

export function checkOidcCallback(url: URL, provider: IdentityProvider, app: AuthApp): void {
  if (`${url.origin}${url.pathname}` !== oidcCallback(provider, app) || url.hash || url.username || url.password) {
    throw new UnauthorizedException();
  }
}
