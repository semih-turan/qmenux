import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Wordmark } from '@qmenux/ui';
import { safeReturnTo } from '@/lib/bff-policy';
import { requireOperator } from '@/lib/gate';
import { MfaForm } from './mfa-client';

export const metadata: Metadata = { title: 'İki adımlı doğrulama' };

export default async function MfaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const returnTo = safeReturnTo(typeof sp.returnTo === 'string' ? sp.returnTo : null) ?? '/';
  const s = await requireOperator(`/mfa?returnTo=${encodeURIComponent(returnTo)}`, { allowUnverified: true });
  if (s.mfaVerified) redirect(returnTo);

  return (
    <main className="qx-center" id="qx-main" tabIndex={-1}>
      <div className="qx-center__panel qx-stack">
        <Wordmark suffix="Platform" />
        <div>
          <h1 className="qx-h1">İki adımlı doğrulama</h1>
          <p className="qx-muted">
            <span className="qx-break">{s.user.email}</span> için doğrulayıcı uygulamadaki altı haneli kodu girin.
          </p>
        </div>
        <MfaForm returnTo={returnTo} />
      </div>
    </main>
  );
}
