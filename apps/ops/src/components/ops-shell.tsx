'use client';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Bell, Ellipsis, KeyRound, LayoutDashboard, Store } from 'lucide-react';
import { AppShell, BottomNav } from '@qmenux/ui';
import type { OpsSession } from '@/lib/types';
import { Link } from './link';
import { SessionProvider } from './session';

/** UI_UX.md: superadmin bottom tabs are Overview, Tenants, Licenses, Alerts, More. */
const NAV = [
  { href: '/', label: 'Genel bakış', icon: <LayoutDashboard size={22} />, match: (p: string) => p === '/' },
  { href: '/tenants', label: 'İşletmeler', icon: <Store size={22} />, match: (p: string) => p.startsWith('/tenants') },
  { href: '/licenses', label: 'Lisanslar', icon: <KeyRound size={22} />, match: (p: string) => p.startsWith('/licenses') },
  { href: '/alerts', label: 'Uyarılar', icon: <Bell size={22} />, match: (p: string) => p.startsWith('/alerts') },
  { href: '/more', label: 'Daha fazla', icon: <Ellipsis size={22} />, match: (p: string) => p.startsWith('/more') },
];

export function OpsShell({ session, children }: { session: OpsSession; children: ReactNode }) {
  const path = usePathname();
  const items = NAV.map((n) => ({ href: n.href, label: n.label, icon: n.icon, active: n.match(path) }));
  return (
    <SessionProvider value={session}>
      <AppShell nav={<BottomNav label="Ana menü" items={items} Link={Link} />}>{children}</AppShell>
    </SessionProvider>
  );
}
