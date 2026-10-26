'use client';
import { use, useState } from 'react';
import { Ban, CalendarPlus, CircleCheck, ExternalLink, XCircle } from 'lucide-react';
import { Badge, Banner, Button, Card, IconButton, Section, Stat, useToast } from '@qmenux/ui';
import { AuditList } from '@/components/audit-list';
import { GrantSheet } from '@/components/grant-sheet';
import { Page } from '@/components/page';
import { ReasonDialog } from '@/components/reason-dialog';
import { useIsAdmin } from '@/components/session';
import { Loadable, ReadOnlyNote } from '@/components/states';
import { LicenseBadge, LicenseEnds, TenantStatusBadge } from '@/components/tenant-badges';
import { api, useApi } from '@/lib/api';
import { LICENSE_LABELS, ROLE_LABELS, businessTypeLabel, formatCount, formatDate, formatDateTime, formatMonth, themeLabel } from '@/lib/format';
import type { AuditEntry, LicenseGrant, TenantDetail } from '@/lib/types';

type Action = { kind: 'revoke'; grant: LicenseGrant } | { kind: 'suspend' } | { kind: 'unsuspend' };

/** UI_UX.md journey: tenant search → details → extend → confirmation + reason + audit. */
export default function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isAdmin = useIsAdmin();
  const toast = useToast();
  const q = useApi<TenantDetail>(`control/tenants/${id}`);
  const audit = useApi<{ entries: AuditEntry[] }>(`control/audit?tenantId=${id}`);
  const [granting, setGranting] = useState(false);
  const [action, setAction] = useState<Action | null>(null);

  const refresh = () => {
    void q.reload();
    void audit.reload();
  };

  return (
    <Page title={q.data?.displayName ?? 'İşletme'} subtitle={q.data ? q.data.slug : undefined} back="/tenants">
      {!isAdmin && <ReadOnlyNote />}
      <Loadable q={q} rows={6}>
        {(t) => {
          const now = Date.now();
          const open = t.grants.filter((g) => !g.revokedAt);
          // The period in effect right now, and the latest end among all open periods (extensions chain after it).
          const current = open.find((g) => new Date(g.startsAt).getTime() <= now && new Date(g.endsAt).getTime() > now) ?? null;
          const live = open.length > 0 ? open.reduce((a, b) => (new Date(a.endsAt) > new Date(b.endsAt) ? a : b)) : null;
          const endsAt = live && new Date(live.endsAt).getTime() > now ? live.endsAt : (open[0]?.endsAt ?? null);
          const canGrant = isAdmin && (t.status === 'ACTIVE' || t.status === 'APPROVED');
          const grantState = (g: LicenseGrant): 'revoked' | 'current' | 'planned' | 'past' =>
            g.revokedAt ? 'revoked' : new Date(g.endsAt).getTime() <= now ? 'past' : new Date(g.startsAt).getTime() > now ? 'planned' : 'current';
          return (
            <>
              {t.status === 'SUSPENDED' && (
                <Banner tone="danger" title="İşletme askıda">
                  {t.suspendedReason ? `Gerekçe: ${t.suspendedReason.replace(/[.\s]+$/, '')}. ` : ''}Müşteri menüsü ve panel yazma işlemleri kapalı.
                </Banner>
              )}
              {t.status === 'APPROVED' && (
                <Banner tone="warning" title="Onaylı, lisans bekliyor">
                  İşletme sahibi menüsünü hazırlayabilir; lisans tanımlanınca menü yayına açılır.
                </Banner>
              )}

              <Card className="qx-stack qx-stack--tight">
                <div className="qx-between">
                  <span className="qx-section__title">Lisans</span>
                  <LicenseBadge state={t.licenseState} />
                </div>
                <p className="qx-small">
                  <LicenseEnds endsAt={endsAt} state={t.licenseState} />
                </p>
                {canGrant && (
                  <div className="qx-row-actions">
                    <Button variant="primary" icon={<CalendarPlus size={16} />} onClick={() => setGranting(true)}>
                      {current || (live && new Date(live.endsAt).getTime() > now) ? 'Lisansı uzat' : 'Lisans tanımla'}
                    </Button>
                  </div>
                )}
              </Card>

              <Card className="qx-stack qx-stack--tight">
                <div className="qx-between">
                  <span className="qx-section__title">İşletme</span>
                  <TenantStatusBadge status={t.status} />
                </div>
                <dl className="qx-dl">
                  <div>
                    <dt>Tür</dt>
                    <dd>{businessTypeLabel(t.businessType)}</dd>
                  </div>
                  <div>
                    <dt>Tema</dt>
                    <dd>{themeLabel(t.themeId)}</dd>
                  </div>
                  <div>
                    <dt>Onay</dt>
                    <dd className="qx-num">{t.approvedAt ? formatDate(t.approvedAt) : '—'}</dd>
                  </div>
                </dl>
                <div className="qx-row-actions">
                  <a className="qx-btn qx-btn--secondary qx-btn--sm" href={menuUrl(t.slug)} target="_blank" rel="noopener">
                    <ExternalLink size={16} aria-hidden="true" />
                    <span className="qx-btn__label">Menüyü aç</span>
                  </a>
                  {isAdmin && t.status === 'ACTIVE' && (
                    <Button size="sm" variant="danger-ghost" icon={<Ban size={16} />} onClick={() => setAction({ kind: 'suspend' })}>
                      Askıya al
                    </Button>
                  )}
                  {isAdmin && t.status === 'APPROVED' && (
                    <Button size="sm" variant="danger-ghost" icon={<Ban size={16} />} onClick={() => setAction({ kind: 'suspend' })}>
                      Askıya al
                    </Button>
                  )}
                  {isAdmin && t.status === 'SUSPENDED' && (
                    <Button size="sm" variant="primary" icon={<CircleCheck size={16} />} onClick={() => setAction({ kind: 'unsuspend' })}>
                      Askıyı kaldır
                    </Button>
                  )}
                </div>
              </Card>

              <Section title="QR okutma" id="scans">
                <Card className="qx-stack qx-stack--tight">
                  <ScanBars rows={t.monthlyScans} />
                </Card>
              </Section>

              <Section title="Lisans geçmişi" id="grants">
                {t.grants.length === 0 ? (
                  <p className="qx-small qx-muted">Henüz lisans tanımlanmadı.</p>
                ) : (
                  <Card flush>
                    <ul className="qx-list" aria-label="Lisans dönemleri">
                      {t.grants.map((g) => (
                        <li key={g.id} className="qx-item">
                          <span className="qx-item__body">
                            <span className="qx-num">
                              {formatDate(g.startsAt)} – {formatDate(g.endsAt)}
                            </span>
                            <span className="qx-small qx-muted qx-break">
                              {g.grantedBy ? `${g.grantedBy} · ` : ''}
                              {formatDateTime(g.createdAt)}
                              {g.note ? ` · ${g.note}` : ''}
                            </span>
                            {g.revokedAt && (
                              <span className="qx-small qx-break">
                                İptal: {formatDateTime(g.revokedAt)}
                                {g.revokeReason ? ` · ${g.revokeReason}` : ''}
                              </span>
                            )}
                          </span>
                          <span className="qx-item__tools">
                            {grantState(g) === 'revoked' && <Badge tone="danger">İptal</Badge>}
                            {grantState(g) === 'current' && <Badge tone="success">{LICENSE_LABELS.ACTIVE.label}</Badge>}
                            {grantState(g) === 'planned' && <Badge tone="info">Planlı</Badge>}
                            {isAdmin && (grantState(g) === 'current' || grantState(g) === 'planned') && (
                              <IconButton label={`${formatDate(g.startsAt)} – ${formatDate(g.endsAt)} dönemini iptal et`} onClick={() => setAction({ kind: 'revoke', grant: g })}>
                                <XCircle size={18} />
                              </IconButton>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </Section>

              <Section title="Üyeler" id="members">
                {t.members.length === 0 ? (
                  <p className="qx-small qx-muted">Üye yok.</p>
                ) : (
                  <Card flush>
                    <ul className="qx-list" aria-label="Üyeler">
                      {t.members.map((m, i) => (
                        <li key={`${m.email ?? i}`} className="qx-item">
                          <span className="qx-item__body">
                            <strong className="qx-break">{m.displayName || m.email || 'Adsız üye'}</strong>
                            {m.displayName && m.email && <span className="qx-small qx-muted qx-break">{m.email}</span>}
                          </span>
                          <span className="qx-item__tools">
                            <Badge tone={m.role === 'OWNER' ? 'primary' : 'neutral'}>{ROLE_LABELS[m.role] ?? m.role}</Badge>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </Section>

              <Section title="Denetim kaydı" id="audit">
                <Loadable q={audit} rows={3}>
                  {(a) => (a.entries.length === 0 ? <p className="qx-small qx-muted">Bu işletme için kayıt yok.</p> : <AuditList entries={a.entries.slice(0, 20)} label="İşletme denetim kaydı" />)}
                </Loadable>
              </Section>

              <GrantSheet
                tenant={t}
                open={granting}
                onClose={() => setGranting(false)}
                onDone={() => {
                  setGranting(false);
                  toast({ message: current ? 'Lisans uzatıldı.' : 'Lisans tanımlandı. Menü yayına açılabilir.' });
                  refresh();
                }}
              />

              <ReasonDialog
                open={action?.kind === 'revoke'}
                title={action?.kind === 'revoke' ? `${formatDate(action.grant.startsAt)} – ${formatDate(action.grant.endsAt)} dönemi iptal edilsin mi?` : ''}
                description={
                  action?.kind === 'revoke' && grantState(action.grant) === 'planned'
                    ? 'Henüz başlamamış bir dönem. İptal edilirse mevcut dönem bitiminde menü kapanır.'
                    : 'Bu dönem iptal edilince müşteri menüsü hemen kapanır ve işletme değişiklik yapamaz; ek süre uygulanmaz. Geri alınamaz; yeniden erişim için yeni lisans tanımlanır.'
                }
                confirmLabel="Lisansı iptal et"
                onClose={() => setAction(null)}
                onConfirm={async (reason) => {
                  if (action?.kind !== 'revoke') return;
                  await api(`control/tenants/${t.id}/licenses/${action.grant.id}/revoke`, { json: { reason } });
                  setAction(null);
                  toast({ message: 'Lisans iptal edildi.' });
                  refresh();
                }}
              />
              <ReasonDialog
                open={action?.kind === 'suspend'}
                title={`${t.displayName} askıya alınsın mı?`}
                description="Müşteri menüsü kapanır ve işletme paneli salt okunur olur. Lisans süresi işlemeye devam eder; askı kaldırılınca önceki durum geri gelir."
                confirmLabel="Askıya al"
                onClose={() => setAction(null)}
                onConfirm={async (reason) => {
                  await api(`control/tenants/${t.id}/suspend`, { json: { reason } });
                  setAction(null);
                  toast({ message: 'İşletme askıya alındı.' });
                  refresh();
                }}
              />
              <ReasonDialog
                open={action?.kind === 'unsuspend'}
                title="Askı kaldırılsın mı?"
                description="Geçerli lisansı varsa işletme yeniden aktif olur ve menü açılır; yoksa onaylı durumuna döner."
                confirmLabel="Askıyı kaldır"
                tone="primary"
                onClose={() => setAction(null)}
                onConfirm={async (reason) => {
                  await api(`control/tenants/${t.id}/unsuspend`, { json: { reason } });
                  setAction(null);
                  toast({ message: 'Askı kaldırıldı.' });
                  refresh();
                }}
              />
            </>
          );
        }}
      </Loadable>
    </Page>
  );
}

/** Public menu address derived from this host: superman.<root>[:port] → <slug>.<root>[:menuport]. */
function menuUrl(slug: string): string {
  if (typeof window === 'undefined') return '#';
  const { protocol, hostname } = window.location;
  const root = hostname.replace(/^superman\./, '');
  const port = hostname.endsWith('.localhost') ? ':3000' : '';
  return `${protocol}//${slug}.${root}${port}/`;
}

function ScanBars({ rows }: { rows: { month: string; total: number }[] }) {
  if (rows.length === 0) return <p className="qx-small qx-muted">Henüz QR okutma yok.</p>;
  const asc = [...rows].reverse();
  const max = Math.max(1, ...asc.map((r) => r.total));
  const thisMonth = asc[asc.length - 1]!;
  return (
    <>
      <Stat label={formatMonth(thisMonth.month)} value={<span className="qx-num">{formatCount(thisMonth.total)}</span>} meta="QR okutma (masa + genel kod)" />
      {asc.length > 1 && (
      <div className="qx-bars" aria-hidden="true">
        {asc.map((r) => (
          <div key={r.month} className="qx-bars__bar" data-zero={r.total === 0} style={{ height: `${Math.max(4, Math.round((r.total / max) * 100))}%` }} />
        ))}
      </div>
      )}
      <table className="qx-table">
        <caption className="qx-visually-hidden">Aylık QR okutma</caption>
        <thead>
          <tr>
            <th scope="col">Ay</th>
            <th scope="col" className="qx-num">
              Okutma
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 6).map((r) => (
            <tr key={r.month}>
              <td>{formatMonth(r.month)}</td>
              <td className="qx-num">{formatCount(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
