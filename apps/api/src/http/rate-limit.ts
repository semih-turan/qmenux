import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Db } from '@qmenux/database';
import type { Request } from 'express';
import type { ApiConfig } from '../config.js';
import { hashToken } from '../crypto.js';
import { tooMany } from './problem.js';

const digest = (v: string | Buffer) => createHash('sha256').update(v).digest();

/**
 * Client address for rate limiting only (never stored raw, never used for analytics).
 * A first-party BFF proves itself with the shared key and states the end-user IP; otherwise
 * on Vercel the platform sets `x-vercel-forwarded-for`; other forwarded headers are client-controlled.
 */
export function clientIp(req: Request, bffKey: Buffer | null = null): string {
  const presented = req.headers['x-qx-bff-key'];
  const stated = req.headers['x-qx-client-ip'];
  if (bffKey && typeof presented === 'string' && typeof stated === 'string' && isIP(stated)) {
    if (timingSafeEqual(digest(presented), digest(bffKey.toString('base64')))) return stated;
  }
  const vercel = req.headers['x-vercel-forwarded-for'];
  if (typeof vercel === 'string' && vercel) return vercel.split(',')[0]!.trim();
  return req.socket.remoteAddress ?? 'unknown';
}

export class RateLimiter {
  constructor(
    private readonly cfg: ApiConfig,
    private readonly db: Db,
  ) {}

  /** Fixed-window limit keyed by HMAC(bucket + subject); throws 429 when exceeded. */
  async hit(bucket: string, subject: string, limit: number, windowS: number): Promise<void> {
    const key = hashToken(this.cfg.tokenPepper, 'rl', `${bucket}:${subject}`);
    const ok = await this.db.withPublic(async (tx) => {
      const { rows } = await tx.query<{ ok: boolean }>('SELECT qx.rate_limit_hit($1, $2, $3) AS ok', [key, limit, windowS]);
      return rows[0]!.ok;
    });
    if (!ok) throw tooMany();
  }

  ip(req: Request, bucket: string, limit: number, windowS: number) {
    return this.hit(bucket, clientIp(req, this.cfg.bffKey), limit, windowS);
  }
}
