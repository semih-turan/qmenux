import type { Metadata } from 'next';
import { ContentPage } from '@/components/page';

export const metadata: Metadata = { title: 'Sık sorulan sorular' };

const FAQ: [string, string][] = [
  ['Müşterim uygulama indirmek zorunda mı?', 'Hayır. QR kodu telefonun kamerasıyla okutmak yeterli; menü tarayıcıda açılır, hesap veya uygulama gerekmez.'],
  ['Kayıt olunca hemen kullanmaya başlayabilir miyim?', 'Paneli açıp menünüzü hazırlayabilirsiniz; müşteri menüsü ise başvurunuz onaylanıp lisans tanımlandıktan sonra yayına alınır.'],
  ['Fiyatı değiştirince QR kodu yeniden basmam gerekir mi?', 'Hayır. QR kod sabittir; yayınladığınız her değişiklik aynı kodda görünür.'],
  ['Alerjen bilgilerini sizin sisteminiz mi belirliyor?', 'Hayır. Alerjen ve kalori bilgileri işletmenin kendi beyanıdır ve siz onaylamadan yayınlanmaz. Girilmemiş bilgi müşteriye “bilinmiyor” olarak gösterilir, asla “içermez” diye varsayılmaz.'],
  ['Mevcut menümü Excel’den aktarabilir miyim?', 'Evet. CSV veya XLSX dosyanızı yükleyin, sütunları eşleyin, hatalı satırları görün ve taslağa aktarın. Yayınlama ayrı bir adımdır.'],
  ['Birden fazla şube için ne yapmalıyım?', 'İlk sürümde her işletme hesabı bir menü adresi ve bir şube içindir. Çok şubeli yapı için bizimle iletişime geçin.'],
  ['Ziyaretçilerimi takip ediyor musunuz?', 'Hayır. Yalnızca toplam ve aylık QR okutma sayıları tutulur; çerez, kimlik veya parmak izi toplanmaz.'],
  ['Konum görünürlüğü nedir?', 'İsteğe bağlı bir ayardır: menüyü yalnızca işletme çevresinde açmak isterseniz bir yarıçap belirlersiniz. Konum paylaşmak istemeyen müşteri bir açıklama görür; konum gizlice alınmaz.'],
  ['Lisansım dolunca verilerim silinir mi?', 'Hayır. Kısa bir ek süre boyunca menü açık kalır; süre dolunca müşteri menüsü kapanır ama verileriniz korunur ve lisans yenilenince aynen geri gelir.'],
];

export default function FaqPage() {
  return (
    <ContentPage title="Sık sorulan sorular">
      <div className="ld-faq">
        {FAQ.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </ContentPage>
  );
}
