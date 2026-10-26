import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { safeReturnTo } from './bff-policy';
import { serverGet } from './upstream';
import type { OpsSession } from './types';

/**
 * Server-side gate for every operator screen. The API re-checks audience, platform role and MFA
 * on each call; this only decides which screen to show (login, MFA step, no access).
 */
export async function requireOperator(returnTo: string, opts: { allowUnverified?: boolean } = {}): Promise<OpsSession> {
  const r = await serverGet<OpsSession>('/v1/control/session');
  if (!r.ok) {
    if (r.problem.status === 401) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    if (r.problem.status === 403) redirect('/no-access');
    throw new Error(`session failed: ${r.problem.code}`);
  }
  if (!r.data.mfaVerified && !opts.allowUnverified) redirect(`/mfa?returnTo=${encodeURIComponent(returnTo)}`);
  return r.data;
}

/** The path the browser asked for (set by src/proxy.ts), or "/" when absent or not a safe relative path. */
export async function currentPath(): Promise<string> {
  return safeReturnTo((await headers()).get('x-qx-path')) ?? '/';
}
