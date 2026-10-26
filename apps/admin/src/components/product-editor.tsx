'use client';
import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import {
  ALLERGEN_CODES,
  ALLERGEN_LABELS_TR,
  ALLERGEN_STATUSES,
  ALLERGEN_STATUS_LABELS_TR,
  formatMinorPlain,
  parsePriceToMinor,
  type AllergenCode,
  type AllergenStatus,
} from '@qmenux/contracts';
import { Banner, Button, Card, ConfirmDialog, Field, Select, SelectField, TextareaField, TextField, useFocusFirstError, useToast } from '@qmenux/ui';
import { api, isProblem } from '@/lib/api';
import { IMAGE_TYPES, imageError } from '@/lib/media';
import type { Category, Product } from '@/lib/types';

type Source = 'MANUAL' | 'IMPORT' | 'AI_SUGGESTION' | 'SUPPLIER';
type AllergenState = { status: AllergenStatus; verified: boolean; source: Source };

const SOURCE_LABELS: Record<Source, string> = { MANUAL: 'Elle girildi', IMPORT: 'İçe aktarıldı', AI_SUGGESTION: 'Yapay zekâ önerisi', SUPPLIER: 'Tedarikçi' };

function initialAllergens(p?: Product): Record<AllergenCode, AllergenState> {
  const out = {} as Record<AllergenCode, AllergenState>;
  for (const code of ALLERGEN_CODES) {
    const row = p?.allergens.find((a) => a.code === code);
    out[code] = row
      ? { status: row.status, verified: row.verification === 'VERIFIED', source: row.source as Source }
      : { status: 'UNKNOWN', verified: false, source: 'MANUAL' };
  }
  return out;
}

export function ProductEditor({ product, categories, categoryId }: { product?: Product; categories: Category[]; categoryId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [p, setP] = useState(product);
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? formatMinorPlain(product.priceMinor) : '');
  const [cat, setCat] = useState(product?.categoryId ?? categoryId);
  const [tags, setTags] = useState(product?.tags.join(', ') ?? '');
  const [kcal, setKcal] = useState(product?.calories ? String(product.calories.kcal) : '');
  const [kcalVerified, setKcalVerified] = useState(product?.calories?.verification === 'VERIFIED');
  const [allergens, setAllergens] = useState(() => initialAllergens(product));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useFocusFirstError(errors);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const back = `/menu/c/${cat}`;

  const setAllergen = (code: AllergenCode, next: Partial<AllergenState>) => setAllergens((s) => ({ ...s, [code]: { ...s[code], ...next } }));

  function payload() {
    const next: Record<string, string> = {};
    const priceMinor = parsePriceToMinor(price);
    if (!name.trim()) next.name = 'Ürün adını girin.';
    if (priceMinor === null) next.priceMinor = 'Fiyatı 45 veya 45,50 biçiminde girin.';
    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (tagList.length > 8) next.tags = 'En fazla 8 etiket.';
    else if (tagList.some((t) => t.length > 24)) next.tags = 'Her etiket en fazla 24 karakter.';
    const kcalNum = kcal.trim() === '' ? null : Number(kcal);
    if (kcalNum !== null && (!Number.isInteger(kcalNum) || kcalNum < 0 || kcalNum > 10000)) next.calories = '0 ile 10000 arasında tam sayı girin.';
    setErrors(next);
    if (Object.keys(next).length) return null;
    return {
      categoryId: cat,
      name: name.trim(),
      description: description.trim(),
      priceMinor: priceMinor!,
      tags: tagList,
      calories: kcalNum === null ? null : { kcal: kcalNum, verification: kcalVerified ? 'VERIFIED' : 'UNVERIFIED', source: p?.calories?.source ?? 'MANUAL' },
      // UNKNOWN is the same as "no entry": only send what the owner actually stated.
      allergens: ALLERGEN_CODES.filter((c) => allergens[c].status !== 'UNKNOWN').map((code) => ({
        code,
        status: allergens[code].status,
        verification: allergens[code].verified ? 'VERIFIED' : 'UNVERIFIED',
        source: allergens[code].source,
      })),
    };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = payload();
    if (!body) return;
    setBusy(true);
    try {
      if (p) {
        const r = await api<{ version: number }>(`admin/products/${p.id}`, { method: 'PATCH', json: { ...body, expectedVersion: p.version } });
        setP({ ...p, version: r.version });
        toast({ message: 'Kaydedildi. Müşteriler yayınladığınızda görür.' });
        router.push(back);
      } else {
        const r = await api<{ id: string }>('admin/products', { json: body });
        toast({ message: 'Ürün eklendi. Şimdi görsel ekleyebilirsiniz.' });
        router.replace(`/menu/p/${r.id}`);
      }
    } catch (err) {
      if (isProblem(err, 'CONFLICT')) setConflict(true);
      else if (isProblem(err, 'VALIDATION_FAILED')) setErrors(err.fieldErrors());
      else setErrors({ _: err instanceof Error ? err.message : 'Kaydedilemedi.' });
    } finally {
      setBusy(false);
    }
  }

  const unverified = ALLERGEN_CODES.filter((c) => allergens[c].status !== 'UNKNOWN' && !allergens[c].verified).length;
  const unknown = ALLERGEN_CODES.filter((c) => allergens[c].status === 'UNKNOWN').length;

  return (
    <form ref={formRef} className="qx-stack" onSubmit={submit} noValidate>
      {conflict && (
        <Banner
          tone="warning"
          live="alert"
          title="Bu ürün başka bir cihazda değiştirildi"
          action={
            <Button size="sm" icon={<RefreshCw size={16} />} onClick={() => window.location.reload()}>
              Son hâlini yükle
            </Button>
          }
        >
          Kaydetmeden önce güncel hâlini yükleyin; buradaki değişiklikleriniz kaybolur.
        </Banner>
      )}
      {errors._ && (
        <Banner tone="danger" live="alert">
          {errors._}
        </Banner>
      )}

      <Card className="qx-stack">
        <TextField label="Ürün adı" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} error={errors.name} required />
        <TextField
          label="Fiyat"
          inputMode="decimal"
          autoComplete="off"
          value={price}
          affix="₺"
          onChange={(e) => setPrice(e.target.value)}
          onBlur={() => {
            const m = parsePriceToMinor(price);
            if (m !== null) setPrice(formatMinorPlain(m));
          }}
          error={errors.priceMinor}
          required
        />
        <TextareaField label="Açıklama" optional rows={3} maxLength={600} value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} />
        <SelectField label="Kategori" value={cat} onChange={(e) => setCat(e.target.value)}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <TextField label="Etiketler" optional value={tags} onChange={(e) => setTags(e.target.value)} hint="Virgülle ayırın: vegan, acı, yeni" error={errors.tags} />
      </Card>

      {p ? <ImageCard product={p} onChange={setP} /> : <Banner tone="info">Görseli ürünü kaydettikten sonra ekleyebilirsiniz.</Banner>}

      <section className="qx-stack qx-stack--tight" aria-labelledby="allergens-title">
        <h2 id="allergens-title" className="qx-section__title">
          Alerjenler
        </h2>
        <Banner tone="warning" title="Müşteriye yalnızca kontrol ettiğiniz bilgiler gösterilir">
          {unknown === ALLERGEN_CODES.length
            ? 'Hiçbir alerjen için bilgi girilmedi; menüde “bilgi yok” olarak görünür.'
            : unverified > 0
              ? `${unverified} alerjen henüz kontrol edilmedi ve menüde “bilgi yok” olarak görünür.`
              : 'Girilen tüm alerjenleri kontrol ettiniz.'}{' '}
          Tarif veya tedarikçi bilgisini kendiniz doğrulayın.
        </Banner>
        <Card flush>
          {ALLERGEN_CODES.map((code) => {
            const a = allergens[code];
            const ai = a.source === 'AI_SUGGESTION';
            return (
              <div key={code} className="qx-allergen">
                <Field label={ALLERGEN_LABELS_TR[code]} hint={a.source !== 'MANUAL' ? `Kaynak: ${SOURCE_LABELS[a.source]}` : undefined}>
                  {(a11y) => (
                    <Select
                      {...a11y}
                      value={a.status}
                      // Any change is a new human statement: it starts unverified and becomes manual.
                      onChange={(e) => setAllergen(code, { status: e.target.value as AllergenStatus, verified: false, source: 'MANUAL' })}
                    >
                      {ALLERGEN_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {ALLERGEN_STATUS_LABELS_TR[s]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                {a.status !== 'UNKNOWN' && (
                  <label className="qx-check">
                    <input type="checkbox" checked={a.verified} disabled={ai} onChange={(e) => setAllergen(code, { verified: e.target.checked })} />
                    <span>
                      {/* Fourteen identical labels are useless in a screen reader's form list. */}
                      <span className="qx-visually-hidden">{ALLERGEN_LABELS_TR[code]}: </span>
                      {ai ? 'Yapay zekâ önerisi doğrulanamaz; değeri kendiniz seçin.' : 'Bu bilgiyi kontrol ettim'}
                    </span>
                  </label>
                )}
              </div>
            );
          })}
        </Card>
      </section>

      <Card className="qx-stack qx-stack--tight">
        <TextField label="Kalori (kcal)" optional inputMode="numeric" hint="Kontrol edilmeyen kalori değeri müşteriye gösterilmez." value={kcal} onChange={(e) => {
          setKcal(e.target.value.replace(/[^0-9]/g, ''));
          setKcalVerified(false);
        }} error={errors.calories} />
        {kcal !== '' && (
          <label className="qx-check">
            <input type="checkbox" checked={kcalVerified} onChange={(e) => setKcalVerified(e.target.checked)} />
            <span>
              <span className="qx-visually-hidden">Kalori: </span>Bu değeri kontrol ettim
            </span>
          </label>
        )}
      </Card>

      <div className="qx-savebar">
        <Button type="submit" variant="primary" loading={busy}>
          {p ? 'Kaydet' : 'Ürünü ekle'}
        </Button>
      </div>

      {p && (
        <>
          <Button variant="danger-ghost" block icon={<Trash2 size={16} />} onClick={() => setDeleting(true)}>
            Ürünü sil
          </Button>
          <ConfirmDialog
            open={deleting}
            title={`“${p.name}” silinsin mi?`}
            confirmLabel="Ürünü sil"
            onClose={() => setDeleting(false)}
            onConfirm={async () => {
              try {
                await api(`admin/products/${p.id}`, { method: 'DELETE' });
                toast({ message: 'Ürün silindi. Yayınlayana kadar müşteri menüsünde kalır.' });
                router.replace(back);
              } catch (e) {
                toast({ message: e instanceof Error ? e.message : 'Silinemedi.' });
                setDeleting(false);
              }
            }}
          >
            Yayınlanmış eski sürümler geçmişte kalır.
          </ConfirmDialog>
        </>
      )}
    </form>
  );
}

function ImageCard({ product, onChange }: { product: Product; onChange: (p: Product) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const src = preview ?? product.imageUrl;

  async function upload(file: File) {
    setError(null);
    const invalid = imageError(file);
    if (invalid) return setError(invalid);
    setBusy(true);
    const url = URL.createObjectURL(file);
    setPreview(url);
    try {
      await api(`admin/products/${product.id}/image`, { method: 'PUT', body: file, contentType: file.type });
      const r = await api<{ product: Product }>(`admin/products/${product.id}`);
      onChange(r.product);
      toast({ message: 'Görsel güncellendi.' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi.');
    } finally {
      setPreview(null);
      URL.revokeObjectURL(url);
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`admin/products/${product.id}/image`, { method: 'DELETE' });
      onChange({ ...product, imageUrl: null, imageKey: null, activeMediaId: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaldırılamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="qx-stack qx-stack--tight">
      <span className="qx-section__title">Görsel</span>
      {src && <img className="qx-product-img" src={src} alt={`${product.name} görseli`} />}
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
      <div className="qx-row-actions">
        <Button icon={<ImagePlus size={16} />} loading={busy} onClick={() => input.current?.click()}>
          {product.imageUrl ? 'Değiştir' : 'Görsel ekle'}
        </Button>
        {product.imageUrl && !busy && (
          <Button variant="danger-ghost" icon={<Trash2 size={16} />} onClick={remove}>
            Kaldır
          </Button>
        )}
      </div>
      <p className="qx-small qx-muted">Her ürünün tek bir görseli olur. JPEG, PNG veya WebP; en fazla 5 MB.</p>
    </Card>
  );
}
