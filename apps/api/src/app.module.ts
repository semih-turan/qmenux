import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { DatabaseReadiness } from './database-readiness.js';

@Module({ controllers: [HealthController], providers: [DatabaseReadiness] })
export class AppModule {}
