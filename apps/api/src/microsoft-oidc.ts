import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import * as oidc from 'openid-client';
import { authOrigin } from './google-oidc.js';

export const microsoftTenant = '9188040d-6c67-4c5b-b112-36a304b66dad';
export const microsoftIssuer = `https://login.microsoftonline.com/${microsoftTenant}/v2.0`;
export function microsoftEnabled(): boolean {
  return process.env.AUTH_MICROSOFT_ENABLED === 'true' && !!authOrigin()
    && process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0'
    && !!process.env.MICROSOFT_CLIENT_ID?.trim() && !!process.env.MICROSOFT_CLIENT_SECRET?.trim();
}

@Injectable()
export class MicrosoftOidc {
  private configuration?: Promise<oidc.Configuration>;

  private async config(): Promise<oidc.Configuration> {
    if (!microsoftEnabled()) throw new ServiceUnavailableException({ status: 'unavailable' });
    if (!this.configuration) {
      this.configuration = oidc.discovery(new URL(microsoftIssuer), process.env.MICROSOFT_CLIENT_ID!,
        { client_secret: process.env.MICROSOFT_CLIENT_SECRET!, id_token_signed_response_alg: 'RS256' },
        undefined, { timeout: 5, execute: [oidc.enableNonRepudiationChecks] });
    }
    try { return await this.configuration; }
    catch { this.configuration = undefined; throw new ServiceUnavailableException({ status: 'unavailable' }); }
  }

  async start(): Promise<{ url: string; state: string; verifier: string; nonce: string }> {
    const config = await this.config();
    const state = oidc.randomState();
    const verifier = oidc.randomPKCECodeVerifier();
    const nonce = oidc.randomNonce();
    const url = oidc.buildAuthorizationUrl(config, {
      response_type: 'code', scope: 'openid', redirect_uri: `${authOrigin()}/v1/auth/microsoft/callback`,
      state, nonce, code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256',
    });
    return { url: url.href, state, verifier, nonce };
  }

  async finish(url: URL, attempt: { verifier: string; nonce: string }, state: string): Promise<string> {
    const config = await this.config();
    try {
      if (url.origin !== authOrigin() || url.pathname !== '/v1/auth/microsoft/callback'
        || url.hash || url.username || url.password) throw new Error('Invalid callback');
      const tokens = await oidc.authorizationCodeGrant(config, url, {
        expectedState: state, expectedNonce: attempt.nonce, pkceCodeVerifier: attempt.verifier, idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (claims?.iss !== microsoftIssuer || claims.tid !== microsoftTenant || claims.ver !== '2.0'
        || typeof claims.sub !== 'string' || !claims.sub.trim() || claims.sub.length > 255) throw new Error('Invalid subject');
      // No provider tokens, email, display name, or external role claims escape this boundary.
      return claims.sub;
    } catch { throw new UnauthorizedException(); }
  }
}
