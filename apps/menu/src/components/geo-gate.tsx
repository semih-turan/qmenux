'use client';
import { LoaderCircle, MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type Problem =
  | 'denied'
  | 'unavailable'
  | 'unsupported'
  | 'LOW_ACCURACY'
  | 'OUTSIDE'
  | 'RATE_LIMITED'
  | 'REGION_CHECK_UNAVAILABLE'
  | 'network';

const MESSAGES: Record<Problem, string> = {
  denied: 'Konum izni verilmedi. Tarayıcı ayarlarından bu site için konum iznini açıp tekrar deneyebilirsiniz.',
  unavailable: 'Konumunuz belirlenemedi. Açık alanda veya Wi-Fi açıkken tekrar deneyin.',
  unsupported: 'Bu tarayıcı konum paylaşmayı desteklemiyor. Personelden basılı menü isteyebilirsiniz.',
  LOW_ACCURACY: 'Konum yeterince hassas değil. Telefonunuzda hassas konumu açıp tekrar deneyin.',
  OUTSIDE: 'Görünüşe göre işletmenin dışındasınız. Bu menü yalnızca işletme içinde açılır.',
  RATE_LIMITED: 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin.',
  REGION_CHECK_UNAVAILABLE: 'Konum doğrulaması şu an kullanılamıyor.',
  network: 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.',
};

/** A retry asks for a fresh fix: a guest told "outside" who then walks in would otherwise get the
 * cached position from a minute ago and the same answer. */
function position(fresh: boolean): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: fresh ? 0 : 60000 }),
  );
}

/**
 * Location gate (GEOFENCE.md). Nothing is requested until the guest taps the button; the coordinates
 * go once to this host, the API compares and discards them, and only a short-lived signed pass is
 * kept in an HttpOnly cookie. It is a convenience barrier for the owner, not a security boundary.
 */
export function GeoGate({ displayName, mode }: { displayName: string; mode: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const radius = mode === 'RADIUS' || mode === 'COMBINED';

  const working = busy || refreshing;
  const check = async () => {
    if (working) return;
    if (!('geolocation' in navigator)) return setProblem('unsupported');
    const retry = problem !== null;
    setBusy(true);
    setProblem(null);
    try {
      let pos: GeolocationPosition;
      try {
        pos = await position(retry);
      } catch (e) {
        setProblem((e as GeolocationPositionError).code === 1 ? 'denied' : 'unavailable');
        return;
      }
      let res: Response;
      try {
        res = await fetch('/api/location', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: Math.round(pos.coords.accuracy) }),
        });
      } catch {
        setProblem('network');
        return;
      }
      const out = (await res.json().catch(() => null)) as { ok?: boolean; reason?: string } | null;
      if (res.status === 429) return setProblem('RATE_LIMITED');
      if (!res.ok || !out) return setProblem('network');
      if (!out.ok) {
        const r = out.reason as Problem | undefined;
        return setProblem(r && r in MESSAGES ? r : 'OUTSIDE');
      }
      startRefresh(() => router.refresh());
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="m-state" data-qx-gate="">
      <div className="m-state__card">
        <span className="m-state__icon" aria-hidden="true">
          <MapPin size={28} />
        </span>
        <h1>{displayName}</h1>
        <p>{displayName} menüsünü yalnızca işletmedeyken görüntüleyebilirsiniz. Bunun için konumunuzu bir kez paylaşmanız gerekir.</p>
        {radius ? (
          <>
            <p className="m-state__small">
              Konumunuz yalnızca bu kontrol için kullanılır ve kaydedilmez. Doğrulama 2 saat geçerlidir; bu süre için tarayıcınızda
              bir işlevsel çerez saklanır.
            </p>
            {problem && (
              <p className="m-state__alert" role="alert">
                {MESSAGES[problem]}
              </p>
            )}
            {/* aria-disabled, not disabled: a disabled button drops keyboard focus to the page while the check runs. */}
            <button type="button" className="m-btn m-btn--primary" onClick={check} aria-disabled={working} aria-busy={working}>
              {working ? <LoaderCircle className="m-spin" size={20} aria-hidden="true" /> : <MapPin size={20} aria-hidden="true" />}
              {working ? 'Konum kontrol ediliyor…' : problem ? 'Tekrar dene' : 'Konumumu paylaş ve menüyü aç'}
            </button>
          </>
        ) : (
          <p className="m-state__alert" role="status">
            {MESSAGES.REGION_CHECK_UNAVAILABLE}
          </p>
        )}
        <p className="m-state__small">Konum paylaşmak istemezseniz personelden basılı menü isteyebilirsiniz.</p>
      </div>
    </main>
  );
}
