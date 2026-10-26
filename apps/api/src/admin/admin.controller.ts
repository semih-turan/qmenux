import {
  availabilitySchema,
  branchInfoSchema,
  brandingSchema,
  categoryInputSchema,
  geofenceSchema,
  itemInputSchema,
  itemPatchSchema,
  memberInviteSchema,
  publishSchema,
  reorderSchema,
  restoreSchema,
  THEME_IDS,
  uuid,
  whatsappSchema,
  wifiSchema,
} from '@qmenux/contracts';
import { catalog, settings, type Db } from '@qmenux/database';
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { SessionService, TenantActor } from '../auth/sessions.js';
import type { ApiConfig } from '../config.js';
import { encrypt, hashToken, randomToken } from '../crypto.js';
import { ApiError, parse } from '../http/problem.js';
import type { RateLimiter } from '../http/rate-limit.js';
import { MAX_IMAGE_BYTES, sniffImage, type Storage } from '../storage.js';
import { CONFIG, DB, LIMITER, SESSIONS, STORAGE } from '../tokens.js';

const id = (v: string) => parse(uuid, v);
const ctxOf = (a: TenantActor) => ({ tenantId: a.tenantId, userId: a.userId });

/**
 * Business admin API. Every handler resolves the tenant actor server-side from the
 * session (never from a client-supplied tenant id) and runs inside withTenant (RLS).
 */
@Controller('v1/admin')
export class AdminController {
  constructor(
    @Inject(CONFIG) private readonly cfg: ApiConfig,
    @Inject(DB) private readonly db: Db,
    @Inject(SESSIONS) private readonly sessions: SessionService,
    @Inject(LIMITER) private readonly limiter: RateLimiter,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  private menuOrigin(slug: string) {
    const local = this.cfg.rootDomain.endsWith('.localhost');
    return local ? `http://${slug}.${this.cfg.rootDomain}:3000` : `https://${slug}.${this.cfg.rootDomain}`;
  }

  // ---------------------------------------------------------------- dashboard
  @Get('dashboard')
  async dashboard(@Req() req: Request) {
    const a = await this.sessions.tenantActor(req, 'catalog.read');
    return this.db.withTenant(ctxOf(a), async (tx) => {
      const tenant = await settings.getTenantOverview(tx, this.cfg.graceDays);
      const branchId = await catalog.primaryBranchId(tx);
      const publish = await catalog.publishState(tx, branchId);
      const dirty = await catalog.hasUnpublishedChanges(tx);
      const counts = await tx.query<{ categories: number; products: number; sold_out: number; unverified: number }>(
        `SELECT (SELECT count(*)::int FROM qx.categories WHERE deleted_at IS NULL) AS categories,
                (SELECT count(*)::int FROM qx.products WHERE deleted_at IS NULL) AS products,
                (SELECT count(*)::int FROM qx.products WHERE deleted_at IS NULL AND availability = 'SOLD_OUT') AS sold_out,
                (SELECT count(DISTINCT a.product_id)::int FROM qx.product_allergens a JOIN qx.products p ON p.id = a.product_id
                  WHERE p.deleted_at IS NULL AND a.verification = 'UNVERIFIED') AS unverified`,
      );
      const scans = await settings.scanSummary(tx);
      const c = counts.rows[0]!;
      return {
        tenant: { ...tenant, logoUrl: this.storage.publicUrl(tenant.logoKey), menuUrl: this.menuOrigin(tenant.slug) },
        role: a.role,
        publish: { ...publish, hasUnpublishedChanges: dirty },
        counts: { categories: c.categories, products: c.products, soldOut: c.sold_out, unverifiedAllergenProducts: c.unverified },
        scans: { month: scans.month, thisMonth: scans.thisMonth, allTime: scans.allTime },
      };
    });
  }

  @Get('license')
  async license(@Req() req: Request) {
    const a = await this.sessions.tenantActor(req, 'catalog.read');
    return this.db.withTenant(ctxOf(a), async (tx) => {
      const t = await settings.getTenantOverview(tx, this.cfg.graceDays);
      // V1: manual, superadmin-granted license only. No checkout or payment endpoints exist.
      return { state: t.licenseState, endsAt: t.licenseEndsAt, graceDays: this.cfg.graceDays, grants: await settings.tenantLicenseGrants(tx) };
    });
  }

  // ---------------------------------------------------------------- categories
  @Get('categories')
  async categories(@Req() req: Request) {
    const a = await this.sessions.tenantActor(req, 'catalog.read');
    return { categories: await this.db.withTenant(ctxOf(a), (tx) => catalog.listCategories(tx)) };
  }

  @Post('categories')
  async createCategory(@Req() req: Request, @Body() body: unknown) {
    const a = await this.sessions.tenantActor(req, 'catalog.write', { write: true });
    const input = parse(categoryInputSchema, body);
    return { id: await this.db.withTenant(ctxOf(a), (tx) => catalog.createCategory(tx, a, input)) };
  }

  @Patch('categories/:id')
  async updateCategory(@Req() req: Request, @Param('id') cid: string, @Body() body: unknown) {
    const a = await this.sessions.tenantActor(req, 'catalog.write', { write: true });
    const input = parse(categoryInputSchema.partial(), body);
    await this.db.withTenant(ctxOf(a), (tx) => catalog.updateCategory(tx, a, id(cid), input));
    return { ok: true };
  }

  @Delete('categories/:id')
  @HttpCode(204)
  async deleteCategory(@Req() req: Request, @Param('id') cid: string) {
    const a = await this.sessions.tenantActor(req, 'catalog.write', { write: true });
    await this.db.withTenant(ctxOf(a), (tx) => catalog.deleteCategory(tx, a, id(cid)));
  }

  @Put('categories/order')
  async reorderCategories(@Req() req: Request, @Body() body: unknown) {
    const a = await this.sessions.tenantActor(req, 'catalog.write', { write: true });
    const { ids } = parse(reorderSchema, body);
    await this.db.withTenant(ctxOf(a), (tx) => catalog.reorder(tx, 'categories', ids));
    return { ok: true };
  }

  // ---------------------------------------------------------------- products
  @Get('products')
  async products(@Req() req: Request, @Query('categoryId') categoryId?: string) {
    const a = await this.sessions.tenantActor(req, 'catalog.read');
    const rows = await this.db.withTenant(ctxOf(a), (tx) => catalog.listProducts(tx, { categoryId: categoryId ? id(categoryId) : undefined }));
    return { products: rows.map((p) => ({ ...p, imageUrl: this.storage.publicUrl(p.imageKey) })) };
  }

  @Get('products/:id')
  async product(@Req() req: Request, @Param('id') pid: string) {
    const a = await this.sessions.tenantActor(req, 'catalog.read');
    const p = await this.db.withTenant(ctxOf(a), (tx) => catalog.getProduct(tx, id(pid)));
    return { product: { ...p, imageUrl: this.storage.publicUrl(p.imageKey) } };
  }

  @Post('products')
  async createProduct(@Req() req: Request, @Body() body: unknown) {
    const a = await this.sessions.tenantActor(req, 'catalog.write', { write: true });
    const input = parse(itemInputSchema, body);
    return { id: await this.db.withTenant(ctxOf(a), (tx) => catalog.createProduct(tx, a, input)) };
  }

  @Patch('products/:id')
  async updateProduct(@Req() req: Request, @Param('id') pid: string, @Body() body: unknown) {
    const a = await this.sessions.tenantActor(req, 'catalog.write', { write: true });
    const patch = parse(itemPatchSchema, body);
    return { version: await this.db.withTenant(ctxOf(a), (tx) => catalog.updateProduct(tx, a, id(pid), patch)) };
  }

  @Delete('products/:id')
  @HttpCode(204)
  async deleteProduct(@Req() req: Request, @Param('id') pid: string) {
    const a = await this.sessions.tenantActor(req, 'catalog.write', { write: true });
    await this.db.withTenant(ctxOf(a), (tx) => catalog.deleteProduct(tx, a, id(pid)));
  }

  @Put('categories/:id/products/order')
  async reorderProducts(@Req() req: Request, @Body() body: unknown) {
    const a = await this.sessions.tenantActor(req, 'catalog.write', { write: true });
    const { ids } = parse(reorderSchema, body);
    await this.db.withTenant(ctxOf(a), (tx) => catalog.reorder(tx, 'products', ids));
    return { ok: true };
  }

  /** Live overlay (sold out / hidden) — staff can do this without publishing. */
  @Patch('products/:id/availability')
  async availability(@Req() req: Request, @Param('id') pid: string, @Body() body: unknown) {
    const a = await this.sessions.tenantActor(req, 'availability.write', { write: true });
    const { availability } = parse(availabilitySchema, body);
    await this.db.withTenant(ctxOf(a), (tx) => catalog.setAvailability(tx, a, id(pid), availability));
    return { ok: true };
  }

  /** Replaces the single active image (never a second active one). Raw image body. */
  @Put('products/:id/image')
  async productImage(@Req() req: Request, @Param('id') pid: string) {
    const a = await this.sessions.tenantActor(req, 'catalog.write', { write: true });
    await this.limiter.hit('media.upload', a.tenantId, 60, 3600);
    const mediaId = await this.storeImage(req, a);
    await this.db.withTenant(ctxOf(a), (tx) => catalog.setActiveMedia(tx, a, id(pid), mediaId));
    return { mediaId };
  }

  @Delete('products/:id/image')
  @HttpCode(204)
  async removeProductImage(@Req() req: Request, @Param('id') pid: string) {
    const a = await this.sessions.tenantActor(req, 'catalog.write', { write: true });
    await this.db.withTenant(ctxOf(a), (tx) => catalog.setActiveMedia(tx, a, id(pid), null));
  }

  @Put('logo')
  async logo(@Req() req: Request) {
    const a = await this.sessions.tenantActor(req, 'settings.write', { write: true });
    await this.limiter.hit('media.upload', a.tenantId, 60, 3600);
    const mediaId = await this.storeImage(req, a);
    await this.db.withTenant(ctxOf(a), (tx) => settings.setLogo(tx, a, mediaId));
    return { mediaId };
  }

  private async storeImage(req: Request, a: TenantActor): Promise<string> {
    const body = req.body as unknown;
    if (!Buffer.isBuffer(body) || body.length === 0) throw new ApiError(415, 'UNSUPPORTED_MEDIA', 'JPEG, PNG veya WebP görsel yükleyin');
    if (body.length > MAX_IMAGE_BYTES) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Görsel en fazla 5 MB olabilir');
    const type = sniffImage(body);
    if (!type || type !== req.headers['content-type']) throw new ApiError(415, 'UNSUPPORTED_MEDIA', 'JPEG, PNG veya WebP görsel yükleyin');
    const key = await this.storage.put(a.tenantId, type, body);
    return this.db.withTenant(ctxOf(a), (tx) => catalog.createMediaAsset(tx, a, { objectKey: key, contentType: type, bytes: body.length }));
  }

  // ---------------------------------------------------------------- publishing & revisions
  @Get('menu/draft')
  async draft(@Req() req: Request) {
    const a = await this.sessions.tenantActor(req, 'catalog.read');
    return this.db.withTenant(ctxOf(a), async (tx) => {
      const branchId = await catalog.primaryBranchId(tx);
      return { snapshot: await catalog.buildSnapshot(tx, branchId), publish: await catalog.publishState(tx, branchId), hasUnpublishedChanges: await catalog.hasUnpublishedChanges(tx) };
    });
  }

  @Post('menu/publish')
  async publish(@Req() req: Request, @Body() body: unknown) {
    const a = await this.sessions.tenantActor(req, 'menu.publish', { write: true, licensed: true });
    const input = parse(publishSchema, body);
    return this.db.withTenant(ctxOf(a), (tx) => catalog.publishMenu(tx, a, input));
  }

  @Get('menu/revisions')
  async revisions(@Req() req: Request) {
    const a = await this.sessions.tenantActor(req, 'catalog.read');
    return { revisions: await this.db.withTenant(ctxOf(a), (tx) => catalog.listRevisions(tx)) };
  }

  @Get('menu/revisions/:no')
  async revision(@Req() req: Request, @Param('no') no: string) {
    const a = await this.sessions.tenantActor(req, 'catalog.read');
    const n = parse(z.coerce.number().int().min(1), no);
    const r = await this.db.withTenant(ctxOf(a), (tx) => catalog.getRevisionSnapshot(tx, n));
    if (!r) throw new ApiError(404, 'NOT_FOUND', 'Bulunamadı');
    return r;
  }

  /** Restoring publishes a NEW revision; history is never mutated. */
  @Post('menu/revisions/:id/restore')
  async restore(@Req() req: Request, @Param('id') rid: string, @Body() body: unknown) {
    const a = await this.sessions.tenantActor(req, 'menu.publish', { write: true, licensed: true });
    const { expectedRevisionNo } = parse(restoreSchema, body);
    return this.db.withTenant(ctxOf(a), (tx) => catalog.restoreRevision(tx, a, id(rid), expectedRevisionNo));
  }

  // ---------------------------------------------------------------- appearance & business profile
  @Get('themes')
  themes() {
    return { themes: THEME_IDS };
  }

  @Put('business-profile')
  async branding(@Req() req: Request, @Body() body: unknown) {
    const a = await this.sessions.tenantActor(req, 'settings.write', { write: true });
    const input = parse(brandingSchema, body);
    await this.db.withTenant(ctxOf(a), (tx) => settings.updateBranding(tx, a, input));
    return { ok: true };
  }

  // ---------------------------------------------------------------- branch settings
  @Get('branch')
  async branch(@Req() req: Request) {
    const a = await this.sessions.tenantActor(req, 'catalog.read');
    return this.db.withTenant(ctxOf(a), (tx) => settings.getBranchSettings(tx));
  }

  @Put('branch')
  async updateBranch(@Req() req: Request, @Body() body: unknown) {
    const a = await this.sessions.tenantActor(req, 'settings.write', { write: true });
    const input = parse(branchInfoSchema, body);
    await this.db.withTenant(ctxOf(a), (tx) => settings.updateBranchInfo(tx, a, input));
    return { ok: true };
  }

  /** Password is write-only: encrypted here (AES-GCM, bound to the branch) and never returned to admins. */
  @Put('branch/wifi')
  async wifi(@Req() req: Request, @Body() body: unknown) {
    const a = await this.sessions.tenantActor(req, 'settings.write', { write: true });
    const input = parse(wifiSchema, body);
    await this.db.withTenant(ctxOf(a), async (tx) => {
      const branchId = await catalog.primaryBranchId(tx);
      const passwordCiphertext =
        input.password === undefined ? undefined : input.password === '' ? null : encrypt(this.cfg.dataKey, input.password, `wifi:${branchId}`);
      await settings.updateWifi(tx, a, { enabled: input.enabled, ssid: input.ssid || null, passwordCiphertext });
    });
    return { ok: true };
  }

  @Put('branch/whatsapp')
  async whatsapp(@Req() req: Request, @Body() body: unknown) {
    const a = await this.sessions.tenantActor(req, 'settings.write', { write: true });
    const input = parse(whatsappSchema, body);
    await this.db.withTenant(ctxOf(a), (tx) => settings.updateWhatsapp(tx, a, { enabled: input.enabled, phone: input.phone ?? null, message: input.message ?? null }));
    return { ok: true };
  }

  @Put('branch/visibility')
  async geofence(@Req() req: Request, @Body() body: unknown) {
    const a = await this.sessions.tenantActor(req, 'settings.write', { write: true });
    const input = parse(geofenceSchema, body);
    // Province/district checks need versioned official boundary data, which is not sourced yet
    // (DECISIONS.md D-GEO-01). Refuse rather than silently locking guests out.
    if (input.mode === 'ADMIN_REGIONS' || input.mode === 'COMBINED') {
      throw new ApiError(422, 'REGIONS_NOT_AVAILABLE', 'İl/ilçe kısıtlaması henüz kullanılamıyor; yarıçap modunu kullanın');
    }
    return { policyVersion: await this.db.withTenant(ctxOf(a), (tx) => settings.updateGeofence(tx, a, input)) };
  }

  // ---------------------------------------------------------------- table QR codes
  @Get('table-qrs')
  async qrs(@Req() req: Request) {
    const a = await this.sessions.tenantActor(req, 'catalog.read');
    const menuUrl = this.menuOrigin(a.slug);
    // `?src=qr` lets the menu count a door/window scan as a QR scan rather than a direct visit (AC #8).
    return { menuUrl, generalQrUrl: `${menuUrl}/?src=qr`, tables: await this.db.withTenant(ctxOf(a), (tx) => settings.listQrTables(tx)) };
  }

  /** The raw token appears only in this response (inside the printable URL); only its hash is stored. */
  @Post('table-qrs')
  async createQr(@Req() req: Request, @Body() body: unknown) {
    const a = await this.sessions.tenantActor(req, 'settings.write', { write: true, licensed: true });
    const { label } = parse(z.object({ label: z.string().trim().min(1).max(40) }), body);
    const token = randomToken(24);
    const tableId = await this.db.withTenant(ctxOf(a), (tx) => settings.createQrTable(tx, a, label, hashToken(this.cfg.tokenPepper, 'qr', token)));
    return { id: tableId, url: `${this.menuOrigin(a.slug)}/?t=${token}` };
  }

  @Post('table-qrs/:id/rotate')
  @HttpCode(200)
  async rotateQr(@Req() req: Request, @Param('id') tid: string) {
    const a = await this.sessions.tenantActor(req, 'settings.write', { write: true, licensed: true });
    const token = randomToken(24);
    await this.db.withTenant(ctxOf(a), (tx) => settings.rotateQrTable(tx, a, id(tid), hashToken(this.cfg.tokenPepper, 'qr', token)));
    return { url: `${this.menuOrigin(a.slug)}/?t=${token}` };
  }

  @Post('table-qrs/:id/revoke')
  @HttpCode(200)
  async revokeQr(@Req() req: Request, @Param('id') tid: string) {
    const a = await this.sessions.tenantActor(req, 'settings.write', { write: true });
    await this.db.withTenant(ctxOf(a), (tx) => settings.revokeQrTable(tx, a, id(tid)));
    return { ok: true };
  }

  // ---------------------------------------------------------------- analytics (aggregate only, Europe/Istanbul)
  @Get('analytics/summary')
  async analytics(@Req() req: Request, @Query('days') days?: string) {
    const a = await this.sessions.tenantActor(req, 'analytics.read');
    const d = parse(z.coerce.number().int().min(1).max(365).default(30), days);
    return this.db.withTenant(ctxOf(a), async (tx) => ({ scans: await settings.scanSummary(tx), ...(await settings.topItems(tx, d)), timezone: 'Europe/Istanbul' }));
  }

  // ---------------------------------------------------------------- team
  @Get('team')
  async team(@Req() req: Request) {
    const a = await this.sessions.tenantActor(req, 'members.manage');
    return this.db.withTenant(ctxOf(a), (tx) => settings.listMembers(tx));
  }

  /** No e-mail provider in V1: the owner shares the one-time link manually (DECISIONS.md D-API-05). */
  @Post('team/invites')
  async invite(@Req() req: Request, @Body() body: unknown) {
    const a = await this.sessions.tenantActor(req, 'members.manage', { write: true });
    await this.limiter.hit('team.invite', a.tenantId, 20, 3600);
    const input = parse(memberInviteSchema, body);
    const token = randomToken();
    const inviteId = await this.db.withTenant(ctxOf(a), (tx) =>
      settings.createInvite(tx, a, { email: input.email, role: input.role, tokenHash: hashToken(this.cfg.tokenPepper, 'invite', token), ttlHours: 72 }),
    );
    return { id: inviteId, inviteUrl: `${this.cfg.origins.admin}/invite/${token}`, expiresInHours: 72 };
  }

  @Post('team/invites/:id/revoke')
  @HttpCode(200)
  async revokeInvite(@Req() req: Request, @Param('id') iid: string) {
    const a = await this.sessions.tenantActor(req, 'members.manage', { write: true });
    await this.db.withTenant(ctxOf(a), (tx) => settings.revokeInvite(tx, a, id(iid)));
    return { ok: true };
  }

  @Delete('team/members/:userId')
  @HttpCode(204)
  async removeMember(@Req() req: Request, @Param('userId') uid: string) {
    const a = await this.sessions.tenantActor(req, 'members.manage', { write: true });
    await this.db.withTenant(ctxOf(a), (tx) => settings.revokeMember(tx, a, id(uid)));
  }

  // ---------------------------------------------------------------- A4 PDF exports (async worker job)
  @Get('exports')
  async exports(@Req() req: Request) {
    const a = await this.sessions.tenantActor(req, 'exports.create');
    const rows = await this.db.withTenant(ctxOf(a), (tx) => settings.listPdfExports(tx));
    return { exports: rows.map(({ fileKey: _k, ...r }) => r) };
  }

  /** The PDF itself: tenant-scoped lookup, then streamed from storage with no caching. */
  @Get('exports/:id/file')
  async exportFile(@Req() req: Request, @Param('id') id: string, @Res() res: Response) {
    const a = await this.sessions.tenantActor(req, 'exports.create');
    const row = await this.db.withTenant(ctxOf(a), (tx) => settings.pdfExportFileKey(tx, parse(uuid, id)));
    const obj = row ? await this.storage.get(row.fileKey) : null;
    if (!row || !obj) throw new ApiError(404, 'NOT_FOUND', 'Dosya bulunamadı ya da süresi doldu');
    const name = `${row.exportType === 'MENU_A4' ? 'menu' : 'alerjen'}-v${row.revisionNo}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(obj.body);
  }

  @Post('exports')
  @HttpCode(202)
  async requestExport(@Req() req: Request, @Body() body: unknown) {
    const a = await this.sessions.tenantActor(req, 'exports.create', { write: true, licensed: true });
    await this.limiter.hit('exports', a.tenantId, 20, 3600);
    const input = parse(z.object({ exportType: z.enum(['MENU_A4', 'ALLERGEN_A4']), includeSoldOut: z.boolean().default(true) }), body);
    return { id: await this.db.withTenant(ctxOf(a), (tx) => settings.requestPdfExport(tx, a, input)), status: 'QUEUED' };
  }
}
