'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { BUSINESS_TYPE_LABELS_TR, BUSINESS_TYPES, checkSlug, foldTr, normalizeSlug, type BusinessType } from '@qmenux/contracts';
import { Badge, Banner, Button, Card, ConfirmDialog, EmptyState, SelectField, TextareaField, TextField, buttonClass, useFocusFirstError, useToast } from '@qmenux/ui';
import { api, isProblem } from '@/lib/api';
import { PHONE_RE, cleanPhone, noWrap } from '@/lib/format';
import type { Application } from '@/lib/types';

// Draft terms placeholder: the legal text is not lawyer-approved yet (LEG-001..005). The version
// the applicant saw is stored with the application so it can be re-confirmed after legal review.
const TERMS_VERSION = 'draft-0';

const STATUS: Record<Application['status'], { label: string; tone: 'warning' | 'success' | 'danger' | 'neutral' }> = {
  PENDING: { label: 'İncelemede', tone: 'warning' },
  APPROVED: { label: 'Onaylandı', tone: 'success' },
  REJECTED: { label: 'Reddedildi', tone: 'danger' },
  WITHDRAWN: { label: 'Geri çekildi', tone: 'neutral' },
};

/** Like normalizeSlug but keeps a trailing hyphen so "kahve-" can be typed; full normalisation runs on blur. */
const typingSlug = (v: string) => foldTr(v).replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 32);

type SlugState = { kind: 'idle' } | { kind: 'checking' } | { kind: 'ok' } | { kind: 'bad'; message: string };

export function OnboardingClient({ email, hasMemberships, initial }: { email: string; hasMemberships: boolean; initial: Application[] }) {
  const [apps, setApps] = useState(initial);
  const [withdrawing, setWithdrawing] = useState<Application | null>(null);
  const toast = useToast();
  const pending = apps.find((a) => a.status === 'PENDING');
  const approved = apps.find((a) => a.status === 'APPROVED');

  async function refresh() {
    const r = await api<{ applications: Application[] }>('onboarding/applications');
    setApps(r.applications);
  }

  return (
    <>
      {hasMemberships && (
        <Banner tone="success" title="Bir işletmeye zaten erişiminiz var" action={<a className={buttonClass('primary', 'sm')} href="/"><span className="qx-btn__label">Panele git</span></a>}>
          Yeni bir işletme için başvuru da yapabilirsiniz.
        </Banner>
      )}
      {pending ? (
        <PendingCard app={pending} onWithdraw={() => setWithdrawing(pending)} />
      ) : approved && !hasMemberships ? (
        <EmptyState icon={<CheckCircle2 size={28} />} title="Başvurunuz onaylandı" action={<a className={buttonClass('primary')} href="/"><span className="qx-btn__label">Panele git</span></a>}>
          Lisans tanımlandığında menünüzü yayınlayabilirsiniz.
        </EmptyState>
      ) : (
        <ApplicationForm email={email} onSubmitted={refresh} />
      )}

      {apps.some((a) => a !== pending) && (
        <section className="qx-stack qx-stack--tight" aria-labelledby="past">
          <h2 id="past" className="qx-section__title">Geçmiş başvurular</h2>
          {apps
            .filter((a) => a !== pending)
            .map((a) => (
              <Card key={a.id} className="qx-stack qx-stack--tight">
                <div className="qx-between">
                  <strong className="qx-truncate">{a.businessName}</strong>
                  <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
                </div>
                <span className="qx-small qx-muted qx-break">{a.slug}.qmenux.com · {new Date(a.submittedAt).toLocaleDateString('tr-TR')}</span>
                {a.decisionReason && <p className="qx-small qx-break">Gerekçe: {a.decisionReason}</p>}
              </Card>
            ))}
        </section>
      )}

      <ConfirmDialog
        open={withdrawing !== null}
        title="Başvuru geri çekilsin mi?"
        confirmLabel="Geri çek"
        onClose={() => setWithdrawing(null)}
        onConfirm={async () => {
          if (!withdrawing) return;
          try {
            await api(`onboarding/applications/${withdrawing.id}/withdraw`, { method: 'POST' });
            await refresh();
            toast({ message: 'Başvuru geri çekildi.' });
          } catch (e) {
            toast({ message: e instanceof Error ? e.message : 'Geri çekilemedi.' });
          }
          setWithdrawing(null);
        }}
      >
        İnceleme durur. Daha sonra yeni bir başvuru yapabilirsiniz.
      </ConfirmDialog>
    </>
  );
}

function PendingCard({ app, onWithdraw }: { app: Application; onWithdraw: () => void }) {
  return (
    <Card className="qx-stack">
      <div className="qx-between">
        <Clock size={22} aria-hidden="true" />
        <Badge tone="warning">İncelemede</Badge>
      </div>
      <div>
        <h1 className="qx-h1 qx-break">{app.businessName}</h1>
        <p className="qx-muted qx-break">{app.slug}.qmenux.com</p>
      </div>
      <p>
        Başvurunuz platform ekibi tarafından inceleniyor. Onaylandığında ve lisansınız tanımlandığında panel açılır. Bu süreçte sizden ödeme
        alınmaz.
      </p>
      <Button variant="danger-ghost" icon={<XCircle size={16} />} onClick={onWithdraw}>
        Başvuruyu geri çek
      </Button>
    </Card>
  );
}

function ApplicationForm({ email, onSubmitted }: { email: string; onSubmitted: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [type, setType] = useState<BusinessType>('CAFE');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [note, setNote] = useState('');
  const [terms, setTerms] = useState(false);
  const [slugState, setSlugState] = useState<SlugState>({ kind: 'idle' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useFocusFirstError(errors);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Suggest an address from the business name until the user edits it themselves.
  useEffect(() => {
    if (!slugTouched) setSlug(normalizeSlug(name).slice(0, 32));
  }, [name, slugTouched]);

  useEffect(() => {
    if (!slug) return setSlugState({ kind: 'idle' });
    const local = checkSlug(slug);
    if (!local.ok) return setSlugState({ kind: 'bad', message: local.reason === 'RESERVED' ? 'Bu adres sistem için ayrılmış.' : 'En az 3 karakter; küçük harf, rakam ve tire kullanın.' });
    setSlugState({ kind: 'checking' });
    const t = setTimeout(async () => {
      try {
        const r = await api<{ available: boolean; reason: string | null }>(`onboarding/slug-check?slug=${encodeURIComponent(slug)}`);
        setSlugState(r.available ? { kind: 'ok' } : { kind: 'bad', message: 'Bu adres kullanılıyor.' });
      } catch {
        setSlugState({ kind: 'idle' });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [slug]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.businessName = 'İşletme adını girin.';
    if (slugState.kind === 'bad') next.slug = slugState.message;
    if (!PHONE_RE.test(cleanPhone(phone))) next.contactPhone = `Telefonu ${noWrap('0555 123 45 67')} biçiminde girin.`;
    if (!city.trim()) next.city = 'Şehri girin.';
    if (!terms) next.terms = 'Devam etmek için koşulları okuduğunuzu onaylayın.';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api('onboarding/applications', {
        json: { businessName: name.trim(), slug, businessType: type, contactPhone: cleanPhone(phone), city: city.trim(), note: note.trim() || null, acceptedTermsVersion: TERMS_VERSION },
      });
      await onSubmitted();
    } catch (err) {
      if (isProblem(err, 'VALIDATION_FAILED')) setErrors(err.fieldErrors());
      else if (isProblem(err, 'SLUG_TAKEN') || isProblem(err, 'SLUG_INVALID')) setErrors({ slug: err.message });
      else setFormError(err instanceof Error ? err.message : 'Gönderilemedi.');
    } finally {
      setBusy(false);
    }
  }

  const slugHint =
    slugState.kind === 'checking' ? 'Kontrol ediliyor…' : slugState.kind === 'ok' ? `Uygun: ${slug}.qmenux.com` : 'Müşterileriniz menünüzü bu adreste açar.';

  return (
    <form ref={formRef} className="qx-stack" onSubmit={submit} noValidate>
      <div>
        <h1 className="qx-h1">İşletmenizi kaydedin</h1>
        <p className="qx-muted qx-break">
          {email} hesabıyla başvuruyorsunuz. Başvurular incelenip onaylandıktan sonra panel açılır.
        </p>
      </div>
      {formError && (
        <Banner tone="danger" live="alert">
          {formError}
        </Banner>
      )}
      <TextField label="İşletme adı" name="businessName" autoComplete="organization" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} error={errors.businessName} required />
      <TextField
        label="Menü adresi"
        name="slug"
        value={slug}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={32}
        affix=".qmenux.com"
        onChange={(e) => {
          setSlugTouched(true);
          setSlug(typingSlug(e.target.value));
        }}
        onBlur={() => setSlug(normalizeSlug(slug))}
        hint={slugState.kind === 'bad' ? undefined : slugHint}
        error={errors.slug ?? (slugState.kind === 'bad' ? slugState.message : undefined)}
        required
      />
      <SelectField label="İşletme türü" value={type} onChange={(e) => setType(e.target.value as BusinessType)} hint="Önerilen tema ve kategorileri belirler; hepsini sonra değiştirebilirsiniz.">
        {BUSINESS_TYPES.map((t) => (
          <option key={t} value={t}>
            {BUSINESS_TYPE_LABELS_TR[t]}
          </option>
        ))}
      </SelectField>
      <div className="qx-grid-2 qx-grid-2--fields">
        <TextField label="Telefon" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.contactPhone} required />
        <TextField label="Şehir" autoComplete="address-level1" value={city} maxLength={40} onChange={(e) => setCity(e.target.value)} error={errors.city} required />
      </div>
      <TextareaField label="Not" optional value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} hint="Şube sayısı, açılış tarihi gibi bilgiler." />
      <div className="qx-stack qx-stack--tight">
        <label className="qx-check">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} aria-describedby="terms-note" aria-invalid={errors.terms ? true : undefined} />
          <span>Hizmet koşullarını ve aydınlatma metnini okudum.</span>
        </label>
        <p id="terms-note" className="qx-small qx-muted">
          Metinler taslak sürümdür ({TERMS_VERSION}) ve hukuk incelemesi tamamlanınca yeniden onayınız istenecektir.
        </p>
        {errors.terms && (
          <p className="qx-error" role="alert">
            {errors.terms}
          </p>
        )}
      </div>
      <Button type="submit" variant="primary" size="lg" block loading={busy}>
        Başvuruyu gönder
      </Button>
    </form>
  );
}
