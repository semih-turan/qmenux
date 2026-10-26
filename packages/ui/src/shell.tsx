import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cx, type LinkLike } from './primitives';

export function AppShell({ nav, children }: { nav?: ReactNode; children: ReactNode }) {
  return (
    <div className="qx-app" data-nav={nav ? '' : undefined}>
      <a className="qx-skip-link" href="#qx-main">
        İçeriğe geç
      </a>
      {children}
      {nav}
    </div>
  );
}

export interface AppBarProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** A back link/button rendered before the title. */
  leading?: ReactNode;
  actions?: ReactNode;
}

export function AppBar({ title, subtitle, leading, actions }: AppBarProps) {
  return (
    <header className="qx-appbar">
      <div className="qx-appbar__inner">
        {leading}
        <h1 className="qx-appbar__title">
          {title}
          {subtitle && <span className="qx-appbar__sub">{subtitle}</span>}
        </h1>
        {actions}
      </div>
    </header>
  );
}

export function Main({ children }: { children: ReactNode }) {
  return (
    <main className="qx-main" id="qx-main" tabIndex={-1}>
      {children}
    </main>
  );
}

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
}

/** At most five destinations; labels are always visible (icons alone are ambiguous). */
export function BottomNav({ items, label, Link }: { items: NavItem[]; label: string; Link: LinkLike }) {
  return (
    <nav className="qx-bottomnav" aria-label={label}>
      <ul className="qx-bottomnav__list">
        {items.slice(0, 5).map((it) => (
          <li key={it.href}>
            <Link href={it.href} className="qx-bottomnav__item" aria-current={it.active ? 'page' : undefined}>
              <span className="qx-bottomnav__icon" aria-hidden="true">
                {it.icon}
              </span>
              <span className="qx-bottomnav__label">{it.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

interface RowContent {
  title: ReactNode;
  sub?: ReactNode;
  lead?: ReactNode;
  trail?: ReactNode;
  chevron?: boolean;
}

function RowInner({ title, sub, lead, trail, chevron }: RowContent) {
  return (
    <>
      {lead && <span className="qx-row__lead">{lead}</span>}
      <span className="qx-row__body">
        <span className="qx-row__title">{title}</span>
        {sub && <span className="qx-row__sub">{sub}</span>}
      </span>
      {(trail || chevron) && (
        <span className="qx-row__trail">
          {trail}
          {chevron && <ChevronRight size={18} aria-hidden="true" />}
        </span>
      )}
    </>
  );
}

export type ListRowProps = RowContent &
  ({ href: string; Link: LinkLike; onClick?: never } | ({ href?: never; Link?: never } & Omit<ComponentPropsWithoutRef<'button'>, 'title'>) | { static: true });

export function ListRow(props: ListRowProps) {
  const { title, sub, lead, trail, chevron } = props;
  const inner = <RowInner title={title} sub={sub} lead={lead} trail={trail} chevron={chevron} />;
  if ('static' in props) return <div className="qx-row">{inner}</div>;
  if ('href' in props && props.href) {
    const { Link } = props;
    return (
      <Link href={props.href} className="qx-row qx-row--interactive">
        {inner}
      </Link>
    );
  }
  const { title: _t, sub: _s, lead: _l, trail: _tr, chevron: _c, href: _h, Link: _L, className, ...button } = props as RowContent &
    Omit<ComponentPropsWithoutRef<'button'>, 'title'> & { href?: never; Link?: never };
  return (
    <button type="button" {...button} className={cx('qx-row qx-row--interactive', className)}>
      {inner}
    </button>
  );
}

export function List({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul className="qx-list" aria-label={label}>
      {children}
    </ul>
  );
}
