'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, QrCode } from 'lucide-react';
import { buttonClass } from '@qmenux/ui';
import { LEGAL, NAV, SITE } from '@/lib/site';

export function Header() {
  const path = usePathname();
  const current = (href: string) => (path === href ? 'page' : undefined);
  return (
    <header className="ld-header">
      <div className="ld-wrap ld-header__row">
        <Link href="/" className="ld-brand" aria-label="QMenuX ana sayfa">
          <span className="ld-brand__mark" aria-hidden="true">
            <QrCode size={18} />
          </span>
          QMenuX
        </Link>
        <nav className="ld-nav" aria-label="Site">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={current(n.href)}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ld-header__actions">
          <a className={buttonClass('secondary', 'sm')} href={`${SITE.adminOrigin}/login`}>
            <span className="qx-btn__label">Giriş yap</span>
          </a>
          <a className={`${buttonClass('primary', 'sm')} ld-mobile-hide`} href="/kayit">
            <span className="qx-btn__label">Hesap oluştur</span>
          </a>
        </div>
      </div>
      <details className="ld-wrap ld-mobile">
        <summary className="ld-menu-toggle" aria-label="Menüyü aç">
          <Menu size={20} aria-hidden="true" />
        </summary>
        <nav className="ld-menu" aria-label="Site (mobil)">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={current(n.href)}>
              {n.label}
            </Link>
          ))}
          <Link href="/kayit">Hesap oluştur</Link>
        </nav>
      </details>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="ld-footer">
      <div className="ld-wrap">
        <div className="ld-footer__grid">
          <div>
            <h4>QMenuX</h4>
            <p>Kafeler, kahve dükkânları, pastaneler ve restoranlar için telefondan yönetilen QR menü.</p>
          </div>
          <div>
            <h4>Ürün</h4>
            <ul>
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link href={n.href}>{n.label}</Link>
                </li>
              ))}
              <li>
                <Link href="/iletisim">İletişim</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Hukuki</h4>
            <ul>
              {LEGAL.map((n) => (
                <li key={n.href}>
                  <Link href={n.href}>{n.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="ld-footer__legal">Bu site çerez kullanmaz ve ziyaretçi takibi yapmaz. Hukuki metinler avukat incelemesi tamamlanana kadar taslaktır.</p>
      </div>
    </footer>
  );
}
