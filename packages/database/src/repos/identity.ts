import type { AuthProvider, MemberRole, PlatformRole } from '@qmenux/contracts';
import type pg from 'pg';
import type { Tx } from '../db.js';
import { isUniqueViolation } from '../db.js';

/** All functions here run under the `auth` role (db.withAuth). */

export interface UserRow {
  id: string;
  email: string | null;
  displayName: string | null;
  disabledAt: string | null;
}

/**
 * Links by (provider, issuer, subject) ONLY. Emails are never used to merge
 * accounts (an unverified/recycled email must not grant access to another user).
 */
export async function findOrCreateUserByIdentity(
  tx: Tx,
  id: { provider: AuthProvider; issuer: string; subject: string; email: string | null; emailVerified: boolean; name: string | null },
): Promise<UserRow & { created: boolean }> {
  const existing = await tx.query(
    `SELECT u.id, u.email, u.display_name, u.disabled_at FROM qx.auth_identities i JOIN qx.users u ON u.id = i.user_id
      WHERE i.provider = $1 AND i.issuer = $2 AND i.subject = $3`,
    [id.provider, id.issuer, id.subject],
  );
  if (existing.rows[0]) {
    const r = existing.rows[0];
    return { id: r.id, email: r.email, displayName: r.display_name, disabledAt: r.disabled_at, created: false };
  }
  const user = await tx.query<{ id: string }>(
    'INSERT INTO qx.users (email, email_verified, display_name) VALUES ($1, $2, $3) RETURNING id',
    [id.email, id.emailVerified, id.name],
  );
  const userId = user.rows[0]!.id;
  await tx.query(
    `INSERT INTO qx.auth_identities (user_id, provider, issuer, subject, email_at_link) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (provider, issuer, subject) DO NOTHING`,
    [userId, id.provider, id.issuer, id.subject, id.email],
  );
  // Lost a race: another request created the identity first. Use that one.
  const winner = await tx.query(
    `SELECT u.id, u.email, u.display_name, u.disabled_at FROM qx.auth_identities i JOIN qx.users u ON u.id = i.user_id
      WHERE i.provider = $1 AND i.issuer = $2 AND i.subject = $3`,
    [id.provider, id.issuer, id.subject],
  );
  const w = winner.rows[0]!;
  return { id: w.id, email: w.email, displayName: w.display_name, disabledAt: w.disabled_at, created: w.id === userId };
}

// ---------------------------------------------------------------- OIDC flows
export async function saveOidcFlow(
  tx: Tx,
  f: { stateHash: string; provider: string; audience: 'admin' | 'ops'; codeVerifier: string; nonce: string; returnTo: string | null; ttlSeconds: number },
) {
  await tx.query(
    `INSERT INTO qx.oidc_flows (state_hash, provider, audience, code_verifier, nonce, return_to, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(secs => $7))`,
    [f.stateHash, f.provider, f.audience, f.codeVerifier, f.nonce, f.returnTo, f.ttlSeconds],
  );
}

/** Single use: marks consumed atomically; expired or replayed states return null. */
export async function consumeOidcFlow(tx: Tx, stateHash: string) {
  const { rows } = await tx.query(
    `UPDATE qx.oidc_flows SET consumed_at = now()
      WHERE state_hash = $1 AND consumed_at IS NULL AND expires_at > now()
      RETURNING provider, audience, code_verifier, nonce, return_to`,
    [stateHash],
  );
  const r = rows[0];
  return r
    ? { provider: r.provider as AuthProvider, audience: r.audience as 'admin' | 'ops', codeVerifier: r.code_verifier as string, nonce: r.nonce as string, returnTo: r.return_to as string | null }
    : null;
}

// ---------------------------------------------------------------- sessions
export interface SessionRow {
  id: string;
  userId: string;
  audience: 'admin' | 'ops';
  activeTenantId: string | null;
  mfaVerifiedAt: Date | null;
  expiresAt: Date;
  email: string | null;
  displayName: string | null;
}

export async function createSession(tx: Tx, s: { tokenHash: string; userId: string; audience: 'admin' | 'ops'; ttlSeconds: number }): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO qx.sessions (token_hash, user_id, audience, expires_at) VALUES ($1, $2, $3, now() + make_interval(secs => $4)) RETURNING id`,
    [s.tokenHash, s.userId, s.audience, s.ttlSeconds],
  );
  return rows[0]!.id;
}

export async function getSessionByTokenHash(tx: Tx, tokenHash: string, idleSeconds: number): Promise<SessionRow | null> {
  const { rows } = await tx.query(
    `UPDATE qx.sessions s SET last_seen_at = now()
       FROM qx.users u
      WHERE s.token_hash = $1 AND u.id = s.user_id AND s.revoked_at IS NULL AND s.expires_at > now()
        AND s.last_seen_at > now() - make_interval(secs => $2) AND u.disabled_at IS NULL
      RETURNING s.id, s.user_id, s.audience, s.active_tenant_id, s.mfa_verified_at, s.expires_at, u.email, u.display_name`,
    [tokenHash, idleSeconds],
  );
  const r = rows[0];
  return r
    ? {
        id: r.id,
        userId: r.user_id,
        audience: r.audience,
        activeTenantId: r.active_tenant_id,
        mfaVerifiedAt: r.mfa_verified_at,
        expiresAt: r.expires_at,
        email: r.email,
        displayName: r.display_name,
      }
    : null;
}

export async function revokeSession(tx: Tx, sessionId: string) {
  await tx.query('UPDATE qx.sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [sessionId]);
}

export async function markSessionMfa(tx: Tx, sessionId: string) {
  await tx.query('UPDATE qx.sessions SET mfa_verified_at = now() WHERE id = $1', [sessionId]);
}

/** Only succeeds when the session user has an active membership in that tenant. */
export async function setActiveTenant(tx: Tx, sessionId: string, userId: string, tenantId: string): Promise<MemberRole | null> {
  const m = await tx.query<{ role: MemberRole }>(
    'SELECT role FROM qx.memberships WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL',
    [tenantId, userId],
  );
  if (!m.rows[0]) return null;
  await tx.query('UPDATE qx.sessions SET active_tenant_id = $2 WHERE id = $1 AND user_id = $3', [sessionId, tenantId, userId]);
  return m.rows[0].role;
}

export interface MembershipRow {
  tenantId: string;
  slug: string;
  displayName: string;
  status: string;
  role: MemberRole;
}

export async function listMemberships(tx: Tx, userId: string): Promise<MembershipRow[]> {
  const { rows } = await tx.query(
    `SELECT t.id, t.slug, t.display_name, t.status, m.role FROM qx.memberships m JOIN qx.tenants t ON t.id = m.tenant_id
      WHERE m.user_id = $1 AND m.revoked_at IS NULL ORDER BY t.display_name`,
    [userId],
  );
  return rows.map((r) => ({ tenantId: r.id, slug: r.slug, displayName: r.display_name, status: r.status, role: r.role }));
}

export async function getMembershipRole(tx: Tx, userId: string, tenantId: string): Promise<MemberRole | null> {
  const { rows } = await tx.query<{ role: MemberRole }>(
    'SELECT role FROM qx.memberships WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL',
    [userId, tenantId],
  );
  return rows[0]?.role ?? null;
}

// ---------------------------------------------------------------- operators
export interface OperatorRow {
  userId: string;
  role: PlatformRole;
  totpSecretCiphertext: string | null;
  totpEnrolledAt: Date | null;
  totpLastStep: number | null;
}

export async function getOperator(tx: Tx, userId: string): Promise<OperatorRow | null> {
  const { rows } = await tx.query(
    'SELECT user_id, role, totp_secret_ciphertext, totp_enrolled_at, totp_last_step FROM qx.platform_operators WHERE user_id = $1 AND disabled_at IS NULL',
    [userId],
  );
  const r = rows[0];
  return r
    ? { userId: r.user_id, role: r.role, totpSecretCiphertext: r.totp_secret_ciphertext, totpEnrolledAt: r.totp_enrolled_at, totpLastStep: r.totp_last_step === null ? null : Number(r.totp_last_step) }
    : null;
}

export async function setOperatorTotp(tx: Tx, userId: string, ciphertext: string, enrolled: boolean) {
  await tx.query(
    'UPDATE qx.platform_operators SET totp_secret_ciphertext = $2, totp_enrolled_at = CASE WHEN $3 THEN now() ELSE NULL END WHERE user_id = $1',
    [userId, ciphertext, enrolled],
  );
}

/** Replay protection: a TOTP time-step can be used at most once. */
export async function consumeTotpStep(tx: Tx, userId: string, step: number): Promise<boolean> {
  const { rowCount } = await tx.query(
    'UPDATE qx.platform_operators SET totp_last_step = $2 WHERE user_id = $1 AND (totp_last_step IS NULL OR totp_last_step < $2)',
    [userId, step],
  );
  return rowCount === 1;
}

// ---------------------------------------------------------------- applications (applicant side)
export interface ApplicationRow {
  id: string;
  businessName: string;
  slug: string;
  businessType: string;
  city: string;
  contactPhone: string;
  note: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  submittedAt: string;
  reviewedAt: string | null;
  decisionReason: string | null;
  applicantEmail?: string | null;
  applicantName?: string | null;
}

export function mapApplication(r: pg.QueryResultRow): ApplicationRow {
  return {
    id: r.id,
    businessName: r.business_name,
    slug: r.slug,
    businessType: r.business_type,
    city: r.city,
    contactPhone: r.contact_phone,
    note: r.note,
    status: r.status,
    submittedAt: r.submitted_at.toISOString(),
    reviewedAt: r.reviewed_at ? r.reviewed_at.toISOString() : null,
    decisionReason: r.decision_reason,
    applicantEmail: r.applicant_email,
    applicantName: r.applicant_name,
  };
}

export async function listOwnApplications(tx: Tx, userId: string): Promise<ApplicationRow[]> {
  const { rows } = await tx.query('SELECT * FROM qx.tenant_applications WHERE applicant_user_id = $1 ORDER BY submitted_at DESC', [userId]);
  return rows.map(mapApplication);
}

export async function slugTaken(tx: Tx, slug: string): Promise<boolean> {
  // The auth role cannot read other tenants' rows; qx.slug_taken answers a yes/no only.
  const { rows } = await tx.query<{ taken: boolean }>('SELECT qx.slug_taken($1) AS taken', [slug]);
  return !!rows[0]?.taken;
}

/** Submitting an application never creates a tenant; a superadmin must approve it. */
export async function submitApplication(
  tx: Tx,
  userId: string,
  a: { businessName: string; slug: string; businessType: string; contactPhone: string; city: string; note?: string | null; acceptedTermsVersion: string },
): Promise<ApplicationRow | 'SLUG_TAKEN' | 'ALREADY_PENDING'> {
  if (await slugTaken(tx, a.slug)) return 'SLUG_TAKEN';
  try {
    const { rows } = await tx.query(
      `INSERT INTO qx.tenant_applications (applicant_user_id, business_name, slug, business_type, contact_phone, city, note, accepted_terms_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [userId, a.businessName, a.slug, a.businessType, a.contactPhone, a.city, a.note ?? null, a.acceptedTermsVersion],
    );
    return mapApplication(rows[0]!);
  } catch (err) {
    if (isUniqueViolation(err)) {
      const constraint = (err as { constraint?: string }).constraint;
      return constraint === 'tenant_applications_pending_user' ? 'ALREADY_PENDING' : 'SLUG_TAKEN';
    }
    throw err;
  }
}

export async function withdrawApplication(tx: Tx, userId: string, applicationId: string): Promise<boolean> {
  const { rowCount } = await tx.query(
    `UPDATE qx.tenant_applications SET status = 'WITHDRAWN' WHERE id = $1 AND applicant_user_id = $2 AND status = 'PENDING'`,
    [applicationId, userId],
  );
  return rowCount === 1;
}
