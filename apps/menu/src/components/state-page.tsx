import type { ReactNode } from 'react';

/** Full-screen message for the not-found, unavailable and error states. Never says more than the guest needs. */
export function StatePage({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <main className="m-state">
      <div className="m-state__card">
        <span className="m-state__icon" aria-hidden="true">
          {icon}
        </span>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}
