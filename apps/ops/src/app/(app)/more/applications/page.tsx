'use client';
import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { Badge, Button, Card, EmptyState, List, Segmented, useToast } from '@qmenux/ui';
import { Link } from '@/components/link';
import { Page } from '@/components/page';
import { ReasonDialog } from '@/components/reason-dialog';
import { useIsAdmin } from '@/components/session';
import { Loadable, ReadOnlyNote } from '@/components/states';
import { api, useApi } from '@/lib/api';
import { APPLICATION_LABELS, businessTypeLabel, formatCount, formatDateTime } from '@/lib/format';
import type { Application, ApplicationStatus } from '@/lib/types';

type View = ApplicationStatus | 'ALL';
const VIEWS: { value: View; label: string }[] = [
  { value: 'PENDING', label: 'Bekleyen' },
  { value: 'APPROVED', label: 'Onaylı' },
  { value: 'REJECTED', label: 'Red' },
  { value: 'ALL', label: 'Tümü' },
];

type Decision = { app: Application; kind: 'approve' | 'reject' };

/**
 * Application queue (ONB-002: approvals are privileged, audited and idempotent). Approval creates
 * an APPROVED tenant whose menu stays offline until a licence is granted; nothing is charged.
 */
export default function ApplicationsPage() {
  const isAdmin = useIsAdmin();
  const toast = useToast();
  const [view, setView] = useState<View>('PENDING');
  const q = useApi<{ applications: Application[] }>(`control/applications?status=${view}`);
  const [decision, setDecision] = useState<Decision | null>(null);

  return (
    <Page title="Başvurular" back="/more" subtitle={q.data ? `${formatCount(q.data.applications.length)} kayıt` : undefined}>
      <Segmented label="Durum" value={view} options={VIEWS} onChange={setView} />
      {!isAdmin && <ReadOnlyNote />}
      <Loadable q={q} rows={4}>
        {(d) =>
          d.applications.length === 0 ? (
            <Card>
              <EmptyState icon={<Inbox size={28} />} title={view === 'PENDING' ? 'Bekleyen başvuru yok' : 'Bu durumda başvuru yok'}>
                {view === 'PENDING' ? 'Yeni başvurular burada görünür.' : undefined}
              </EmptyState>
            </Card>
          ) : (
            <Card flush>
              <List label="Başvurular">
                {d.applications.map((a) => {
                  const s = APPLICATION_LABELS[a.status];
                  return (
                    <li key={a.id} className="qx-item">
                      <span className="qx-item__body">
                        <span className="qx-between">
                          <strong className="qx-break">{a.businessName}</strong>
                          <Badge tone={s.tone}>{s.label}</Badge>
                        </span>
                        <span className="qx-small qx-muted qx-break">
                          {a.slug} · {businessTypeLabel(a.businessType)} · {a.city}
                        </span>
                        <span className="qx-small qx-muted qx-break">
                          {a.applicantName || a.applicantEmail || 'Başvuran bilinmiyor'}
                          {a.applicantName && a.applicantEmail ? ` · ${a.applicantEmail}` : ''} · {a.contactPhone}
                        </span>
                        <span className="qx-small qx-muted">
                          Gönderim: <span className="qx-num">{formatDateTime(a.submittedAt)}</span>
                          {a.reviewedAt ? ` · Karar: ${formatDateTime(a.reviewedAt)}` : ''}
                        </span>
                        {a.note && <span className="qx-small qx-break">Not: {a.note}</span>}
                        {a.decisionReason && <span className="qx-small qx-break">Gerekçe: {a.decisionReason}</span>}
                        {a.status === 'PENDING' && isAdmin && (
                          <span className="qx-row-actions">
                            <Button size="sm" variant="primary" onClick={() => setDecision({ app: a, kind: 'approve' })}>
                              Onayla
                            </Button>
                            <Button size="sm" variant="danger-ghost" onClick={() => setDecision({ app: a, kind: 'reject' })}>
                              Reddet
                            </Button>
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </List>
            </Card>
          )
        }
      </Loadable>
      <p className="qx-small qx-muted">
        Onay, işletmeyi açar ama menüyü yayına almaz; bunun için <Link href="/licenses">lisans</Link> tanımlanmalıdır.
      </p>

      <ReasonDialog
        open={decision !== null}
        title={decision?.kind === 'approve' ? `${decision.app.businessName} onaylansın mı?` : `${decision?.app.businessName ?? 'Başvuru'} reddedilsin mi?`}
        description={
          decision?.kind === 'approve'
            ? `${decision.app.slug} adresiyle bir işletme oluşturulur ve başvuran sahip olur. Menü, lisans tanımlanana kadar kapalı kalır.`
            : 'Başvuran panelde gerekçeyi görmez; yalnızca durumun reddedildiğini görür. Aynı kişi yeniden başvurabilir.'
        }
        confirmLabel={decision?.kind === 'approve' ? 'Onayla' : 'Reddet'}
        tone={decision?.kind === 'approve' ? 'primary' : 'danger'}
        onClose={() => setDecision(null)}
        onConfirm={async (reason) => {
          if (!decision) return;
          const r = await api<{ tenantId?: string }>(`control/applications/${decision.app.id}/${decision.kind}`, { json: { reason } });
          setDecision(null);
          toast({ message: decision.kind === 'approve' ? 'Başvuru onaylandı. Lisans tanımlayınca menü yayına açılır.' : 'Başvuru reddedildi.' });
          void q.reload();
          if (decision.kind === 'approve' && r.tenantId) window.location.assign(`/tenants/${r.tenantId}`);
        }}
      />
    </Page>
  );
}
