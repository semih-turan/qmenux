'use client';
import { Check, Copy, Wifi } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { sendMetric } from '@/lib/beacon';

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * Optional guest Wi-Fi (amendment 2026-10-25). The network name is always visible; the password is
 * shown on request so it is not read off a shoulder, and the reveal is the only thing counted.
 */
export function WifiCard({ ssid, password }: { ssid: string; password: string | null }) {
  const [shown, setShown] = useState(false);
  const [copy, setCopy] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const reveal = () => {
    setShown(true);
    sendMetric('wifi_reveal', undefined, true);
  };

  const copyPassword = async () => {
    if (!password) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(password);
      ok = true;
    } catch {
      ok = false;
    }
    setCopy(ok ? 'copied' : 'failed');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopy('idle'), 2400);
  };

  return (
    <section className="m-wifi" aria-labelledby="m-wifi-title">
      <span className="m-wifi__icon" aria-hidden="true">
        <Wifi size={20} />
      </span>
      <div className="m-wifi__text">
        <h2 className="m-wifi__label" id="m-wifi-title">
          Wi-Fi
        </h2>
        <p className="m-wifi__ssid">{ssid}</p>
      </div>
      {password === null ? (
        <p className="m-wifi__none">Bu ağ için şifre gerekmiyor.</p>
      ) : (
        <div className="m-wifi__actions">
          {shown ? (
            <>
              <span className="m-wifi__pass">
                <span className="m-sr">Şifre: </span>
                {password}
              </span>
              <button type="button" className="m-btn m-btn--sm" onClick={copyPassword}>
                {copy === 'copied' ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
                {copy === 'copied' ? 'Kopyalandı' : 'Kopyala'}
              </button>
            </>
          ) : (
            <button type="button" className="m-btn m-btn--sm" onClick={reveal}>
              Şifreyi göster
            </button>
          )}
          {/* One live region: "copied" is already on the button, so only a failure needs to be seen. */}
          <p className={copy === 'failed' ? 'm-wifi__none' : 'm-sr'} role="status">
            {copy === 'copied' ? 'Şifre kopyalandı' : copy === 'failed' ? 'Kopyalanamadı. Şifreyi basılı tutup kopyalayabilirsiniz.' : ''}
          </p>
        </div>
      )}
    </section>
  );
}
