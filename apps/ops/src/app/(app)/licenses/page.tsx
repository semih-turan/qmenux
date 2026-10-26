'use client';
import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Segmented } from '@qmenux/ui';
import { Page } from '@/components/page';
import { Loadable } from '@/components/states';
import { TenantList } from '@/components/tenant-list';
import { useApi } from '@/lib/api';
import { daysUntil } from '@/lib/format';
import type { TenantSummary } from '@/lib/types';

type View = 'expiring' | 'grace' | 'unlicensed' | 'all';
const VIEWS: { value: View; label: string }[] = [
  { value: 'expiring', label: 'Dolacak' },
  { value: 'grace', label: 'Ek süre' },
  { value: 'unlicensed', label: 'Lisanssız' },
  { value: 'all', label: 'Tümü' },
];
const isView = (v: string | null): v is View => VIEWS.some((o) => o.value === v);

const EMPTY: Record<View, { title: string; text: string }> = {
  expiring: { title: '14 gün içinde dolacak lisans yok', text: 'Süresi yaklaşan lisanslar burada görünür.' },
  grace: { title: 'Ek sürede işletme yok', text: 'Süresi dolmuş ama menüsü hâlâ açık olan işletmeler burada görünür.' },
  unlicensed: { title: 'Lisanssız işletme yok', text: 'Onaylı ama lisansı tanımlanmamış ya da süresi dolmuş işletmeler burada görünür.' },
  all: { title: 'Henüz işletme yok', text: '' },
};

function filter(all: TenantSummary[], view: View): TenantSummary[] {
  const live = all.filter((t) => t.status === 'ACTIVE' || t.status === 'APPROVED');
  switch (view) {
    case 'expiring':
      return live.filter((t) => t.licenseState === 'ACTIVE' && t.licenseEndsAt && daysUntil(t.licenseEndsAt) <= 14).sort((a, b) => a.licenseEndsAt!.localeCompare(b.licenseEndsAt!));
    case 'grace':
      return live.filter((t) => t.licenseState === 'GRACE').sort((a, b) => (a.licenseEndsAt ?? '').localeCompare(b.licenseEndsAt ?? ''));
    case 'unlicensed':
      return live.filter((t) => t.licenseState === 'NOT_GRANTED' || t.licenseState === 'EXPIRED' || t.licenseState === 'REVOKED');
    default:
      return all;
  }
}

function LicensesView() {
  const sp = useSearchParams();
  const router = useRouter();
  const raw = sp.get('view');
  const view: View = isView(raw) ? raw : 'expiring';
  const q = useApi<{ tenants: TenantSummary[] }>('control/tenants');
  const rows = useMemo(() => (q.data ? filter(q.data.tenants, view) : []), [q.data, view]);

  return (
    <Page title="Lisanslar" subtitle="Elle tanımlanır; panelde ödeme alınmaz">
      <Segmented label="Görünüm" value={view} options={VIEWS} onChange={(v) => router.replace(v === 'expiring' ? '/licenses' : `/licenses?view=${v}`)} />
      <Loadable q={q} rows={6}>
        {() => <TenantList tenants={rows} label="Lisanslar" emptyTitle={EMPTY[view].title} emptyText={EMPTY[view].text} />}
      </Loadable>
    </Page>
  );
}

export default function LicensesPage() {
  return (
    <Suspense fallback={null}>
      <LicensesView />
    </Suspense>
  );
}
