'use client';

import { useEffect, useState } from 'react';

const providers = [{ id: 'google', label: 'Google' }, { id: 'microsoft', label: 'Microsoft / Outlook' }, { id: 'apple', label: 'Apple' }] as const;
type State = 'loading' | 'signed_out' | 'registered' | 'unavailable';

export default function SignIn() {
  const [state, setState] = useState<State>('loading');
  const [enabled, setEnabled] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]);
    async function load() {
      try {
        const [config, session] = await Promise.all([
          fetch('/api/auth/providers', { cache: 'no-store', signal }),
          fetch('/api/auth/me', { cache: 'no-store', signal }),
        ]);
        if (session.ok) {
          const data = await session.json();
          if (data.user?.status === 'REGISTERED' && data.tenantAccess === false) { setState('registered'); return; }
        }
        if (!config.ok || session.status !== 401) throw new Error('Unavailable');
        const data = await config.json();
        setEnabled(providers.filter(provider => data.providers?.some((item: { id: string; enabled: boolean }) => item.id === provider.id && item.enabled === true)).map(provider => provider.id));
        setState('signed_out');
      } catch { if (!controller.signal.aborted) setState('unavailable'); }
    }
    void load();
    return () => controller.abort();
  }, []);

  async function submit(provider?: string) {
    setBusy(true); setMessage('');
    try {
      const csrf = document.cookie.split(';').map(value => value.trim()).filter(value => value.startsWith('__Host-qmenux_admin_csrf='));
      const response = await fetch(provider ? `/api/auth/${provider}/start` : '/api/auth/logout', {
        method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(15_000),
        headers: { 'Content-Type': 'application/json', 'X-QMenuX-Request': '1',
          ...(!provider && csrf.length === 1 ? { 'X-CSRF-Token': csrf[0]!.slice('__Host-qmenux_admin_csrf='.length) } : {}) },
        body: '{}',
      });
      if (!response.ok) throw new Error('Unavailable');
      const data = await response.json();
      if (provider && typeof data.redirect === 'string') { window.location.assign(data.redirect); return; }
      if (!provider && data.status === 'signed_out') { window.location.reload(); return; }
      throw new Error('Unavailable');
    } catch {
      setMessage(provider ? 'Giriş başlatılamadı. Bağlantınızı kontrol edip tekrar deneyin.'
        : 'Çıkış doğrulanamadı. Oturumunuz açık olabilir; bağlantınızı kontrol edip tekrar deneyin.');
      setBusy(false);
    }
  }

  return (
    <section aria-label="Hesap erişimi" aria-busy={state === 'loading' || busy}>
      {state === 'loading' && <p role="status">Giriş seçenekleri yükleniyor…</p>}
      {state === 'registered' ? <>
        <h2>Hesabınızla giriş yaptınız</h2>
        <p>İşletme erişimi için yönetici onayı ve geçerli lisans gerekir. Giriş yapmak işletmenizi etkinleştirmez.</p>
        <button type="button" disabled={busy} onClick={() => void submit()}>{busy ? 'Çıkış doğrulanıyor…' : 'Çıkış yap'}</button>
      </> : <>
        <p>Kafe ve restoran işletme hesabınıza giriş yapın. Yeni hesaplar için işletme erişimi yönetici onayına bağlıdır.</p>
        {state === 'unavailable' && <p role="status">Giriş henüz kullanıma açılmadı veya bağlantı kurulamadı. Daha sonra tekrar deneyin.</p>}
        <div className="sign-in-actions">
          {providers.map(provider => <button key={provider.id} type="button"
            disabled={state !== 'signed_out' || busy || !enabled.includes(provider.id)}
            onClick={() => void submit(provider.id)}>{provider.label} ile devam et</button>)}
        </div>
        {state === 'signed_out' && enabled.length === 0 && <p role="status">Giriş sağlayıcıları henüz kullanıma açılmadı.</p>}
      </>}
      {message && <p role="alert">{message}</p>}
    </section>
  );
}
