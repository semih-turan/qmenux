'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ListSkeleton } from '@qmenux/ui';
import { ProductEditor } from '@/components/product-editor';
import { Page } from '@/components/page';
import { Loadable } from '@/components/states';
import { useApi } from '@/lib/api';
import type { Category } from '@/lib/types';

function NewProduct() {
  const category = useSearchParams().get('category') ?? '';
  const cats = useApi<{ categories: Category[] }>('admin/categories');
  const first = cats.data?.categories.find((c) => c.id === category)?.id ?? cats.data?.categories[0]?.id;
  return (
    <Page title="Yeni ürün" back={category ? `/menu/c/${category}` : '/menu'}>
      <Loadable q={cats} rows={8}>
        {(d) => (first ? <ProductEditor categories={d.categories} categoryId={first} /> : <p className="qx-muted">Önce bir kategori ekleyin.</p>)}
      </Loadable>
    </Page>
  );
}

export default function NewProductPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={8} />}>
      <NewProduct />
    </Suspense>
  );
}
