import type { Metadata } from 'next';
import { LegalDraft } from '@/components/page';

export const metadata: Metadata = { title: 'Kullanım koşulları', robots: { index: false, follow: true } };

export default function Page() {
  return <LegalDraft title="Kullanım koşulları" scope={['Hizmetin tanımı ve lisans modeli (tek paket, elle tanımlanan lisans)', 'Başvuru, onay ve hesap kapatma', 'İçerikten (fiyat, alerjen, görsel) işletmenin sorumluluğu', 'Yasaklı kullanım ve askıya alma', 'Sorumluluk sınırları ve uyuşmazlık']} />;
}
