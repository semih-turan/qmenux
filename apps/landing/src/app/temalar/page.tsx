import type { Metadata } from 'next';
import { THEME_IDS, THEME_META, THEME_SWATCHES } from '@qmenux/contracts';
import { ContentPage } from '@/components/page';

export const metadata: Metadata = { title: 'Temalar', description: 'Müşteri menüsü için on hazır tema. Tema yalnızca müşteri menüsünü değiştirir.' };

export default function ThemesPage() {
  return (
    <ContentPage title="On müşteri teması" lead="Renkler ve yazı tipleri temaya göre değişir; içerik, fiyat ve alerjen bilgileri her temada aynı şekilde, okunaklı gösterilir. Örnek renkler aşağıda; canlı önizleme panelde.">
      <div className="ld-themes">
        {THEME_IDS.map((id) => {
          const m = THEME_META[id];
          const s = THEME_SWATCHES[id];
          return (
            <article key={id} className="ld-theme">
              <div className="ld-theme__swatch" style={{ background: s.bg, color: s.ink }} aria-hidden="true">
                Aa
                <span className="ld-theme__accent" style={{ background: s.accent }} />
              </div>
              <strong>{m.name}</strong>
              <span>{m.suitableFor}</span>
            </article>
          );
        })}
      </div>
    </ContentPage>
  );
}
