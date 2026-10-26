'use client';
import { BellOff, CalendarClock, ClipboardList, Hourglass, KeyRound } from 'lucide-react';
import { Card, EmptyState, List, ListRow } from '@qmenux/ui';
import { Link } from '@/components/link';
import { Page } from '@/components/page';
import { Loadable } from '@/components/states';
import { useApi } from '@/lib/api';
import { formatCount } from '@/lib/format';
import type { PlatformStats } from '@/lib/types';

/**
 * Alerts are derived from server counts (no client-side polling or push). Each row opens the
 * screen where the operator acts on it.
 */
export default function AlertsPage() {
  const q = useApi<PlatformStats>('control/stats');
  return (
    <Page title="Uyarılar">
      <Loadable q={q} rows={4}>
        {(s) => {
          const rows = [
            s.pendingApplications > 0 && { href: '/more/applications', icon: <ClipboardList size={20} />, title: `${formatCount(s.pendingApplications)} başvuru bekliyor`, sub: 'İnceleyip onaylayın ya da reddedin' },
            s.expiringSoon > 0 && { href: '/licenses', icon: <CalendarClock size={20} />, title: `${formatCount(s.expiringSoon)} lisans 14 gün içinde dolacak`, sub: 'Uzatma için işletmeyle iletişime geçin' },
            s.graceTenants > 0 && { href: '/licenses?view=grace', icon: <Hourglass size={20} />, title: `${formatCount(s.graceTenants)} işletme ek sürede`, sub: 'Süre dolunca menü kapanır' },
            s.unlicensedTenants > 0 && { href: '/licenses?view=unlicensed', icon: <KeyRound size={20} />, title: `${formatCount(s.unlicensedTenants)} işletmenin lisansı yok ya da dolmuş`, sub: 'Müşteri menüsü kapalı' },
          ].filter((r): r is Exclude<typeof r, false> => Boolean(r));
          if (rows.length === 0)
            return (
              <Card>
                <EmptyState icon={<BellOff size={28} />} title="Dikkat gerektiren bir şey yok">
                  Bekleyen başvuru, dolacak lisans ya da ek süredeki işletme bulunmuyor.
                </EmptyState>
              </Card>
            );
          return (
            <Card flush>
              <List label="Uyarılar">
                {rows.map((r) => (
                  <li key={r.href}>
                    <ListRow href={r.href} Link={Link} lead={r.icon} title={r.title} sub={r.sub} chevron />
                  </li>
                ))}
              </List>
            </Card>
          );
        }}
      </Loadable>
      <p className="qx-small qx-muted">Uyarılar sunucudaki sayımlardan türetilir; bu panel bildirim göndermez.</p>
    </Page>
  );
}
