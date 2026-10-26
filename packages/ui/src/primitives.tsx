import type { ComponentPropsWithoutRef, ComponentType, ElementType, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/** Any router link (next/link) or a plain anchor; the UI package never imports a framework. */
export type LinkLike = ComponentType<{ href: string; className?: string; children?: ReactNode; 'aria-current'?: 'page' | undefined; prefetch?: boolean }>;

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', block = false, extra?: string) {
  return cx('qx-btn', `qx-btn--${variant}`, size !== 'md' && `qx-btn--${size}`, block && 'qx-btn--block', extra);
}

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Shows a spinner, keeps the width, blocks repeat submits and announces busy state. */
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant, size, block, loading = false, icon, className, children, disabled, type = 'button', onClick, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={buttonClass(variant, size, block, className)}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={loading ? (e) => e.preventDefault() : onClick}
    >
      {loading && <span className="qx-spinner" aria-hidden="true" />}
      <span className="qx-btn__label">
        {icon}
        {children}
      </span>
    </button>
  );
}

export interface IconButtonProps extends ComponentPropsWithoutRef<'button'> {
  /** Required accessible name; icon-only controls are otherwise silent to screen readers. */
  label: string;
  children: ReactNode;
}

export function IconButton({ label, className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button {...rest} type={type} className={cx('qx-iconbtn', className)} aria-label={label} title={label}>
      {children}
    </button>
  );
}

export function Spinner({ label = 'Yükleniyor' }: { label?: string }) {
  return <span className="qx-spinner" role="status" aria-label={label} />;
}

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({ tone = 'neutral', children, className, ...rest }: ComponentPropsWithoutRef<'span'> & { tone?: Tone }) {
  return (
    <span {...rest} className={cx('qx-badge', tone !== 'neutral' && `qx-badge--${tone}`, className)}>
      {children}
    </span>
  );
}

const BANNER_ICON = { info: Info, primary: Info, success: CheckCircle2, warning: AlertTriangle, danger: OctagonAlert } as const;

export interface BannerProps {
  tone?: keyof typeof BANNER_ICON;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  /** Use `alert` only for errors the user must notice now; everything else is a polite status. */
  live?: 'status' | 'alert' | 'none';
}

export function Banner({ tone = 'info', title, children, action, live = 'none' }: BannerProps) {
  const Icon = BANNER_ICON[tone];
  return (
    <div className={cx('qx-banner', tone !== 'info' && `qx-banner--${tone}`)} role={live === 'none' ? undefined : live}>
      <Icon size={18} aria-hidden="true" />
      <div className="qx-banner__body">
        {title && <p className="qx-banner__title">{title}</p>}
        {children && <div>{children}</div>}
        {action && <div className="qx-banner__action">{action}</div>}
      </div>
    </div>
  );
}

export function Card({ flush, className, as: As = 'div', ...rest }: ComponentPropsWithoutRef<'div'> & { flush?: boolean; as?: ElementType }) {
  return <As {...rest} className={cx('qx-card', flush && 'qx-card--flush', className)} />;
}

export function Section({ title, action, children, id }: { title: ReactNode; action?: ReactNode; children: ReactNode; id?: string }) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section className="qx-section" aria-labelledby={headingId}>
      <div className="qx-section__head">
        <h2 className="qx-section__title" id={headingId}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, meta }: { label: ReactNode; value: ReactNode; meta?: ReactNode }) {
  return (
    <div className="qx-stat">
      <span className="qx-stat__label">{label}</span>
      <span className="qx-stat__value">{value}</span>
      {meta && <span className="qx-stat__meta">{meta}</span>}
    </div>
  );
}

export function Skeleton({ width = '100%', height = 16, radius }: { width?: number | string; height?: number | string; radius?: number }) {
  return <span className="qx-skel" aria-hidden="true" style={{ width, height, borderRadius: radius }} />;
}

/** A list-shaped loading placeholder; announced once instead of per bar. */
export function ListSkeleton({ rows = 4, label = 'Yükleniyor' }: { rows?: number; label?: string }) {
  return (
    <div className="qx-card qx-card--flush" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="qx-row" style={{ borderTop: i ? '1px solid var(--qx-border)' : undefined }}>
          <Skeleton width={40} height={40} radius={8} />
          <div className="qx-row__body">
            <Skeleton width={`${60 - (i % 3) * 12}%`} />
            <Skeleton width="35%" height={12} />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface StateProps {
  icon: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, children, action }: StateProps) {
  return (
    <div className="qx-state">
      <div className="qx-state__icon" aria-hidden="true">
        {icon}
      </div>
      <h2 className="qx-state__title">{title}</h2>
      {children && <p className="qx-state__body">{children}</p>}
      {action && <div className="qx-state__action">{action}</div>}
    </div>
  );
}

export function ErrorState({ icon, title, children, action }: StateProps) {
  return (
    <div className="qx-state qx-state--danger" role="alert">
      <div className="qx-state__icon" aria-hidden="true">
        {icon}
      </div>
      <h2 className="qx-state__title">{title}</h2>
      {children && <p className="qx-state__body">{children}</p>}
      {action && <div className="qx-state__action">{action}</div>}
    </div>
  );
}

export function Wordmark({ suffix }: { suffix?: string }) {
  return (
    <span className="qx-wordmark">
      <span className="qx-wordmark__mark" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <path d="M14 14h3v3M21 21h-4M21 14v3" />
        </svg>
      </span>
      QMenuX{suffix && <span className="qx-muted" style={{ fontWeight: 600 }}>{suffix}</span>}
    </span>
  );
}
