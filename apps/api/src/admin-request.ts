import { BadRequestException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export type AdminRequest = IncomingMessage & { rawBody?: Buffer };
const countHeader = (req: IncomingMessage, name: string) =>
  req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === name).length;

export function readAdminJson(req: AdminRequest, key: 'ADMIN_BFF_SECRET' | 'ADMIN_ONBOARDING_SECRET' | 'OPERATOR_BFF_SECRET' | 'OPERATOR_REVIEW_SECRET' | 'OPERATOR_PROVISIONING_SECRET'): Record<string, unknown> {
  const configured = process.env[key];
  if (!configured || !/^[A-Za-z0-9_-]{43}$/.test(configured) || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'
    || (key === 'ADMIN_ONBOARDING_SECRET' && (configured === process.env.ADMIN_BFF_SECRET || configured === process.env.CRON_SECRET))
    || (key.startsWith('OPERATOR_') && ['ADMIN_BFF_SECRET','ADMIN_ONBOARDING_SECRET','CRON_SECRET','OPERATOR_BFF_SECRET','OPERATOR_REVIEW_SECRET','OPERATOR_PROVISIONING_SECRET'].some(name=>name!==key&&process.env[name]===configured))) {
    throw new ServiceUnavailableException({ status: 'unavailable' });
  }
  const actual = Buffer.from(req.headers.authorization ?? ''), expected = Buffer.from(`Bearer ${configured}`);
  if (countHeader(req, 'authorization') !== 1 || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new UnauthorizedException();
  if (req.url?.includes('?') || countHeader(req, 'content-type') !== 1
    || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '')
    || req.headers['content-encoding'] || !req.rawBody || req.rawBody.length > (key.startsWith('OPERATOR_') ? 32768 : 8192)) throw new BadRequestException();
  let body: unknown, raw: string;
  try { raw = new TextDecoder('utf-8', { fatal: true }).decode(req.rawBody); body = JSON.parse(raw); }
  catch { throw new BadRequestException(); }
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.values(body).some(value => typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value)))) throw new BadRequestException();
  const keys = new Set<string>();
  // Machine contracts accept flat primitives; escaped duplicate keys must not collapse silently.
  for (const match of raw.matchAll(/"(?:\\.|[^"\\])*"\s*:?/g)) {
    const token = match[0].trim();
    if (!token.endsWith(':')) continue;
    const name = JSON.parse(token.slice(0, -1)) as string;
    if (keys.has(name)) throw new BadRequestException();
    keys.add(name);
  }
  return body as Record<string, unknown>;
}
