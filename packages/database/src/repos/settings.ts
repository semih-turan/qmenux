import type { BusinessType, GeofenceSettings, LicenseStatus, MemberRole, ThemeId } from '@qmenux/contracts';
import type { Tx } from '../db.js';
import { isUniqueViolation } from '../db.js';
import { audit } from './audit.js';
import { ConflictError, NotFoundError, primaryBranchId, type Actor } from './catalog.js';

/** All functions here run under the `app` role with server-resolved tenant context. */

function memberAudit(tx: Tx, actor: Actor, action: string, targetType?: string, targetId?: string, metadata?: Record<string, unknown>) {
  return audit(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, actorKind: 'member', action, targetType, targetId, metadata });
}

// ---------------------------------------------------------------- tenant overview & branding
export async function getTenantOverview(tx: Tx, graceDays: number) {
  const { rows } = await tx.query(
    `SELECT t.id, t.slug, t.display_name, t.tagline, t.business_type, t.theme_id, t.status, t.logo_media_id,
            (SELECT object_key FROM qx.media_assets m WHERE m.id = t.logo_media_id AND m.deleted_at IS NULL) AS logo_key,
            qx.license_state(t.id, $1) AS license_state,
            (SELECT max(ends_at) FROM qx.license_grants g WHERE g.revoked_at IS NULL) AS license_ends_at
       FROM qx.tenants t`,
    [graceDays],
  );
  const r = rows[0];
  if (!r) throw new NotFoundError('tenant');
  return {
    id: r.id as string,
    slug: r.slug as string,
    displayName: r.display_name as string,
    tagline: r.tagline as string | null,
    businessType: r.business_type as BusinessType,
    themeId: r.theme_id as ThemeId,
    status: r.status as string,
    logoKey: r.logo_key as string | null,
    licenseState: r.license_state as LicenseStatus,
    licenseEndsAt: r.license_ends_at ? (r.license_ends_at as Date).toISOString() : null,
  };
}

export async function updateBranding(
  tx: Tx,
  actor: Actor,
  input: { displayName: string; themeId: ThemeId; businessType: BusinessType; tagline?: string | null },
) {
  await tx.query(
    `UPDATE qx.tenants SET display_name = $1, theme_id = $2, business_type = $3, tagline = $4 WHERE id = $5`,
    [input.displayName, input.themeId, input.businessType, input.tagline ?? null, actor.tenantId],
  );
  await memberAudit(tx, actor, 'tenant.branding', 'tenant', actor.tenantId, { themeId: input.themeId });
}

export async function setLogo(tx: Tx, actor: Actor, mediaId: string | null) {
  if (mediaId) {
    const m = await tx.query('SELECT 1 FROM qx.media_assets WHERE id = $1 AND deleted_at IS NULL', [mediaId]);
    if (!m.rowCount) throw new NotFoundError('media');
  }
  await tx.query('UPDATE qx.tenants SET logo_media_id = $1 WHERE id = $2', [mediaId, actor.tenantId]);
  await memberAudit(tx, actor, 'tenant.logo', 'tenant', actor.tenantId);
}

// ---------------------------------------------------------------- branch info
export async function getBranchSettings(tx: Tx) {
  const branchId = await primaryBranchId(tx);
  const { rows } = await tx.query(
    `SELECT b.id, b.name, b.address, b.phone, b.hours_text,
            w.enabled AS wifi_enabled, w.ssid, (w.password_ciphertext IS NOT NULL) AS wifi_has_password,
            wa.enabled AS wa_enabled, wa.phone_e164, wa.message AS wa_message,
            v.mode, v.center_lat, v.center_lng, v.radius_m, v.regions, v.policy_version
       FROM qx.branches b
       LEFT JOIN qx.branch_wifi w ON w.branch_id = b.id
       LEFT JOIN qx.branch_whatsapp wa ON wa.branch_id = b.id
       LEFT JOIN qx.menu_visibility_policies v ON v.branch_id = b.id
      WHERE b.id = $1`,
    [branchId],
  );
  const r = rows[0]!;
  return {
    branch: { id: r.id as string, name: r.name as string, address: r.address as string | null, phone: r.phone as string | null, hoursText: r.hours_text as string | null },
    // The Wi-Fi password is never returned to the admin UI after saving (write-only field).
    wifi: { enabled: !!r.wifi_enabled, ssid: (r.ssid as string | null) ?? null, hasPassword: !!r.wifi_has_password },
    whatsapp: { enabled: !!r.wa_enabled, phone: (r.phone_e164 as string | null) ?? null, message: (r.wa_message as string | null) ?? null },
    geofence: {
      mode: ((r.mode as string | null) ?? 'OFF') as GeofenceSettings['mode'],
      center: r.center_lat === null || r.center_lat === undefined ? null : { lat: r.center_lat as number, lng: r.center_lng as number },
      radiusKm: r.radius_m ? (r.radius_m as number) / 1000 : null,
      regions: (r.regions ?? []) as GeofenceSettings['regions'],
      policyVersion: (r.policy_version as number | null) ?? 0,
    },
  };
}

export async function updateBranchInfo(
  tx: Tx,
  actor: Actor,
  input: { name: string; address?: string | null; phone?: string | null; hoursText?: string | null },
) {
  const branchId = await primaryBranchId(tx);
  await tx.query('UPDATE qx.branches SET name = $2, address = $3, phone = $4, hours_text = $5 WHERE id = $1', [
    branchId,
    input.name,
    input.address ?? null,
    input.phone ?? null,
    input.hoursText ?? null,
  ]);
  await memberAudit(tx, actor, 'branch.update', 'branch', branchId);
}

/**
 * Wi-Fi is optional. The caller encrypts the password (AES-GCM, server key) before it
 * reaches the database; `passwordCiphertext === undefined` keeps the stored password.
 */
export async function updateWifi(tx: Tx, actor: Actor, input: { enabled: boolean; ssid: string | null; passwordCiphertext?: string | null }) {
  const branchId = await primaryBranchId(tx);
  await tx.query(
    `INSERT INTO qx.branch_wifi (tenant_id, branch_id, enabled, ssid, password_ciphertext)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (branch_id) DO UPDATE SET enabled = EXCLUDED.enabled, ssid = EXCLUDED.ssid,
       password_ciphertext = CASE WHEN $6::boolean THEN EXCLUDED.password_ciphertext ELSE qx.branch_wifi.password_ciphertext END`,
    [actor.tenantId, branchId, input.enabled, input.ssid, input.passwordCiphertext ?? null, input.passwordCiphertext !== undefined],
  );
  await memberAudit(tx, actor, 'branch.wifi', 'branch', branchId, { enabled: input.enabled, passwordChanged: input.passwordCiphertext !== undefined });
}

/** WhatsApp is a link-out CTA only (wa.me), opt-in; no messaging API integration. */
export async function updateWhatsapp(tx: Tx, actor: Actor, input: { enabled: boolean; phone: string | null; message: string | null }) {
  const branchId = await primaryBranchId(tx);
  await tx.query(
    `INSERT INTO qx.branch_whatsapp (tenant_id, branch_id, enabled, phone_e164, message) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (branch_id) DO UPDATE SET enabled = EXCLUDED.enabled, phone_e164 = EXCLUDED.phone_e164, message = EXCLUDED.message`,
    [actor.tenantId, branchId, input.enabled, input.phone, input.message],
  );
  await memberAudit(tx, actor, 'branch.whatsapp', 'branch', branchId, { enabled: input.enabled });
}

/** Each change bumps policy_version so guests re-check against the newest policy. */
export async function updateGeofence(tx: Tx, actor: Actor, input: GeofenceSettings) {
  const branchId = await primaryBranchId(tx);
  const radiusM = input.radiusKm ? Math.round(input.radiusKm * 1000) : null;
  const usesRadius = input.mode === 'RADIUS' || input.mode === 'COMBINED';
  const { rows } = await tx.query<{ policy_version: number }>(
    `INSERT INTO qx.menu_visibility_policies (tenant_id, branch_id, mode, center_lat, center_lng, radius_m, regions, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (branch_id) DO UPDATE SET mode = EXCLUDED.mode, center_lat = EXCLUDED.center_lat, center_lng = EXCLUDED.center_lng,
       radius_m = EXCLUDED.radius_m, regions = EXCLUDED.regions, updated_by = EXCLUDED.updated_by,
       policy_version = qx.menu_visibility_policies.policy_version + 1
     RETURNING policy_version`,
    [
      actor.tenantId,
      branchId,
      input.mode,
      usesRadius ? (input.center?.lat ?? null) : null,
      usesRadius ? (input.center?.lng ?? null) : null,
      usesRadius ? radiusM : null,
      JSON.stringify(input.regions ?? []),
      actor.userId,
    ],
  );
  // Coordinates are business location, not visitor data; still kept out of audit metadata.
  await memberAudit(tx, actor, 'branch.geofence', 'branch', branchId, { mode: input.mode, radiusM });
  return rows[0]!.policy_version;
}

// ---------------------------------------------------------------- table QR codes
export interface QrTableRow {
  id: string;
  label: string;
  active: boolean;
  createdAt: string;
  scansThisMonth: number;
}

export async function listQrTables(tx: Tx): Promise<QrTableRow[]> {
  const { rows } = await tx.query(
    `SELECT q.id, q.label, q.active, q.created_at,
            COALESCE((SELECT sum(valid_count) FROM qx.qr_scan_daily s WHERE s.table_id = q.id
                       AND s.local_date >= date_trunc('month', now() AT TIME ZONE 'Europe/Istanbul')::date), 0)::int AS scans
       FROM qx.qr_tables q WHERE q.revoked_at IS NULL ORDER BY q.label`,
  );
  return rows.map((r) => ({ id: r.id, label: r.label, active: r.active, createdAt: r.created_at.toISOString(), scansThisMonth: r.scans }));
}

/** The raw token is generated by the caller and shown once (in the QR URL); only its hash is stored. */
export async function createQrTable(tx: Tx, actor: Actor, label: string, tokenHash: string): Promise<string> {
  const branchId = await primaryBranchId(tx);
  try {
    const { rows } = await tx.query<{ id: string }>(
      'INSERT INTO qx.qr_tables (tenant_id, branch_id, label, token_hash) VALUES ($1, $2, $3, $4) RETURNING id',
      [actor.tenantId, branchId, label, tokenHash],
    );
    await memberAudit(tx, actor, 'qr_table.create', 'qr_table', rows[0]!.id, { label });
    return rows[0]!.id;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError('token collision');
    throw err;
  }
}

/** Rotating a token invalidates printed codes for that table; scans then count as plain 'qr'. */
export async function rotateQrTable(tx: Tx, actor: Actor, id: string, tokenHash: string) {
  const { rowCount } = await tx.query('UPDATE qx.qr_tables SET token_hash = $2, active = true WHERE id = $1 AND revoked_at IS NULL', [id, tokenHash]);
  if (!rowCount) throw new NotFoundError('qr table');
  await memberAudit(tx, actor, 'qr_table.rotate', 'qr_table', id);
}

export async function revokeQrTable(tx: Tx, actor: Actor, id: string) {
  const { rowCount } = await tx.query('UPDATE qx.qr_tables SET active = false, revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [id]);
  if (!rowCount) throw new NotFoundError('qr table');
  await memberAudit(tx, actor, 'qr_table.revoke', 'qr_table', id);
}

// ---------------------------------------------------------------- analytics (aggregate only)
/**
 * A QR scan is a landing from a table code or the general code (`?src=qr`), counted once per browser session
 * (OD-11). Direct visits (typed or shared link) are reported apart and never counted as scans (PRD, AC #8).
 * Months and days are Europe/Istanbul calendar buckets.
 */
export async function scanSummary(tx: Tx) {
  const totals = await tx.query(
    `SELECT COALESCE(sum(valid_count) FILTER (WHERE source IN ('table', 'qr')), 0)::int AS all_time,
            COALESCE(sum(valid_count) FILTER (WHERE source IN ('table', 'qr')
              AND local_date >= date_trunc('month', now() AT TIME ZONE 'Europe/Istanbul')::date), 0)::int AS this_month,
            to_char(now() AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM') AS month
       FROM qx.qr_scan_daily`,
  );
  const monthly = await tx.query(
    `SELECT to_char(date_trunc('month', local_date), 'YYYY-MM') AS month,
            COALESCE(sum(valid_count) FILTER (WHERE source = 'table'), 0)::int AS table_scans,
            COALESCE(sum(valid_count) FILTER (WHERE source = 'qr'), 0)::int AS qr_scans,
            COALESCE(sum(valid_count) FILTER (WHERE source = 'direct'), 0)::int AS direct_visits
       FROM qx.qr_scan_daily GROUP BY 1 ORDER BY 1 DESC LIMIT 12`,
  );
  const daily = await tx.query(
    `SELECT to_char(local_date, 'YYYY-MM-DD') AS day,
            COALESCE(sum(valid_count) FILTER (WHERE source IN ('table', 'qr')), 0)::int AS total,
            COALESCE(sum(valid_count) FILTER (WHERE source = 'direct'), 0)::int AS direct
       FROM qx.qr_scan_daily WHERE local_date >= (now() AT TIME ZONE 'Europe/Istanbul')::date - 29
      GROUP BY local_date ORDER BY local_date`,
  );
  const t = totals.rows[0]!;
  return {
    month: t.month as string,
    thisMonth: t.this_month as number,
    allTime: t.all_time as number,
    monthly: monthly.rows.map((r) => ({
      month: r.month as string,
      table: r.table_scans as number,
      qr: r.qr_scans as number,
      total: (r.table_scans as number) + (r.qr_scans as number),
      direct: r.direct_visits as number,
    })),
    last30Days: daily.rows as { day: string; total: number; direct: number }[],
  };
}

export async function topItems(tx: Tx, days = 30, limit = 10) {
  const { rows } = await tx.query(
    `SELECT a.entity_id AS id, p.name, sum(a.count)::int AS views
       FROM qx.analytics_daily a JOIN qx.products p ON p.id = a.entity_id
      WHERE a.metric = 'item_view' AND a.local_date >= (now() AT TIME ZONE 'Europe/Istanbul')::date - $1::int
      GROUP BY a.entity_id, p.name ORDER BY views DESC LIMIT $2`,
    [days, limit],
  );
  const metrics = await tx.query(
    `SELECT metric, sum(count)::int AS total FROM qx.analytics_daily
      WHERE local_date >= (now() AT TIME ZONE 'Europe/Istanbul')::date - $1::int GROUP BY metric`,
    [days],
  );
  return {
    topItems: rows as { id: string; name: string; views: number }[],
    metrics: Object.fromEntries(metrics.rows.map((r) => [r.metric as string, r.total as number])) as Record<string, number>,
  };
}

// ---------------------------------------------------------------- team
export async function listMembers(tx: Tx) {
  const members = await tx.query(
    `SELECT m.user_id, m.role, m.created_at, u.email, u.display_name FROM qx.memberships m JOIN qx.users u ON u.id = m.user_id
      WHERE m.revoked_at IS NULL ORDER BY CASE m.role WHEN 'OWNER' THEN 0 WHEN 'MANAGER' THEN 1 ELSE 2 END, m.created_at`,
  );
  const invites = await tx.query(
    `SELECT id, email, role, created_at, expires_at FROM qx.member_invites
      WHERE accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC`,
  );
  return {
    members: members.rows.map((r) => ({
      userId: r.user_id as string,
      role: r.role as MemberRole,
      email: r.email as string | null,
      displayName: r.display_name as string | null,
      since: (r.created_at as Date).toISOString(),
    })),
    invites: invites.rows.map((r) => ({
      id: r.id as string,
      email: r.email as string,
      role: r.role as MemberRole,
      createdAt: (r.created_at as Date).toISOString(),
      expiresAt: (r.expires_at as Date).toISOString(),
    })),
  };
}

export async function createInvite(tx: Tx, actor: Actor, input: { email: string; role: 'MANAGER' | 'STAFF'; tokenHash: string; ttlHours: number }) {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO qx.member_invites (tenant_id, email, role, token_hash, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(hours => $6)) RETURNING id`,
    [actor.tenantId, input.email, input.role, input.tokenHash, actor.userId, input.ttlHours],
  );
  await memberAudit(tx, actor, 'member.invite', 'invite', rows[0]!.id, { role: input.role });
  return rows[0]!.id;
}

export async function revokeInvite(tx: Tx, actor: Actor, id: string) {
  const { rowCount } = await tx.query('UPDATE qx.member_invites SET revoked_at = now() WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL', [id]);
  if (!rowCount) throw new NotFoundError('invite');
  await memberAudit(tx, actor, 'member.invite_revoke', 'invite', id);
}

/** Owners cannot be removed here (ownership transfer is a separate, audited platform flow). */
export async function revokeMember(tx: Tx, actor: Actor, userId: string) {
  if (userId === actor.userId) throw new ConflictError('cannot remove yourself');
  const { rowCount } = await tx.query(
    `UPDATE qx.memberships SET revoked_at = now() WHERE user_id = $1 AND role <> 'OWNER' AND revoked_at IS NULL`,
    [userId],
  );
  if (!rowCount) throw new NotFoundError('member');
  await memberAudit(tx, actor, 'member.revoke', 'user', userId);
}

/**
 * Runs under the `auth` role (db.withAuth(userId)). qx.accept_invite looks the invite up
 * by token hash only and joins the signed-in user to exactly that invite's tenant.
 */
export async function acceptInvite(tx: Tx, tokenHash: string): Promise<string | null> {
  const { rows } = await tx.query<{ tenant_id: string | null }>('SELECT qx.accept_invite($1) AS tenant_id', [tokenHash]);
  return rows[0]?.tenant_id ?? null;
}

// ---------------------------------------------------------------- PDF export jobs
export async function requestPdfExport(tx: Tx, actor: Actor, input: { exportType: 'MENU_A4' | 'ALLERGEN_A4'; includeSoldOut: boolean }) {
  const branchId = await primaryBranchId(tx);
  const pub = await tx.query<{ revision_no: number }>('SELECT revision_no FROM qx.menu_publications WHERE branch_id = $1', [branchId]);
  if (!pub.rows[0]) throw new ConflictError('menu is not published');
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO qx.pdf_export_jobs (tenant_id, branch_id, revision_no, export_type, include_sold_out, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [actor.tenantId, branchId, pub.rows[0].revision_no, input.exportType, input.includeSoldOut, actor.userId],
  );
  const id = rows[0]!.id;
  await tx.query(`INSERT INTO qx.outbox_events (tenant_id, type, payload, idempotency_key) VALUES ($1, 'pdf.requested', $2, $3)`, [
    actor.tenantId,
    JSON.stringify({ jobId: id }),
    `pdf:${id}`,
  ]);
  await memberAudit(tx, actor, 'pdf.request', 'pdf_export', id, { exportType: input.exportType });
  return id;
}

export async function listPdfExports(tx: Tx) {
  const { rows } = await tx.query(
    `SELECT id, revision_no, export_type, include_sold_out, status, file_key, error, created_at, generated_at, expires_at
       FROM qx.pdf_export_jobs ORDER BY created_at DESC LIMIT 20`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    revisionNo: r.revision_no as number,
    exportType: r.export_type as 'MENU_A4' | 'ALLERGEN_A4',
    includeSoldOut: r.include_sold_out as boolean,
    status: r.status as string,
    ready: r.status === 'READY' && !!r.file_key && (!r.expires_at || (r.expires_at as Date) > new Date()),
    fileKey: r.file_key as string | null,
    error: r.error as string | null,
    createdAt: (r.created_at as Date).toISOString(),
  }));
}

/** File key of a READY, unexpired export in this tenant (RLS), or null. */
export async function pdfExportFileKey(tx: Tx, id: string): Promise<{ fileKey: string; exportType: string; revisionNo: number } | null> {
  const { rows } = await tx.query(
    `SELECT file_key, export_type, revision_no FROM qx.pdf_export_jobs
      WHERE id = $1 AND status = 'READY' AND file_key IS NOT NULL AND (expires_at IS NULL OR expires_at > now())`,
    [id],
  );
  const r = rows[0];
  return r ? { fileKey: r.file_key as string, exportType: r.export_type as string, revisionNo: r.revision_no as number } : null;
}

// ---------------------------------------------------------------- license (read-only for tenant)
export async function tenantLicenseGrants(tx: Tx) {
  const { rows } = await tx.query(
    `SELECT starts_at, ends_at, revoked_at FROM qx.license_grants ORDER BY created_at DESC LIMIT 20`,
  );
  return rows.map((r) => ({
    startsAt: (r.starts_at as Date).toISOString(),
    endsAt: (r.ends_at as Date).toISOString(),
    revoked: !!r.revoked_at,
  }));
}
