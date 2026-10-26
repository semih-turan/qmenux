import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Wordmark } from '@qmenux/ui';
import { requireMe } from '@/lib/gate';
import { InviteClient } from './invite-client';

export const metadata: Metadata = { title: 'Ekip daveti' };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) notFound();
  const me = await requireMe(`/invite/${token}`);
  return (
    <main className="qx-center" id="qx-main" tabIndex={-1}>
      <div className="qx-center__panel qx-stack">
        <Wordmark suffix="İşletme" />
        <InviteClient token={token} email={me.user.email} />
      </div>
    </main>
  );
}
