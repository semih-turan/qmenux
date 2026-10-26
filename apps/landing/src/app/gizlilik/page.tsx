import type { Metadata } from 'next';
import { LegalDraft } from '@/components/page';

export const metadata: Metadata = { title: 'Gizlilik bildirimi', robots: { index: false, follow: true } };

export default function Page() {
  return <LegalDraft title="Gizlilik bildirimi" scope={['Hangi kişisel veriler işlenir (işletme sahibi hesap bilgileri, başvuru verileri)', 'Müşteri menüsü ziyaretçilerinden kişisel veri toplanmaz; yalnızca toplu okutma sayıları tutulur', 'Veri saklama süreleri ve silme', 'Alt işleyiciler (barındırma, kimlik sağlayıcıları)', 'Haklarınız ve başvuru yolu']} />;
}
