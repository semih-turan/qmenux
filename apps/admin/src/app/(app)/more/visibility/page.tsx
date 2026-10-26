'use client';
import { useState, type ClipboardEvent, type FormEvent } from 'react';
import { Crosshair, ExternalLink } from 'lucide-react';
import { MAX_RADIUS_KM, MIN_RADIUS_KM, isValidCoord } from '@qmenux/contracts';
import { Banner, Button, Card, ConfirmDialog, Segmented, TextField, useFocusFirstError, useToast } from '@qmenux/ui';
import { Page } from '@/components/page';
import { useCan } from '@/components/session';
import { Loadable, NoAccess } from '@/components/states';
import { api, useApi, useSubmit } from '@/lib/api';
import { formatKm, parseDecimal } from '@/lib/format';
import type { Branch } from '@/lib/types';

type Mode = 'OFF' | 'RADIUS';

const RADIUS_PRESETS = [0.1, 0.25, 0.5, 1, 2];

export default function VisibilityPage() {
  const allowed = useCan('settings.write');
  const q = useApi<Branch>(allowed ? 'admin/branch' : null);

  return (
    <Page title="Konum görünürlüğü" back="/more">
      {!allowed ? (
        <NoAccess />
      ) : (
        <Loadable q={q} rows={4}>
          {(b) => <VisibilityForm key={`${b.branch.id}:${b.geofence.policyVersion}`} geofence={b.geofence} onSaved={() => void q.reload()} />}
        </Loadable>
      )}
    </Page>
  );
}

const fmtCoord = (n: number) => String(Number(n.toFixed(6))).replace('.', ',');

/**
 * Best-effort visibility, not security: guests share their location only after tapping a button,
 * the check runs once and coordinates are not stored. Province/district limits wait for official
 * boundary data (DECISIONS.md D-GEO-01), so only OFF and RADIUS are offered.
 */
function VisibilityForm({ geofence, onSaved }: { geofence: Branch['geofence']; onSaved: () => void }) {
  const toast = useToast();
  const { busy, errors, setErrors, run } = useSubmit();
  const formRef = useFocusFirstError(errors);
  const unsupported = geofence.mode === 'ADMIN_REGIONS' || geofence.mode === 'COMBINED';
  const [mode, setMode] = useState<Mode>(geofence.mode === 'RADIUS' ? 'RADIUS' : 'OFF');
  const [lat, setLat] = useState(geofence.center ? fmtCoord(geofence.center.lat) : '');
  const [lng, setLng] = useState(geofence.center ? fmtCoord(geofence.center.lng) : '');
  const [radius, setRadius] = useState(geofence.radiusKm ? String(geofence.radiusKm).replace('.', ',') : '0,5');
  const [locating, setLocating] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  const latN = parseDecimal(lat);
  const lngN = parseDecimal(lng);
  const radiusN = parseDecimal(radius);
  const center = latN !== null && lngN !== null && isValidCoord(latN, lngN) ? { lat: latN, lng: lngN } : null;
  const radiusKm = radiusN !== null && radiusN >= MIN_RADIUS_KM && radiusN <= MAX_RADIUS_KM ? radiusN : null;

  function locate() {
    if (!('geolocation' in navigator)) return setErrors({ center: 'Bu tarayıcı konum vermiyor. Koordinatları elle girin.' });
    setLocating(true);
    setErrors({});
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(fmtCoord(p.coords.latitude));
        setLng(fmtCoord(p.coords.longitude));
        setAccuracy(Math.round(p.coords.accuracy));
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setErrors({
          center:
            err.code === err.PERMISSION_DENIED
              ? 'Konum izni verilmedi. Tarayıcı ayarlarından izin verin ya da koordinatları elle girin.'
              : err.code === err.TIMEOUT
                ? 'Konum zamanında alınamadı. Açık alanda yeniden deneyin.'
                : 'Konum alınamadı. Koordinatları elle girin.',
        });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  // Map apps copy "41.0082, 28.9784": split it across both fields.
  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const m = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(e.clipboardData.getData('text'));
    if (!m) return;
    e.preventDefault();
    setLat(m[1]!.replace('.', ','));
    setLng(m[2]!.replace('.', ','));
    setAccuracy(null);
  }

  function validate(): boolean {
    if (mode === 'OFF') return true;
    // Per-field errors mark the input invalid, so focus lands on the first one to fix.
    const next: Record<string, string> = {};
    if (latN === null || Math.abs(latN) > 90) next.lat = '−90 ile 90 arasında bir sayı girin.';
    if (lngN === null || Math.abs(lngN) > 180) next.lng = '−180 ile 180 arasında bir sayı girin.';
    if (radiusKm === null) next.radiusKm = `Yarıçap ${formatKm(MIN_RADIUS_KM)} ile ${formatKm(MAX_RADIUS_KM)} arasında olmalı.`;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save() {
    await run(async () => {
      const json = mode === 'OFF' ? { mode, center: null, radiusKm: null, regions: [] } : { mode, center, radiusKm, regions: [] };
      await api('admin/branch/visibility', { method: 'PUT', json });
      toast({ message: mode === 'OFF' ? 'Kaydedildi. Menü her yerden açılır.' : 'Kaydedildi. Misafirler menüyü açarken konum onayı verir.' });
      onSaved();
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (mode === 'RADIUS' && geofence.mode !== 'RADIUS') return setConfirming(true);
    void save();
  }

  return (
    <form ref={formRef} className="qx-stack" onSubmit={submit} noValidate>
      {unsupported && (
        <Banner tone="warning" title="Kayıtlı il/ilçe ayarı desteklenmiyor">
          Bu ayar şu an uygulanamıyor. Yarıçap seçip kaydedin ya da kısıtlamayı kapatın.
        </Banner>
      )}

      <Card className="qx-stack">
        <Segmented<Mode>
          label="Konum kısıtlaması"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'OFF', label: 'Kapalı' },
            { value: 'RADIUS', label: 'Yarıçap' },
          ]}
        />
        <p className="qx-small qx-muted">
          {mode === 'OFF'
            ? 'Menü her yerden açılır ve misafirden konum istenmez.'
            : 'Menü yalnızca işletmenin çevresinde açılır. Misafir menüyü açarken bir kez konum paylaşmaya onay verir.'}
        </p>
      </Card>

      {mode === 'RADIUS' && (
        <>
          <Card className="qx-stack">
            <div className="qx-stack qx-stack--tight">
              <span className="qx-section__title">İşletmenin konumu</span>
              <Button icon={<Crosshair size={16} />} block loading={locating} onClick={locate}>
                Bulunduğum konumu kullan
              </Button>
              {accuracy !== null && <p className="qx-small qx-muted">Konum yaklaşık ±{accuracy} m doğrulukla alındı. İşletmenin içindeyken almanızı öneririz.</p>}
            </div>
            <div className="qx-grid-2 qx-grid-2--fields">
              <TextField label="Enlem" inputMode="decimal" autoComplete="off" placeholder="41,0082" value={lat} error={errors.lat} onPaste={onPaste} onChange={(e) => (setLat(e.target.value), setAccuracy(null))} />
              <TextField label="Boylam" inputMode="decimal" autoComplete="off" placeholder="28,9784" value={lng} error={errors.lng} onPaste={onPaste} onChange={(e) => (setLng(e.target.value), setAccuracy(null))} />
            </div>
            {errors.center && (
              <p className="qx-error" role="alert">
                {errors.center}
              </p>
            )}
            {center && (
              <a
                className="qx-small"
                href={`https://www.openstreetmap.org/?mlat=${center.lat}&mlon=${center.lng}#map=17/${center.lat}/${center.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44 }}
              >
                <ExternalLink size={16} aria-hidden="true" />
                Konumu haritada kontrol et
              </a>
            )}
          </Card>

          <Card className="qx-stack qx-stack--tight">
            <TextField
              label="Yarıçap"
              inputMode="decimal"
              autoComplete="off"
              affix="km"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              error={errors.radiusKm}
              hint={radiusKm !== null ? `Merkezden ${formatKm(radiusKm)} uzağa kadar; çap ${formatKm(radiusKm * 2)}.` : `${formatKm(MIN_RADIUS_KM)} – ${formatKm(MAX_RADIUS_KM)} arası.`}
            />
            <div className="qx-chips" role="group" aria-label="Hazır yarıçaplar">
              {RADIUS_PRESETS.map((r) => (
                <button key={r} type="button" className="qx-chip" aria-pressed={radiusN === r} onClick={() => setRadius(String(r).replace('.', ','))}>
                  <span>{formatKm(r)}</span>
                </button>
              ))}
            </div>
          </Card>

          <Banner tone="warning" title="Bu bir güvenlik önlemi değildir">
            Konum izni vermeyen ya da alanın dışında olan misafir menüyü göremez. Konum taklit edilebilir; GPS’in zayıf olduğu kapalı alanlarda yarıçapı geniş tutun.
          </Banner>
        </>
      )}

      {errors._ && (
        <p className="qx-error" role="alert">
          {errors._}
        </p>
      )}
      <Button type="submit" variant="primary" block loading={busy}>
        Kaydet
      </Button>

      <ConfirmDialog
        open={confirming}
        tone="primary"
        title="Konum kısıtlaması açılsın mı?"
        confirmLabel="Aç ve kaydet"
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          await save();
          setConfirming(false);
        }}
      >
        Misafirler menüyü yalnızca işletmenin {radiusKm !== null ? formatKm(radiusKm) : ''} çevresindeyken ve konumlarını paylaşınca açabilir. Konum izni vermeyenler menüyü göremez.
      </ConfirmDialog>
    </form>
  );
}
