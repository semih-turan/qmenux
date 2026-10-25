import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { Database } from './database.js';
import { TenantTransactions } from './tenant-transactions.js';
import { AuthController } from './auth.controller.js';
import { GoogleOidc } from './google-oidc.js';
import { IdentityStore } from './identity-store.js';

@Module({ controllers: [HealthController, AuthController], providers: [Database, TenantTransactions, GoogleOidc, IdentityStore] })
export class AppModule {}
