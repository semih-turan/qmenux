import type { AllergenCode, AllergenStatus, BusinessType, LicenseStatus, ThemeId } from '@qmenux/contracts';

export type Role = 'OWNER' | 'MANAGER' | 'STAFF';

export interface Me {
  user: { id: string; email: string; displayName: string | null };
  activeTenantId: string | null;
  memberships: { tenantId: string; slug: string; displayName: string; status: string; role: Role }[];
  applications: Application[];
}

export interface Application {
  id: string;
  businessName: string;
  slug: string;
  businessType: BusinessType;
  city: string;
  contactPhone: string;
  note: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  submittedAt: string;
  reviewedAt: string | null;
  decisionReason: string | null;
}

export interface Dashboard {
  tenant: {
    id: string;
    slug: string;
    displayName: string;
    tagline: string | null;
    businessType: BusinessType;
    themeId: ThemeId;
    status: string;
    logoKey: string | null;
    licenseState: LicenseStatus;
    licenseEndsAt: string | null;
    logoUrl: string | null;
    menuUrl: string;
  };
  role: Role;
  /** 0 = never published. */
  publish: { publishedRevisionNo: number; latestRevisionNo: number; hasUnpublishedChanges: boolean };
  counts: { categories: number; products: number; soldOut: number; unverifiedAllergenProducts: number };
  /** QR scans (table + general code), never direct visits; `month` is the current Europe/Istanbul month. */
  scans: { month: string; thisMonth: number; allTime: number };
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  position: number;
  isVisible: boolean;
  itemCount: number;
}

export type Availability = 'AVAILABLE' | 'SOLD_OUT' | 'HIDDEN';
export type Verification = 'UNVERIFIED' | 'VERIFIED';

export interface AllergenRow {
  code: AllergenCode;
  status: AllergenStatus;
  verification: string;
  source: string;
  verifiedAt: string | null;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  priceMinor: number;
  tags: string[];
  position: number;
  availability: Availability;
  version: number;
  imageKey: string | null;
  imageUrl: string | null;
  activeMediaId: string | null;
  calories: { kcal: number; verification: string; source: string } | null;
  allergens: AllergenRow[];
  updatedAt: string;
}

export interface Revision {
  id: string;
  revisionNo: number;
  note: string | null;
  publishedAt: string;
  publishedBy: string | null;
  restoredFromNo: number | null;
  itemCount: number;
  isCurrent: boolean;
}

export interface Branch {
  branch: { id: string; name: string; address: string | null; phone: string | null; hoursText: string | null };
  wifi: { enabled: boolean; ssid: string | null; hasPassword: boolean };
  whatsapp: { enabled: boolean; phone: string | null; message: string | null };
  geofence: { mode: 'OFF' | 'RADIUS' | 'ADMIN_REGIONS' | 'COMBINED'; center: { lat: number; lng: number } | null; radiusKm: number | null; regions: unknown[]; policyVersion: number };
}

export interface TableQr {
  id: string;
  label: string;
  active: boolean;
  createdAt: string;
  scansThisMonth: number;
}

export interface Analytics {
  scans: {
    month: string;
    thisMonth: number;
    allTime: number;
    /** `total` = table + general QR; `direct` (typed or shared link) is reported apart, never as a scan. */
    monthly: { month: string; total: number; table: number; qr: number; direct: number }[];
    last30Days: { day: string; total: number; direct: number }[];
  };
  topItems: { id: string; name: string; views: number }[];
  metrics: Record<string, unknown>;
  timezone: string;
}

export interface Team {
  members: { userId: string; role: Role; email: string | null; displayName: string | null; since: string }[];
  invites: { id: string; email: string; role: Role; createdAt: string; expiresAt: string }[];
}

export interface ExportJob {
  id: string;
  revisionNo: number | null;
  exportType: 'MENU_A4' | 'ALLERGEN_A4';
  includeSoldOut: boolean;
  status: string;
  ready: boolean;
  error: string | null;
  createdAt: string;
}

export interface License {
  state: LicenseStatus;
  endsAt: string | null;
  graceDays: number;
  grants: { startsAt: string; endsAt: string; revoked: boolean }[];
}

/** T027 staged import */
export interface ImportRowResult {
  line: number;
  category: string;
  name: string;
  description: string | null;
  priceMinor: number | null;
  tags: string[];
  errors: string[];
}

export interface ImportPreview {
  id: string;
  filename: string;
  status: 'VALIDATED' | 'APPLIED' | 'DISCARDED';
  headers: string[];
  sample: string[][];
  mapping: Record<string, number>;
  summary: Record<string, unknown>;
  results: ImportRowResult[];
}

export interface ImportBatchSummary {
  id: string;
  filename: string;
  status: 'VALIDATED' | 'APPLIED' | 'DISCARDED';
  summary: Record<string, unknown>;
  createdAt: string;
  appliedAt: string | null;
}
