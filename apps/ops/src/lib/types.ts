import type { LicenseStatus, TenantStatus } from '@qmenux/contracts';

export type OperatorRole = 'PLATFORM_ADMIN' | 'PLATFORM_SUPPORT';

/** GET /v1/control/session */
export interface OpsSession {
  user: { id: string; email: string; displayName: string | null };
  role: OperatorRole;
  mfaVerified: boolean;
  expiresAt: string;
}

/** GET /v1/control/stats */
export interface PlatformStats {
  pendingApplications: number;
  activeTenants: number;
  graceTenants: number;
  unlicensedTenants: number;
  expiringSoon: number;
  scansThisMonth: number;
}

export type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';

/** GET /v1/control/applications */
export interface Application {
  id: string;
  businessName: string;
  slug: string;
  businessType: string;
  city: string;
  contactPhone: string;
  note: string | null;
  status: ApplicationStatus;
  submittedAt: string;
  reviewedAt: string | null;
  decisionReason: string | null;
  applicantEmail?: string | null;
  applicantName?: string | null;
}

/** GET /v1/control/tenants */
export interface TenantSummary {
  id: string;
  slug: string;
  displayName: string;
  businessType: string;
  status: TenantStatus;
  licenseState: LicenseStatus;
  licenseEndsAt: string | null;
  scansThisMonth: number;
  scansLastMonth: number;
  publishedRevisionNo: number | null;
  createdAt: string;
}

export interface LicenseGrant {
  id: string;
  startsAt: string;
  endsAt: string;
  note: string | null;
  grantedBy: string | null;
  createdAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
}

/** GET /v1/control/tenants/:id */
export interface TenantDetail {
  id: string;
  slug: string;
  displayName: string;
  businessType: string;
  themeId: string;
  status: TenantStatus;
  suspendedReason: string | null;
  approvedAt: string | null;
  licenseState: LicenseStatus;
  grants: LicenseGrant[];
  members: { email: string | null; displayName: string | null; role: string }[];
  monthlyScans: { month: string; total: number }[];
}

/** GET /v1/control/audit */
export interface AuditEntry {
  id: string;
  action: string;
  actorUserId: string | null;
  actorKind: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
