import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { Database } from './database.js';
import { TenantTransactions } from './tenant-transactions.js';
import { AuthController } from './auth.controller.js';
import { GoogleOidc } from './google-oidc.js';
import { IdentityStore } from './identity-store.js';
import { TenantAuthorization } from './tenant-authorization.js';
import { OperatorAccess } from './operator-access.js';
import { OperatorAuthorization } from './operator-authorization.js';

@Module({ controllers: [HealthController, AuthController], providers: [Database, TenantTransactions, GoogleOidc, IdentityStore, TenantAuthorization, OperatorAccess, OperatorAuthorization] })
export class AppModule {}
