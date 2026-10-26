import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { Database } from './database.js';
import { TenantTransactions } from './tenant-transactions.js';
import { AdminAuthController, AdminAuthErrors } from './admin-auth.controller.js';
import { AuthController } from './auth.controller.js';
import { GoogleOidc } from './google-oidc.js';
import { MicrosoftOidc } from './microsoft-oidc.js';
import { AppleClientSecret } from './apple-client-secret.js';
import { AppleOidc } from './apple-oidc.js';
import { IdentityStore } from './identity-store.js';
import { AdminOnboardingController } from './admin-onboarding.controller.js';
import { OnboardingApplications } from './onboarding-applications.js';
import { DraftStructure } from './draft-structure.js';
import { DraftCatalog } from './draft-catalog.js';
import { TenantAuthorization } from './tenant-authorization.js';
import { OperatorAccess } from './operator-access.js';
import { OperatorAuthorization } from './operator-authorization.js';
import { TenantProvisioning } from './tenant-provisioning.js';
import { OperatorApplicationReview } from './operator-application-review.js';
import { OperatorPasskeys } from './operator-passkeys.js';
import { AuthMaintenanceController } from './auth-maintenance.controller.js';

@Module({ controllers: [HealthController, AuthController, AdminAuthController, AdminOnboardingController, AuthMaintenanceController], providers: [{ provide: APP_FILTER, useClass: AdminAuthErrors }, Database, TenantTransactions, GoogleOidc, MicrosoftOidc, AppleClientSecret, AppleOidc, IdentityStore, TenantAuthorization, DraftCatalog, DraftStructure, OnboardingApplications, OperatorAccess, OperatorAuthorization, OperatorPasskeys, OperatorApplicationReview, TenantProvisioning] })
export class AppModule {}
