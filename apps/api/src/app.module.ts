import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { Database } from './database.js';
import { TenantTransactions } from './tenant-transactions.js';

@Module({ controllers: [HealthController], providers: [Database, TenantTransactions] })
export class AppModule {}
