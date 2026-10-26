import type { Metadata } from 'next';
import { ContentPage } from '@/components/page';

export const metadata: Metadata = { title: 'Özellikler', description: 'QMenuX özellikleri: telefondan yönetim, on tema, masa QR, A4 PDF, okutma raporları, Excel içe aktarma.' };

const NOW = [
  ['Telefon öncelikli panel', 'Tüm işlemler 320 px ekranda çalışır: ürün ekleme, fiyat, “tükendi”, kategori sırası, yayınlama.'],
  ['Taslak ve yayın ayrımı', 'Değişiklikler önce taslakta kalır; tek dokunuşla yayınlanır. Yayınlanmış her sürüm saklanır ve geri yüklenebilir.'],
  ['On müşteri teması', 'Coffee Minimal’dan Dark Dining’e on tema; sektöre göre öneri gelir, siz değiştirirsiniz.'],
  ['Genel ve masa QR kodları', 'Masa başına ayrı kod, kod yenileme ve iptal; masa bazında okutma sayıları.'],
  ['A4 menü ve alerjen PDF', 'Yayındaki menüden baskıya hazır A4 menü ve 14 alerjenlik tablo. Doğrulanmamış alerjen bilgisi “?” olarak basılır.'],
  ['Excel / CSV içe aktarma', 'Mevcut menü dosyanızı yükleyin, sütunları eşleyin, önizlemeyi görün, taslağa aktarın.'],
  ['Ürün arama ve alerjen filtresi', 'Müşteri menüsünde Türkçe uyumlu arama; alerjen ve beslenme etiketlerine göre filtre.'],
  ['Okutma raporları', 'Aylık ve toplam QR okutma, en çok bakılan ürünler. Kişi takibi ve parmak izi yoktur.'],
  ['Konum görünürlüğü (isteğe bağlı)', 'Menüyü yalnızca işletme çevresinde açmak isterseniz yarıçap belirleyin; müşteri izin vermezse açıklama görür.'],
  ['Wi-Fi ve WhatsApp bloğu (isteğe bağlı)', 'Menüde misafir Wi-Fi bilgisi ve WhatsApp iletişim düğmesi; ikisi de kapalı gelir, siz açarsınız.'],
  ['Ekip rolleri', 'Sahip, yönetici ve personel rolleri; personel yalnızca ürün durumunu değiştirir.'],
];

const LATER = [
  ['Çok dilli menü', 'Çeviri alanları ve dil seçici.'],
  ['Zamanlı menü ve fiyat', 'Kahvaltı/öğle menüleri, ileri tarihli fiyat değişikliği.'],
  ['Online ödeme ile lisans yenileme', 'İlk sürümde ödeme alınmaz; lisanslar QMenuX ekibince tanımlanır.'],
  ['Yapay zekâ ile içerik önerisi', 'Planlanıyor. Kalori ve alerjen gibi bilgiler hiçbir zaman onaysız yayınlanmayacak.'],
];

export default function FeaturesPage() {
  return (
    <ContentPage title="Özellikler" lead="Bugün kullanabildikleriniz ve yol haritasında olanlar ayrı listelenir; yayınlanmamış bir özellik var gibi gösterilmez.">
      <h2 className="ld-h2" style={{ fontSize: 22, marginTop: 32 }}>
        Şu an kullanımda
      </h2>
      <div className="ld-grid ld-grid--3">
        {NOW.map(([t, d]) => (
          <article key={t} className="ld-card">
            <h3>{t}</h3>
            <p>{d}</p>
          </article>
        ))}
      </div>
      <h2 className="ld-h2" style={{ fontSize: 22, marginTop: 48 }}>
        Yol haritası
      </h2>
      <div className="ld-grid">
        {LATER.map(([t, d]) => (
          <article key={t} className="ld-card">
            <h3>{t}</h3>
            <p>{d}</p>
          </article>
        ))}
      </div>
    </ContentPage>
  );
}
