import {
  ALLERGEN_CODES,
  allergenBucket,
  geofenceCheckSchema,
  isLikelyBot,
  matchesSearch,
  scanEventSchema,
  slugSchema,
  uuid,
  withinRadius,
  type PublicMenu,
  type PublicMenuItem,
  type PublicMenuResponse,
} from '@qmenux/contracts';
import type { Db, MenuSnapshot } from '@qmenux/database';
import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { ApiConfig } from '../config.js';
import { decrypt, hashToken, signPass, verifyPass } from '../crypto.js';
import { ApiError, notFound, parse } from '../http/problem.js';
import type { RateLimiter } from '../http/rate-limit.js';
import { isPdfKey, type Storage } from '../storage.js';
import { CONFIG, DB, LIMITER, STORAGE } from '../tokens.js';

const GEO_PASS_TTL_S = 2 * 3600;
const GEO_PASS = 'geo';

/** Calendar day in Türkiye; aggregates are bucketed by local date, never by visitor. */
export function istanbulDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

interface Geofence {
  mode: 'OFF' | 'RADIUS' | 'ADMIN_REGIONS' | 'COMBINED';
  centerLat: number | null;
  centerLng: number | null;
  radiusM: number | null;
  policyVersion: number;
}

interface RawMenu {
  state: 'OK' | 'GEOFENCE_REQUIRED' | 'UNAVAILABLE';
  reason?: string;
  displayName?: string;
  themeId?: string;
  geofence?: { mode: string };
  tenant?: { slug: string; displayName: string; tagline: string | null; businessType: string; themeId: string; logoKey: string | null };
  branch?: { id: string; name: string; address: string | null; phone: string | null; hoursText: string | null };
  wifi?: { ssid: string; passwordCiphertext: string | null } | null;
  whatsapp?: { phone: string; message: string | null } | null;
  revision?: { no: number; publishedAt: string };
  snapshot?: MenuSnapshot;
  availability?: Record<string, 'AVAILABLE' | 'SOLD_OUT' | 'HIDDEN'>;
}

/**
 * Unauthenticated guest API. The menu BFF on `{slug}.qmenux.com` resolves the slug from its
 * trusted Host and calls these routes. Responses contain only published, public-safe data.
 * No cookies, no visitor identifiers, no raw IPs or coordinates are stored.
 */
@Controller('v1/public/menus/:slug')
export class PublicController {
  constructor(
    @Inject(CONFIG) private readonly cfg: ApiConfig,
    @Inject(DB) private readonly db: Db,
    @Inject(LIMITER) private readonly limiter: RateLimiter,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  private slug(raw: string) {
    const r = slugSchema.safeParse(raw);
    if (!r.success) throw notFound();
    return r.data;
  }

  private async geofence(slug: string): Promise<Geofence | null> {
    return this.db.withPublic(async (tx) => {
      const { rows } = await tx.query<{ g: Geofence | null }>('SELECT qx.public_geofence($1) AS g', [slug]);
      return rows[0]?.g ?? null;
    });
  }

  /** Loads and shapes the menu. HIDDEN items, branch ids and ciphertexts never leave this method. */
  async load(slug: string, geoPass: string | undefined): Promise<PublicMenuResponse> {
    const fence = await this.geofence(slug);
    let geoOk = !fence || fence.mode === 'OFF';
    if (!geoOk && geoPass) {
      const claims = verifyPass<{ exp: number; s: string; v: number }>(this.cfg.tokenPepper, GEO_PASS, geoPass);
      geoOk = !!claims && claims.s === slug && claims.v === fence!.policyVersion;
    }
    const raw = await this.db.withPublic(async (tx) => {
      const { rows } = await tx.query<{ m: RawMenu }>('SELECT qx.public_menu($1, $2, $3) AS m', [slug, this.cfg.graceDays, geoOk]);
      return rows[0]!.m;
    });
    if (raw.state === 'UNAVAILABLE') return { state: 'UNAVAILABLE', reason: raw.reason as 'NOT_FOUND' };
    if (raw.state === 'GEOFENCE_REQUIRED') {
      return { state: 'GEOFENCE_REQUIRED', displayName: raw.displayName!, themeId: raw.themeId as never, geofence: { required: true, mode: raw.geofence!.mode } };
    }
    const t = raw.tenant!;
    const b = raw.branch!;
    const avail = raw.availability ?? {};
    let wifi: PublicMenu['wifi'] = null;
    if (raw.wifi) {
      let password: string | null = null;
      if (raw.wifi.passwordCiphertext) {
        try {
          password = decrypt(this.cfg.dataKey, raw.wifi.passwordCiphertext, `wifi:${b.id}`);
        } catch {
          password = null; // key rotation / corruption: show SSID only, never fail the menu
        }
      }
      wifi = { ssid: raw.wifi.ssid, password };
    }
    const menu: PublicMenu = {
      slug: t.slug,
      displayName: t.displayName,
      tagline: t.tagline,
      businessType: t.businessType as PublicMenu['businessType'],
      themeId: t.themeId as PublicMenu['themeId'],
      logoUrl: this.storage.publicUrl(t.logoKey),
      branch: { name: b.name, address: b.address, phone: b.phone, hoursText: b.hoursText },
      wifi,
      whatsapp: raw.whatsapp ?? null,
      revision: { no: raw.revision!.no, publishedAt: new Date(raw.revision!.publishedAt).toISOString() },
      categories: raw
        .snapshot!.categories.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          items: c.items.flatMap((i): PublicMenuItem[] => {
            // Products deleted after publish have no live row: treat as hidden.
            const a = avail[i.id];
            if (!a || a === 'HIDDEN') return [];
            return [
              {
                id: i.id,
                name: i.name,
                description: i.description,
                priceMinor: i.priceMinor,
                imageUrl: this.storage.publicUrl(i.imageKey),
                availability: a,
                tags: i.tags,
                kcal: i.kcal,
                allergens: i.allergens as PublicMenuItem['allergens'],
              },
            ];
          }),
        }))
        .filter((c) => c.items.length > 0),
    };
    return { state: 'OK', menu, geofence: { required: false } };
  }

  @Get()
  async menu(@Req() req: Request, @Param('slug') raw: string, @Headers('x-qx-geo-pass') pass: string | undefined, @Res({ passthrough: true }) res: Response) {
    await this.limiter.ip(req, 'public.menu', 240, 60);
    const result = await this.load(this.slug(raw), pass);
    // Short shared caching is unsafe because the geo pass changes the response; keep it private.
    res.setHeader('Cache-Control', 'private, no-store');
    if (result.state === 'UNAVAILABLE' && result.reason === 'NOT_FOUND') res.status(404);
    return result;
  }

  /**
   * Coordinates come from the browser after an explicit user action and disclosure. They are
   * compared in memory and discarded. This is a convenience gate, not an anti-spoofing control.
   */
  @Post('location-check')
  @HttpCode(200)
  async locationCheck(@Req() req: Request, @Param('slug') raw: string, @Body() body: unknown) {
    await this.limiter.ip(req, 'public.geo', 20, 300);
    const slug = this.slug(raw);
    const point = parse(geofenceCheckSchema, body);
    const fence = await this.geofence(slug);
    if (!fence || fence.mode === 'OFF') return { ok: true, pass: null };
    if (fence.mode !== 'RADIUS' || fence.centerLat === null || fence.centerLng === null || !fence.radiusM) {
      return { ok: false, reason: 'REGION_CHECK_UNAVAILABLE' };
    }
    if (point.accuracyM !== undefined && point.accuracyM > 1000) return { ok: false, reason: 'LOW_ACCURACY' };
    const inside = withinRadius({ lat: fence.centerLat, lng: fence.centerLng }, fence.radiusM / 1000, point);
    if (!inside) return { ok: false, reason: 'OUTSIDE' };
    const pass = signPass(this.cfg.tokenPepper, GEO_PASS, { s: slug, v: fence.policyVersion, exp: Math.floor(Date.now() / 1000) + GEO_PASS_TTL_S });
    return { ok: true, pass, expiresInS: GEO_PASS_TTL_S };
  }

  /** Server-side search over the same safe read model. UNKNOWN allergen status is never "free". */
  @Get('search')
  async search(
    @Req() req: Request,
    @Param('slug') raw: string,
    @Headers('x-qx-geo-pass') pass: string | undefined,
    @Query() query: Record<string, unknown>,
  ) {
    await this.limiter.ip(req, 'public.search', 120, 60);
    const q = parse(
      z.object({
        q: z.string().trim().max(60).default(''),
        category: uuid.optional(),
        allergensExclude: z
          .string()
          .optional()
          .transform((v) => (v ? v.split(',').filter(Boolean) : []))
          .pipe(z.array(z.enum(ALLERGEN_CODES)).max(14)),
      }),
      { q: query.q, category: query.category, allergensExclude: query.allergens_exclude },
    );
    const result = await this.load(this.slug(raw), pass);
    if (result.state !== 'OK') return { state: result.state, items: [], uncertain: [] };
    const items: (PublicMenuItem & { categoryId: string })[] = [];
    const uncertain: (PublicMenuItem & { categoryId: string })[] = [];
    for (const c of result.menu.categories) {
      if (q.category && c.id !== q.category) continue;
      for (const i of c.items) {
        if (q.q && !matchesSearch([i.name, i.description, c.name, ...i.tags], q.q)) continue;
        const bucket = allergenBucket(i.allergens, q.allergensExclude);
        if (bucket === 'safe') items.push({ ...i, categoryId: c.id });
        else if (bucket === 'uncertain') uncertain.push({ ...i, categoryId: c.id });
      }
    }
    return { state: 'OK', items, uncertain };
  }

  /** Aggregate scan count. The client event id dedupes retries; it is not linked to any visitor. */
  @Post('scans')
  @HttpCode(202)
  async scan(@Req() req: Request, @Param('slug') raw: string, @Body() body: unknown) {
    await this.limiter.ip(req, 'public.scan', 60, 300);
    const slug = this.slug(raw);
    const e = parse(scanEventSchema, body);
    // Crawlers and link previews get the same answer but are not counted (OD-11).
    if (isLikelyBot(req.headers['user-agent'])) return { accepted: true };
    const tokenHash = e.tableToken ? hashToken(this.cfg.tokenPepper, 'qr', e.tableToken) : null;
    await this.db.withPublic((tx) =>
      tx.query('SELECT qx.public_record_scan($1, $2, $3, $4, $5::date)', [slug, e.clientEventId, e.source, tokenHash, istanbulDate()]),
    );
    return { accepted: true };
  }

  @Post('metrics')
  @HttpCode(202)
  async metric(@Req() req: Request, @Param('slug') raw: string, @Body() body: unknown) {
    await this.limiter.ip(req, 'public.metric', 300, 300);
    const slug = this.slug(raw);
    const m = parse(
      z.object({
        metric: z.enum(['item_view', 'category_view', 'search', 'wifi_reveal', 'whatsapp_click', 'pdf_download']),
        entityId: uuid.optional(),
      }),
      body,
    );
    if (isLikelyBot(req.headers['user-agent'])) return { accepted: true };
    await this.db.withPublic((tx) =>
      tx.query('SELECT qx.public_record_metric($1, $2, $3, $4::date)', [slug, m.metric, m.entityId ?? null, istanbulDate()]),
    );
    return { accepted: true };
  }
}

/** Development media driver only. Production media is served by object storage (D-API-04). */
@Controller('v1/media')
export class MediaController {
  constructor(@Inject(STORAGE) private readonly storage: Storage) {}

  @Get('t/:tenant/:file')
  async get(@Param('tenant') tenant: string, @Param('file') file: string, @Res() res: Response) {
    // Export PDFs live in the same tree but are only served to the tenant through /v1/admin/exports/:id/file.
    const obj = isPdfKey(file) ? null : await this.storage.get(`t/${tenant}/${file}`);
    if (!obj) throw new ApiError(404, 'NOT_FOUND', 'Bulunamadı');
    res.setHeader('Content-Type', obj.contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.send(obj.body);
  }
}
