import type { Metadata } from 'next';
import { LegalDraft } from '@/components/page';

export const metadata: Metadata = { title: 'Çerez politikası', robots: { index: false, follow: true } };

export default function Page() {
  return <LegalDraft title="Çerez politikası" scope={['Pazarlama sitesi çerez kullanmaz', 'İşletme ve platform panelleri yalnızca oturum için zorunlu, host-only çerez kullanır', 'Müşteri menüsünde çerez ve takip yoktur', 'Üçüncü taraf çerezleri kullanılmaz']} />;
}
