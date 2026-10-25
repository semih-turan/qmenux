import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseReadiness } from './database-readiness.js';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseReadiness) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  getHealth() {
    return { status: 'ok' };
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async getReadiness() {
    if (!await this.database.isReady()) throw new ServiceUnavailableException({ status: 'unavailable' });
    return { status: 'ready' };
  }
}
