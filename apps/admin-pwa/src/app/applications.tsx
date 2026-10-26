'use client';

import { Button } from '@qmenux/ui/button';
import { TextField } from '@qmenux/ui/text-field';
import { useEffect, useRef, useState } from 'react';
import { parseApplication, uuidPattern, type Application } from '../lib/onboarding-model';

const base = '/api/onboarding/applications';
class RequestError extends Error {
  constructor(readonly status: number) { super('Application request failed'); }
}
async function request(path: string, method = 'GET', body?: object, signal?: AbortSignal) {
  const csrf = document.cookie.split(';').map(value => value.trim()).filter(value => value.startsWith('__Host-qmenux_admin_csrf='));
  const response = await fetch(`${base}${path}`, { method, cache: 'no-store',
    signal: signal ?? AbortSignal.timeout(15_000),
    ...(body ? { headers: { 'Content-Type': 'application/json', 'X-QMenuX-Request': '1',
      ...(csrf.length === 1 ? { 'X-CSRF-Token': csrf[0]!.slice('__Host-qmenux_admin_csrf='.length) } : {}) }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new RequestError(response.status);
  return response.json();
}
async function readPage(after?: string, signal?: AbortSignal) {
  const data = await request(after ? `?after=${encodeURIComponent(after)}` : '', 'GET', undefined, signal);
  if (!Array.isArray(data.items) || data.items.length > 20
    || (data.nextCursor !== null && (typeof data.nextCursor !== 'string' || !uuidPattern.test(data.nextCursor)))) throw new Error('Invalid list');
  return { items: (data.items as unknown[]).map(parseApplication), nextCursor: data.nextCursor as string | null };
}

export default function Applications() {
  const [items, setItems] = useState<Application[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [name, setName] = useState(''), [editing, setEditing] = useState<Application | null>(null);
  const [uncertain, setUncertain] = useState(false);
  // shortcut: retry keys survive only this screen; add durable recovery before cross-device retries.
  const pendingCreate = useRef<{ name: string; idempotencyKey: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function load(after?: string, signal?: AbortSignal) {
    const data = await readPage(after, signal);
    setItems(previous => after ? [...previous, ...data.items.filter(item => !previous.some(old => old.id === item.id))] : data.items);
    setCursor(data.nextCursor); setReady(true);
  }
  useEffect(() => {
    const controller = new AbortController();
    void readPage(undefined, AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]))
      .then(data => { if (!controller.signal.aborted) { setItems(data.items); setCursor(data.nextCursor); setReady(true); } })
      .catch(() => { if (!controller.signal.aborted) setMessage('Başvurular yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.'); });
    return () => controller.abort();
  }, []);

  async function refresh(after?: string) {
    setBusy(true); setMessage('');
    try { await load(after); }
    catch (error) { setMessage(error instanceof RequestError && error.status === 401
      ? 'Oturumunuz doğrulanamadı. Yeniden giriş yapın.' : 'Başvurular yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.'); }
    finally { setBusy(false); }
  }
  async function save(application?: Application) {
    setBusy(true); setMessage('');
    try {
      let path = '', method = 'POST', body: object;
      if (application) { path = `/${application.id}/submit`; body = { revision: application.revision }; }
      else if (editing) { path = `/${editing.id}`; method = 'PATCH'; body = { name, revision: editing.revision }; }
      else {
        pendingCreate.current ??= { name, idempotencyKey: crypto.randomUUID() };
        body = pendingCreate.current;
      }
      const data = await request(path, method, body);
      const confirmed = parseApplication(data.application);
      setItems(previous => [confirmed, ...previous.filter(item => item.id !== confirmed.id)]);
      if (!application) { pendingCreate.current = null; setUncertain(false); setName(''); setEditing(null); }
      setMessage(confirmed.status === 'APPROVED' ? 'Başvurunuz onaylandı. İşletme erişimi ve lisans henüz verilmedi.' : confirmed.status === 'REJECTED' ? 'Başvurunuz reddedildi. İşletme erişimi verilmedi.' : confirmed.status === 'PENDING_APPROVAL' ? 'Başvurunuz onay bekliyor. İşletme erişimi henüz verilmedi.' : 'Taslak kaydedildi. Göndermeden önce işletme adını kontrol edin.');
    } catch (error) {
      if (!application && !editing && pendingCreate.current) setUncertain(true);
      if (error instanceof RequestError && error.status === 409) {
        setMessage('Başvuru değişmiş olabilir. Listeyi yenileyip güncel taslağı tekrar açın; değişiklikleriniz gönderilmedi.');
      } else if (error instanceof RequestError && error.status === 401) {
        setMessage('Oturumunuz doğrulanamadı. Yeniden giriş yapın; işlem doğrulanmadı.');
      } else setMessage('İşlem doğrulanamadı. Bağlantınızı kontrol edip aynı işlemi tekrar deneyin.');
    } finally { setBusy(false); }
  }
  function edit(application: Application | null) {
    setEditing(application); setName(application?.requestedName ?? ''); setMessage('');
    input.current?.focus(); input.current?.scrollIntoView({ block: 'center' });
  }

  return <section className="applications" aria-labelledby="applications-title" aria-busy={busy}>
    <h2 id="applications-title">İşletme başvuruları</h2>
    <p>Taslağınızı kontrol edip onaya gönderin. Göndermek işletme erişimi veya lisans vermez.</p>
    <p role="status" aria-live="polite">{message || (!ready ? 'Başvurular yükleniyor…' : '')}</p>
    <Button disabled={busy} onClick={() => void refresh()}>Listeyi yenile</Button>
    {ready && <>
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <h3>{editing ? 'Taslağı düzenle' : 'Yeni başvuru taslağı'}</h3>
        <TextField ref={input} id="business-name" label="İşletme adı" name="businessName" autoComplete="organization"
          required maxLength={200} value={name} disabled={busy || uncertain} onChange={event => setName(event.target.value)} />
        {uncertain && <p>Aynı taslağı güvenle tekrar deneyebilirsiniz. Sonuç doğrulanana kadar adı değiştirmeyin.</p>}
        <Button type="submit" disabled={busy || !name.trim()}>{uncertain ? 'Aynı taslağı tekrar dene' : editing ? 'Değişiklikleri kaydet' : 'Taslağı kaydet'}</Button>
        {editing && <Button disabled={busy} onClick={() => edit(null)}>Düzenlemeyi kapat</Button>}
      </form>
      {items.length === 0 && <p>Henüz başvurunuz yok.</p>}
      <ul className="application-list">{items.map(application => <li key={application.id}>
        <h3>{application.requestedName}</h3>
        <p>{application.status === 'DRAFT' ? 'Taslak — henüz gönderilmedi' : application.status === 'APPROVED' ? 'Onaylandı — işletme erişimi ve lisans henüz verilmedi' : application.status === 'REJECTED' ? 'Reddedildi — işletme erişimi verilmedi' : 'Onay bekliyor — işletme erişimi henüz verilmedi'}</p>
        {application.status === 'DRAFT' && <div className="application-actions">
          <Button disabled={busy || uncertain} onClick={() => edit(application)} aria-label={`${application.requestedName} taslağını düzenle`}>Düzenle</Button>
          <Button disabled={busy || uncertain || editing?.id === application.id} onClick={() => void save(application)}
            aria-label={`${application.requestedName} başvurusunu onaya gönder`}>Onaya gönder</Button>
        </div>}
      </li>)}</ul>
      {cursor && <Button disabled={busy} onClick={() => void refresh(cursor)}>Daha fazla başvuru</Button>}
    </>}
  </section>;
}
