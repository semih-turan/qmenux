import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { safeReturnTo } from './bff-policy';
import { serverGet } from './upstream';
import type { Me } from './types';

/** Server-side session check for pages outside the tenant shell. */
export async function requireMe(returnTo: string): Promise<Me> {
  const r = await serverGet<Me>('/v1/me');
  if (!r.ok) {
    if (r.problem.status === 401) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    throw new Error(`me failed: ${r.problem.code}`);
  }
  return r.data;
}

/** The path the browser asked for (set by src/proxy.ts), or "/" when absent or not a safe relative path. */
export async function currentPath(): Promise<string> {
  return safeReturnTo((await headers()).get('x-qx-path')) ?? '/';
}
