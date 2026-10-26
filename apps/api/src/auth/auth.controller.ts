import { AUTH_PROVIDERS, uuid } from '@qmenux/contracts';
import { identity, settings, type Db } from '@qmenux/database';
import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { ApiConfig } from '../config.js';
import { base32Decode, decrypt, hashToken, pkcePair, randomToken, verifyTotp } from '../crypto.js';
import { ApiError, forbidden, notFound, parse } from '../http/problem.js';
import type { RateLimiter } from '../http/rate-limit.js';
import { CONFIG, DB, LIMITER, OIDC, SESSIONS } from '../tokens.js';
import type { OidcService } from './oidc.js';
import type { SessionService } from './sessions.js';

/** Relative in-app path only: no scheme, no protocol-relative `//`, no backslashes (open-redirect safe). */
const returnToSchema = z
  .string()
  .max(300)
  .regex(/^\/(?![/\\])[^\\\s]*$/)
  .optional();

const flowSchema = z.object({ provider: z.enum(AUTH_PROVIDERS), audience: z.enum(['admin', 'ops']), returnTo: returnToSchema });
const callbackSchema = z.object({
  provider: z.enum(AUTH_PROVIDERS),
  audience: z.enum(['admin', 'ops']),
  code: z.string().min(1).max(4096),
  state: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
});

@Controller('v1/auth')
export class AuthController {
  constructor(
    @Inject(CONFIG) private readonly cfg: ApiConfig,
    @Inject(DB) private readonly db: Db,
    @Inject(OIDC) private readonly oidc: OidcService,
    @Inject(SESSIONS) private readonly sessions: SessionService,
    @Inject(LIMITER) private readonly limiter: RateLimiter,
  ) {}

  @Get('providers')
  providers() {
    return { providers: this.oidc.providers().map((p) => ({ id: p.id, label: p.label })) };
  }

  /**
   * Starts an authorization-code + PKCE flow. The BFF must also bind `state` to the
   * browser (short-lived host-only cookie) and compare it on callback (login CSRF).
   */
  @Post('flows')
  async start(@Req() req: Request, @Body() body: unknown) {
    await this.limiter.ip(req, 'auth.flow', 30, 300);
    const input = parse(flowSchema, body);
    const p = this.oidc.provider(input.provider);
    const state = randomToken();
    const nonce = randomToken();
    const { verifier, challenge } = pkcePair();
    await this.db.withAuth(null, (tx) =>
      identity.saveOidcFlow(tx, {
        stateHash: hashToken(this.cfg.tokenPepper, 'state', state),
        provider: p.id,
        audience: input.audience,
        codeVerifier: verifier,
        nonce,
        returnTo: input.returnTo ?? null,
        ttlSeconds: 600,
      }),
    );
    return { authorizationUrl: this.oidc.authorizationUrl(p, input.audience, state, nonce, challenge), state };
  }

  @Post('callback')
  @HttpCode(200)
  async callback(@Req() req: Request, @Body() body: unknown) {
    await this.limiter.ip(req, 'auth.callback', 30, 300);
    const input = parse(callbackSchema, body);
    const flow = await this.db.withAuth(null, (tx) => identity.consumeOidcFlow(tx, hashToken(this.cfg.tokenPepper, 'state', input.state)));
    if (!flow || flow.provider !== input.provider || flow.audience !== input.audience) {
      throw new ApiError(400, 'FLOW_INVALID', 'Giriş oturumu geçersiz veya süresi doldu. Lütfen tekrar deneyin.');
    }
    const who = await this.oidc.exchange(flow.provider, flow.audience, input.code, flow.codeVerifier, flow.nonce);
    const user = await this.db.withAuth(null, (tx) => identity.findOrCreateUserByIdentity(tx, who));
    if (user.disabledAt) throw forbidden('ACCOUNT_DISABLED', 'Bu hesap devre dışı');

    if (flow.audience === 'ops') {
      // No ops session at all for non-operators (do not reveal more than "forbidden").
      const op = await this.db.withAuth(user.id, (tx) => identity.getOperator(tx, user.id));
      if (!op) throw forbidden();
      if (!op.totpEnrolledAt || !op.totpSecretCiphertext) throw forbidden('MFA_NOT_ENROLLED', 'Operatör için iki adımlı doğrulama kurulumu gerekli');
    }
    const session = await this.sessions.create(user.id, flow.audience);
    return {
      sessionToken: session.token,
      expiresInS: session.expiresInS,
      audience: flow.audience,
      returnTo: flow.returnTo,
      mfaRequired: flow.audience === 'ops',
      newUser: user.created,
    };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request) {
    const s = (await this.sessions.resolve(req, 'admin')) ?? (await this.sessions.resolve(req, 'ops'));
    if (s) await this.sessions.revoke(s);
  }
}

@Controller('v1/me')
export class MeController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(SESSIONS) private readonly sessions: SessionService,
  ) {}

  @Get()
  async me(@Req() req: Request) {
    const s = await this.sessions.require(req, 'admin');
    const [memberships, applications] = await this.db.withAuth(s.userId, async (tx) => [
      await identity.listMemberships(tx, s.userId),
      await identity.listOwnApplications(tx, s.userId),
    ] as const);
    return {
      user: { id: s.userId, email: s.email, displayName: s.displayName },
      activeTenantId: memberships.some((m) => m.tenantId === s.activeTenantId) ? s.activeTenantId : null,
      memberships,
      applications,
    };
  }

  @Post('active-tenant')
  @HttpCode(200)
  async setActive(@Req() req: Request, @Body() body: unknown) {
    const s = await this.sessions.require(req, 'admin');
    const { tenantId } = parse(z.object({ tenantId: uuid }), body);
    const role = await this.db.withAuth(s.userId, (tx) => identity.setActiveTenant(tx, s.id, s.userId, tenantId));
    if (!role) throw notFound();
    return { tenantId, role };
  }
}

@Controller('v1/invites')
export class InviteController {
  constructor(
    @Inject(CONFIG) private readonly cfg: ApiConfig,
    @Inject(DB) private readonly db: Db,
    @Inject(SESSIONS) private readonly sessions: SessionService,
    @Inject(LIMITER) private readonly limiter: RateLimiter,
  ) {}

  @Post('accept')
  @HttpCode(200)
  async accept(@Req() req: Request, @Body() body: unknown) {
    const s = await this.sessions.require(req, 'admin');
    await this.limiter.hit('invite.accept', s.userId, 10, 3600);
    const { token } = parse(z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/) }), body);
    const tenantId = await this.db.withAuth(s.userId, (tx) => settings.acceptInvite(tx, hashToken(this.cfg.tokenPepper, 'invite', token)));
    if (!tenantId) throw new ApiError(410, 'INVITE_INVALID', 'Davet geçersiz, kullanılmış veya süresi dolmuş');
    await this.db.withAuth(s.userId, (tx) => identity.setActiveTenant(tx, s.id, s.userId, tenantId));
    return { tenantId };
  }
}

/** Operator session state + MFA. TOTP enrolment is CLI-only (`pnpm --filter @qmenux/api ops:totp`). */
@Controller('v1/control')
export class OpsAuthController {
  constructor(
    @Inject(CONFIG) private readonly cfg: ApiConfig,
    @Inject(DB) private readonly db: Db,
    @Inject(SESSIONS) private readonly sessions: SessionService,
    @Inject(LIMITER) private readonly limiter: RateLimiter,
  ) {}

  @Get('session')
  async session(@Req() req: Request) {
    const s = await this.sessions.require(req, 'ops');
    const op = await this.db.withAuth(s.userId, (tx) => identity.getOperator(tx, s.userId));
    if (!op) throw forbidden();
    return { user: { id: s.userId, email: s.email, displayName: s.displayName }, role: op.role, mfaVerified: !!s.mfaVerifiedAt, expiresAt: s.expiresAt };
  }

  /** Verifies TOTP, burns the time-step, then rotates the session (old token stops working). */
  @Post('mfa/verify')
  @HttpCode(200)
  async verify(@Req() req: Request, @Body() body: unknown) {
    const s = await this.sessions.require(req, 'ops');
    await this.limiter.hit('ops.mfa', s.userId, 5, 300);
    const { code } = parse(z.object({ code: z.string().regex(/^\d{6}$/) }), body);
    await verifyOperatorTotp(this.cfg, this.db, s.userId, code);
    const next = await this.sessions.create(s.userId, 'ops');
    await this.db.withAuth(s.userId, async (tx) => {
      await identity.markSessionMfa(tx, next.id);
      await identity.revokeSession(tx, s.id);
    });
    return { sessionToken: next.token, expiresInS: next.expiresInS };
  }
}

/** Shared by MFA login and step-up (license grants). Throws 403 MFA_INVALID on any failure. */
export async function verifyOperatorTotp(cfg: ApiConfig, db: Db, userId: string, code: string): Promise<void> {
  const bad = () => forbidden('MFA_INVALID', 'Doğrulama kodu hatalı veya kullanılmış');
  await db.withAuth(userId, async (tx) => {
    const op = await identity.getOperator(tx, userId);
    if (!op?.totpSecretCiphertext || !op.totpEnrolledAt) throw bad();
    const secret = base32Decode(decrypt(cfg.dataKey, op.totpSecretCiphertext, `totp:${userId}`));
    const step = verifyTotp(secret, code);
    if (step === null || !(await identity.consumeTotpStep(tx, userId, step))) throw bad();
  });
}

/** Local mock IdP for development and tests only. Disabled (404) unless QX_DEV_IDP=1 outside production. */
@Controller('v1/dev-idp')
export class DevIdpController {
  constructor(
    @Inject(CONFIG) private readonly cfg: ApiConfig,
    @Inject(OIDC) private readonly oidc: OidcService,
  ) {}

  private allowedRedirect(uri: unknown): string {
    if (!this.cfg.devIdp || this.cfg.isProduction) throw notFound();
    const allowed = [this.oidc.redirectUri('admin', 'dev'), this.oidc.redirectUri('ops', 'dev')];
    if (typeof uri !== 'string' || !allowed.includes(uri)) throw new ApiError(400, 'BAD_REDIRECT', 'Geçersiz yönlendirme adresi');
    return uri;
  }

  @Get('authorize')
  page(@Query() q: Record<string, string>, @Res() res: Response) {
    const redirectUri = this.allowedRedirect(q.redirect_uri);
    const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const hidden = ['state', 'nonce', 'code_challenge'].map((k) => `<input type="hidden" name="${k}" value="${esc(q[k])}">`).join('');
    const users = [
      ['dev-owner', 'Demo İşletme Sahibi'],
      ['dev-operator', 'Demo Operatör'],
      ['dev-applicant', 'Demo Başvuru Sahibi'],
    ];
    const buttons = users.map(([sub, name]) => `<button name="sub" value="${sub}">${esc(name)} <small>${sub}</small></button>`).join('');
    res
      .status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action *")
      .send(
        `<!doctype html><html lang="tr"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Geliştirici girişi</title>
<style>body{font:16px system-ui;margin:0;padding:24px 16px;max-width:420px;margin-inline:auto;background:#f6f5f2;color:#1c1b19}
button{display:flex;justify-content:space-between;width:100%;min-height:48px;margin:8px 0;padding:12px 16px;border:1px solid #d6d3cc;border-radius:12px;background:#fff;font:inherit;cursor:pointer}
small{color:#6b675f}p{color:#6b675f;font-size:14px}</style>
<h1>Geliştirici girişi</h1><p>Yalnızca yerel geliştirme için. Gerçek bir kimlik sağlayıcısı değildir.</p>
<form method="post"><input type="hidden" name="redirect_uri" value="${esc(redirectUri)}">${hidden}${buttons}
<label style="display:block;margin-top:16px">Başka kullanıcı (sub)<input name="custom" pattern="[a-z0-9-]{3,40}" style="display:block;width:100%;min-height:44px;margin-top:4px;font:inherit"></label>
<button name="sub" value="__custom">Bu kullanıcıyla devam et</button></form></html>`,
      );
  }

  @Post('authorize')
  approve(@Body() body: Record<string, string>, @Res() res: Response) {
    const redirectUri = this.allowedRedirect(body.redirect_uri);
    const sub = body.sub === '__custom' ? body.custom : body.sub;
    if (!sub || !/^[a-z0-9-]{3,40}$/.test(sub) || !body.state || !body.nonce || !body.code_challenge) throw new ApiError(400, 'BAD_REQUEST', 'Eksik bilgi');
    const code = this.oidc.issueDevCode({ sub, name: sub, nonce: body.nonce, codeChallenge: body.code_challenge, redirectUri });
    const u = new URL(redirectUri);
    u.searchParams.set('code', code);
    u.searchParams.set('state', body.state);
    res.redirect(303, u.toString());
  }

}
