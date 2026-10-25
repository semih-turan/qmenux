import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { Database } from './database.js';

@Controller('health')
export class HealthController {
  constructor(private readonly database: Database) {}

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
