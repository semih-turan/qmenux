import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import * as oidc from 'openid-client';
import { AppleClientSecret } from './apple-client-secret.js';
import { authOrigin } from './google-oidc.js';

export const appleIssuer = 'https://appleid.apple.com';

export function appleEnabled(): boolean {
  return process.env.AUTH_APPLE_ENABLED === 'true' && !!authOrigin()
    && process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0'
    && ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_CLIENT_ID', 'APPLE_PRIVATE_KEY'].every(name => !!process.env[name]?.trim());
}

@Injectable()
export class AppleOidc {
  constructor(private readonly secret: AppleClientSecret) {}

  private async config(): Promise<oidc.Configuration> {
    if (!appleEnabled()) throw new ServiceUnavailableException({ status: 'unavailable' });
    // Mint per operation: a cached configuration must not retain an expired developer JWT.
    const clientSecret = await this.secret.create();
    try {
      const config = await oidc.discovery(new URL(appleIssuer), process.env.APPLE_CLIENT_ID!,
        { client_secret: clientSecret, id_token_signed_response_alg: 'RS256' },
        undefined, { timeout: 5, execute: [oidc.enableNonRepudiationChecks] });
      const metadata = config.serverMetadata();
      if (metadata.issuer !== appleIssuer || metadata.authorization_endpoint !== `${appleIssuer}/auth/authorize`
        || metadata.token_endpoint !== `${appleIssuer}/auth/token` || metadata.jwks_uri !== `${appleIssuer}/auth/keys`
        || !metadata.response_types_supported?.includes('code') || !metadata.response_modes_supported?.includes('query')
        || !metadata.token_endpoint_auth_methods_supported?.includes('client_secret_post')
        || !metadata.id_token_signing_alg_values_supported?.includes('RS256')) {
        throw new Error('Unexpected Apple endpoints');
      }
      return config;
    } catch { throw new ServiceUnavailableException({ status: 'unavailable' }); }
  }

  async start(): Promise<{ url: string; state: string; nonce: string }> {
    const config = await this.config();
    const state = oidc.randomState(), nonce = oidc.randomNonce();
    const url = oidc.buildAuthorizationUrl(config, {
      response_type: 'code', response_mode: 'query', redirect_uri: `${authOrigin()}/v1/auth/apple/callback`, state, nonce,
    });
    return { url: url.href, state, nonce };
  }

  async finish(url: URL, attempt: { nonce: string }, state: string): Promise<string> {
    const config = await this.config();
    try {
      if (url.origin !== authOrigin() || url.pathname !== '/v1/auth/apple/callback' || url.hash || url.username || url.password
        || !/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(attempt.nonce)
        || url.searchParams.has('id_token') || url.searchParams.has('access_token') || url.searchParams.has('user')) {
        throw new Error('Invalid Apple callback');
      }
      const tokens = await oidc.authorizationCodeGrant(config, url, {
        expectedState: state, expectedNonce: attempt.nonce, idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (claims?.iss !== appleIssuer || typeof claims.sub !== 'string' || !claims.sub.trim() || claims.sub.length > 255) {
        throw new Error('Invalid Apple subject');
      }
      // No token, email, relay address, name or external role escapes this boundary.
      return claims.sub;
    } catch { throw new UnauthorizedException(); }
  }
}
