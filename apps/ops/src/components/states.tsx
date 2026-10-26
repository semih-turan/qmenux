'use client';
import type { ReactNode } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { Banner, Button, ErrorState, ListSkeleton } from '@qmenux/ui';
import type { ApiProblem } from '@/lib/api';

/** Standard loading / error rendering for a useApi() result. */
export function Loadable<T>({ q, children, rows = 4 }: { q: { data: T | undefined; error: ApiProblem | null; loading: boolean; reload: () => void }; children: (d: T) => ReactNode; rows?: number }) {
  if (q.data !== undefined) return <>{children(q.data)}</>;
  if (q.error)
    return (
      <ErrorState
        icon={<WifiOff size={28} />}
        title="Yüklenemedi"
        action={
          <Button icon={<RefreshCw size={16} />} onClick={() => q.reload()}>
            Tekrar dene
          </Button>
        }
      >
        {q.error.message}
      </ErrorState>
    );
  return <ListSkeleton rows={rows} />;
}

/** Shown to PLATFORM_SUPPORT above screens that have admin-only actions. The API enforces the same rule. */
export function ReadOnlyNote() {
  return (
    <Banner tone="info" title="Salt okunur erişim">
      Destek rolü kayıtları görür; onay, lisans ve askı işlemleri platform yöneticisine aittir.
    </Banner>
  );
}
