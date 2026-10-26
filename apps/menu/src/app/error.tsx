'use client';
import { CloudOff } from 'lucide-react';
import { RetryButton } from '@/components/retry-button';
import { StatePage } from '@/components/state-page';
import { ThemeRoot } from '@/components/theme-root';

export default function MenuError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ThemeRoot themeId={null} state="ERROR">
      <StatePage icon={<CloudOff size={28} />} title="Bir sorun oluştu">
        <p>Menü gösterilirken beklenmeyen bir hata oldu. Tekrar deneyin ya da personelden basılı menü isteyin.</p>
        <RetryButton onRetry={reset} />
      </StatePage>
    </ThemeRoot>
  );
}
