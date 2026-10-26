'use client';
import { useState } from 'react';
import { CheckCircle2, RotateCcw, UploadCloud } from 'lucide-react';
import { Badge, Banner, Button, Card, ConfirmDialog, EmptyState, TextField, useToast } from '@qmenux/ui';
import { Page } from '@/components/page';
import { Loadable } from '@/components/states';
import { api, isProblem, useApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Revision } from '@/lib/types';

interface Draft {
  snapshot: { categories: { id: string; name: string; items: unknown[] }[] };
  publish: { publishedRevisionNo: number; latestRevisionNo: number };
  hasUnpublishedChanges: boolean;
}

export default function PublishPage() {
  const draft = useApi<Draft>('admin/menu/draft');
  const revs = useApi<{ revisions: Revision[] }>('admin/menu/revisions');
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<Revision | null>(null);

  const reload = () => {
    void draft.reload();
    void revs.reload();
  };

  async function publish(d: Draft) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ revisionNo: number }>('admin/menu/publish', { json: { expectedRevisionNo: d.publish.publishedRevisionNo, note: note.trim() } });
      setNote('');
      toast({ message: `Sürüm #${r.revisionNo} yayında.` });
      reload();
    } catch (e) {
      if (isProblem(e, 'CONFLICT')) {
        setError('Menü bu sırada başka bir cihazdan yayınlandı. Güncel durumu yükledik; tekrar kontrol edin.');
        reload();
      } else setError(e instanceof Error ? e.message : 'Yayınlanamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Yayınla" back="/menu">
      <Loadable q={draft} rows={3}>
        {(d) => {
          const items = d.snapshot.categories.reduce((n, c) => n + c.items.length, 0);
          const never = d.publish.publishedRevisionNo === 0;
          return (
            <Card className="qx-stack">
              <div className="qx-between">
                <strong>{never ? 'Henüz yayın yok' : `Yayındaki sürüm #${d.publish.publishedRevisionNo}`}</strong>
                {d.hasUnpublishedChanges ? <Badge tone="warning">Taslakta değişiklik var</Badge> : <Badge tone="success">Güncel</Badge>}
              </div>
              <p className="qx-muted">
                Taslak: {d.snapshot.categories.length} görünür kategori, {items} ürün. Gizli kategoriler ve ürünler yayına girmez; kontrol edilmemiş alerjen ve
                kalori bilgileri “bilgi yok” olarak yayınlanır.
              </p>
              {error && (
                <Banner tone="danger" live="alert">
                  {error}
                </Banner>
              )}
              {items === 0 ? (
                <Banner tone="info">Yayınlamak için görünür bir kategoride en az bir ürün olmalı.</Banner>
              ) : (
                <>
                  <TextField label="Not" optional maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} hint="Örneğin “Kış menüsü” — geçmişte bu sürümü bulmanızı kolaylaştırır." />
                  <Button variant="primary" size="lg" block icon={<UploadCloud size={18} />} loading={busy} disabled={!d.hasUnpublishedChanges && !never} onClick={() => publish(d)}>
                    {d.hasUnpublishedChanges || never ? 'Şimdi yayınla' : 'Yayınlanacak değişiklik yok'}
                  </Button>
                </>
              )}
            </Card>
          );
        }}
      </Loadable>

      <section className="qx-stack qx-stack--tight" aria-labelledby="history">
        <h2 id="history" className="qx-section__title">
          Geçmiş sürümler
        </h2>
        <Loadable q={revs} rows={4}>
          {({ revisions }) =>
            revisions.length === 0 ? (
              <EmptyState icon={<CheckCircle2 size={28} />} title="Henüz sürüm yok">
                İlk yayından sonra her sürüm burada saklanır; istediğinizi geri yükleyebilirsiniz.
              </EmptyState>
            ) : (
              <Card flush>
                <ul className="qx-list" aria-label="Sürümler">
                  {revisions.map((r) => (
                    <li key={r.id} className="qx-product">
                      <div className="qx-between">
                        <strong className="qx-num">#{r.revisionNo}</strong>
                        {r.isCurrent ? <Badge tone="success">Yayında</Badge> : <span className="qx-small qx-muted">{r.itemCount} ürün</span>}
                      </div>
                      {r.note && <span className="qx-break">{r.note}</span>}
                      <span className="qx-small qx-muted qx-break">
                        {formatDateTime(r.publishedAt)}
                        {r.publishedBy ? ` · ${r.publishedBy}` : ''}
                        {r.restoredFromNo ? ` · #${r.restoredFromNo} sürümünden` : ''}
                      </span>
                      {!r.isCurrent && (
                        <span>
                          <Button size="sm" variant="ghost" icon={<RotateCcw size={16} />} onClick={() => setRestoring(r)}>
                            Bu sürümü geri yükle
                          </Button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )
          }
        </Loadable>
      </section>

      <ConfirmDialog
        open={restoring !== null}
        tone="primary"
        title={`#${restoring?.revisionNo ?? ''} sürümü geri yüklensin mi?`}
        confirmLabel="Geri yükle ve yayınla"
        onClose={() => setRestoring(null)}
        onConfirm={async () => {
          if (!restoring || !draft.data) return;
          try {
            const r = await api<{ revisionNo: number }>(`admin/menu/revisions/${restoring.id}/restore`, {
              json: { expectedRevisionNo: draft.data.publish.publishedRevisionNo },
            });
            toast({ message: `#${restoring.revisionNo} içeriği yeni sürüm #${r.revisionNo} olarak yayında.` });
            reload();
          } catch (e) {
            toast({ message: isProblem(e, 'CONFLICT') ? 'Menü bu sırada değişti; listeyi yeniledik.' : e instanceof Error ? e.message : 'Geri yüklenemedi.' });
            reload();
          }
          setRestoring(null);
        }}
      >
        Eski içerik yeni bir sürüm olarak yayınlanır; geçmiş silinmez. Taslağınız değişmez.
      </ConfirmDialog>
    </Page>
  );
}
