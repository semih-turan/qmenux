import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export type AccessIdentity = Readonly<{ issuer: string; subject: string; audience: string }>;

@Injectable()
export class OperatorAccess {
  private keys?: { issuer: string; resolve: ReturnType<typeof createRemoteJWKSet> };

  async verify(assertion: unknown): Promise<AccessIdentity> {
    const issuer = process.env.OPERATOR_ACCESS_ISSUER;
    const audience = process.env.OPERATOR_ACCESS_AUDIENCE;
    if (process.env.OPERATOR_ACCESS_ENABLED !== 'true' || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
      || !issuer || !/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(issuer)
      || !audience || !/^[a-f0-9]{64}$/.test(audience)) {
      this.keys = undefined;
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
    if (typeof assertion !== 'string' || assertion.length > 8192
      || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(assertion)) throw new UnauthorizedException();
    if (this.keys?.issuer !== issuer) {
      this.keys = { issuer, resolve: createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`),
        { timeoutDuration: 5000, cooldownDuration: 30000, cacheMaxAge: 600000 }) };
    }
    try {
      const { payload } = await jwtVerify(assertion, this.keys.resolve, {
        issuer, audience, algorithms: ['RS256'], typ: 'JWT', maxTokenAge: 900,
        requiredClaims: ['exp', 'iat', 'nbf', 'sub', 'type'],
      });
      if (payload.type !== 'app' || typeof payload.sub !== 'string' || !payload.sub.trim() || payload.sub.length > 255
        || !Array.isArray(payload.aud) || payload.aud.length !== 1 || payload.aud[0] !== audience
        || Object.hasOwn(payload, 'common_name') || Object.hasOwn(payload, 'service_token_id')) throw new Error();
      // Access identity alone grants no platform role, MFA proof, session or step-up.
      return Object.freeze({ issuer, subject: payload.sub, audience });
    } catch { throw new UnauthorizedException(); }
  }
}
