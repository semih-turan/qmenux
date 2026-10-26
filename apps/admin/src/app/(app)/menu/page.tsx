'use client';
import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, EyeOff, FolderPlus, History, Pencil, Plus, Trash2 } from 'lucide-react';
import { Banner, Button, Card, ConfirmDialog, EmptyState, IconButton, List, ListRow, Sheet, Switch, TextareaField, TextField, useFocusFirstError, useToast } from '@qmenux/ui';
import { Link } from '@/components/link';
import { Page } from '@/components/page';
import { useCan } from '@/components/session';
import { Loadable } from '@/components/states';
import { api, isProblem, useApi } from '@/lib/api';
import type { Category } from '@/lib/types';

type Draft = { id: string | null; name: string; description: string; isVisible: boolean };

export default function MenuPage() {
  const q = useApi<{ categories: Category[] }>('admin/categories');
  const canWrite = useCan('catalog.write');
  const canPublish = useCan('menu.publish');
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  async function move(list: Category[], i: number, dir: -1 | 1) {
    const next = [...list];
    const [c] = next.splice(i, 1);
    next.splice(i + dir, 0, c!);
    q.setData({ categories: next });
    try {
      await api('admin/categories/order', { method: 'PUT', json: { ids: next.map((x) => x.id) } });
    } catch (e) {
      q.setData({ categories: list });
      toast({ message: e instanceof Error ? e.message : 'Sıralama kaydedilemedi.' });
    }
  }

  return (
    <Page
      title="Menü"
      actions={
        canPublish ? (
          <Link href="/menu/publish" className="qx-iconbtn" aria-label="Yayınla ve geçmiş">
            <History size={20} aria-hidden="true" />
          </Link>
        ) : undefined
      }
    >
      <Loadable q={q} rows={6}>
        {({ categories }) =>
          categories.length === 0 ? (
            <Card>
              <EmptyState
                icon={<FolderPlus size={28} />}
                title="Henüz kategori yok"
                action={
                  canWrite ? (
                    <Button variant="primary" icon={<Plus size={16} />} onClick={() => setDraft({ id: null, name: '', description: '', isVisible: true })}>
                      Kategori ekle
                    </Button>
                  ) : undefined
                }
              >
                Örneğin “Sıcak içecekler”, “Tatlılar” veya “Ana yemekler”.
              </EmptyState>
            </Card>
          ) : (
            <>
              {canPublish && (
                <Banner tone="info">
                  Değişiklikler taslakta kalır; müşteriler yayınladığınız sürümü görür. Tükendi işaretleri ise anında yansır.
                </Banner>
              )}
              <Card flush>
                <List label="Kategoriler">
                  {categories.map((c, i) => (
                    <li key={c.id} className="qx-between qx-cat-row">
                      <ListRow
                        href={`/menu/c/${c.id}`}
                        Link={Link}
                        chevron={!canWrite}
                        title={<span className="qx-break">{c.name}</span>}
                        sub={
                          <>
                            {c.itemCount} ürün
                            {!c.isVisible && (
                              <>
                                {' · '}
                                <EyeOff size={12} aria-hidden="true" /> Gizli
                              </>
                            )}
                          </>
                        }
                      />
                      {canWrite && (
                        <span className="qx-cat-row__tools">
                          <IconButton label={`${c.name} yukarı taşı`} disabled={i === 0} onClick={() => move(categories, i, -1)}>
                            <ArrowUp size={18} />
                          </IconButton>
                          <IconButton label={`${c.name} aşağı taşı`} disabled={i === categories.length - 1} onClick={() => move(categories, i, 1)}>
                            <ArrowDown size={18} />
                          </IconButton>
                          <IconButton label={`${c.name} düzenle`} onClick={() => setDraft({ id: c.id, name: c.name, description: c.description ?? '', isVisible: c.isVisible })}>
                            <Pencil size={18} />
                          </IconButton>
                        </span>
                      )}
                    </li>
                  ))}
                </List>
              </Card>
              {canWrite && (
                <Button block icon={<Plus size={16} />} onClick={() => setDraft({ id: null, name: '', description: '', isVisible: true })}>
                  Kategori ekle
                </Button>
              )}
            </>
          )
        }
      </Loadable>

      <CategorySheet
        draft={draft}
        onClose={() => setDraft(null)}
        onSaved={() => {
          setDraft(null);
          void q.reload();
        }}
        onDelete={(c) => {
          setDraft(null);
          setDeleting(q.data?.categories.find((x) => x.id === c) ?? null);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={`“${deleting?.name ?? ''}” silinsin mi?`}
        confirmLabel="Kategoriyi sil"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api(`admin/categories/${deleting.id}`, { method: 'DELETE' });
            toast({ message: 'Kategori silindi. Yayınlayana kadar müşteri menüsü değişmez.' });
            void q.reload();
          } catch (e) {
            toast({ message: e instanceof Error ? e.message : 'Silinemedi.' });
          }
          setDeleting(null);
        }}
      >
        {deleting && deleting.itemCount > 0 ? `İçindeki ${deleting.itemCount} ürün de silinir. ` : ''}Yayınlanmış eski sürümler geçmişte kalır.
      </ConfirmDialog>
    </Page>
  );
}

function CategorySheet({ draft, onClose, onSaved, onDelete }: { draft: Draft | null; onClose: () => void; onSaved: () => void; onDelete: (id: string) => void }) {
  return (
    <Sheet open={draft !== null} onClose={onClose} title={draft?.id ? 'Kategoriyi düzenle' : 'Yeni kategori'}>
      {draft && <CategoryForm key={draft.id ?? 'new'} draft={draft} onSaved={onSaved} onDelete={onDelete} />}
    </Sheet>
  );
}

function CategoryForm({ draft, onSaved, onDelete }: { draft: Draft; onSaved: () => void; onDelete: (id: string) => void }) {
  const [v, setV] = useState(draft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useFocusFirstError(errors);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) return setErrors({ name: 'Kategori adını girin.' });
    setBusy(true);
    try {
      const json = { name: v.name.trim(), description: v.description.trim(), isVisible: v.isVisible };
      if (v.id) await api(`admin/categories/${v.id}`, { method: 'PATCH', json });
      else await api('admin/categories', { json });
      toast({ message: v.id ? 'Kategori güncellendi.' : 'Kategori eklendi.' });
      onSaved();
    } catch (err) {
      if (isProblem(err, 'VALIDATION_FAILED')) setErrors(err.fieldErrors());
      else setErrors({ _: err instanceof Error ? err.message : 'Kaydedilemedi.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} className="qx-stack" onSubmit={submit} noValidate>
      {errors._ && (
        <Banner tone="danger" live="alert">
          {errors._}
        </Banner>
      )}
      <TextField label="Ad" value={v.name} maxLength={80} enterKeyHint="done" onChange={(e) => setV({ ...v, name: e.target.value })} error={errors.name} required />
      <TextareaField label="Açıklama" optional rows={2} maxLength={300} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} error={errors.description} />
      <Switch checked={v.isVisible} onCheckedChange={(isVisible) => setV({ ...v, isVisible })} label="Müşteri menüsünde göster" description="Kapalıysa kategori ve ürünleri yayında görünmez." />
      <Button type="submit" variant="primary" block loading={busy}>
        Kaydet
      </Button>
      {v.id && (
        <Button variant="danger-ghost" block icon={<Trash2 size={16} />} onClick={() => onDelete(v.id!)}>
          Kategoriyi sil
        </Button>
      )}
    </form>
  );
}
