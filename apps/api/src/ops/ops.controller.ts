import { decisionSchema, licenseGrantSchema, uuid } from '@qmenux/contracts';
import { audit, platform, type Db } from '@qmenux/database';
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { verifyOperatorTotp } from '../auth/auth.controller.js';
import type { SessionService } from '../auth/sessions.js';
import type { ApiConfig } from '../config.js';
import { parse } from '../http/problem.js';
import type { RateLimiter } from '../http/rate-limit.js';
import { CONFIG, DB, LIMITER, SESSIONS } from '../tokens.js';

const id = (v: string) => parse(uuid, v);

/**
 * Platform operations (superman.qmenux.com BFF → /v1/control). Every call requires an
 * MFA-verified ops session and a server-side platform role; the hostname proves nothing.
 * Mutations are PLATFORM_ADMIN only; PLATFORM_SUPPORT is read-only.
 */
@Controller('v1/control')
export class OpsController {
  constructor(
    @Inject(CONFIG) private readonly cfg: ApiConfig,
    @Inject(DB) private readonly db: Db,
    @Inject(SESSIONS) private readonly sessions: SessionService,
    @Inject(LIMITER) private readonly limiter: RateLimiter,
  ) {}

  @Get('stats')
  async stats(@Req() req: Request) {
    const op = await this.sessions.operator(req);
    return this.db.withPlatform(op.userId, (tx) => platform.platformStats(tx, this.cfg.graceDays));
  }

  @Get('applications')
  async applications(@Req() req: Request, @Query('status') status?: string) {
    const op = await this.sessions.operator(req);
    const s = parse(z.enum(['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'ALL']).default('PENDING'), status);
    return { applications: await this.db.withPlatform(op.userId, (tx) => platform.listApplications(tx, s)) };
  }

  /** Approval creates an APPROVED (not yet live) tenant; the menu goes live only after a license grant. */
  @Post('applications/:id/approve')
  @HttpCode(200)
  async approve(@Req() req: Request, @Param('id') aid: string, @Body() body: unknown) {
    const op = await this.sessions.operator(req, { adminOnly: true });
    const { reason } = parse(decisionSchema, body);
    return { tenantId: await this.db.withPlatform(op.userId, (tx) => platform.approveApplication(tx, op.userId, id(aid), reason)) };
  }

  @Post('applications/:id/reject')
  @HttpCode(200)
  async reject(@Req() req: Request, @Param('id') aid: string, @Body() body: unknown) {
    const op = await this.sessions.operator(req, { adminOnly: true });
    const { reason } = parse(decisionSchema, body);
    await this.db.withPlatform(op.userId, (tx) => platform.rejectApplication(tx, op.userId, id(aid), reason));
    return { ok: true };
  }

  @Get('tenants')
  async tenants(@Req() req: Request, @Query('q') q?: string, @Query('status') status?: string) {
    const op = await this.sessions.operator(req);
    const opts = parse(z.object({ q: z.string().trim().max(80).optional(), status: z.string().max(20).optional() }), { q, status });
    return { tenants: await this.db.withPlatform(op.userId, (tx) => platform.listTenants(tx, this.cfg.graceDays, opts)) };
  }

  @Get('tenants/:id')
  async tenant(@Req() req: Request, @Param('id') tid: string) {
    const op = await this.sessions.operator(req);
    return this.db.withPlatform(op.userId, (tx) => platform.getTenantDetail(tx, id(tid), this.cfg.graceDays));
  }

  /**
   * Manual license grant. Step-up: a fresh TOTP code in the body, even within an MFA session.
   * No payment provider is involved in V1 and nothing here is reachable from a browser redirect.
   */
  @Post('tenants/:id/licenses')
  async grant(@Req() req: Request, @Param('id') tid: string, @Body() body: unknown) {
    const op = await this.sessions.operator(req, { adminOnly: true });
    await this.limiter.hit('ops.license', op.userId, 10, 300);
    const input = parse(licenseGrantSchema, body);
    await verifyOperatorTotp(this.cfg, this.db, op.userId, input.totp);
    const grantId = await this.db.withPlatform(op.userId, (tx) => platform.grantLicense(tx, op.userId, id(tid), new Date(input.endsAt), input.note ?? null));
    return { grantId };
  }

  @Post('tenants/:id/licenses/:grantId/revoke')
  @HttpCode(200)
  async revoke(@Req() req: Request, @Param('id') tid: string, @Param('grantId') gid: string, @Body() body: unknown) {
    const op = await this.sessions.operator(req, { adminOnly: true });
    const { reason } = parse(decisionSchema, body);
    await this.db.withPlatform(op.userId, (tx) => platform.revokeLicense(tx, op.userId, id(tid), id(gid), reason));
    return { ok: true };
  }

  @Post('tenants/:id/suspend')
  @HttpCode(200)
  async suspend(@Req() req: Request, @Param('id') tid: string, @Body() body: unknown) {
    const op = await this.sessions.operator(req, { adminOnly: true });
    const { reason } = parse(decisionSchema, body);
    await this.db.withPlatform(op.userId, (tx) => platform.setTenantSuspended(tx, op.userId, id(tid), true, reason));
    return { ok: true };
  }

  @Post('tenants/:id/unsuspend')
  @HttpCode(200)
  async unsuspend(@Req() req: Request, @Param('id') tid: string, @Body() body: unknown) {
    const op = await this.sessions.operator(req, { adminOnly: true });
    const { reason } = parse(decisionSchema, body);
    await this.db.withPlatform(op.userId, (tx) => platform.setTenantSuspended(tx, op.userId, id(tid), false, reason));
    return { ok: true };
  }

  @Get('audit')
  async auditLog(@Req() req: Request, @Query('tenantId') tenantId?: string, @Query('before') before?: string) {
    const op = await this.sessions.operator(req);
    // `before` is an audit row id cursor (bigint, newest first), as listAudit expects.
    const opts = parse(z.object({ tenantId: uuid.optional(), before: z.string().regex(/^\d{1,18}$/).optional() }), { tenantId, before });
    return { entries: await this.db.withPlatform(op.userId, (tx) => audit.listAudit(tx, { ...opts, limit: 100 })) };
  }
}
