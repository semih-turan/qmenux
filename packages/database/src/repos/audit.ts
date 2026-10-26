import type { Tx } from '../db.js';

export interface AuditEntry {
  tenantId: string | null;
  actorUserId: string | null;
  actorKind: 'member' | 'operator' | 'system';
  action: string;
  targetType?: string;
  targetId?: string;
  /** Never put secrets (Wi-Fi passwords, tokens, provider claims) here. */
  metadata?: Record<string, unknown>;
  correlationId?: string;
}

const FORBIDDEN_KEYS = /password|secret|token|ciphertext|code_verifier|nonce/i;

function scrub(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) out[k] = FORBIDDEN_KEYS.test(k) ? '[redacted]' : v;
  return out;
}

export async function audit(tx: Tx, e: AuditEntry): Promise<void> {
  await tx.query(
    `INSERT INTO qx.audit_logs (tenant_id, actor_user_id, actor_kind, action, target_type, target_id, metadata, correlation_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      e.tenantId,
      e.actorUserId,
      e.actorKind,
      e.action,
      e.targetType ?? null,
      e.targetId ?? null,
      JSON.stringify(scrub(e.metadata ?? {})),
      e.correlationId ?? null,
    ],
  );
}

export interface AuditRow {
  id: string;
  action: string;
  actorUserId: string | null;
  actorKind: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export async function listAudit(tx: Tx, opts: { tenantId?: string; limit?: number; before?: string } = {}): Promise<AuditRow[]> {
  const { rows } = await tx.query(
    `SELECT id::text, action, actor_user_id, actor_kind, target_type, target_id, metadata, created_at
       FROM qx.audit_logs
      WHERE ($1::uuid IS NULL OR tenant_id = $1) AND ($2::bigint IS NULL OR id < $2)
      ORDER BY id DESC LIMIT $3`,
    [opts.tenantId ?? null, opts.before ?? null, Math.min(opts.limit ?? 50, 200)],
  );
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    actorUserId: r.actor_user_id,
    actorKind: r.actor_kind,
    targetType: r.target_type,
    targetId: r.target_id,
    metadata: r.metadata,
    createdAt: r.created_at.toISOString(),
  }));
}
