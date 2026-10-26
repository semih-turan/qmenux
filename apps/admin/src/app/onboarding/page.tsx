import type { Metadata } from 'next';
import { Wordmark } from '@qmenux/ui';
import { requireMe } from '@/lib/gate';
import { OnboardingClient } from './onboarding-client';

export const metadata: Metadata = { title: 'İşletme başvurusu' };

export default async function OnboardingPage() {
  const me = await requireMe('/onboarding');
  return (
    <main className="qx-center" id="qx-main" tabIndex={-1}>
      <div className="qx-center__panel qx-stack">
        <div className="qx-between">
          <Wordmark suffix="İşletme" />
          <form method="post" action="/auth/logout">
            <button type="submit" className="qx-btn qx-btn--ghost qx-btn--sm">
              <span className="qx-btn__label">Çıkış</span>
            </button>
          </form>
        </div>
        <OnboardingClient email={me.user.email} hasMemberships={me.memberships.length > 0} initial={me.applications} />
      </div>
    </main>
  );
}
