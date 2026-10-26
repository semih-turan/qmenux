'use client';
import { useEffect, useRef, useState } from 'react';
import { Store } from 'lucide-react';
import { Badge, Banner, Card, List, ListRow, Spinner, buttonClass } from '@qmenux/ui';
import { api } from '@/lib/api';
import type { Me } from '@/lib/types';

const ROLE_TR = { OWNER: 'Sahip', MANAGER: 'Yönetici', STAFF: 'Personel' } as const;

export function SelectClient({ memberships, activeTenantId, returnTo }: { memberships: Me['memberships']; activeTenantId: string | null; returnTo: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const auto = useRef(false);

  async function choose(tenantId: string) {
    setBusy(tenantId);
    setError(null);
    try {
      await api('me/active-tenant', { json: { tenantId } });
      // Full navigation so the server shell re-reads the session with the new tenant.
      window.location.assign(returnTo);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Seçilemedi.');
      setBusy(null);
    }
  }

  // A single business needs no choice.
  useEffect(() => {
    if (!auto.current && memberships.length === 1 && !activeTenantId) {
      auto.current = true;
      void choose(memberships[0]!.tenantId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (memberships.length === 1 && !activeTenantId && !error)
    return (
      <div className="qx-stack" aria-live="polite">
        <Spinner label="İşletmeniz açılıyor" />
      </div>
    );

  return (
    <>
      <div>
        <h1 className="qx-h1">Hangi işletmeyi yöneteceksiniz?</h1>
        <p className="qx-muted">Daha sonra “Daha fazla” menüsünden değiştirebilirsiniz.</p>
      </div>
      {error && (
        <Banner tone="danger" live="alert">
          {error}
        </Banner>
      )}
      <Card flush>
        <List label="İşletmeleriniz">
          {memberships.map((m) => (
            <li key={m.tenantId}>
              <ListRow
                lead={<Store size={20} />}
                title={m.displayName}
                sub={`${m.slug}.qmenux.com · ${ROLE_TR[m.role]}`}
                trail={busy === m.tenantId ? <Spinner label="Açılıyor" /> : m.tenantId === activeTenantId ? <Badge tone="primary">Açık</Badge> : null}
                chevron={busy !== m.tenantId}
                disabled={busy !== null}
                onClick={() => choose(m.tenantId)}
              />
            </li>
          ))}
        </List>
      </Card>
      <a className={buttonClass('ghost', 'md', true)} href="/onboarding">
        <span className="qx-btn__label">Yeni işletme başvurusu</span>
      </a>
    </>
  );
}
