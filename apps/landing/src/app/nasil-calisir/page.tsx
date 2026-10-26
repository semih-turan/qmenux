import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClass } from '@qmenux/ui';
import { ContentPage } from '@/components/page';

export const metadata: Metadata = { title: 'Nasıl çalışır', description: 'Hesap oluşturma, onay, menü hazırlama ve QR yayınlama adımları.' };

export default function HowPage() {
  return (
    <ContentPage title="Nasıl çalışır" lead="Kayıt anında hiçbir şey otomatik açılmaz: başvurunuz incelenir, lisans tanımlanır, sonra menünüz yayına alınabilir.">
      <ol className="ld-steps">
        <li>
          <h3>Giriş yapın ve başvurun</h3>
          <p>Google, Microsoft (Outlook) veya Apple hesabınızla giriş yapın. İşletme adı, türü (kafe, pastane, restoran…), şehir ve menü adresinizi (ör. kosekahve.qmenux.com) yazın.</p>
        </li>
        <li>
          <h3>Onay ve lisans</h3>
          <p>QMenuX ekibi başvuruyu inceler. Onaylanan işletme için lisans elle tanımlanır; panelde ödeme alınmaz ve otomatik yenileme yoktur. Bu sırada paneli açıp menünüzü hazırlayabilirsiniz; müşteri menüsü lisans tanımlanana kadar kapalı kalır.</p>
        </li>
        <li>
          <h3>Menüyü hazırlayın</h3>
          <p>İşletme türünüze göre önerilen kategorilerle başlayın ya da Excel/CSV dosyanızı yükleyin. Ürün görseli, açıklama, alerjen ve kalori bilgilerini siz onaylarsınız.</p>
        </li>
        <li>
          <h3>Tema seçin, yayınlayın</h3>
          <p>On temadan birini seçin, taslağı gözden geçirip yayınlayın. QR kodları ve A4 PDF’i indirin; masalara yerleştirin.</p>
        </li>
        <li>
          <h3>Günlük kullanım</h3>
          <p>Fiyat değişikliği, “tükendi”, yeni ürün: telefondan yapın, yayınlayın, aynı QR’da anında görünsün. Raporlardan okutma sayılarını izleyin.</p>
        </li>
      </ol>
      <div className="ld-cta">
        <Link href="/kayit" className={buttonClass('primary', 'lg')}>
          <span className="qx-btn__label">Hesap oluştur</span>
        </Link>
      </div>
    </ContentPage>
  );
}
