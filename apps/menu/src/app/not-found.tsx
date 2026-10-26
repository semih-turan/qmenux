import type { Metadata } from 'next';
import { SearchX } from 'lucide-react';
import { StatePage } from '@/components/state-page';
import { ThemeRoot } from '@/components/theme-root';

export const metadata: Metadata = { title: { absolute: 'Menü bulunamadı' } };

/** Same wording whether the address never existed or was mistyped, so it cannot be used to probe for businesses. */
export default function NotFound() {
  return (
    <ThemeRoot themeId={null} state="NOT_FOUND">
      <StatePage icon={<SearchX size={28} />} title="Menü bulunamadı">
        <p>Adresi kontrol edin veya masadaki QR kodu yeniden okutun.</p>
      </StatePage>
    </ThemeRoot>
  );
}
