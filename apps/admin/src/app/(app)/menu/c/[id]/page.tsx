'use client';
import { useParams } from 'next/navigation';
import { ArrowDown, ArrowUp, ImageOff, PackagePlus, Plus, ShieldAlert } from 'lucide-react';
import { formatMinor } from '@qmenux/contracts';
import { Badge, Card, EmptyState, IconButton, Segmented, buttonClass, useToast } from '@qmenux/ui';
import { Link } from '@/components/link';
import { Page } from '@/components/page';
import { useCan } from '@/components/session';
import { Loadable } from '@/components/states';
import { api, useApi } from '@/lib/api';
import type { Availability, Category, Product } from '@/lib/types';

const AVAIL_OPTIONS: { value: Availability; label: string }[] = [
  { value: 'AVAILABLE', label: 'Var' },
  { value: 'SOLD_OUT', label: 'Tükendi' },
  { value: 'HIDDEN', label: 'Gizli' },
];
const AVAIL_DONE: Record<Availability, string> = { AVAILABLE: 'satışta', SOLD_OUT: 'tükendi olarak işaretlendi', HIDDEN: 'gizlendi' };

export default function CategoryPage() {
  const { id } = useParams<{ id: string }>();
  const cats = useApi<{ categories: Category[] }>('admin/categories');
  const q = useApi<{ products: Product[] }>(`admin/products?categoryId=${id}`);
  const canWrite = useCan('catalog.write');
  const toast = useToast();
  const cat = cats.data?.categories.find((c) => c.id === id);

  function patch(pid: string, availability: Availability) {
    const cur = q.data?.products;
    if (!cur) return;
    q.setData({ products: cur.map((p) => (p.id === pid ? { ...p, availability } : p)) });
  }

  async function setAvailability(p: Product, next: Availability, undoable = true) {
    const prev = p.availability;
    patch(p.id, next);
    try {
      await api(`admin/products/${p.id}/availability`, { method: 'PATCH', json: { availability: next } });
      if (undoable)
        toast({
          message: `${p.name} ${AVAIL_DONE[next]}. Müşteri menüsüne hemen yansır.`,
          action: { label: 'Geri al', onAction: () => void setAvailability({ ...p, availability: next }, prev, false) },
        });
    } catch (e) {
      patch(p.id, prev);
      toast({ message: e instanceof Error ? e.message : 'Değiştirilemedi.' });
    }
  }

  async function move(list: Product[], i: number, dir: -1 | 1) {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(i + dir, 0, x!);
    q.setData({ products: next });
    try {
      await api(`admin/categories/${id}/products/order`, { method: 'PUT', json: { ids: next.map((p) => p.id) } });
    } catch (e) {
      q.setData({ products: list });
      toast({ message: e instanceof Error ? e.message : 'Sıralama kaydedilemedi.' });
    }
  }

  const addHref = `/menu/p/new?category=${id}`;

  return (
    <Page
      title={cat?.name ?? 'Kategori'}
      back="/menu"
      actions={
        canWrite ? (
          <Link href={addHref} className="qx-iconbtn" aria-label="Ürün ekle">
            <Plus size={22} aria-hidden="true" />
          </Link>
        ) : undefined
      }
    >
      <Loadable q={q} rows={6}>
        {({ products }) =>
          products.length === 0 ? (
            <Card>
              <EmptyState
                icon={<PackagePlus size={28} />}
                title="Bu kategoride ürün yok"
                action={
                  canWrite ? (
                    <Link href={addHref} className={buttonClass('primary')}>
                      <span className="qx-btn__label">Ürün ekle</span>
                    </Link>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <Card flush>
              <ul className="qx-list" aria-label="Ürünler">
                {products.map((p, i) => {
                  const unverified = p.allergens.some((a) => a.verification !== 'VERIFIED') || p.allergens.length === 0;
                  const head = (
                    <>
                      {p.imageUrl ? (
                        <img className="qx-thumb" src={p.imageUrl} alt="" width={48} height={48} loading="lazy" decoding="async" />
                      ) : (
                        <span className="qx-thumb qx-thumb--empty" aria-hidden="true">
                          <ImageOff size={18} />
                        </span>
                      )}
                      <span className="qx-product__name">{p.name}</span>
                      <span className="qx-price">{formatMinor(p.priceMinor)}</span>
                    </>
                  );
                  return (
                    <li key={p.id} className="qx-product" data-availability={p.availability}>
                      {canWrite ? (
                        <Link href={`/menu/p/${p.id}`} className="qx-product__head">
                          {head}
                        </Link>
                      ) : (
                        <div className="qx-product__head">{head}</div>
                      )}
                      <div className="qx-between">
                        <Segmented label={`${p.name} durumu`} value={p.availability} options={AVAIL_OPTIONS} onChange={(v) => v !== p.availability && setAvailability(p, v)} />
                        {canWrite && (
                          <span className="qx-cat-row__tools">
                            <IconButton label={`${p.name} yukarı taşı`} disabled={i === 0} onClick={() => move(products, i, -1)}>
                              <ArrowUp size={18} />
                            </IconButton>
                            <IconButton label={`${p.name} aşağı taşı`} disabled={i === products.length - 1} onClick={() => move(products, i, 1)}>
                              <ArrowDown size={18} />
                            </IconButton>
                          </span>
                        )}
                      </div>
                      {canWrite && unverified && (
                        <span>
                          <Badge tone="warning">
                            <ShieldAlert size={12} aria-hidden="true" /> Alerjen doğrulanmadı
                          </Badge>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )
        }
      </Loadable>
    </Page>
  );
}
