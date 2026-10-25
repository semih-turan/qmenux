import { All, BadRequestException, Catch, Controller, Header, HttpCode, HttpException, MethodNotAllowedException, Param, Post, Req,
  type ArgumentsHost,
  ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { GoogleOidc, googleEnabled } from './google-oidc.js';
import { MicrosoftOidc, microsoftEnabled } from './microsoft-oidc.js';
import { AppleOidc, appleEnabled } from './apple-oidc.js';
import { IdentityStore, type IdentityProvider } from './identity-store.js';
import { oidcCallback } from './oidc-callback.js';

const secretPattern = /^[A-Za-z0-9_-]{43}$/;
const secret = () => randomBytes(32).toString('base64url');
type AdminRequest = IncomingMessage & { rawBody?: Buffer };
const countHeader = (req: IncomingMessage, name: string) =>
  req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === name).length;

// Parser/router failures precede controller headers and may otherwise echo credential-bearing input.
@Catch()
export class AdminAuthErrors extends BaseExceptionFilter {
  constructor(adapter: HttpAdapterHost) { super(adapter.httpAdapter); }

  override catch(error: unknown, host: ArgumentsHost): void {
    const path = host.switchToHttp().getRequest<IncomingMessage>().url?.split('?')[0];
    if (path !== '/v1/internal/admin-auth' && !path?.startsWith('/v1/internal/admin-auth/')) return super.catch(error, host);
    const status = error instanceof HttpException ? error.getStatus()
      : (error as { statusCode?: number } | null)?.statusCode;
    const code = status && [400, 401, 404, 405, 413, 415, 503].includes(status) ? status : 500;
    const res = host.switchToHttp().getResponse<ServerResponse>();
    res.statusCode = code; res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: code === 503 ? 'unavailable' : code === 401 ? 'unauthorized' : 'invalid_request' }));
  }
}

@Controller('internal/admin-auth')
export class AdminAuthController {
  constructor(private readonly google: GoogleOidc, private readonly microsoft: MicrosoftOidc,
    private readonly apple: AppleOidc, private readonly store: IdentityStore) {}

  private authenticate(req: IncomingMessage): void {
    const configured = process.env.ADMIN_BFF_SECRET;
    if (!configured || !secretPattern.test(configured) || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
    const actual = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${configured}`);
    if (countHeader(req, 'authorization') !== 1 || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new UnauthorizedException();
    }
  }

  private body(req: AdminRequest, required: string[], optional: string[] = []): Record<string, string> {
    this.authenticate(req);
    if (req.url?.includes('?') || countHeader(req, 'content-type') !== 1
      || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '')
      || req.headers['content-encoding'] || !req.rawBody || req.rawBody.length > 8192) throw new BadRequestException();
    const raw = req.rawBody.toString('utf8');
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new BadRequestException(); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException();
    const keys = new Set<string>();
    // The accepted schema is flat strings; scan whole JSON string tokens to detect even escaped duplicate keys.
    for (const match of raw.matchAll(/"(?:\\.|[^"\\])*"\s*:?/g)) {
      const token = match[0].trim();
      if (!token.endsWith(':')) continue;
      const key = JSON.parse(token.slice(0, -1)) as string;
      if (keys.has(key)) throw new BadRequestException();
      keys.add(key);
    }
    if (Object.entries(body).some(([key, value]) => ![...required, ...optional].includes(key)
      || typeof value !== 'string' || !value || value.length > 2048 || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
      || required.some(key => !Object.hasOwn(body, key))) throw new BadRequestException();
    return body as Record<string, string>;
  }

  private proof(value: string | undefined): string {
    if (!value || !secretPattern.test(value)) throw new BadRequestException();
    return value;
  }

  private provider(value: string): IdentityProvider {
    if (value !== 'google' && value !== 'microsoft' && value !== 'apple') throw new BadRequestException();
    if (!(value === 'google' ? googleEnabled() : value === 'microsoft' ? microsoftEnabled() : appleEnabled())) {
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
    return value;
  }

  @Post(':provider/start')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async start(@Req() req: AdminRequest, @Param('provider') name: string) {
    const body = this.body(req, ['browser']);
    const browser = this.proof(body.browser), provider = this.provider(name);
    const attempt: { url: string; state: string; nonce: string; verifier?: string } = await (provider === 'apple' ? this.apple.start('admin')
      : provider === 'google' ? this.google.start('admin') : this.microsoft.start('admin'));
    await this.store.beginAdmin(provider, attempt.state, browser, attempt.verifier ?? null, attempt.nonce);
    return { url: attempt.url, expiresIn: 300 };
  }

  @Post(':provider/finish')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async finish(@Req() req: AdminRequest, @Param('provider') name: string) {
    const body = this.body(req, ['browser', 'state'], ['code', 'error', 'previousSession']);
    const browser = this.proof(body.browser), state = this.proof(body.state);
    const previous = body.previousSession === undefined ? undefined : this.proof(body.previousSession);
    if (!!body.code === !!body.error || (body.error && !['access_denied', 'user_cancelled_authorize', 'server_error',
      'temporarily_unavailable', 'invalid_request', 'unauthorized_client', 'unsupported_response_type', 'invalid_scope'].includes(body.error))) {
      throw new BadRequestException();
    }
    const provider = this.provider(name);
    const attempt = await this.store.consumeAdmin(provider, state, browser);
    if (!attempt || body.error) throw new UnauthorizedException();
    const url = new URL(oidcCallback(provider, 'admin'));
    url.searchParams.set('state', state); url.searchParams.set('code', body.code!);
    let subject: string;
    if (provider === 'apple') subject = await this.apple.finish(url, attempt, state, 'admin');
    else {
      if (!attempt.verifier) throw new UnauthorizedException();
      const pkce = { verifier: attempt.verifier, nonce: attempt.nonce };
      subject = await (provider === 'google' ? this.google : this.microsoft).finish(url, pkce, state, 'admin');
    }
    const session = secret(), csrf = secret();
    const id = await this.store.createAdminSession(provider, subject, session, csrf, previous);
    if (!id) throw new UnauthorizedException();
    return { session, csrf, expiresIn: 3600, user: { id, status: 'REGISTERED' }, tenantAccess: false };
  }

  @Post('me')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async me(@Req() req: AdminRequest) {
    const body = this.body(req, ['session']);
    const user = await this.store.readAdminSession(this.proof(body.session));
    if (!user) throw new UnauthorizedException();
    return { user, tenantAccess: false };
  }

  @Post('logout')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async logout(@Req() req: AdminRequest) {
    const body = this.body(req, ['session', 'csrf']);
    const session = this.proof(body.session), csrf = this.proof(body.csrf);
    if (!await this.store.revokeAdminSession(session, csrf)) throw new UnauthorizedException();
    return { status: 'signed_out' };
  }

  @All(['me', 'logout', ':provider/start', ':provider/finish'])
  @Header('Allow', 'POST')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  unsupportedMethod(): never {
    throw new MethodNotAllowedException();
  }

}
