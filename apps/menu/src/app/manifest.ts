import type { MetadataRoute } from 'next';
import { loadMenu } from '@/lib/load';
import { resolveTheme } from '@/lib/themes';

export const dynamic = 'force-dynamic';

/** Per-business install name and colours; one manifest and scope per menu host (UI_UX.md "PWA"). */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const l = await loadMenu();
  const res = l.kind === 'ok' ? l.res : null;
  const name = res?.state === 'OK' ? res.menu.displayName : res?.state === 'GEOFENCE_REQUIRED' ? res.displayName : 'Menü';
  const { theme } = resolveTheme(res?.state === 'OK' ? res.menu.themeId : res?.state === 'GEOFENCE_REQUIRED' ? res.themeId : null);
  return {
    name: `${name} · Menü`,
    short_name: name.length > 12 ? 'Menü' : name,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'tr',
    background_color: theme.tokens.bg,
    theme_color: theme.tokens.bg,
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
