'use client';
import { useState, type FormEvent } from 'react';
import { Plus, QrCode, RefreshCw, Trash2 } from 'lucide-react';
import { Banner, Button, Card, ConfirmDialog, EmptyState, IconButton, Sheet, TextField, useFocusFirstError, useToast } from '@qmenux/ui';
import { QrCard } from '@/components/qr-code';
import { Page } from '@/components/page';
import { useCan } from '@/components/session';
import { Loadable } from '@/components/states';
import { api, isProblem, useApi } from '@/lib/api';
import { formatCount } from '@/lib/format';
import type { TableQr } from '@/lib/types';

type Shown = { label: string; url: string; rotated: boolean };

export default function QrPage() {
  const q = useApi<{ menuUrl: string; generalQrUrl: string; tables: TableQr[] }>('admin/table-qrs');
  const canManage = useCan('settings.write');
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const [rotating, setRotating] = useState<TableQr | null>(null);
  const [revoking, setRevoking] = useState<TableQr | null>(null);

  return (
    <Page
      title="QR kodları"
      actions={
        canManage ? (
          <IconButton label="Masa ekle" onClick={() => setAdding(true)}>
            <Plus size={22} />
          </IconButton>
        ) : undefined
      }
    >
      <Loadable q={q} rows={4}>
        {({ generalQrUrl, tables }) => (
          <>
            <Card className="qx-stack">
              <div>
                <h2 className="qx-section__title">Genel menü kodu</h2>
                <p className="qx-small qx-muted">Kapı, vitrin veya kasa için. Masa bilgisi taşımaz.</p>
              </div>
              <QrCard value={generalQrUrl} caption="Menü" label="Genel menü QR kodu" />
            </Card>

            <section className="qx-stack qx-stack--tight" aria-labelledby="tables">
              <h2 id="tables" className="qx-section__title">
                Masalar
              </h2>
              {tables.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={<QrCode size={28} />}
                    title="Henüz masa kodu yok"
                    action={
                      canManage ? (
                        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdding(true)}>
                          Masa ekle
                        </Button>
                      ) : undefined
                    }
                  >
                    Her masaya ayrı kod basarsanız hangi masadan kaç okutma geldiğini görürsünüz.
                  </EmptyState>
                </Card>
              ) : (
                <Card flush>
                  <ul className="qx-list" aria-label="Masa kodları">
                    {tables.map((t) => (
                      <li key={t.id} className="qx-item">
                        <span className="qx-item__body">
                          <strong className="qx-break">{t.label}</strong>
                          <span className="qx-small qx-muted qx-num">
                            Bu ay {formatCount(t.scansThisMonth)} okutma{!t.active && ' · Pasif'}
                          </span>
                        </span>
                        {canManage && (
                          <span className="qx-cat-row__tools">
                            <IconButton label={`${t.label} için yeni kod üret`} onClick={() => setRotating(t)}>
                              <RefreshCw size={18} />
                            </IconButton>
                            <IconButton label={`${t.label} kodunu kaldır`} onClick={() => setRevoking(t)}>
                              <Trash2 size={18} />
                            </IconButton>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              <p className="qx-small qx-muted">
                Okutmalar ziyaretçi kimliği tutulmadan, Türkiye saatine göre günlük toplam olarak sayılır. Masa bağlantısı güvenlik için yalnızca oluşturulduğu anda
                gösterilir.
              </p>
            </section>
          </>
        )}
      </Loadable>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Masa ekle">
        {adding && (
          <AddTableForm
            onCreated={(label, url) => {
              setAdding(false);
              setShown({ label, url, rotated: false });
              void q.reload();
            }}
          />
        )}
      </Sheet>

      <Sheet open={shown !== null} onClose={() => setShown(null)} title={shown ? `${shown.label} kodu` : ''}>
        {shown && (
          <div className="qx-stack">
            <Banner tone="warning" title="Şimdi kaydedin">
              Bu bağlantı bir daha gösterilmez. Kaybederseniz yeni kod üretebilirsiniz; o zaman eski basılı kod masa bilgisi taşımaz.
            </Banner>
            {shown.rotated && <Banner tone="info">Eski basılı kod artık bu masaya sayılmaz; menü yine açılır.</Banner>}
            <QrCard value={shown.url} caption={shown.label} label={`${shown.label} QR kodu`} />
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={rotating !== null}
        title={`${rotating?.label ?? ''} için yeni kod üretilsin mi?`}
        confirmLabel="Yeni kod üret"
        onClose={() => setRotating(null)}
        onConfirm={async () => {
          if (!rotating) return;
          try {
            const r = await api<{ url: string }>(`admin/table-qrs/${rotating.id}/rotate`, { method: 'POST' });
            setShown({ label: rotating.label, url: r.url, rotated: true });
            void q.reload();
          } catch (e) {
            toast({ message: e instanceof Error ? e.message : 'Kod üretilemedi.' });
          }
          setRotating(null);
        }}
      >
        Masadaki basılı kodu yenisiyle değiştirmeniz gerekir. Eski kod menüyü açmaya devam eder ama bu masaya sayılmaz.
      </ConfirmDialog>

      <ConfirmDialog
        open={revoking !== null}
        title={`${revoking?.label ?? ''} kaldırılsın mı?`}
        confirmLabel="Kaldır"
        onClose={() => setRevoking(null)}
        onConfirm={async () => {
          if (!revoking) return;
          try {
            await api(`admin/table-qrs/${revoking.id}/revoke`, { method: 'POST' });
            toast({ message: `${revoking.label} kaldırıldı.` });
            void q.reload();
          } catch (e) {
            toast({ message: isProblem(e, 'NOT_FOUND') ? 'Bu kod zaten kaldırılmış.' : e instanceof Error ? e.message : 'Kaldırılamadı.' });
            void q.reload();
          }
          setRevoking(null);
        }}
      >
        Geçmiş okutma sayıları raporlarda kalır.
      </ConfirmDialog>
    </Page>
  );
}

function AddTableForm({ onCreated }: { onCreated: (label: string, url: string) => void }) {
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const formRef = useFocusFirstError(error);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = label.trim();
    if (!v) return setError('Masa adını girin.');
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ url: string }>('admin/table-qrs', { json: { label: v } });
      onCreated(v, r.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} className="qx-stack" onSubmit={submit} noValidate>
      <TextField label="Masa adı" value={label} maxLength={40} enterKeyHint="done" placeholder="Örneğin Masa 5 veya Bahçe 2" onChange={(e) => setLabel(e.target.value)} error={error ?? undefined} required />
      <Button type="submit" variant="primary" block loading={busy}>
        Kod oluştur
      </Button>
    </form>
  );
}
