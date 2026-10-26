'use client';
import { Badge } from '@qmenux/ui';
import type { LicenseStatus, TenantStatus } from '@qmenux/contracts';
import { LICENSE_LABELS, TENANT_LABELS, daysUntil, formatDate } from '@/lib/format';

export function TenantStatusBadge({ status }: { status: TenantStatus }) {
  const s = TENANT_LABELS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function LicenseBadge({ state }: { state: LicenseStatus }) {
  const s = LICENSE_LABELS[state];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** "Bitiş: 12 Kasım 2026 (16 gün)" — the day count is what an operator scans for. */
export function LicenseEnds({ endsAt, state }: { endsAt: string | null; state: LicenseStatus }) {
  if (!endsAt) return <>Lisans tanımlanmadı</>;
  const d = daysUntil(endsAt);
  const rel = d > 0 ? `${d} gün kaldı` : d === 0 ? 'bugün doluyor' : `${-d} gün önce doldu`;
  const prefix = state === 'REVOKED' ? 'İptal edildi · bitişti' : 'Bitiş';
  return (
    <>
      {prefix}: <span className="qx-num">{formatDate(endsAt)}</span> ({rel})
    </>
  );
}
