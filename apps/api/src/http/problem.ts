import { randomUUID } from 'node:crypto';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { ConflictError, NotFoundError, TenantContextError } from '@qmenux/database';
import type { Request, Response } from 'express';
import { ZodError, type ZodTypeAny, type output } from 'zod';

/**
 * Stable machine codes (RFC 9457 problem details). Messages never reveal whether
 * another tenant's resource exists: cross-tenant ids are simply NOT_FOUND.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(title);
  }
}

export const unauthorized = () => new ApiError(401, 'UNAUTHENTICATED', 'Oturum gerekli');
export const forbidden = (code = 'FORBIDDEN', title = 'Bu işlem için yetkiniz yok') => new ApiError(403, code, title);
export const notFound = () => new ApiError(404, 'NOT_FOUND', 'Bulunamadı');
export const tooMany = () => new ApiError(429, 'RATE_LIMITED', 'Çok fazla istek. Lütfen biraz sonra tekrar deneyin.');

export function parse<S extends ZodTypeAny>(schema: S, input: unknown): output<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw r.error;
  return r.data;
}

@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();
    const traceId = (req.headers['x-request-id'] as string | undefined)?.slice(0, 64) || randomUUID();
    let status = 500;
    let body: Record<string, unknown> = { code: 'INTERNAL', title: 'Beklenmeyen bir hata oluştu' };

    if (err instanceof ApiError) {
      status = err.status;
      body = { code: err.code, title: err.title, ...err.extra };
    } else if (err instanceof ZodError) {
      status = 422;
      body = {
        code: 'VALIDATION_FAILED',
        title: 'Girilen bilgileri kontrol edin',
        errors: err.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message })),
      };
    } else if (err instanceof ConflictError) {
      status = 409;
      body = { code: 'CONFLICT', title: 'Kayıt başka biri tarafından değiştirildi', detail: err.message, current: err.current };
    } else if (err instanceof NotFoundError || err instanceof TenantContextError) {
      status = 404;
      body = { code: 'NOT_FOUND', title: 'Bulunamadı' };
    } else if (err instanceof HttpException) {
      status = err.getStatus();
      body = { code: status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR', title: status === 404 ? 'Bulunamadı' : err.message };
    } else if (typeof err === 'object' && err && (err as { type?: string }).type === 'entity.too.large') {
      status = 413;
      body = { code: 'PAYLOAD_TOO_LARGE', title: 'İstek çok büyük' };
    } else if (typeof err === 'object' && err && (err as { type?: string }).type === 'entity.parse.failed') {
      status = 400;
      body = { code: 'BAD_JSON', title: 'Geçersiz istek gövdesi' };
    }

    if (status >= 500) {
      // Log class + trace only: request bodies may contain tenant data or secrets.
      const name = err instanceof Error ? err.name : typeof err;
      const pgCode = (err as { code?: string } | null)?.code;
      console.error(JSON.stringify({ level: 'error', traceId, path: req.route?.path ?? 'unmatched', error: name, pgCode, message: err instanceof Error ? err.message.slice(0, 200) : undefined }));
    }
    res
      .status(status)
      .setHeader('Content-Type', 'application/problem+json')
      .setHeader('Cache-Control', 'no-store')
      .json({ type: `https://api.qmenux.com/problems/${String(body.code).toLowerCase()}`, status, traceId, ...body });
  }
}
