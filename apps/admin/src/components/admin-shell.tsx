'use client';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { BarChart3, Ellipsis, House, QrCode, UtensilsCrossed } from 'lucide-react';
import { AppShell, BottomNav } from '@qmenux/ui';
import type { Me } from '@/lib/types';
import { Link } from './link';
import { SessionProvider } from './session';

const NAV = [
  { href: '/', label: 'Ana sayfa', icon: <House size={22} />, match: (p: string) => p === '/' },
  { href: '/menu', label: 'Menü', icon: <UtensilsCrossed size={22} />, match: (p: string) => p.startsWith('/menu') },
  { href: '/qr', label: 'QR', icon: <QrCode size={22} />, match: (p: string) => p.startsWith('/qr') },
  { href: '/reports', label: 'Raporlar', icon: <BarChart3 size={22} />, match: (p: string) => p.startsWith('/reports') },
  { href: '/more', label: 'Daha fazla', icon: <Ellipsis size={22} />, match: (p: string) => p.startsWith('/more') },
];

export function AdminShell({ me, tenant, children }: { me: Me; tenant: Me['memberships'][number]; children: ReactNode }) {
  const path = usePathname();
  const items = NAV.filter((n) => n.href !== '/reports' || tenant.role !== 'STAFF').map((n) => ({ href: n.href, label: n.label, icon: n.icon, active: n.match(path) }));
  return (
    <SessionProvider value={{ me, role: tenant.role, tenant }}>
      <AppShell nav={<BottomNav label="Ana menü" items={items} Link={Link} />}>{children}</AppShell>
    </SessionProvider>
  );
}
