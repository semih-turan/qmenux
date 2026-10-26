'use client';
import { Copy, ExternalLink, UploadCloud, UtensilsCrossed } from 'lucide-react';
import { Banner, Button, Card, EmptyState, Stat, buttonClass, useToast } from '@qmenux/ui';
import { Link } from '@/components/link';
import { Page } from '@/components/page';
import { useCan, useSession } from '@/components/session';
import { Loadable } from '@/components/states';
import { useApi } from '@/lib/api';
import { formatCount, formatDate } from '@/lib/format';
import type { Dashboard } from '@/lib/types';

export default function HomePage() {
  const { tenant } = useSession();
  const q = useApi<Dashboard>('admin/dashboard');
  return (
    <Page title={tenant.displayName} subtitle={q.data ? q.data.tenant.menuUrl.replace(/^https?:\/\//, '') : undefined}>
      <Loadable q={q} rows={5}>
        {(d) => <DashboardView d={d} />}
      </Loadable>
    </Page>
  );
}

function LicenseBanner({ d }: { d: Dashboard }) {
  const { licenseState: s, licenseEndsAt } = d.tenant;
  const more = (
    <Link href="/more/license" className={buttonClass('secondary', 'sm')}>
      <span className="qx-btn__label">Lisans ayrıntıları</span>
    </Link>
  );
  if (s === 'ACTIVE') return null;
  if (s === 'NOT_GRANTED')
    return (
      <Banner tone="warning" title="Lisans henüz tanımlanmadı" action={more}>
        Menünüzü hazırlayabilirsiniz; yayınlamak için lisansın platform ekibi tarafından tanımlanması gerekir. Panelde ödeme alınmaz.
      </Banner>
    );
  if (s === 'GRACE')
    return (
      <Banner tone="warning" title="Lisans süresi doldu, ek süre içindesiniz" action={more}>
        Menünüz şimdilik açık. Yenileme için platform ekibiyle iletişime geçin.
      </Banner>
    );
  return (
    <Banner tone="danger" title={s === 'REVOKED' ? 'Lisans iptal edildi' : 'Lisans süresi doldu'} action={more}>
      {licenseEndsAt ? `Bitiş: ${formatDate(licenseEndsAt)}. ` : ''}Müşteri menünüz kapalı ve değişiklik yapılamıyor.
    </Banner>
  );
}

function DashboardView({ d }: { d: Dashboard }) {
  const toast = useToast();
  const canPublish = useCan('menu.publish');
  const canWrite = useCan('catalog.write');
  const neverPublished = d.publish.publishedRevisionNo === 0;

  async function copy() {
    try {
      await navigator.clipboard.writeText(d.tenant.menuUrl);
      toast({ message: 'Menü bağlantısı kopyalandı.' });
    } catch {
      toast({ message: 'Kopyalanamadı. Bağlantıyı basılı tutarak kopyalayın.' });
    }
  }

  return (
    <>
      <LicenseBanner d={d} />

      {d.counts.products === 0 ? (
        <Card>
          <EmptyState
            icon={<UtensilsCrossed size={28} />}
            title="Menünüz boş"
            action={
              canWrite ? (
                <Link href="/menu" className={buttonClass('primary')}>
                  <span className="qx-btn__label">İlk kategoriyi ekle</span>
                </Link>
              ) : undefined
            }
          >
            Kategori ve ürün ekleyin, sonra tek dokunuşla yayınlayın.
          </EmptyState>
        </Card>
      ) : (
        d.publish.hasUnpublishedChanges &&
        canPublish && (
          <Banner
            tone="primary"
            title={neverPublished ? 'Menünüz henüz yayında değil' : 'Yayınlanmamış değişiklikler var'}
            action={
              <Link href="/menu/publish" className={buttonClass('primary', 'sm')}>
                <span className="qx-btn__label">Gözden geçir ve yayınla</span>
              </Link>
            }
          >
            Müşterileriniz yayınlanan son sürümü görür.
          </Banner>
        )
      )}

      {d.counts.unverifiedAllergenProducts > 0 && (
        <Banner tone="warning" title={`${d.counts.unverifiedAllergenProducts} üründe doğrulanmamış alerjen bilgisi var`} action={<Link href="/menu" className={buttonClass('secondary', 'sm')}><span className="qx-btn__label">Ürünlere git</span></Link>}>
          Doğrulanmamış alerjenler müşteriye “bilinmiyor” olarak gösterilir.
        </Banner>
      )}

      <div className="qx-grid-2">
        <Card>
          <Stat label="Bu ay QR okutma" value={<span className="qx-num">{formatCount(d.scans.thisMonth)}</span>} meta={`Toplam ${formatCount(d.scans.allTime)}`} />
        </Card>
        <Card>
          <Stat label="Ürün" value={<span className="qx-num">{d.counts.products}</span>} meta={`${d.counts.categories} kategori`} />
        </Card>
        <Card>
          <Stat label="Tükendi" value={<span className="qx-num">{d.counts.soldOut}</span>} />
        </Card>
        <Card>
          <Stat
            label="Yayındaki sürüm"
            value={<span className="qx-num">{neverPublished ? '—' : `#${d.publish.publishedRevisionNo}`}</span>}
            meta={d.publish.hasUnpublishedChanges ? 'Taslakta değişiklik var' : 'Güncel'}
          />
        </Card>
      </div>

      <Card className="qx-stack qx-stack--tight">
        <span className="qx-small qx-muted">Müşteri menüsü</span>
        <span className="qx-break qx-mono">{d.tenant.menuUrl.replace(/^https?:\/\//, '')}</span>
        <div className="qx-row-actions">
          <a className={buttonClass('secondary', 'sm')} href={d.tenant.menuUrl} target="_blank" rel="noopener">
            <ExternalLink size={16} aria-hidden="true" />
            <span className="qx-btn__label">Aç</span>
          </a>
          <Button size="sm" icon={<Copy size={16} />} onClick={copy}>
            Kopyala
          </Button>
          <Link href="/qr" className={buttonClass('ghost', 'sm')}>
            <span className="qx-btn__label">QR kodları</span>
          </Link>
        </div>
      </Card>

      {!canPublish && (
        <Banner tone="info" title="Personel görünümü">
          Ürünleri tükendi olarak işaretleyebilirsiniz. Diğer değişiklikleri yönetici yapar.
        </Banner>
      )}
      {neverPublished && d.counts.products > 0 && !canPublish && (
        <EmptyState icon={<UploadCloud size={28} />} title="Menü yayında değil">
          Yayınlamak için işletme sahibine haber verin.
        </EmptyState>
      )}
    </>
  );
}
