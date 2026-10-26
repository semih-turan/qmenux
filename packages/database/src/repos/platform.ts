import { BUSINESS_TYPE_SUGGESTIONS, type BusinessType, type LicenseStatus, type TenantStatus } from '@qmenux/contracts';
import type { Tx } from '../db.js';
import { isUniqueViolation } from '../db.js';
import { audit } from './audit.js';
import { ConflictError, NotFoundError } from './catalog.js';
import { mapApplication, type ApplicationRow } from './identity.js';

/** All functions here run under the `platform` role after operator RBAC + MFA checks. */

export async function listApplications(tx: Tx, status: ApplicationRow['status'] | 'ALL' = 'PENDING'): Promise<ApplicationRow[]> {
  const { rows } = await tx.query(
    `SELECT a.*, u.email AS applicant_email, u.display_name AS applicant_name
       FROM qx.tenant_applications a JOIN qx.users u ON u.id = a.applicant_user_id
      WHERE ($1 = 'ALL' OR a.status = $1) ORDER BY a.submitted_at ASC LIMIT 200`,
    [status],
  );
  return rows.map(mapApplication);
}

/**
 * Approval creates the tenant (APPROVED, not yet ACTIVE), its primary branch and the
 * applicant's OWNER membership. The public menu stays offline until a license is granted.
 */
export async function approveApplication(tx: Tx, operatorId: string, applicationId: string, reason: string): Promise<string> {
  const { rows } = await tx.query('SELECT * FROM qx.tenant_applications WHERE id = $1 FOR UPDATE', [applicationId]);
  const app = rows[0];
  if (!app) throw new NotFoundError('application');
  if (app.status !== 'PENDING') throw new ConflictError(`application is ${app.status}`);
  const suggestion = BUSINESS_TYPE_SUGGESTIONS[app.business_type as BusinessType] ?? BUSINESS_TYPE_SUGGESTIONS.OTHER;
  let tenantId: string;
  try {
    const t = await tx.query<{ id: string }>(
      `INSERT INTO qx.tenants (slug, display_name, business_type, theme_id, status, approved_at, approved_by)
       VALUES ($1, $2, $3, $4, 'APPROVED', now(), $5) RETURNING id`,
      [app.slug, app.business_name, app.business_type, suggestion.theme, operatorId],
    );
    tenantId = t.rows[0]!.id;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError('slug already in use');
    throw err;
  }
  await tx.query(`INSERT INTO qx.branches (tenant_id, name, is_primary) VALUES ($1, $2, true)`, [tenantId, app.business_name]);
  await tx.query(`INSERT INTO qx.memberships (tenant_id, user_id, role) VALUES ($1, $2, 'OWNER')`, [tenantId, app.applicant_user_id]);
  await tx.query(
    `UPDATE qx.tenant_applications SET status = 'APPROVED', tenant_id = $2, reviewed_at = now(), reviewed_by = $3, decision_reason = $4 WHERE id = $1`,
    [applicationId, tenantId, operatorId, reason],
  );
  await audit(tx, { tenantId, actorUserId: operatorId, actorKind: 'operator', action: 'application.approve', targetType: 'application', targetId: applicationId, metadata: { reason } });
  await tx.query(`INSERT INTO qx.outbox_events (tenant_id, type, payload, idempotency_key) VALUES ($1, 'tenant.approved', $2, $3)`, [
    tenantId,
    JSON.stringify({ applicationId }),
    `tenant.approved:${applicationId}`,
  ]);
  return tenantId;
}

export async function rejectApplication(tx: Tx, operatorId: string, applicationId: string, reason: string): Promise<void> {
  const { rowCount } = await tx.query(
    `UPDATE qx.tenant_applications SET status = 'REJECTED', reviewed_at = now(), reviewed_by = $2, decision_reason = $3
      WHERE id = $1 AND status = 'PENDING'`,
    [applicationId, operatorId, reason],
  );
  if (!rowCount) throw new ConflictError('application is not pending');
  await audit(tx, { tenantId: null, actorUserId: operatorId, actorKind: 'operator', action: 'application.reject', targetType: 'application', targetId: applicationId, metadata: { reason } });
}

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

/** Month buckets use Europe/Istanbul calendar dates (QR scan totals/month). */
export async function listTenants(tx: Tx, graceDays: number, opts: { q?: string; status?: string } = {}): Promise<TenantSummary[]> {
  const { rows } = await tx.query(
    `WITH bounds AS (
       SELECT date_trunc('month', (now() AT TIME ZONE 'Europe/Istanbul'))::date AS this_month,
              (date_trunc('month', (now() AT TIME ZONE 'Europe/Istanbul')) - interval '1 month')::date AS last_month)
     SELECT t.id, t.slug, t.display_name, t.business_type, t.status, t.created_at,
            qx.license_state(t.id, $1) AS license_state,
            (SELECT max(ends_at) FROM qx.license_grants g WHERE g.tenant_id = t.id AND g.revoked_at IS NULL) AS license_ends_at,
            COALESCE((SELECT sum(valid_count) FROM qx.qr_scan_daily s, bounds b WHERE s.tenant_id = t.id AND s.source IN ('table', 'qr') AND s.local_date >= b.this_month), 0)::int AS scans_this,
            COALESCE((SELECT sum(valid_count) FROM qx.qr_scan_daily s, bounds b WHERE s.tenant_id = t.id AND s.source IN ('table', 'qr') AND s.local_date >= b.last_month AND s.local_date < b.this_month), 0)::int AS scans_last,
            (SELECT max(revision_no) FROM qx.menu_publications p WHERE p.tenant_id = t.id) AS published_no
       FROM qx.tenants t
      WHERE ($2::text IS NULL OR t.slug ILIKE '%' || $2 || '%' OR t.display_name ILIKE '%' || $2 || '%')
        AND ($3::text IS NULL OR t.status = $3)
      ORDER BY t.created_at DESC LIMIT 500`,
    [graceDays, opts.q?.replace(/[%_\\]/g, '') || null, opts.status ?? null],
  );
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    displayName: r.display_name,
    businessType: r.business_type,
    status: r.status,
    licenseState: r.license_state,
    licenseEndsAt: r.license_ends_at ? r.license_ends_at.toISOString() : null,
    scansThisMonth: r.scans_this,
    scansLastMonth: r.scans_last,
    publishedRevisionNo: r.published_no,
    createdAt: r.created_at.toISOString(),
  }));
}

export interface LicenseGrantRow {
  id: string;
  startsAt: string;
  endsAt: string;
  note: string | null;
  grantedBy: string | null;
  createdAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
}

export async function getTenantDetail(tx: Tx, tenantId: string, graceDays: number) {
  const t = await tx.query('SELECT * FROM qx.tenants WHERE id = $1', [tenantId]);
  if (!t.rows[0]) throw new NotFoundError('tenant');
  const grants = await tx.query(
    `SELECT g.*, u.display_name AS granted_by_name FROM qx.license_grants g LEFT JOIN qx.users u ON u.id = g.granted_by
      WHERE g.tenant_id = $1 ORDER BY g.created_at DESC`,
    [tenantId],
  );
  const owners = await tx.query(
    `SELECT u.email, u.display_name, m.role FROM qx.memberships m JOIN qx.users u ON u.id = m.user_id
      WHERE m.tenant_id = $1 AND m.revoked_at IS NULL ORDER BY m.role`,
    [tenantId],
  );
  const monthly = await tx.query(
    `SELECT to_char(date_trunc('month', local_date), 'YYYY-MM') AS month, sum(valid_count)::int AS total
       FROM qx.qr_scan_daily WHERE tenant_id = $1 AND source IN ('table', 'qr') GROUP BY 1 ORDER BY 1 DESC LIMIT 12`,
    [tenantId],
  );
  const state = await tx.query<{ s: LicenseStatus }>('SELECT qx.license_state($1, $2) AS s', [tenantId, graceDays]);
  const r = t.rows[0];
  return {
    id: r.id as string,
    slug: r.slug as string,
    displayName: r.display_name as string,
    businessType: r.business_type as string,
    themeId: r.theme_id as string,
    status: r.status as TenantStatus,
    suspendedReason: r.suspended_reason as string | null,
    approvedAt: r.approved_at ? (r.approved_at as Date).toISOString() : null,
    licenseState: state.rows[0]!.s,
    grants: grants.rows.map(
      (g): LicenseGrantRow => ({
        id: g.id,
        startsAt: g.starts_at.toISOString(),
        endsAt: g.ends_at.toISOString(),
        note: g.note,
        grantedBy: g.granted_by_name,
        createdAt: g.created_at.toISOString(),
        revokedAt: g.revoked_at ? g.revoked_at.toISOString() : null,
        revokeReason: g.revoke_reason,
      }),
    ),
    members: owners.rows.map((o) => ({ email: o.email as string | null, displayName: o.display_name as string | null, role: o.role as string })),
    monthlyScans: monthly.rows as { month: string; total: number }[],
  };
}

/**
 * Manual license grant (no payment gateway in V1). New grant starts at the later of
 * now and the current grant's end, so extensions never overlap or shorten access.
 */
export async function grantLicense(tx: Tx, operatorId: string, tenantId: string, endsAt: Date, note: string | null) {
  const t = await tx.query<{ status: TenantStatus }>('SELECT status FROM qx.tenants WHERE id = $1 FOR UPDATE', [tenantId]);
  const status = t.rows[0]?.status;
  if (!status) throw new NotFoundError('tenant');
  if (!['APPROVED', 'ACTIVE'].includes(status)) throw new ConflictError(`cannot license a ${status} tenant`);
  const cur = await tx.query<{ ends_at: Date }>(
    'SELECT max(ends_at) AS ends_at FROM qx.license_grants WHERE tenant_id = $1 AND revoked_at IS NULL AND ends_at > now()',
    [tenantId],
  );
  const startsAt = cur.rows[0]?.ends_at ?? new Date();
  if (endsAt <= startsAt) throw new ConflictError('end date must be after the current license end');
  const g = await tx.query<{ id: string }>(
    `INSERT INTO qx.license_grants (tenant_id, starts_at, ends_at, granted_by, note) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [tenantId, startsAt, endsAt, operatorId, note],
  );
  if (status === 'APPROVED') await tx.query(`UPDATE qx.tenants SET status = 'ACTIVE' WHERE id = $1`, [tenantId]);
  await audit(tx, {
    tenantId,
    actorUserId: operatorId,
    actorKind: 'operator',
    action: 'license.grant',
    targetType: 'license_grant',
    targetId: g.rows[0]!.id,
    metadata: { endsAt: endsAt.toISOString(), note },
  });
  return g.rows[0]!.id;
}

export async function revokeLicense(tx: Tx, operatorId: string, tenantId: string, grantId: string, reason: string) {
  const { rowCount } = await tx.query(
    `UPDATE qx.license_grants SET revoked_at = now(), revoked_by = $3, revoke_reason = $4
      WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL`,
    [grantId, tenantId, operatorId, reason],
  );
  if (!rowCount) throw new NotFoundError('license grant');
  await audit(tx, { tenantId, actorUserId: operatorId, actorKind: 'operator', action: 'license.revoke', targetType: 'license_grant', targetId: grantId, metadata: { reason } });
}

export async function setTenantSuspended(tx: Tx, operatorId: string, tenantId: string, suspended: boolean, reason: string) {
  const { rows } = await tx.query<{ status: TenantStatus }>('SELECT status FROM qx.tenants WHERE id = $1 FOR UPDATE', [tenantId]);
  const cur = rows[0]?.status;
  if (!cur) throw new NotFoundError('tenant');
  if (suspended) {
    if (cur === 'SUSPENDED') return;
    await tx.query(`UPDATE qx.tenants SET status = 'SUSPENDED', suspended_reason = $2 WHERE id = $1`, [tenantId, reason]);
  } else {
    if (cur !== 'SUSPENDED') return;
    const hasGrant = await tx.query('SELECT 1 FROM qx.license_grants WHERE tenant_id = $1 AND revoked_at IS NULL LIMIT 1', [tenantId]);
    await tx.query(`UPDATE qx.tenants SET status = $2, suspended_reason = NULL WHERE id = $1`, [tenantId, hasGrant.rowCount ? 'ACTIVE' : 'APPROVED']);
  }
  await audit(tx, { tenantId, actorUserId: operatorId, actorKind: 'operator', action: suspended ? 'tenant.suspend' : 'tenant.unsuspend', targetType: 'tenant', targetId: tenantId, metadata: { reason } });
}

export async function platformStats(tx: Tx, graceDays: number) {
  const { rows } = await tx.query(
    `SELECT
       (SELECT count(*) FROM qx.tenant_applications WHERE status = 'PENDING')::int AS pending_applications,
       (SELECT count(*) FROM qx.tenants WHERE status = 'ACTIVE')::int AS active_tenants,
       (SELECT count(*) FROM qx.tenants t WHERE t.status = 'ACTIVE' AND qx.license_state(t.id, $1) = 'GRACE')::int AS grace_tenants,
       (SELECT count(*) FROM qx.tenants t WHERE t.status IN ('ACTIVE','APPROVED') AND qx.license_state(t.id, $1) IN ('EXPIRED','NOT_GRANTED'))::int AS unlicensed_tenants,
       (SELECT count(*) FROM qx.license_grants g WHERE g.revoked_at IS NULL AND g.ends_at BETWEEN now() AND now() + interval '14 days')::int AS expiring_soon,
       COALESCE((SELECT sum(valid_count) FROM qx.qr_scan_daily
                  WHERE source IN ('table', 'qr') AND local_date >= date_trunc('month', now() AT TIME ZONE 'Europe/Istanbul')::date), 0)::int AS scans_this_month`,
    [graceDays],
  );
  const r = rows[0]!;
  return {
    pendingApplications: r.pending_applications as number,
    activeTenants: r.active_tenants as number,
    graceTenants: r.grace_tenants as number,
    unlicensedTenants: r.unlicensed_tenants as number,
    expiringSoon: r.expiring_soon as number,
    scansThisMonth: r.scans_this_month as number,
  };
}
