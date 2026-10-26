import type { ReactNode } from 'react';
import { currentPath, requireOperator } from '@/lib/gate';
import { OpsShell } from '@/components/ops-shell';

/** Every operator screen is gated on the server (session, platform role, MFA); the API re-checks all three on each call. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  // Deep links survive a re-login: the gate sends the originally requested path as returnTo.
  const session = await requireOperator(await currentPath());
  return <OpsShell session={session}>{children}</OpsShell>;
}
