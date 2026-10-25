import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import * as oidc from 'openid-client';

import { authOrigin, oidcCallback, checkOidcCallback, type AuthApp } from './oidc-callback.js';
export { authOrigin } from './oidc-callback.js';

export const googleIssuer = 'https://accounts.google.com';
export function googleEnabled(): boolean {
  return process.env.AUTH_GOOGLE_ENABLED === 'true' && !!authOrigin()
    && process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0'
    && !!process.env.GOOGLE_CLIENT_ID?.trim() && !!process.env.GOOGLE_CLIENT_SECRET?.trim();
}

@Injectable()
export class GoogleOidc {
  private configuration?: Promise<oidc.Configuration>;

  private async config(): Promise<oidc.Configuration> {
    if (!googleEnabled()) throw new ServiceUnavailableException({ status: 'unavailable' });
    if (!this.configuration) {
      this.configuration = oidc.discovery(new URL(googleIssuer), process.env.GOOGLE_CLIENT_ID!,
        { client_secret: process.env.GOOGLE_CLIENT_SECRET!, id_token_signed_response_alg: 'RS256' },
        undefined, { timeout: 5, execute: [oidc.enableNonRepudiationChecks] });
    }
    try { return await this.configuration; }
    catch { this.configuration = undefined; throw new ServiceUnavailableException({ status: 'unavailable' }); }
  }

  async start(app: AuthApp = 'api'): Promise<{ url: string; state: string; verifier: string; nonce: string }> {
    const redirect = oidcCallback('google', app);
    const config = await this.config();
    const state = oidc.randomState();
    const verifier = oidc.randomPKCECodeVerifier();
    const nonce = oidc.randomNonce();
    const url = oidc.buildAuthorizationUrl(config, {
      response_type: 'code', scope: 'openid', redirect_uri: redirect,
      state, nonce, code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256',
    });
    return { url: url.href, state, verifier, nonce };
  }

  async finish(url: URL, attempt: { verifier: string; nonce: string }, state: string, app: AuthApp = 'api'): Promise<string> {
    const config = await this.config();
    try {
      checkOidcCallback(url, 'google', app);
      const tokens = await oidc.authorizationCodeGrant(config, url, {
        expectedState: state, expectedNonce: attempt.nonce, pkceCodeVerifier: attempt.verifier, idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (claims?.iss !== googleIssuer || !claims.sub || claims.sub.length > 255) throw new Error('Invalid subject');
      // No provider tokens, email, display name, or external role claims escape this boundary.
      return claims.sub;
    } catch { throw new UnauthorizedException(); }
  }
}
