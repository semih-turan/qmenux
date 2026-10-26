'use client';
import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { Button, Card, Switch, TextField, useFocusFirstError, useToast } from '@qmenux/ui';
import { Page } from '@/components/page';
import { useCan } from '@/components/session';
import { Loadable, NoAccess } from '@/components/states';
import { api, useApi, useSubmit } from '@/lib/api';
import type { Branch } from '@/lib/types';

export default function WifiPage() {
  const allowed = useCan('settings.write');
  const q = useApi<Branch>(allowed ? 'admin/branch' : null);

  return (
    <Page title="Wi-Fi" back="/more">
      {!allowed ? (
        <NoAccess />
      ) : (
        <Loadable q={q} rows={3}>
          {(b) => <WifiForm key={b.branch.id} wifi={b.wifi} />}
        </Loadable>
      )}
    </Page>
  );
}

/** keep = leave the stored password as is; set = replace it; clear = open network. */
type PasswordMode = 'keep' | 'set' | 'clear';

// The admin never sees the stored password: the API keeps it encrypted and only reports hasPassword.
function WifiForm({ wifi }: { wifi: Branch['wifi'] }) {
  const toast = useToast();
  const { busy, errors, setErrors, run } = useSubmit();
  const formRef = useFocusFirstError(errors);
  const [enabled, setEnabled] = useState(wifi.enabled);
  const [ssid, setSsid] = useState(wifi.ssid ?? '');
  const [stored, setStored] = useState(wifi.hasPassword);
  const [mode, setMode] = useState<PasswordMode>(wifi.hasPassword ? 'keep' : 'set');
  const [password, setPassword] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const name = ssid.trim();
    if (enabled && !name) return setErrors({ ssid: 'Ağ adını girin.' });
    if (stored && mode === 'set' && !password) return setErrors({ password: 'Yeni şifreyi girin ya da vazgeçin.' });
    // Hidden fields never change anything: switching Wi-Fi off keeps the stored password.
    const nextPassword = !enabled || mode === 'keep' ? undefined : mode === 'clear' ? '' : password || undefined;
    await run(async () => {
      await api('admin/branch/wifi', { method: 'PUT', json: { enabled, ssid: name || undefined, password: nextPassword } });
      const hasNow = nextPassword === undefined ? stored : nextPassword !== '';
      setStored(hasNow);
      setMode(hasNow ? 'keep' : 'set');
      setPassword('');
      toast({ message: enabled ? 'Kaydedildi. Wi-Fi bilgisi menüde görünür.' : 'Kaydedildi. Wi-Fi bilgisi menüde gizli.' });
    });
  }

  return (
    <form ref={formRef} className="qx-stack" onSubmit={submit} noValidate>
      <Card>
        <Switch checked={enabled} onCheckedChange={setEnabled} label="Menüde Wi-Fi bilgisini göster" description="Müşteriler ağ adını görür; şifreyi “Göster”e dokununca görür." />
      </Card>

      {enabled && (
        <Card className="qx-stack">
          <TextField
            label="Ağ adı (SSID)"
            value={ssid}
            maxLength={32}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            onChange={(e) => setSsid(e.target.value)}
            error={errors.ssid}
            required
          />

          {mode === 'keep' ? (
            <div className="qx-stack qx-stack--tight">
              <span className="qx-label">Şifre</span>
              <p className="qx-small qx-muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <KeyRound size={16} aria-hidden="true" />
                Kayıtlı bir şifre var. Güvenlik için burada gösterilmez.
              </p>
              <div className="qx-row-actions">
                <Button size="sm" onClick={() => setMode('set')}>
                  Şifreyi değiştir
                </Button>
                <Button size="sm" variant="danger-ghost" onClick={() => setMode('clear')}>
                  Şifreyi kaldır
                </Button>
              </div>
            </div>
          ) : mode === 'clear' ? (
            <div className="qx-stack qx-stack--tight">
              <span className="qx-label">Şifre</span>
              <p className="qx-small">Kaydettiğinizde şifre silinir ve menüde yalnızca ağ adı görünür (şifresiz ağ).</p>
              <div className="qx-row-actions">
                <Button size="sm" onClick={() => setMode('keep')}>
                  Vazgeç
                </Button>
              </div>
            </div>
          ) : (
            <div className="qx-stack qx-stack--tight">
              <TextField
                label={stored ? 'Yeni şifre' : 'Şifre'}
                value={password}
                maxLength={63}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
                hint={stored ? undefined : 'Şifresiz ağ için boş bırakın.'}
                optional={!stored}
              />
              {stored && (
                <div className="qx-row-actions">
                  <Button
                    size="sm"
                    onClick={() => {
                      setPassword('');
                      setMode('keep');
                    }}
                  >
                    Vazgeç
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <p className="qx-small qx-muted">
        Şifre şifrelenmiş olarak saklanır ve bu panelde bir daha gösterilmez. Menüyü açabilen herkes şifreyi görebilir; misafir ağı kullanmanızı öneririz.
      </p>
      {errors._ && (
        <p className="qx-error" role="alert">
          {errors._}
        </p>
      )}
      <Button type="submit" variant="primary" block loading={busy}>
        Kaydet
      </Button>
    </form>
  );
}
