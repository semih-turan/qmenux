'use client';
import { Store } from 'lucide-react';
import { Card, EmptyState, List, ListRow } from '@qmenux/ui';
import { Link } from '@/components/link';
import { LicenseBadge, TenantStatusBadge } from '@/components/tenant-badges';
import { daysUntil, formatCount, formatDate } from '@/lib/format';
import type { TenantSummary } from '@/lib/types';

/** Days left comes first: on a narrow row the end of the line is what gets truncated. */
function subline(t: TenantSummary): string {
  const parts: string[] = [];
  if (t.licenseEndsAt && (t.licenseState === 'ACTIVE' || t.licenseState === 'GRACE')) {
    const d = daysUntil(t.licenseEndsAt);
    parts.push(d >= 0 ? `${d} gün kaldı (${formatDate(t.licenseEndsAt)})` : `${-d} gün önce doldu`);
  }
  parts.push(`${formatCount(t.scansThisMonth)} okutma`, t.slug);
  return parts.join(' · ');
}

export function TenantList({ tenants, emptyTitle, emptyText, label }: { tenants: TenantSummary[]; emptyTitle: string; emptyText?: string; label: string }) {
  if (tenants.length === 0)
    return (
      <Card>
        <EmptyState icon={<Store size={28} />} title={emptyTitle}>
          {emptyText}
        </EmptyState>
      </Card>
    );
  return (
    <Card flush>
      <List label={label}>
        {tenants.map((t) => (
          <li key={t.id}>
            <ListRow
              href={`/tenants/${t.id}`}
              Link={Link}
              title={<span className="qx-break">{t.displayName}</span>}
              sub={<span className="qx-break">{subline(t)}</span>}
              trail={
                <span className="qx-item__tools">
                  {t.status !== 'ACTIVE' && <TenantStatusBadge status={t.status} />}
                  <LicenseBadge state={t.licenseState} />
                </span>
              }
              chevron
            />
          </li>
        ))}
      </List>
    </Card>
  );
}
