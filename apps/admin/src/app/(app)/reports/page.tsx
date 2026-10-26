'use client';
import { BarChart3, Lock } from 'lucide-react';
import { Card, EmptyState, Stat } from '@qmenux/ui';
import { Page } from '@/components/page';
import { useCan } from '@/components/session';
import { Loadable } from '@/components/states';
import { useApi } from '@/lib/api';
import { fillDays } from '@/lib/analytics';
import { formatCount } from '@/lib/format';
import type { Analytics } from '@/lib/types';

const METRIC_LABELS: Record<string, string> = {
  item_view: 'Ürün görüntüleme',
  category_view: 'Kategori görüntüleme',
  search: 'Arama',
  wifi_reveal: 'Wi-Fi bilgisi açıldı',
  whatsapp_click: 'WhatsApp tıklaması',
  pdf_download: 'PDF indirme',
};

const dayLabel = (day: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
const monthLabel = (month: string) => new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));

export default function ReportsPage() {
  const allowed = useCan('analytics.read');
  const q = useApi<Analytics>(allowed ? 'admin/analytics/summary?days=30' : null);

  if (!allowed)
    return (
      <Page title="Raporlar">
        <EmptyState icon={<Lock size={28} />} title="Raporlar yöneticilere açık">
          Okutma ve görüntüleme sayılarını işletme sahibi veya yönetici görebilir.
        </EmptyState>
      </Page>
    );

  return (
    <Page title="Raporlar" subtitle="Son 30 gün">
      <Loadable q={q} rows={5}>
        {(a) => {
          const days = fillDays(a.scans.last30Days);
          const total = days.reduce((n, x) => n + x.total, 0);
          const direct = a.scans.last30Days.reduce((n, x) => n + x.direct, 0);
          const max = Math.max(...days.map((x) => x.total));
          const peak = days.find((x) => x.total === max);
          const metrics = Object.entries(a.metrics).filter(([k, v]) => k !== 'item_view' && typeof v === 'number' && v > 0) as [string, number][];

          if (a.scans.allTime === 0 && a.scans.monthly.length === 0 && a.topItems.length === 0)
            return (
              <Card>
                <EmptyState icon={<BarChart3 size={28} />} title="Henüz veri yok">
                  Müşteriler QR kodunu okuttukça okutma ve görüntüleme sayıları burada görünür.
                </EmptyState>
              </Card>
            );

          return (
            <>
              <div className="qx-grid-2">
                <Card>
                  <Stat label="Bu ay QR okutma" value={<span className="qx-num">{formatCount(a.scans.thisMonth)}</span>} meta={monthLabel(a.scans.month)} />
                </Card>
                <Card>
                  <Stat label="Toplam QR okutma" value={<span className="qx-num">{formatCount(a.scans.allTime)}</span>} meta="Tüm zamanlar" />
                </Card>
                <Card>
                  <Stat label="Son 30 gün" value={<span className="qx-num">{formatCount(total)}</span>} meta="QR okutma" />
                </Card>
                <Card>
                  <Stat label="En yoğun gün" value={<span className="qx-num">{max > 0 ? formatCount(max) : '—'}</span>} meta={max > 0 && peak ? dayLabel(peak.day) : 'Henüz yok'} />
                </Card>
              </div>

              <Card className="qx-stack qx-stack--tight">
                <h2 className="qx-section__title">Günlük QR okutma</h2>
                <div
                  className="qx-bars"
                  role="img"
                  aria-label={`Son 30 günde toplam ${formatCount(total)} QR okutma${max > 0 && peak ? `, en yoğun gün ${dayLabel(peak.day)} (${formatCount(max)})` : ''}.`}
                >
                  {days.map((x) => (
                    <span key={x.day} className="qx-bars__bar" data-zero={x.total === 0} style={{ height: `${max > 0 ? Math.max(2, (x.total / max) * 100) : 2}%` }} title={`${dayLabel(x.day)}: ${x.total}`} />
                  ))}
                </div>
                <div className="qx-between qx-small qx-muted" aria-hidden="true">
                  <span>{dayLabel(days[0]!.day)}</span>
                  <span>{dayLabel(days[days.length - 1]!.day)}</span>
                </div>
                {direct > 0 && <p className="qx-small qx-muted">Ayrıca {formatCount(direct)} ziyaret bağlantıyla geldi; bunlar okutmaya sayılmaz.</p>}
              </Card>

              {a.scans.monthly.length > 0 && (
                <Card flush>
                  <table className="qx-table">
                    <caption className="qx-visually-hidden">Aylık okutma sayıları</caption>
                    <thead>
                      <tr>
                        <th scope="col">Ay</th>
                        <th scope="col" className="qx-num">
                          Masa
                        </th>
                        <th scope="col" className="qx-num">
                          Genel QR
                        </th>
                        <th scope="col" className="qx-num">
                          Toplam
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.scans.monthly.map((m) => (
                        <tr key={m.month}>
                          <th scope="row" style={{ fontWeight: m.month === a.scans.month ? 700 : 400 }}>
                            {monthLabel(m.month)}
                          </th>
                          <td className="qx-num">{formatCount(m.table)}</td>
                          <td className="qx-num">{formatCount(m.qr)}</td>
                          <td className="qx-num">
                            <strong>{formatCount(m.total)}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}

              <section className="qx-stack qx-stack--tight" aria-labelledby="top">
                <h2 id="top" className="qx-section__title">
                  En çok bakılan ürünler
                </h2>
                {a.topItems.length === 0 ? (
                  <p className="qx-small qx-muted">Son 30 günde ürün görüntülemesi yok.</p>
                ) : (
                  <Card flush>
                    <ol className="qx-list" aria-label="En çok bakılan ürünler">
                      {a.topItems.map((it, i) => (
                        <li key={it.id} className="qx-item">
                          <span className="qx-break">
                            <span className="qx-muted qx-num">{i + 1}. </span>
                            {it.name}
                          </span>
                          <span className="qx-num qx-price" style={{ paddingInlineEnd: 'var(--qx-space-2)' }}>
                            {formatCount(it.views)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </Card>
                )}
              </section>

              {metrics.length > 0 && (
                <Card flush>
                  <ul className="qx-list" aria-label="Diğer etkileşimler">
                    {metrics.map(([k, v]) => (
                      <li key={k} className="qx-item">
                        <span>{METRIC_LABELS[k] ?? k}</span>
                        <span className="qx-num qx-price" style={{ paddingInlineEnd: 'var(--qx-space-2)' }}>
                          {formatCount(v)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              <p className="qx-small qx-muted">
                Okutma, menünün masa kodu ya da genel QR koduyla açılmasıdır. Aynı tarayıcı sekmesinde yeniden açmak tekrar sayılmaz; bağlantıyla gelen ziyaretler ve
                arama motoru gibi otomatik ziyaretler okutmaya katılmaz. Sayılar kişi sayısı değil, tahmindir. Gün ve aylar Türkiye saatine göredir; ziyaretçi kimliği
                veya cihaz bilgisi tutulmaz.
              </p>
            </>
          );
        }}
      </Loadable>
    </Page>
  );
}
