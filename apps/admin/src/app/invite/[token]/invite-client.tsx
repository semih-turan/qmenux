'use client';
import { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { Banner, Button, EmptyState, buttonClass } from '@qmenux/ui';
import { api, isProblem } from '@/lib/api';

export function InviteClient({ token, email }: { token: string; email: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ gone: boolean; message: string } | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      // The API also makes the joined business the active one.
      await api<{ tenantId: string }>('invites/accept', { json: { token } });
      window.location.replace('/');
    } catch (e) {
      setError({ gone: isProblem(e, 'INVITE_INVALID'), message: e instanceof Error ? e.message : 'Kabul edilemedi.' });
      setBusy(false);
    }
  }

  if (error?.gone)
    return (
      <EmptyState icon={<MailCheck size={28} />} title="Davet kullanılamıyor" action={<a className={buttonClass('secondary')} href="/"><span className="qx-btn__label">Panele git</span></a>}>
        {error.message} İşletme sahibinden yeni bir davet isteyin.
      </EmptyState>
    );

  return (
    <>
      <div>
        <h1 className="qx-h1">Ekibe katılın</h1>
        <p className="qx-muted qx-break">
          Davet, giriş yaptığınız <strong>{email}</strong> hesabına tanımlanacak. Davet farklı bir e-postaya gönderildiyse kabul edilmez.
        </p>
      </div>
      {error && (
        <Banner tone="danger" live="alert">
          {error.message}
        </Banner>
      )}
      <Button variant="primary" size="lg" block loading={busy} onClick={accept}>
        Daveti kabul et
      </Button>
    </>
  );
}
