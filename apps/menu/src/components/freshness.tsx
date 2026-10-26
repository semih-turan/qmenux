'use client';
import { WifiOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { formatStamp } from '@/lib/format';

const STALE_AFTER_MS = 5 * 60 * 1000;
/** Waits between reachability checks once the phone says it is back online. */
const RETRY_MS = [1000, 2000, 4000, 8000, 15000];

/**
 * `online` fires as soon as a network interface comes up, often before requests get through, and a
 * reload at that moment just serves the saved copy again. A HEAD request skips the service worker,
 * so it answers only when the server is really reachable.
 */
async function reachable(): Promise<boolean> {
  try {
    const res = await fetch('/icon.svg', { method: 'HEAD', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Keeps an open menu honest about prices and stock. A tab brought back after a while re-reads the
 * menu; a copy served by the service worker while offline says so and reloads once the network is back.
 */
export function Freshness({ renderedAt }: { renderedAt: string }) {
  const router = useRouter();
  const [offlineCopy, setOfflineCopy] = useState(false);
  const renderedRef = useRef(renderedAt);
  useEffect(() => {
    renderedRef.current = renderedAt;
  }, [renderedAt]);

  useEffect(() => {
    // The service worker flips this attribute in the saved HTML before serving it.
    const served = document.documentElement.dataset.qxOffline === '1';
    setOfflineCopy(served);

    let timer: number | undefined;
    let attempt = 0;
    const reloadWhenReachable = async () => {
      window.clearTimeout(timer);
      if (await reachable()) {
        location.reload();
        return;
      }
      if (attempt < RETRY_MS.length) timer = window.setTimeout(reloadWhenReachable, RETRY_MS[attempt++]);
    };
    const retry = () => {
      attempt = 0;
      void reloadWhenReachable();
    };

    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      if (Date.now() - new Date(renderedRef.current).getTime() < STALE_AFTER_MS) return;
      if (served) retry();
      else router.refresh();
    };
    const onOnline = () => {
      if (served) retry();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [router]);

  if (!offlineCopy) return null;
  return (
    <p className="m-offline" role="status">
      <WifiOff size={18} aria-hidden="true" />
      <span>
        Bağlantı kurulamadı — menünün {formatStamp(renderedAt)} tarihli kayıtlı kopyasını görüyorsunuz. Fiyatlar ve stok durumu
        değişmiş olabilir.
      </span>
    </p>
  );
}
