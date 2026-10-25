import { Controller, Get, Header, HttpCode, Post, Req, Res, ServiceUnavailableException,
  UnauthorizedException } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { authOrigin, googleEnabled, GoogleOidc } from './google-oidc.js';
import { IdentityStore } from './identity-store.js';

const loginCookie = '__Host-qmenux_login';
const sessionCookie = '__Host-qmenux_session';
const secret = () => randomBytes(32).toString('base64url');
const cookie = (name: string, value: string, seconds: number) =>
  `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`;

export function readSecretCookie(header: string | undefined, name: string): string | undefined {
  const matches = (header ?? '').split(';').map((p) => p.trim()).filter((p) => p.startsWith(`${name}=`));
  if (matches.length !== 1) return undefined;
  const value = matches[0]!.slice(name.length + 1);
  return /^[a-zA-Z0-9_-]{43}$/.test(value) ? value : undefined;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly google: GoogleOidc, private readonly store: IdentityStore) {}

  private origin(req: IncomingMessage): string {
    const origin = authOrigin();
    if (!googleEnabled() || !origin) throw new ServiceUnavailableException({ status: 'unavailable' });
    if (req.headers.host?.toLowerCase() !== new URL(origin).host) throw new UnauthorizedException();
    return origin;
  }

  @Get('providers')
  @Header('Cache-Control', 'no-store')
  providers() {
    return { providers: [{ id: 'google', enabled: googleEnabled() }, { id: 'microsoft', enabled: false }, { id: 'apple', enabled: false }] };
  }

  @Get('google/start')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async start(@Req() req: IncomingMessage, @Res({ passthrough: true }) res: ServerResponse) {
    this.origin(req);
    const attempt = await this.google.start();
    const browser = secret();
    await this.store.begin(attempt.state, browser, attempt.verifier, attempt.nonce);
    res.setHeader('Set-Cookie', cookie(loginCookie, browser, 300));
    res.statusCode = 302;
    res.setHeader('Location', attempt.url);
  }

  @Get('google/callback')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async callback(@Req() req: IncomingMessage, @Res({ passthrough: true }) res: ServerResponse) {
    const origin = this.origin(req);
    const url = new URL(req.url!, origin);
    if (url.origin !== origin || url.pathname !== '/v1/auth/google/callback' || url.hash) throw new UnauthorizedException();
    const state = url.searchParams.get('state');
    const browser = readSecretCookie(req.headers.cookie, loginCookie);
    if (!state || !/^[a-zA-Z0-9_-]{43}$/.test(state) || url.searchParams.getAll('state').length !== 1 || !browser) {
      throw new UnauthorizedException();
    }
    res.setHeader('Set-Cookie', cookie(loginCookie, '', 0));
    const attempt = await this.store.consume(state, browser);
    if (!attempt) throw new UnauthorizedException();
    const subject = await this.google.finish(url, attempt, state);
    const token = secret();
    const id = await this.store.createSession(subject, token, readSecretCookie(req.headers.cookie, sessionCookie));
    if (!id) throw new UnauthorizedException();
    res.setHeader('Set-Cookie', [cookie(loginCookie, '', 0), cookie(sessionCookie, token, 3600)]);
    return { user: { id, status: 'REGISTERED' }, tenantAccess: false };
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  async me(@Req() req: IncomingMessage) {
    this.origin(req);
    const token = readSecretCookie(req.headers.cookie, sessionCookie);
    const user = token ? await this.store.readSession(token) : undefined;
    if (!user) throw new UnauthorizedException();
    return { user, tenantAccess: false };
  }

  @Post('logout')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async logout(@Req() req: IncomingMessage, @Res({ passthrough: true }) res: ServerResponse) {
    const origin = this.origin(req);
    // Same-origin POST only until the admin BFF/CSRF contract is implemented.
    if (req.headers.origin !== origin) throw new UnauthorizedException();
    const token = readSecretCookie(req.headers.cookie, sessionCookie);
    if (token) await this.store.revokeSession(token);
    res.setHeader('Set-Cookie', cookie(sessionCookie, '', 0));
    return { status: 'signed_out' };
  }
}
