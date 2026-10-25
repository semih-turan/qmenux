import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { Database } from './database.js';
import { TenantTransactions } from './tenant-transactions.js';
import { AuthController } from './auth.controller.js';
import { GoogleOidc } from './google-oidc.js';
import { MicrosoftOidc } from './microsoft-oidc.js';
import { AppleClientSecret } from './apple-client-secret.js';
import { AppleOidc } from './apple-oidc.js';
import { IdentityStore } from './identity-store.js';
import { TenantAuthorization } from './tenant-authorization.js';
import { OperatorAccess } from './operator-access.js';
import { OperatorAuthorization } from './operator-authorization.js';
import { AuthMaintenanceController } from './auth-maintenance.controller.js';

@Module({ controllers: [HealthController, AuthController, AuthMaintenanceController], providers: [Database, TenantTransactions, GoogleOidc, MicrosoftOidc, AppleClientSecret, AppleOidc, IdentityStore, TenantAuthorization, OperatorAccess, OperatorAuthorization] })
export class AppModule {}
