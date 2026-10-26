import type { Metadata } from 'next';
import { Lock } from 'lucide-react';
import { buttonClass, EmptyState, Wordmark } from '@qmenux/ui';

export const metadata: Metadata = { title: 'Erişim yok' };

/** Signed in, but not a platform operator (or the operator record was removed). */
export default function NoAccessPage() {
  return (
    <main className="qx-center" id="qx-main" tabIndex={-1}>
      <div className="qx-center__panel qx-stack">
        <Wordmark suffix="Platform" />
        <EmptyState icon={<Lock size={28} />} title="Bu hesap platform operatörü değil">
          Operatör yetkisi sunucu tarafında tanımlanır. İşletme paneline girmek istiyorsanız admin adresini kullanın.
        </EmptyState>
        <form action="/auth/logout" method="post">
          <button type="submit" className={buttonClass('secondary', 'lg', true)}>
            <span className="qx-btn__label">Çıkış yap</span>
          </button>
        </form>
      </div>
    </main>
  );
}
