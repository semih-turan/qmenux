import { can, type LicenseStatus, type MemberRole, type Permission, type PlatformRole } from '@qmenux/contracts';
import { identity, type Actor, type Db } from '@qmenux/database';
import type { Request } from 'express';
import type { ApiConfig } from '../config.js';
import { hashToken, randomToken } from '../crypto.js';
import { ApiError, forbidden, unauthorized } from '../http/problem.js';
import type { Audience } from './oidc.js';

export interface SessionInfo extends identity.SessionRow {
  tokenHash: string;
}

export interface TenantActor extends Actor {
  role: MemberRole;
  tenantStatus: string;
  license: LicenseStatus;
  slug: string;
}

export interface OperatorActor {
  userId: string;
  role: PlatformRole;
  session: SessionInfo;
}

const BEARER_RE = /^Bearer ([A-Za-z0-9_-]{32,128})$/;

/**
 * Sessions are opaque random tokens held by the first-party BFF in a host-only
 * `__Host-` cookie and forwarded as a bearer token. Only an HMAC is stored.
 */
export class SessionService {
  constructor(
    private readonly cfg: ApiConfig,
    private readonly db: Db,
  ) {}

  async create(userId: string, audience: Audience): Promise<{ id: string; token: string; expiresInS: number }> {
    const token = randomToken();
    const ttl = audience === 'ops' ? this.cfg.sessions.opsTtlS : this.cfg.sessions.adminTtlS;
    const id = await this.db.withAuth(userId, (tx) =>
      identity.createSession(tx, { tokenHash: hashToken(this.cfg.tokenPepper, 'session', token), userId, audience, ttlSeconds: ttl }),
    );
    return { id, token, expiresInS: ttl };
  }

  /** Returns null for absent/expired/idle/revoked sessions or a session of another audience. */
  async resolve(req: Request, audience: Audience): Promise<SessionInfo | null> {
    const m = BEARER_RE.exec(req.headers.authorization ?? '');
    if (!m) return null;
    const tokenHash = hashToken(this.cfg.tokenPepper, 'session', m[1]!);
    const idle = audience === 'ops' ? this.cfg.sessions.opsIdleS : this.cfg.sessions.adminIdleS;
    const s = await this.db.withAuth(null, (tx) => identity.getSessionByTokenHash(tx, tokenHash, idle));
    if (!s || s.audience !== audience) return null;
    return { ...s, tokenHash };
  }

  async require(req: Request, audience: Audience): Promise<SessionInfo> {
    const s = await this.resolve(req, audience);
    if (!s) throw unauthorized();
    return s;
  }

  async revoke(s: SessionInfo) {
    await this.db.withAuth(s.userId, (tx) => identity.revokeSession(tx, s.id));
  }

  /**
   * Resolves the tenant actor once per request from the session's active tenant.
   * Role, tenant status and license state are read server-side; nothing comes from the client.
   */
  async tenantActor(req: Request, permission: Permission, opts: { write?: boolean; licensed?: boolean } = {}): Promise<TenantActor> {
    const s = await this.require(req, 'admin');
    if (!s.activeTenantId) throw new ApiError(409, 'NO_ACTIVE_TENANT', 'Önce bir işletme seçin');
    const ctx = { tenantId: s.activeTenantId, userId: s.userId };
    const row = await this.db.withTenant(ctx, async (tx) => {
      const { rows } = await tx.query(
        `SELECT m.role, t.status, t.slug, qx.license_state(t.id, $2) AS license
           FROM qx.memberships m JOIN qx.tenants t ON t.id = m.tenant_id
          WHERE m.user_id = $1 AND m.revoked_at IS NULL`,
        [s.userId, this.cfg.graceDays],
      );
      return rows[0] as { role: MemberRole; status: string; slug: string; license: LicenseStatus } | undefined;
    });
    // Membership revoked after tenant selection: behave as if the tenant were never selected.
    if (!row) throw new ApiError(409, 'NO_ACTIVE_TENANT', 'Önce bir işletme seçin');
    if (!can(row.role, permission)) throw forbidden();
    if (opts.write && row.status === 'SUSPENDED') throw forbidden('TENANT_SUSPENDED', 'İşletme hesabı askıya alındı');
    if (opts.licensed && row.license !== 'ACTIVE' && row.license !== 'GRACE') throw forbidden('LICENSE_INACTIVE', 'Bu işlem için etkin lisans gerekli');
    return { tenantId: s.activeTenantId, userId: s.userId, role: row.role, tenantStatus: row.status, license: row.license, slug: row.slug };
  }

  /** Operator: platform role + MFA-verified ops session. Hostname is never trusted for this. */
  async operator(req: Request, opts: { adminOnly?: boolean } = {}): Promise<OperatorActor> {
    const s = await this.require(req, 'ops');
    const op = await this.db.withAuth(s.userId, (tx) => identity.getOperator(tx, s.userId));
    if (!op) throw forbidden();
    if (!s.mfaVerifiedAt) throw forbidden('MFA_REQUIRED', 'İki adımlı doğrulama gerekli');
    if (opts.adminOnly && op.role !== 'PLATFORM_ADMIN') throw forbidden();
    return { userId: s.userId, role: op.role, session: s };
  }
}
