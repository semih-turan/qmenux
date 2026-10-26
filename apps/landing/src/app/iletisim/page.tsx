import type { Metadata } from 'next';
import { ContentPage } from '@/components/page';
import { SITE } from '@/lib/site';

export const metadata: Metadata = { title: 'İletişim' };

/** No contact form in V1: a form needs spam defences and a mail provider (LANDING_PAGE_SPEC), so e-mail is the channel. */
export default function ContactPage() {
  return (
    <ContentPage title="İletişim" prose lead="Teklif, çok şubeli kullanım, lisans ve destek için yazın; iş günlerinde yanıtlarız.">
      <p>
        E-posta: <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
      </p>
      <p>Başvurunuzun durumunu görmek için işletme paneline giriş yapabilirsiniz; onay bekleyen hesaplar panelde “inceleniyor” durumunu görür.</p>
      <h2>Destek konuları</h2>
      <ul>
        <li>Başvuru ve lisans durumu</li>
        <li>Excel/CSV içe aktarma sorunları</li>
        <li>QR kod ve A4 PDF baskısı</li>
        <li>Hesap ve ekip erişimi</li>
      </ul>
    </ContentPage>
  );
}
