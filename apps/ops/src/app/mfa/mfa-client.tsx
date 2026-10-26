'use client';
import { useState, type FormEvent } from 'react';
import { Banner, Button, TextField, buttonClass } from '@qmenux/ui';
import { normalizeOtp } from '@/lib/otp';
import { problemMessage } from '@/lib/messages';

/** Posts the code to /auth/mfa (same origin); the rotated session lands in the httpOnly cookie there. */
export function MfaForm({ returnTo }: { returnTo: string }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const c = normalizeOtp(code);
    if (!c) {
      setError('Altı haneli kodu girin.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/auth/mfa', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-qx-bff': '1', accept: 'application/json' },
        body: JSON.stringify({ code: c }),
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (res.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!res.ok) {
        const p = (await res.json().catch(() => ({}))) as { code?: string; title?: string };
        setError(problemMessage(p.code ?? 'HTTP_ERROR', p.title));
        setCode('');
        return;
      }
      // Full navigation so the server gate sees the new cookie.
      window.location.assign(returnTo);
    } catch {
      setError(problemMessage('NETWORK'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="qx-stack">
      <form onSubmit={submit} className="qx-stack" noValidate>
        {error && (
          <Banner tone="danger" live="alert" title="Doğrulanamadı">
            {error}
          </Banner>
        )}
        <TextField
          label="Doğrulama kodu"
          hint="Kod her 30 saniyede yenilenir; her kod bir kez kullanılır."
          error={null}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, '').slice(0, 7))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          autoFocus
          className="qx-otp"
          required
        />
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          Doğrula
        </Button>
      </form>
      {/* Separate form: a nested form is invalid HTML. Plain POST, Origin-checked on the server. */}
      <form action="/auth/logout" method="post">
        <button type="submit" className={buttonClass('ghost', 'md', true)}>
          <span className="qx-btn__label">Başka hesapla gir</span>
        </button>
      </form>
    </div>
  );
}
