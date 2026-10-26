'use client';
import type { LicenseStatus } from '@qmenux/contracts';
import { Badge, Card } from '@qmenux/ui';
import { Page } from '@/components/page';
import { Loadable } from '@/components/states';
import { useApi } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { License } from '@/lib/types';

const STATE: Record<LicenseStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral'; text: string }> = {
  NOT_GRANTED: { label: 'Tanımlanmadı', tone: 'neutral', text: 'Menünüzü hazırlayabilirsiniz. Yayınlamak için lisansın QMenuX ekibi tarafından tanımlanması gerekir.' },
  ACTIVE: { label: 'Etkin', tone: 'success', text: 'Menünüz yayında ve tüm özellikler açık.' },
  GRACE: { label: 'Ek süre', tone: 'warning', text: 'Süre doldu. Ek süre boyunca menünüz açık kalır; bu sürede yenileme yapılmazsa menü kapanır.' },
  EXPIRED: { label: 'Süresi doldu', tone: 'danger', text: 'Müşteri menünüz kapalı ve değişiklik yapılamıyor. Verileriniz silinmez.' },
  REVOKED: { label: 'İptal edildi', tone: 'danger', text: 'Lisans QMenuX ekibi tarafından iptal edildi. Müşteri menünüz kapalı.' },
};

const DAY_MS = 86_400_000;

/** Read-only. V1 has no checkout or payment: licences are granted manually by the QMenuX team. */
export default function LicensePage() {
  const q = useApi<License>('admin/license');

  return (
    <Page title="Lisans" back="/more">
      <Loadable q={q} rows={3}>
        {(l) => {
          const s = STATE[l.state];
          const graceEnds = l.endsAt ? new Date(new Date(l.endsAt).getTime() + l.graceDays * DAY_MS).toISOString() : null;
          return (
            <>
              <Card className="qx-stack qx-stack--tight">
                <div className="qx-between">
                  <span className="qx-section__title">Durum</span>
                  <Badge tone={s.tone}>{s.label}</Badge>
                </div>
                <p className="qx-small">{s.text}</p>
                {l.endsAt && (
                  <dl className="qx-dl">
                    <div>
                      <dt>Bitiş</dt>
                      <dd className="qx-num">{formatDate(l.endsAt)}</dd>
                    </div>
                    {(l.state === 'ACTIVE' || l.state === 'GRACE') && graceEnds && l.graceDays > 0 && (
                      <div>
                        <dt>Ek süre sonu</dt>
                        <dd className="qx-num">{formatDate(graceEnds)}</dd>
                      </div>
                    )}
                  </dl>
                )}
              </Card>

              <section className="qx-stack qx-stack--tight" aria-labelledby="grants">
                <h2 id="grants" className="qx-section__title">
                  Geçmiş
                </h2>
                {l.grants.length === 0 ? (
                  <p className="qx-small qx-muted">Henüz lisans tanımlanmadı.</p>
                ) : (
                  <Card flush>
                    <ul className="qx-list" aria-label="Lisans dönemleri">
                      {l.grants.map((g, i) => (
                        <li key={`${g.startsAt}-${i}`} className="qx-item">
                          <span className="qx-item__body qx-num">
                            {formatDate(g.startsAt)} – {formatDate(g.endsAt)}
                          </span>
                          {g.revoked && <Badge tone="danger">İptal</Badge>}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </section>

              <p className="qx-small qx-muted">Panelde ödeme alınmaz ve otomatik yenileme yoktur. Uzatma veya sorularınız için QMenuX ile iletişime geçin.</p>
            </>
          );
        }}
      </Loadable>
    </Page>
  );
}
