import { uuid } from '@qmenux/contracts';
import { imports, type Db } from '@qmenux/database';
import { Body, Controller, Delete, Get, Header, HttpCode, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import type { SessionService, TenantActor } from '../auth/sessions.js';
import { ApiError, parse } from '../http/problem.js';
import type { RateLimiter } from '../http/rate-limit.js';
import { DB, LIMITER, SESSIONS } from '../tokens.js';
import {
  autoMap,
  CSV_TYPES,
  IMPORT_FIELDS,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  mappingProblems,
  parseCsv,
  parseXlsx,
  TEMPLATE_CSV,
  validateRows,
  XLSX_TYPES,
  type ImportGrid,
  type ImportMapping,
} from './import-parse.js';

const ctxOf = (a: TenantActor) => ({ tenantId: a.tenantId, userId: a.userId });
const id = (v: string) => parse(uuid, v);

const mappingSchema = z.object(Object.fromEntries(IMPORT_FIELDS.map((f) => [f, z.number().int().min(0).max(50).optional()])) as Record<(typeof IMPORT_FIELDS)[number], z.ZodOptional<z.ZodNumber>>);
const applySchema = z.object({ duplicates: z.enum(['update', 'skip']).default('update') });

/**
 * Staged catalog import (T027): upload → parse → mapping → dry run → draft commit. The file is parsed
 * once and kept as text in the batch; no spreadsheet code ever runs. Imported rows become DRAFT
 * categories/products; publishing stays a separate, manual step.
 */
@Controller('v1/admin/imports')
export class ImportsController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(SESSIONS) private readonly sessions: SessionService,
    @Inject(LIMITER) private readonly limiter: RateLimiter,
  ) {}

  @Get('template.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="qmenux-menu-sablonu.csv"')
  @Header('Cache-Control', 'public, max-age=3600')
  template() {
    return TEMPLATE_CSV;
  }

  @Get()
  async list(@Req() req: Request) {
    const a = await this.sessions.tenantActor(req, 'catalog.write');
    return { imports: await this.db.withTenant(ctxOf(a), (tx) => imports.listBatches(tx)) };
  }

  /** Raw CSV/XLSX body (content-type decides the parser). Returns the dry-run preview. */
  @Post()
  async upload(@Req() req: Request, @Query('filename') filename?: string) {
    const a = await this.sessions.tenantActor(req, 'catalog.write', { write: true });
    await this.limiter.hit('imports', a.tenantId, 30, 3600);
    const body = req.body as unknown;
    const ct = String(req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
    if (!Buffer.isBuffer(body) || body.length === 0) throw new ApiError(415, 'UNSUPPORTED_MEDIA', 'CSV veya XLSX dosyası yükleyin');
    if (body.length > IMPORT_MAX_BYTES) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Dosya en fazla 2 MB olabilir');
    let grid: ImportGrid;
    if (XLSX_TYPES.has(ct)) {
      if (body.subarray(0, 2).toString('latin1') !== 'PK') throw new ApiError(415, 'UNSUPPORTED_MEDIA', 'Geçerli bir XLSX dosyası değil');
      grid = await parseXlsx(body).catch(() => {
        throw new ApiError(422, 'IMPORT_UNREADABLE', 'XLSX dosyası okunamadı');
      });
    } else if (CSV_TYPES.has(ct)) {
      if (body.subarray(0, 2).toString('latin1') === 'PK') throw new ApiError(415, 'UNSUPPORTED_MEDIA', 'Bu bir XLSX dosyası; türü doğru seçin');
      grid = parseCsv(decodeText(body));
    } else throw new ApiError(415, 'UNSUPPORTED_MEDIA', 'CSV veya XLSX dosyası yükleyin');
    if (grid.headers.length === 0 || grid.rows.length === 0) throw new ApiError(422, 'IMPORT_EMPTY', 'Dosyada başlık satırı ve en az bir ürün satırı olmalı');
    if (grid.rows.length > IMPORT_MAX_ROWS) throw new ApiError(422, 'IMPORT_TOO_MANY_ROWS', `En fazla ${IMPORT_MAX_ROWS} satır içe aktarılabilir`);

    const mapping = autoMap(grid.headers);
    const results = validateRows(grid, mapping);
    const safeName = (filename ?? 'import').replace(/[^\w.\-() ğüşöçıİĞÜŞÖÇ]/g, '').slice(0, 120) || 'import';
    const rows = { headers: grid.headers, grid: grid.rows, mapping, results };
    const summary = summarize(results, mapping, grid.headers.length);
    const batchId = await this.db.withTenant(ctxOf(a), (tx) => imports.createBatch(tx, a, { filename: safeName, rows, summary }));
    return preview(batchId, safeName, 'VALIDATED', rows, summary);
  }

  @Get(':id')
  async get(@Req() req: Request, @Param('id') bid: string) {
    const a = await this.sessions.tenantActor(req, 'catalog.write');
    const b = await this.db.withTenant(ctxOf(a), (tx) => imports.getBatch(tx, id(bid)));
    return preview(b.id, b.filename, b.status, b.rows, b.summary);
  }

  /** Re-runs the dry run with a user-adjusted column mapping. */
  @Patch(':id/mapping')
  async remap(@Req() req: Request, @Param('id') bid: string, @Body() body: unknown) {
    const a = await this.sessions.tenantActor(req, 'catalog.write', { write: true });
    const mapping = parse(mappingSchema, body) as ImportMapping;
    return this.db.withTenant(ctxOf(a), async (tx) => {
      const b = await imports.getBatch(tx, id(bid));
      if (b.status !== 'VALIDATED') throw new ApiError(409, 'CONFLICT', 'Bu içe aktarma kapanmış');
      const grid: ImportGrid = { headers: b.rows.headers, rows: b.rows.grid };
      const results = validateRows(grid, mapping);
      const rows = { ...b.rows, mapping: mapping as Record<string, number>, results };
      const summary = summarize(results, mapping, grid.headers.length);
      await imports.updateBatchRows(tx, b.id, rows, summary);
      return preview(b.id, b.filename, b.status, rows, summary);
    });
  }

  /** Draft commit: creates categories/products, never publishes. Licence required like any other catalog write. */
  @Post(':id/apply')
  @HttpCode(200)
  async apply(@Req() req: Request, @Param('id') bid: string, @Body() body: unknown) {
    const a = await this.sessions.tenantActor(req, 'catalog.write', { write: true, licensed: true });
    const { duplicates } = parse(applySchema, body ?? {});
    return this.db.withTenant(ctxOf(a), async (tx) => {
      const b = await imports.getBatch(tx, id(bid));
      const problems = mappingProblems(b.rows.mapping as ImportMapping, b.rows.headers.length);
      if (problems.length) throw new ApiError(422, 'IMPORT_MAPPING', problems.join(' '));
      const result = await imports.applyBatch(tx, a, b.id, duplicates);
      return { ok: true, result };
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async discard(@Req() req: Request, @Param('id') bid: string) {
    const a = await this.sessions.tenantActor(req, 'catalog.write', { write: true });
    await this.db.withTenant(ctxOf(a), (tx) => imports.discardBatch(tx, a, id(bid)));
  }
}

/** UTF-8 (with or without BOM) first; a file that is not valid UTF-8 is read as Windows-1254 (Turkish Excel default). */
function decodeText(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1254').decode(buf);
  }
}

function summarize(results: ReturnType<typeof validateRows>, mapping: ImportMapping, columnCount: number) {
  const valid = results.filter((r) => r.errors.length === 0);
  return {
    rowCount: results.length,
    validCount: valid.length,
    errorCount: results.length - valid.length,
    categories: [...new Set(valid.map((r) => r.category))],
    mappingProblems: mappingProblems(mapping, columnCount),
  };
}

function preview(id: string, filename: string, status: string, rows: { headers: string[]; grid: string[][]; mapping: Record<string, number>; results: ReturnType<typeof validateRows> }, summary: Record<string, unknown>) {
  return {
    id,
    filename,
    status,
    headers: rows.headers,
    sample: rows.grid.slice(0, 5),
    mapping: rows.mapping,
    summary,
    // Row results are capped for the phone screen; the counts in `summary` cover the whole file.
    results: rows.results.slice(0, 500),
  };
}
