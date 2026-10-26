'use client';
import { useDeferredValue, useState } from 'react';
import { Search } from 'lucide-react';
import { Segmented, TextField } from '@qmenux/ui';
import { Page } from '@/components/page';
import { Loadable } from '@/components/states';
import { TenantList } from '@/components/tenant-list';
import { useApi } from '@/lib/api';
import { formatCount } from '@/lib/format';
import type { TenantSummary } from '@/lib/types';

type View = 'ALL' | 'ACTIVE' | 'APPROVED' | 'SUSPENDED';
const VIEWS: { value: View; label: string }[] = [
  { value: 'ALL', label: 'Tümü' },
  { value: 'ACTIVE', label: 'Aktif' },
  { value: 'APPROVED', label: 'Onaylı' },
  { value: 'SUSPENDED', label: 'Askıda' },
];

/** MOBILE_ADMIN_FLOWS §9: search a tenant on the phone, then open its status and licence. */
export default function TenantsPage() {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>('ALL');
  const deferred = useDeferredValue(query.trim());
  const params = new URLSearchParams();
  if (deferred) params.set('q', deferred.slice(0, 80));
  if (view !== 'ALL') params.set('status', view);
  const qs = params.toString();
  const q = useApi<{ tenants: TenantSummary[] }>(`control/tenants${qs ? `?${qs}` : ''}`);

  return (
    <Page title="İşletmeler" subtitle={q.data ? `${formatCount(q.data.tenants.length)} kayıt` : undefined}>
      <div className="qx-search qx-stack qx-stack--tight">
        <TextField label="Ara" name="q" type="search" affix={<Search size={18} aria-hidden="true" />} placeholder="Ad veya menü adresi" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" enterKeyHint="search" />
        <Segmented label="Durum" value={view} options={VIEWS} onChange={setView} />
      </div>
      <Loadable q={q} rows={6}>
        {(d) => <TenantList tenants={d.tenants} label="İşletmeler" emptyTitle={deferred ? 'Eşleşen işletme yok' : 'Henüz işletme yok'} emptyText={deferred ? 'Ad ya da adresin bir bölümünü yazın.' : 'Onaylanan başvurular burada listelenir.'} />}
      </Loadable>
    </Page>
  );
}
