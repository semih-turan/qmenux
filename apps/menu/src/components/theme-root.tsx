import type { ReactNode } from 'react';
import { resolveTheme, themeStyle } from '@/lib/themes';

export type PageState = 'OK' | 'UNAVAILABLE' | 'GEOFENCE' | 'ERROR' | 'NOT_FOUND';

/**
 * Applies one public theme to everything inside it. `data-qx-state` is what the service worker reads
 * to decide whether a response is a menu worth keeping offline, so every page must render through here.
 */
export function ThemeRoot({
  themeId,
  slug,
  state,
  renderedAt,
  children,
}: {
  themeId: string | null;
  slug?: string;
  state: PageState;
  renderedAt?: string;
  children: ReactNode;
}) {
  const { theme, fallback } = resolveTheme(themeId);
  if (fallback && themeId) {
    // Only the ids: enough to find the tenant whose theme was retired, nothing about the guest.
    console.warn(JSON.stringify({ event: 'menu.theme_fallback', themeId: themeId.slice(0, 40), slug }));
  }
  return (
    <>
      {/* Overscroll and the area behind the iOS toolbars show the html background, not the page's. */}
      <style>{`html{background:${theme.tokens.bg}}`}</style>
      <div
        className="qx-menu"
        data-theme={theme.id}
        data-layout={theme.layout}
        data-header={theme.header}
        data-ornament={theme.ornament}
        data-price={theme.price}
        data-qx-state={state}
        data-qx-rendered-at={renderedAt}
        style={themeStyle(theme)}
      >
        {children}
      </div>
    </>
  );
}
