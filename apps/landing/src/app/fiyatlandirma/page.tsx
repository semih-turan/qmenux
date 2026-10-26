import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClass } from '@qmenux/ui';
import { ContentPage } from '@/components/page';

export const metadata: Metadata = { title: 'Fiyatlandırma', description: 'Tek paket, sabit lisans. Paketler arası özellik kısıtı yok.' };

/** The fixed price and billing interval are still open decisions (TASKS T000); no number is invented here. */
export default function PricingPage() {
  return (
    <ContentPage title="Tek paket, sabit lisans" lead="Başlangıç / Pro / Kurumsal yok. Her işletme aynı özelliklerin tamamını kullanır.">
      <div className="ld-price">
        <h2 style={{ margin: 0 }}>QMenuX lisansı</h2>
        <p className="ld-sub" style={{ marginTop: 8 }}>
          Lisans ücreti ve dönem bilgisi yayına alınmadan önce burada ilan edilecektir. Şu an fiyat teklifi için bizimle iletişime geçin.
        </p>
        <ul>
          <li>Sınırsız ürün ve kategori, bir işletme adresi</li>
          <li>On tema, masa QR kodları, A4 menü ve alerjen PDF</li>
          <li>Okutma raporları, ekip rolleri, Excel/CSV içe aktarma</li>
          <li>Lisans süresi dolunca kısa bir ek süre; verileriniz silinmez</li>
        </ul>
        <p className="ld-note">İlk sürümde online ödeme yoktur: lisans, başvurunuz onaylandıktan sonra QMenuX ekibince tanımlanır ve uzatılır. Yapay zekâ kredileri gibi ek ürünler kullanıma açıldığında ayrıca duyurulur.</p>
        <div className="ld-cta">
          <Link href="/iletisim" className={buttonClass('primary', 'lg')}>
            <span className="qx-btn__label">Teklif iste</span>
          </Link>
          <Link href="/kayit" className={buttonClass('secondary', 'lg')}>
            <span className="qx-btn__label">Hesap oluştur</span>
          </Link>
        </div>
      </div>
    </ContentPage>
  );
}
