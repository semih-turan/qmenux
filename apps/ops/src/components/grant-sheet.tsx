'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { Banner, Button, Sheet, TextField, TextareaField, useFocusFirstError } from '@qmenux/ui';
import { normalizeOtp } from '@/lib/otp';
import { api, isProblem, useSubmit } from '@/lib/api';
import { endOfDayIso, formatDate, plusMonths, toDateInput } from '@/lib/format';
import type { TenantDetail } from '@/lib/types';

const PRESETS = [
  { months: 1, label: '+1 ay' },
  { months: 3, label: '+3 ay' },
  { months: 6, label: '+6 ay' },
  { months: 12, label: '+12 ay' },
];

/** The current unrevoked grant's end, when it is still in the future; extensions start from there. */
function currentEnd(t: TenantDetail): Date | null {
  const live = t.grants.filter((g) => !g.revokedAt).map((g) => new Date(g.endsAt).getTime());
  if (live.length === 0) return null;
  const max = Math.max(...live);
  return max > Date.now() ? new Date(max) : null;
}

/**
 * Manual licence grant / extension (V1 has no payment gateway; PAY-002: only superadmin grants).
 * Step-up: a fresh TOTP code is required in the same request even inside an MFA session, and the
 * API verifies it server-side before writing anything.
 */
export function GrantSheet({ tenant, open, onClose, onDone }: { tenant: TenantDetail; open: boolean; onClose: () => void; onDone: (grantId: string) => void }) {
  const base = useMemo(() => currentEnd(tenant) ?? new Date(), [tenant]);
  const extending = currentEnd(tenant) !== null;
  const minDate = toDateInput(new Date(Math.max(base.getTime(), Date.now())));
  const [endsOn, setEndsOn] = useState(() => plusMonths(base, 12));
  const [note, setNote] = useState('');
  const [totp, setTotp] = useState('');
  const { busy, errors, setErrors, run } = useSubmit();
  const formRef = useFocusFirstError<HTMLFormElement>(errors);

  const close = () => {
    if (busy) return;
    setErrors({});
    setTotp('');
    onClose();
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    const iso = endOfDayIso(endsOn);
    if (!iso) next.endsAt = 'Geçerli bir bitiş tarihi seçin.';
    else if (new Date(iso).getTime() <= base.getTime()) next.endsAt = extending ? `Yeni bitiş ${formatDate(base.toISOString())} tarihinden sonra olmalı.` : 'Bitiş tarihi gelecekte olmalı.';
    const code = normalizeOtp(totp);
    if (!code) next.totp = 'Doğrulayıcı uygulamadaki altı haneli kodu girin.';
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    await run(async () => {
      try {
        const r = await api<{ grantId: string }>(`control/tenants/${tenant.id}/licenses`, { json: { endsAt: iso, note: note.trim() || undefined, totp: code } });
        setTotp('');
        setNote('');
        onDone(r.grantId);
      } catch (err) {
        // A wrong or reused code is a field problem: clear it so the next code is typed fresh.
        if (isProblem(err, 'MFA_INVALID')) {
          setTotp('');
          setErrors({ totp: err.message });
          return;
        }
        throw err;
      }
    });
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title={extending ? 'Lisansı uzat' : 'Lisans tanımla'}
      dismissible={!busy}
      description={
        extending
          ? `Mevcut lisans ${formatDate(base.toISOString())} tarihinde bitiyor; yeni dönem o günden başlar, erişim kesintiye uğramaz.`
          : 'Yeni dönem bugün başlar. Onaylı işletme lisansla birlikte aktif olur ve menüsü yayına açılır.'
      }
    >
      <form ref={formRef} onSubmit={submit} className="qx-stack" noValidate>
        {errors._ && (
          <Banner tone="danger" live="alert" title="Lisans tanımlanamadı">
            {errors._}
          </Banner>
        )}
        <div className="qx-stack qx-stack--tight">
          <span className="qx-small qx-muted">Hızlı seçim</span>
          <div className="qx-chips qx-chips--wrap" role="group" aria-label="Süre ön ayarları">
            {PRESETS.map((p) => {
              const v = plusMonths(base, p.months);
              return (
                <button key={p.months} type="button" className="qx-chip" aria-pressed={endsOn === v} onClick={() => setEndsOn(v)}>
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <TextField
          label="Bitiş tarihi"
          name="endsAt"
          type="date"
          hint="Seçilen günün sonuna kadar geçerli."
          error={errors.endsAt ?? null}
          value={endsOn}
          min={minDate}
          onChange={(e) => setEndsOn(e.target.value)}
          required
        />
        <TextareaField label="Not" name="note" optional hint="Örn. fatura numarası veya anlaşma. Denetim kaydında görünür." error={errors.note ?? null} value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} counter={`${note.length}/300`} rows={2} />
        <TextField
          label="Doğrulama kodu (ek doğrulama)"
          name="totp"
          hint="Lisans işlemi için uygulamadaki güncel kod gerekir."
          error={errors.totp ?? null}
          value={totp}
          onChange={(e) => setTotp(e.target.value.replace(/[^\d\s]/g, '').slice(0, 7))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          className="qx-otp"
          required
        />
        <div className="qx-row-actions">
          <Button type="submit" variant="primary" loading={busy}>
            {extending ? 'Lisansı uzat' : 'Lisansı tanımla'}
          </Button>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Vazgeç
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
