import { applicationSchema, BUSINESS_TYPES, checkSlug, normalizeSlug, uuid } from '@qmenux/contracts';
import { identity, type Db } from '@qmenux/database';
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionService } from './auth/sessions.js';
import { ApiError, notFound, parse } from './http/problem.js';
import type { RateLimiter } from './http/rate-limit.js';
import { DB, LIMITER, SESSIONS } from './tokens.js';

/**
 * Authenticated-pending users: submit/withdraw an application. Submitting never
 * creates or activates a tenant; a platform operator must approve and license it.
 */
@Controller('v1/onboarding')
export class OnboardingController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(SESSIONS) private readonly sessions: SessionService,
    @Inject(LIMITER) private readonly limiter: RateLimiter,
  ) {}

  @Get('business-types')
  businessTypes() {
    return { businessTypes: BUSINESS_TYPES };
  }

  @Get('slug-check')
  async slugCheck(@Req() req: Request, @Query('slug') raw: string | undefined) {
    const s = await this.sessions.require(req, 'admin');
    await this.limiter.hit('onboarding.slug', s.userId, 60, 300);
    const slug = normalizeSlug(String(raw ?? ''));
    const check = checkSlug(slug);
    if (check.ok === false) return { slug, available: false, reason: check.reason };
    const taken = await this.db.withAuth(s.userId, (tx) => identity.slugTaken(tx, slug));
    return { slug, available: !taken, reason: taken ? 'TAKEN' : null };
  }

  @Get('applications')
  async list(@Req() req: Request) {
    const s = await this.sessions.require(req, 'admin');
    return { applications: await this.db.withAuth(s.userId, (tx) => identity.listOwnApplications(tx, s.userId)) };
  }

  @Post('applications')
  async submit(@Req() req: Request, @Body() body: unknown) {
    const s = await this.sessions.require(req, 'admin');
    await this.limiter.hit('onboarding.submit', s.userId, 5, 3600);
    const input = parse(applicationSchema, body);
    const check = checkSlug(input.slug);
    if (check.ok === false) throw new ApiError(422, 'SLUG_INVALID', 'Bu adres kullanılamaz', { reason: check.reason });
    const r = await this.db.withAuth(s.userId, (tx) => identity.submitApplication(tx, s.userId, input));
    if (r === 'SLUG_TAKEN') throw new ApiError(409, 'SLUG_TAKEN', 'Bu adres alınmış');
    if (r === 'ALREADY_PENDING') throw new ApiError(409, 'ALREADY_PENDING', 'Bekleyen bir başvurunuz zaten var');
    return { application: r };
  }

  @Post('applications/:id/withdraw')
  @HttpCode(200)
  async withdraw(@Req() req: Request, @Param('id') id: string) {
    const s = await this.sessions.require(req, 'admin');
    const ok = await this.db.withAuth(s.userId, (tx) => identity.withdrawApplication(tx, s.userId, parse(uuid, id)));
    if (!ok) throw notFound();
    return { ok: true };
  }
}
