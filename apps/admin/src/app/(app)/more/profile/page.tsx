'use client';
import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, ImagePlus, Store } from 'lucide-react';
import { BUSINESS_TYPES, BUSINESS_TYPE_LABELS_TR, BUSINESS_TYPE_SUGGESTIONS, type BusinessType, type ThemeId } from '@qmenux/contracts';
import { Button, Card, SelectField, TextField, buttonClass, useFocusFirstError, useToast } from '@qmenux/ui';
import { Page } from '@/components/page';
import { useCan } from '@/components/session';
import { Loadable, NoAccess } from '@/components/states';
import { ThemePicker } from '@/components/theme-picker';
import { api, useApi, useSubmit } from '@/lib/api';
import { IMAGE_TYPES, imageError } from '@/lib/media';
import type { Dashboard } from '@/lib/types';

type Tenant = Dashboard['tenant'];

export default function ProfilePage() {
  const allowed = useCan('settings.write');
  const q = useApi<Dashboard>(allowed ? 'admin/dashboard' : null);

  return (
    <Page title="Profil ve tema" back="/more">
      {!allowed ? (
        <NoAccess />
      ) : (
        <Loadable q={q} rows={4}>
          {(d) => (
            <>
              <LogoCard tenant={d.tenant} onUploaded={() => void q.reload()} />
              <ProfileForm key={d.tenant.id} tenant={d.tenant} />
            </>
          )}
        </Loadable>
      )}
    </Page>
  );
}

function ProfileForm({ tenant }: { tenant: Tenant }) {
  const router = useRouter();
  const toast = useToast();
  const { busy, errors, setErrors, run } = useSubmit();
  const formRef = useFocusFirstError(errors);
  const [displayName, setDisplayName] = useState(tenant.displayName);
  const [tagline, setTagline] = useState(tenant.tagline ?? '');
  const [businessType, setBusinessType] = useState<BusinessType>(tenant.businessType);
  const [themeId, setThemeId] = useState<ThemeId>(tenant.themeId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) return setErrors({ displayName: 'İşletme adını girin.' });
    await run(async () => {
      await api('admin/business-profile', { method: 'PUT', json: { displayName: name, tagline: tagline.trim(), businessType, themeId } });
      toast({ message: 'Kaydedildi. Müşteri menüsü hemen güncellenir.' });
      router.refresh(); // the shell reads the business name from the server session
    });
  }

  return (
    <form ref={formRef} className="qx-stack" onSubmit={submit} noValidate>
      <Card className="qx-stack">
        <TextField
          label="İşletme adı"
          value={displayName}
          maxLength={80}
          autoComplete="organization"
          enterKeyHint="next"
          onChange={(e) => setDisplayName(e.target.value)}
          error={errors.displayName}
          required
        />
        <TextField
          label="Kısa açıklama"
          hint="Menünün üstünde, adın altında görünür."
          placeholder="Örneğin Moda'da üçüncü dalga kahve"
          value={tagline}
          maxLength={140}
          enterKeyHint="next"
          onChange={(e) => setTagline(e.target.value)}
          error={errors.tagline}
          counter={`${tagline.length}/140`}
          optional
        />
        <SelectField
          label="İşletme türü"
          hint="Yalnızca tema ve kategori önerisi için kullanılır; menünüzü değiştirmez."
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value as BusinessType)}
          error={errors.businessType}
        >
          {BUSINESS_TYPES.map((t) => (
            <option key={t} value={t}>
              {BUSINESS_TYPE_LABELS_TR[t]}
            </option>
          ))}
        </SelectField>
      </Card>

      <section className="qx-stack qx-stack--tight" aria-labelledby="theme">
        <div className="qx-between">
          <h2 id="theme" className="qx-section__title">
            Menü teması
          </h2>
          <a href={tenant.menuUrl} target="_blank" rel="noopener noreferrer" className={buttonClass('ghost', 'sm')}>
            <ExternalLink size={16} aria-hidden="true" />
            Menüyü aç
          </a>
        </div>
        <p className="qx-small qx-muted">Tema yalnızca müşterinin gördüğü menüyü değiştirir; bu panel aynı kalır.</p>
        <ThemePicker value={themeId} suggested={BUSINESS_TYPE_SUGGESTIONS[businessType].theme} onChange={setThemeId} />
      </section>

      {errors._ && (
        <p className="qx-error" role="alert">
          {errors._}
        </p>
      )}
      <div className="qx-savebar">
        <Button type="submit" variant="primary" loading={busy}>
          Kaydet
        </Button>
      </div>
    </form>
  );
}

function LogoCard({ tenant, onUploaded }: { tenant: Tenant; onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const src = preview ?? tenant.logoUrl;

  async function upload(file: File) {
    setError(null);
    const invalid = imageError(file);
    if (invalid) return setError(invalid);
    setBusy(true);
    const url = URL.createObjectURL(file);
    setPreview(url);
    try {
      await api('admin/logo', { method: 'PUT', body: file, contentType: file.type });
      toast({ message: 'Logo güncellendi.' });
      onUploaded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi.');
    } finally {
      setPreview(null);
      URL.revokeObjectURL(url);
      setBusy(false);
    }
  }

  return (
    <Card className="qx-stack qx-stack--tight">
      <div className="qx-media-row">
        {src ? (
          <img className="qx-logo" src={src} alt={`${tenant.displayName} logosu`} />
        ) : (
          <span className="qx-logo qx-logo--empty" aria-hidden="true">
            <Store size={28} />
          </span>
        )}
        <div className="qx-stack qx-stack--tight" style={{ minWidth: 0 }}>
          <span className="qx-section__title">Logo</span>
          <Button size="sm" icon={<ImagePlus size={16} />} loading={busy} onClick={() => input.current?.click()}>
            {tenant.logoUrl ? 'Değiştir' : 'Logo yükle'}
          </Button>
        </div>
      </div>
      {error && (
        <p className="qx-error" role="alert">
          {error}
        </p>
      )}
      <input
        ref={input}
        type="file"
        accept={IMAGE_TYPES.join(',')}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void upload(f);
        }}
      />
      <p className="qx-small qx-muted">Kare bir görsel en iyi sonucu verir. JPEG, PNG veya WebP; en fazla 5 MB.</p>
    </Card>
  );
}
