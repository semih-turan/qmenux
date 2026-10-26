export const TENANT_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'REJECTED', 'SUSPENDED'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const LICENSE_STATUSES = ['NOT_GRANTED', 'ACTIVE', 'GRACE', 'EXPIRED', 'REVOKED'] as const;
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

export const AVAILABILITY = ['AVAILABLE', 'SOLD_OUT', 'HIDDEN'] as const;
export type Availability = (typeof AVAILABILITY)[number];

export const MEMBER_ROLES = ['OWNER', 'MANAGER', 'STAFF'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const PLATFORM_ROLES = ['PLATFORM_ADMIN', 'PLATFORM_SUPPORT'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PERMISSIONS = {
  'catalog.read': ['OWNER', 'MANAGER', 'STAFF'],
  'catalog.write': ['OWNER', 'MANAGER'],
  'availability.write': ['OWNER', 'MANAGER', 'STAFF'],
  'menu.publish': ['OWNER', 'MANAGER'],
  'settings.write': ['OWNER'],
  'members.manage': ['OWNER'],
  'analytics.read': ['OWNER', 'MANAGER'],
  'exports.create': ['OWNER', 'MANAGER'],
} as const satisfies Record<string, readonly MemberRole[]>;
export type Permission = keyof typeof PERMISSIONS;

export function can(role: MemberRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly MemberRole[]).includes(role);
}

export const AUTH_PROVIDERS = ['google', 'microsoft', 'apple', 'dev'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

/** Grace length is an OPEN decision (OD-07); callers pass the configured value. */
export function effectiveLicenseStatus(
  lic: { status: LicenseStatus; endsAt: Date | null },
  now: Date,
  graceDays: number,
): LicenseStatus {
  if (lic.status === 'REVOKED' || lic.status === 'NOT_GRANTED') return lic.status;
  if (!lic.endsAt || now <= lic.endsAt) return 'ACTIVE';
  const graceEnd = new Date(lic.endsAt.getTime() + graceDays * 86_400_000);
  return now <= graceEnd ? 'GRACE' : 'EXPIRED';
}

/** ACTIVE and GRACE keep the public menu online. */
export function licenseAllowsPublicMenu(status: LicenseStatus): boolean {
  return status === 'ACTIVE' || status === 'GRACE';
}
