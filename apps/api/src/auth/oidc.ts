import type { AuthProvider } from '@qmenux/contracts';
import { DEV_ISSUER } from '@qmenux/database';
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type JWTPayload } from 'jose';
import type { ApiConfig } from '../config.js';
import { pkceChallenge, signPass, verifyPass } from '../crypto.js';
import { ApiError } from '../http/problem.js';

export type Audience = 'admin' | 'ops';

export interface VerifiedIdentity {
  provider: AuthProvider;
  issuer: string;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

interface ProviderDef {
  id: AuthProvider;
  label: string;
  authorizeUrl: string;
  tokenUrl: string | null;
  jwksUrl: string | null;
  scope: string;
  clientId: string;
  extraAuthParams?: Record<string, string>;
}

const MS_CONSUMER_TID = '9188040d-6c67-4c5b-b112-36a304b66dad';

export const idpError = (detail: string) => new ApiError(401, 'IDP_REJECTED', 'Giriş doğrulanamadı. Lütfen tekrar deneyin.', { detail });

/**
 * Provider endpoints and claim rules are a starting point and MUST be re-verified
 * against current provider documentation before launch (see DECISIONS.md D-API-01).
 */
export class OidcService {
  private readonly jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

  constructor(private readonly cfg: ApiConfig) {}

  providers(): ProviderDef[] {
    const out: ProviderDef[] = [];
    const c = this.cfg;
    if (c.google)
      out.push({
        id: 'google',
        label: 'Google',
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
        scope: 'openid email profile',
        clientId: c.google.clientId,
        extraAuthParams: { prompt: 'select_account' },
      });
    if (c.microsoft)
      out.push({
        id: 'microsoft',
        label: 'Microsoft (Outlook)',
        authorizeUrl: `https://login.microsoftonline.com/${c.microsoft.tenant}/oauth2/v2.0/authorize`,
        tokenUrl: `https://login.microsoftonline.com/${c.microsoft.tenant}/oauth2/v2.0/token`,
        jwksUrl: `https://login.microsoftonline.com/${c.microsoft.tenant}/discovery/v2.0/keys`,
        scope: 'openid email profile',
        clientId: c.microsoft.clientId,
        extraAuthParams: { prompt: 'select_account' },
      });
    if (c.apple)
      out.push({
        id: 'apple',
        label: 'Apple',
        authorizeUrl: 'https://appleid.apple.com/auth/authorize',
        tokenUrl: 'https://appleid.apple.com/auth/token',
        jwksUrl: 'https://appleid.apple.com/auth/keys',
        scope: 'openid email name',
        clientId: c.apple.clientId,
        // Apple posts the result back; the BFF callback route must accept form_post.
        extraAuthParams: { response_mode: 'form_post' },
      });
    if (c.devIdp)
      out.push({
        id: 'dev',
        label: 'Geliştirici girişi (yalnızca yerel)',
        authorizeUrl: `${c.origins.api}/v1/dev-idp/authorize`,
        tokenUrl: null,
        jwksUrl: null,
        scope: 'openid',
        clientId: 'qmenux-dev',
      });
    return out;
  }

  provider(id: string): ProviderDef {
    const p = this.providers().find((x) => x.id === id);
    if (!p) throw new ApiError(400, 'PROVIDER_UNAVAILABLE', 'Bu giriş yöntemi şu anda kullanılamıyor');
    return p;
  }

  /** Exact redirect URI per audience; never taken from the request. */
  redirectUri(audience: Audience, provider: AuthProvider): string {
    const origin = audience === 'ops' ? this.cfg.origins.ops : this.cfg.origins.admin;
    return `${origin}/auth/callback/${provider}`;
  }

  authorizationUrl(p: ProviderDef, audience: Audience, state: string, nonce: string, codeChallenge: string): string {
    const u = new URL(p.authorizeUrl);
    const params: Record<string, string> = {
      client_id: p.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri(audience, p.id),
      scope: p.scope,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      ...p.extraAuthParams,
    };
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  }

  async exchange(providerId: AuthProvider, audience: Audience, code: string, codeVerifier: string, nonce: string): Promise<VerifiedIdentity> {
    const p = this.provider(providerId);
    const redirectUri = this.redirectUri(audience, p.id);
    if (p.id === 'dev') return this.exchangeDev(code, codeVerifier, nonce, redirectUri);

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: p.clientId,
      code_verifier: codeVerifier,
    });
    const secret = await this.clientSecret(p.id);
    if (secret) body.set('client_secret', secret);
    const res = await fetch(p.tokenUrl!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw idpError(`token endpoint ${res.status}`);
    const json = (await res.json()) as { id_token?: string };
    if (!json.id_token) throw idpError('no id_token');
    return this.verifyIdToken(p, json.id_token, nonce);
  }

  private async clientSecret(id: AuthProvider): Promise<string | undefined> {
    if (id === 'google') return this.cfg.google?.clientSecret;
    if (id === 'microsoft') return this.cfg.microsoft?.clientSecret;
    if (id === 'apple' && this.cfg.apple) {
      const a = this.cfg.apple;
      const key = await importPKCS8(a.privateKey, 'ES256');
      return new SignJWT({})
        .setProtectedHeader({ alg: 'ES256', kid: a.keyId })
        .setIssuer(a.teamId)
        .setSubject(a.clientId)
        .setAudience('https://appleid.apple.com')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(key);
    }
    return undefined;
  }

  private async verifyIdToken(p: ProviderDef, idToken: string, nonce: string): Promise<VerifiedIdentity> {
    let jwks = this.jwks.get(p.jwksUrl!);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(p.jwksUrl!));
      this.jwks.set(p.jwksUrl!, jwks);
    }
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(idToken, jwks, {
        audience: p.clientId,
        issuer: p.id === 'google' ? ['https://accounts.google.com', 'accounts.google.com'] : p.id === 'apple' ? 'https://appleid.apple.com' : undefined,
        clockTolerance: 60,
      }));
    } catch {
      throw idpError('id_token verification failed');
    }
    if (payload.nonce !== nonce) throw idpError('nonce mismatch');
    if (!payload.sub || !payload.iss) throw idpError('missing sub/iss');

    if (p.id === 'microsoft') {
      // Multi-tenant endpoints: the issuer must match the token's own tenant id.
      const tid = String(payload.tid ?? '');
      if (!/^[0-9a-f-]{36}$/.test(tid) || payload.iss !== `https://login.microsoftonline.com/${tid}/v2.0`) throw idpError('issuer/tid mismatch');
      if (this.cfg.microsoft?.tenant === 'consumers' && tid !== MS_CONSUMER_TID) throw idpError('unexpected tenant');
    }

    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
    // Microsoft email claims are not verified ownership; never treat them as such.
    const emailVerified = p.id !== 'microsoft' && (payload.email_verified === true || payload.email_verified === 'true');
    const name = typeof payload.name === 'string' ? payload.name.slice(0, 120) : null;
    return { provider: p.id, issuer: payload.iss, subject: payload.sub, email, emailVerified, name };
  }

  // ---------------------------------------------------------------- local dev IdP (QX_DEV_IDP=1, never production)
  issueDevCode(input: { sub: string; name: string; nonce: string; codeChallenge: string; redirectUri: string }): string {
    if (!this.cfg.devIdp || this.cfg.isProduction) throw new ApiError(404, 'NOT_FOUND', 'Bulunamadı');
    return signPass(this.cfg.tokenPepper, 'dev-idp', { ...input, exp: Math.floor(Date.now() / 1000) + 120 });
  }

  private exchangeDev(code: string, verifier: string, nonce: string, redirectUri: string): VerifiedIdentity {
    if (!this.cfg.devIdp || this.cfg.isProduction) throw idpError('dev idp disabled');
    const c = verifyPass<{ sub: string; name: string; nonce: string; codeChallenge: string; redirectUri: string; exp: number }>(
      this.cfg.tokenPepper,
      'dev-idp',
      code,
    );
    if (!c) throw idpError('invalid code');
    if (c.nonce !== nonce || c.redirectUri !== redirectUri || c.codeChallenge !== pkceChallenge(verifier)) throw idpError('code binding mismatch');
    return { provider: 'dev', issuer: DEV_ISSUER, subject: c.sub, email: `${c.sub}@example.test`, emailVerified: true, name: c.name };
  }
}
