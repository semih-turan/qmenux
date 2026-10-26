import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { CloudOff, Store, UtensilsCrossed } from 'lucide-react';
import { Contact } from '@/components/contact';
import { GeoGate } from '@/components/geo-gate';
import { MenuBrowser } from '@/components/menu-browser';
import { MenuHeader } from '@/components/menu-header';
import { RetryButton } from '@/components/retry-button';
import { ScanBeacon } from '@/components/scan-beacon';
import { StatePage } from '@/components/state-page';
import { ThemeRoot } from '@/components/theme-root';
import { WifiCard } from '@/components/wifi-card';
import { formatStamp } from '@/lib/format';
import { loadMenu, type MenuLoad } from '@/lib/load';
import { resolveTheme } from '@/lib/themes';

// Availability and prices change during service; every request reads the live menu.
export const dynamic = 'force-dynamic';

function themeIdOf(l: MenuLoad): string | null {
  if (l.kind !== 'ok') return null;
  if (l.res.state === 'OK') return l.res.menu.themeId;
  if (l.res.state === 'GEOFENCE_REQUIRED') return l.res.themeId;
  return null;
}

export async function generateMetadata(): Promise<Metadata> {
  const l = await loadMenu();
  if (l.kind !== 'ok') return { title: { absolute: 'Menü' } };
  if (l.res.state === 'OK') return { title: { absolute: l.res.menu.displayName }, description: l.res.menu.tagline ?? undefined };
  if (l.res.state === 'GEOFENCE_REQUIRED') return { title: { absolute: l.res.displayName } };
  return { title: { absolute: 'Menü görüntülenemiyor' } };
}

export async function generateViewport(): Promise<Viewport> {
  const l = await loadMenu();
  const { theme } = resolveTheme(themeIdOf(l));
  // The status bar should match the very top of the page: the band header on a menu, the page elsewhere.
  const top = l.kind === 'ok' && l.res.state === 'OK' && theme.header === 'band' ? theme.tokens.accent : theme.tokens.bg;
  return { themeColor: top, colorScheme: theme.dark ? 'dark' : 'light' };
}

export default async function MenuPage() {
  const l = await loadMenu();
  if (l.kind === 'not-found') notFound();
  const renderedAt = new Date().toISOString();

  if (l.kind === 'error') {
    return (
      <ThemeRoot themeId={null} state="ERROR" renderedAt={renderedAt}>
        <StatePage icon={<CloudOff size={28} />} title="Menü şu anda yüklenemedi">
          <p>Bağlantıda bir sorun oluştu. Biraz sonra tekrar deneyin ya da personelden basılı menü isteyin.</p>
          <RetryButton />
        </StatePage>
      </ThemeRoot>
    );
  }

  const { res, slug } = l;
  if (res.state === 'UNAVAILABLE') {
    // Not published, licence inactive or suspended all read the same: the reason is the business's, not the guest's.
    return (
      <ThemeRoot themeId={null} slug={slug} state="UNAVAILABLE" renderedAt={renderedAt}>
        <StatePage icon={<Store size={28} />} title="Bu menü şu anda görüntülenemiyor">
          <p>Lütfen personelden basılı menü isteyin.</p>
        </StatePage>
      </ThemeRoot>
    );
  }

  if (res.state === 'GEOFENCE_REQUIRED') {
    return (
      <ThemeRoot themeId={res.themeId} slug={slug} state="GEOFENCE" renderedAt={renderedAt}>
        <ScanBeacon />
        <GeoGate displayName={res.displayName} mode={res.geofence.mode} />
      </ThemeRoot>
    );
  }

  const menu = { ...res.menu, categories: res.menu.categories.filter((c) => c.items.length > 0) };
  return (
    <ThemeRoot themeId={menu.themeId} slug={slug} state="OK" renderedAt={renderedAt}>
      <a className="m-skip" href="#menu">
        Menüye geç
      </a>
      <ScanBeacon />
      <MenuHeader menu={menu} />
      {menu.wifi && (
        <div className="m-wrap">
          <WifiCard ssid={menu.wifi.ssid} password={menu.wifi.password} />
        </div>
      )}
      {menu.categories.length > 0 ? (
        <MenuBrowser menu={menu} renderedAt={renderedAt} />
      ) : (
        <main id="menu" className="m-wrap" tabIndex={-1}>
          <div className="m-empty">
            <span className="m-empty__icon" aria-hidden="true">
              <UtensilsCrossed size={26} />
            </span>
            <h2>Menü hazırlanıyor</h2>
            <p>Şu an listelenen ürün yok. Personelden basılı menü isteyebilirsiniz.</p>
          </div>
        </main>
      )}
      <div className="m-wrap">
        <Contact branch={menu.branch} whatsapp={menu.whatsapp} />
        <footer className="m-ft">
          <p>Menü güncellemesi: {formatStamp(menu.revision.publishedAt)}</p>
          <p>Basılı menüyü personelden isteyebilirsiniz.</p>
          <p>QMenuX ile hazırlandı</p>
        </footer>
      </div>
    </ThemeRoot>
  );
}
