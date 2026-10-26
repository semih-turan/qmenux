'use client';
import type { ReactNode } from 'react';
import { Lock, RefreshCw, WifiOff } from 'lucide-react';
import { Button, EmptyState, ErrorState, ListSkeleton } from '@qmenux/ui';
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

/** Shown instead of a screen the current role cannot use. The API enforces the same rule. */
export function NoAccess({ title = 'Bu bölüm işletme sahibine açık', children }: { title?: string; children?: ReactNode }) {
  return (
    <EmptyState icon={<Lock size={28} />} title={title}>
      {children ?? 'Değişiklik gerekiyorsa işletme sahibine haber verin.'}
    </EmptyState>
  );
}
