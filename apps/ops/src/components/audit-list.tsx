'use client';
import { Card, List } from '@qmenux/ui';
import { auditLabel, formatDateTime } from '@/lib/format';
import type { AuditEntry } from '@/lib/types';

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const ACTOR: Record<string, string> = { operator: 'Operatör', member: 'İşletme kullanıcısı', user: 'İşletme kullanıcısı', system: 'Sistem' };
const TARGET: Record<string, string> = { tenant: 'işletme', branch: 'şube', product: 'ürün', category: 'kategori', application: 'başvuru', license_grant: 'lisans', qr_table: 'masa QR', member: 'üye', invite: 'davet' };

/** Metadata is shown as plain "key: value" lines; the reason (when present) comes first. */
function Meta({ m }: { m: Record<string, unknown> }) {
  const entries = Object.entries(m).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (entries.length === 0) return null;
  const reason = entries.find(([k]) => k === 'reason');
  const rest = entries.filter(([k]) => k !== 'reason');
  return (
    <>
      {reason && <span className="qx-small qx-break">Gerekçe: {String(reason[1])}</span>}
      {rest.length > 0 && (
        <span className="qx-meta">
          {rest.map(([k, v]) => (
            <span key={k}>
              {k}: {typeof v === 'string' ? (ISO_RE.test(v) ? formatDateTime(v) : v) : JSON.stringify(v)}
            </span>
          ))}
        </span>
      )}
    </>
  );
}

export function AuditList({ entries, label = 'Denetim kaydı' }: { entries: AuditEntry[]; label?: string }) {
  // The API pages by id; within a page, order by time so the newest action is always on top.
  const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <Card flush>
      <List label={label}>
        {sorted.map((e) => (
          <li key={e.id} className="qx-item">
            <span className="qx-item__body">
              <strong className="qx-break">{auditLabel(e.action)}</strong>
              <span className="qx-small qx-muted qx-break">
                <span className="qx-num">{formatDateTime(e.createdAt)}</span> · {ACTOR[e.actorKind] ?? e.actorKind}
                {e.targetType ? ` · ${TARGET[e.targetType] ?? e.targetType}` : ''}
              </span>
              <Meta m={e.metadata ?? {}} />
            </span>
          </li>
        ))}
      </List>
    </Card>
  );
}
