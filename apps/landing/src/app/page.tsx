import Link from 'next/link';
import { BarChart3, FileText, Palette, QrCode, ShieldCheck, Smartphone } from 'lucide-react';
import { buttonClass } from '@qmenux/ui';
import { SITE } from '@/lib/site';

const BENEFITS = [
  { icon: <Smartphone size={20} />, title: 'Telefondan yönetim', text: 'Fiyat değiştirmek, ürünü “tükendi” yapmak, yeni kategori açmak: hepsi cebinizdeki panelden, masaüstü gerekmeden.' },
  { icon: <QrCode size={20} />, title: 'Masa bazlı QR', text: 'Genel QR ve masa başına ayrı kodlar; hangi masa ne kadar okutmuş görürsünüz. Kod yenilemek tek dokunuş.' },
  { icon: <Palette size={20} />, title: 'On hazır tema', text: 'Kahve barından fine dining’e on tema. Tema değişince yalnızca müşteri menüsü değişir, paneliniz aynı kalır.' },
  { icon: <FileText size={20} />, title: 'A4 menü ve alerjen PDF', text: 'Yayındaki menüden baskıya hazır A4 menü ve 14 alerjenlik tablo. Doğrulanmamış bilgi asla “içermez” diye basılmaz.' },
  { icon: <BarChart3 size={20} />, title: 'Okutma raporları', text: 'Aylık ve toplam QR okutma sayıları, en çok bakılan ürünler. Ziyaretçi takibi ve parmak izi yok.' },
  { icon: <ShieldCheck size={20} />, title: 'Veriniz size ait', text: 'Fiyat ve alerjen bilgileri işletmenin kendi onayladığı veridir; yayınlanmış her sürüm saklanır, geri dönülebilir.' },
];

export default function HomePage() {
  return (
    <>
      <section className="ld-wrap ld-hero">
        <div>
          <span className="ld-eyebrow">Kafe · kahve dükkânı · pastane · restoran</span>
          <h1 className="ld-h1">Menünüz telefonunuzda, müşteriniz QR’da.</h1>
          <p className="ld-lead">QMenuX ile menünüzü dakikalar içinde hazırlayın, masalara QR kod koyun, fiyatı değiştiğinde anında güncelleyin. Uygulama indirmeden, hesap açmadan açılan bir menü.</p>
          <div className="ld-cta">
            <Link href="/kayit" className={buttonClass('primary', 'lg')}>
              <span className="qx-btn__label">Hesap oluştur</span>
            </Link>
            <a href={SITE.demoMenu} className={buttonClass('secondary', 'lg')} target="_blank" rel="noopener">
              <span className="qx-btn__label">Örnek menüyü aç</span>
            </a>
          </div>
          <p className="ld-note">Yeni hesaplar QMenuX ekibinin onayından sonra açılır; kayıt tek başına ücret veya abonelik başlatmaz.</p>
        </div>
        <PhoneMock />
      </section>

      <section className="ld-section ld-section--alt">
        <div className="ld-wrap">
          <h2 className="ld-h2">İşletmenizin gününe uyan özellikler</h2>
          <p className="ld-sub">Kahve dükkânı da pizzacı da aynı paneli kullanır; sektöre göre değişen tek şey önerilen kategoriler ve tema.</p>
          <div className="ld-grid ld-grid--3">
            {BENEFITS.map((b) => (
              <article key={b.title} className="ld-card">
                <span className="ld-card__icon" aria-hidden="true">
                  {b.icon}
                </span>
                <h3>{b.title}</h3>
                <p>{b.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ld-section">
        <div className="ld-wrap">
          <h2 className="ld-h2">Dört adımda yayında</h2>
          <ol className="ld-steps">
            <li>
              <h3>Hesap oluşturun</h3>
              <p>Google, Microsoft veya Apple hesabınızla giriş yapın; işletme adını, türünü ve menü adresinizi seçin.</p>
            </li>
            <li>
              <h3>Onay bekleyin</h3>
              <p>QMenuX ekibi başvuruyu inceler ve lisansı tanımlar. Bu sırada menünüzü hazırlamaya başlayabilirsiniz.</p>
            </li>
            <li>
              <h3>Menünüzü girin</h3>
              <p>Kategori ve ürünleri telefondan ekleyin ya da Excel/CSV dosyanızı yükleyin; tema seçin, logo ekleyin.</p>
            </li>
            <li>
              <h3>QR’ı masaya koyun</h3>
              <p>Yayınlayın, QR kodları ve A4 PDF’i indirin. Sonraki her değişiklik aynı QR’da anında görünür.</p>
            </li>
          </ol>
          <div className="ld-cta">
            <Link href="/nasil-calisir" className={buttonClass('ghost', 'md')}>
              <span className="qx-btn__label">Ayrıntılı anlatım</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/** Static demo menu (no real tenant data), rendered as a phone frame. */
function PhoneMock() {
  return (
    <div className="ld-phone" aria-hidden="true">
      <div className="ld-phone__bar">
        <strong>Köşe Kahve &amp; Fırın</strong>
        <div style={{ fontSize: 12, color: '#7a6f63' }}>Her gün 08:00–22:00 · Kadıköy</div>
      </div>
      <div className="ld-phone__chips">
        <span>Kahve</span>
        <span>Kahvaltı</span>
        <span>Fırın</span>
        <span>Ana yemek</span>
      </div>
      <div className="ld-phone__item">
        <div>
          Flat white<small>Çift shot, mikro köpük</small>
        </div>
        <b>95 ₺</b>
      </div>
      <div className="ld-phone__item">
        <div>
          Serpme kahvaltı<small>2 kişilik · menemenli</small>
        </div>
        <b>650 ₺</b>
      </div>
      <div className="ld-phone__item">
        <div>
          Tereyağlı kruvasan<small>Sabah fırından</small>
        </div>
        <b>75 ₺</b>
      </div>
      <div className="ld-phone__item">
        <div>
          Izgara levrek<small>Mevsim yeşillikleri</small>
        </div>
        <b>420 ₺</b>
      </div>
    </div>
  );
}
