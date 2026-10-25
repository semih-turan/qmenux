import { Controller, Get, Header, MethodNotAllowedException, Req, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { Database } from './database.js';
import { cleanupExpiredAuth } from './auth-maintenance.js';

@Controller('internal/maintenance')
export class AuthMaintenanceController {
  constructor(private readonly database: Database) {}

  @Get('auth-expiry')
  @Header('Cache-Control', 'no-store')
  async cleanup(@Req() req: IncomingMessage) {
    if (req.method !== 'GET') throw new MethodNotAllowedException();
    const secret = process.env.CRON_SECRET;
    if (!secret || !/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new ServiceUnavailableException({ status: 'unavailable' });
    const headers = req.rawHeaders.filter((value, i) => i % 2 === 0 && value.toLowerCase() === 'authorization');
    const supplied = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${secret}`);
    if (headers.length !== 1 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new UnauthorizedException();
    }
    return { status: 'ok', deleted: await cleanupExpiredAuth(this.database) };
  }
}
