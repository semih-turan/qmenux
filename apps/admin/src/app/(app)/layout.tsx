import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { currentPath, requireMe } from '@/lib/gate';
import { AdminShell } from '@/components/admin-shell';

/** Every tenant screen is gated on the server; the API re-checks role and tenant on each call. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  // Deep links survive a re-login: the gate sends the originally requested path as returnTo.
  const path = await currentPath();
  const me = await requireMe(path);
  if (me.memberships.length === 0) redirect('/onboarding');
  const tenant = me.memberships.find((m) => m.tenantId === me.activeTenantId);
  // The select screen sends the owner on to the page they asked for once a tenant is chosen.
  if (!tenant) redirect(path === '/' ? '/select' : `/select?returnTo=${encodeURIComponent(path)}`);
  return (
    <AdminShell me={me} tenant={tenant}>
      {children}
    </AdminShell>
  );
}
