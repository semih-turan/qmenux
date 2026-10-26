'use client';
import { useParams } from 'next/navigation';
import { ProductEditor } from '@/components/product-editor';
import { Page } from '@/components/page';
import { Loadable } from '@/components/states';
import { useApi } from '@/lib/api';
import type { Category, Product } from '@/lib/types';

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const q = useApi<{ product: Product }>(`admin/products/${id}`);
  const cats = useApi<{ categories: Category[] }>('admin/categories');
  const both = { ...q, data: q.data && cats.data ? { product: q.data.product, categories: cats.data.categories } : undefined, error: q.error ?? cats.error, reload: () => { void q.reload(); void cats.reload(); } };
  return (
    <Page title={q.data?.product.name ?? 'Ürün'} back={q.data ? `/menu/c/${q.data.product.categoryId}` : '/menu'}>
      <Loadable q={both} rows={8}>
        {(d) => <ProductEditor key={`${d.product.id}:${d.product.version}`} product={d.product} categories={d.categories} categoryId={d.product.categoryId} />}
      </Loadable>
    </Page>
  );
}
