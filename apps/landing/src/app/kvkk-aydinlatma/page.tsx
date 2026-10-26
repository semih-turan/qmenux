import type { Metadata } from 'next';
import { LegalDraft } from '@/components/page';

export const metadata: Metadata = { title: 'KVKK aydınlatma metni', robots: { index: false, follow: true } };

export default function Page() {
  return <LegalDraft title="KVKK aydınlatma metni" scope={['Veri sorumlusu kimliği (işletme ünvanı ve adresi belirlenecek)', 'İşleme amaçları ve hukuki sebepler', 'Aktarım yapılan taraflar ve yurt dışı aktarım', 'Saklama süreleri', 'KVKK madde 11 kapsamındaki haklar ve başvuru usulü']} />;
}
