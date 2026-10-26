import 'server-only';
import type { PublicMenuResponse } from '@qmenux/contracts';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { serverEnv } from './env';
import { geoCookieName, menuSlug } from './policy';
import { upstream } from './upstream';

export type MenuLoad =
  | { kind: 'not-found' }
  /** The API could not be reached or answered with an error; the page says "try again", never why. */
  | { kind: 'error' }
  | { kind: 'ok'; slug: string; res: Exclude<PublicMenuResponse, { state: 'UNAVAILABLE'; reason: 'NOT_FOUND' }> };

/**
 * One API round trip per request, shared by generateMetadata, generateViewport and the page.
 * The tenant comes from the Host header only; the geofence pass travels in the HttpOnly cookie.
 */
export const loadMenu = cache(async (): Promise<MenuLoad> => {
  const env = serverEnv();
  const h = await headers();
  const slug = menuSlug(h.get('host'), env.rootDomain, env.previewMenu);
  if (!slug) return { kind: 'not-found' };
  const geoPass = (await cookies()).get(geoCookieName(env.secure))?.value ?? null;
  let res: Response;
  try {
    res = await upstream(`/v1/public/menus/${slug}`, { geoPass, reqHeaders: h });
  } catch {
    return { kind: 'error' };
  }
  if (res.status === 404) return { kind: 'not-found' };
  if (!res.ok) return { kind: 'error' };
  const body = (await res.json().catch(() => null)) as PublicMenuResponse | null;
  if (!body || typeof body !== 'object' || !('state' in body)) return { kind: 'error' };
  if (body.state === 'UNAVAILABLE' && body.reason === 'NOT_FOUND') return { kind: 'not-found' };
  return { kind: 'ok', slug, res: body as Extract<MenuLoad, { kind: 'ok' }>['res'] };
});
