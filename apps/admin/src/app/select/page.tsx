import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Wordmark } from '@qmenux/ui';
import { safeReturnTo } from '@/lib/bff-policy';
import { requireMe } from '@/lib/gate';
import { SelectClient } from './select-client';

export const metadata: Metadata = { title: 'İşletme seçin' };

export default async function SelectPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const returnTo = safeReturnTo(typeof sp.returnTo === 'string' ? sp.returnTo : null) ?? '/';
  const me = await requireMe('/select');
  if (me.memberships.length === 0) redirect('/onboarding');
  return (
    <main className="qx-center" id="qx-main" tabIndex={-1}>
      <div className="qx-center__panel qx-stack">
        <Wordmark suffix="İşletme" />
        <SelectClient memberships={me.memberships} activeTenantId={me.activeTenantId} returnTo={returnTo} />
      </div>
    </main>
  );
}
