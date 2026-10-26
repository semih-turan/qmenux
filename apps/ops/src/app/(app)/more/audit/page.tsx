'use client';
import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { Banner, Button, Card, EmptyState } from '@qmenux/ui';
import { AuditList } from '@/components/audit-list';
import { Page } from '@/components/page';
import { Loadable } from '@/components/states';
import { api, isProblem, useApi } from '@/lib/api';
import type { AuditEntry } from '@/lib/types';

const PAGE = 100;

/** Platform-wide log, newest first; "Daha eski" pages by id cursor. Per-tenant history lives on the tenant screen. */
export default function AuditPage() {
  const q = useApi<{ entries: AuditEntry[] }>('control/audit');
  const [older, setOlder] = useState<AuditEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function more(last: AuditEntry) {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ entries: AuditEntry[] }>(`control/audit?before=${encodeURIComponent(last.id)}`);
      setOlder((o) => [...o, ...r.entries]);
      if (r.entries.length < PAGE) setDone(true);
    } catch (e) {
      setErr(isProblem(e) ? e.message : 'Yüklenemedi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Denetim kaydı" back="/more">
      <Loadable q={q} rows={6}>
        {(d) => {
          const all = [...d.entries, ...older];
          if (all.length === 0)
            return (
              <Card>
                <EmptyState icon={<ScrollText size={28} />} title="Henüz kayıt yok">
                  Onay, lisans ve askı işlemleri burada listelenir.
                </EmptyState>
              </Card>
            );
          const last = all[all.length - 1]!;
          return (
            <>
              <AuditList entries={all} />
              {err && (
                <Banner tone="danger" live="alert" title="Daha eski kayıtlar yüklenemedi">
                  {err}
                </Banner>
              )}
              {!done && d.entries.length >= PAGE && (
                <Button block loading={busy} onClick={() => more(last)}>
                  Daha eski kayıtlar
                </Button>
              )}
            </>
          );
        }}
      </Loadable>
    </Page>
  );
}
