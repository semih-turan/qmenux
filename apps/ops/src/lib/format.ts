import { BUSINESS_TYPE_LABELS_TR, THEME_META, type LicenseStatus, type TenantStatus } from '@qmenux/contracts';
import type { ApplicationStatus } from './types';

// Display formatting for the operator panel. Dates render in the device's zone.

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const formatCount = (n: number) => n.toLocaleString('tr-TR');

/** "2026-10" → "Ekim 2026" */
export const formatMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

const DAY_MS = 86_400_000;

/** Whole days from now until `iso` (negative when past). */
export const daysUntil = (iso: string, now = Date.now()) => Math.ceil((new Date(iso).getTime() - now) / DAY_MS);

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export const LICENSE_LABELS: Record<LicenseStatus, { label: string; tone: Tone }> = {
  NOT_GRANTED: { label: 'Lisans yok', tone: 'neutral' },
  ACTIVE: { label: 'Etkin', tone: 'success' },
  GRACE: { label: 'Ek süre', tone: 'warning' },
  EXPIRED: { label: 'Süresi doldu', tone: 'danger' },
  REVOKED: { label: 'İptal edildi', tone: 'danger' },
};

export const TENANT_LABELS: Record<TenantStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Taslak', tone: 'neutral' },
  PENDING_APPROVAL: { label: 'Onay bekliyor', tone: 'info' },
  APPROVED: { label: 'Onaylandı', tone: 'info' },
  ACTIVE: { label: 'Aktif', tone: 'success' },
  REJECTED: { label: 'Reddedildi', tone: 'danger' },
  SUSPENDED: { label: 'Askıda', tone: 'danger' },
};

export const APPLICATION_LABELS: Record<ApplicationStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Bekliyor', tone: 'warning' },
  APPROVED: { label: 'Onaylandı', tone: 'success' },
  REJECTED: { label: 'Reddedildi', tone: 'danger' },
  WITHDRAWN: { label: 'Geri çekildi', tone: 'neutral' },
};

export const businessTypeLabel = (t: string) => (BUSINESS_TYPE_LABELS_TR as Record<string, string>)[t] ?? t;
export const themeLabel = (id: string) => (THEME_META as Record<string, { name: string }>)[id]?.name ?? id;

export const ROLE_LABELS: Record<string, string> = { OWNER: 'Sahip', MANAGER: 'Yönetici', STAFF: 'Personel', PLATFORM_ADMIN: 'Platform yöneticisi', PLATFORM_SUPPORT: 'Destek (salt okunur)' };

/** Audit action codes → short Turkish labels; unknown actions show the raw code. */
export const AUDIT_LABELS: Record<string, string> = {
  'application.approve': 'Başvuru onaylandı',
  'application.reject': 'Başvuru reddedildi',
  'license.grant': 'Lisans tanımlandı',
  'license.revoke': 'Lisans iptal edildi',
  'tenant.suspend': 'İşletme askıya alındı',
  'tenant.unsuspend': 'Askı kaldırıldı',
  'menu.publish': 'Menü yayınlandı',
  'menu.restore': 'Menü sürümü geri alındı',
  'category.create': 'Kategori eklendi',
  'category.update': 'Kategori güncellendi',
  'category.delete': 'Kategori silindi',
  'product.create': 'Ürün eklendi',
  'product.update': 'Ürün güncellendi',
  'product.delete': 'Ürün silindi',
  'product.availability': 'Ürün durumu değişti',
  'product.image': 'Ürün görseli değişti',
  'import.apply': 'Excel/CSV içe aktarıldı',
  'import.discard': 'İçe aktarma iptal edildi',
  'pdf.request': 'PDF talep edildi',
  'tenant.approved': 'İşletme onaylandı',
  'tenant.branding': 'Marka / tema güncellendi',
  'tenant.logo': 'Logo değişti',
  'branch.update': 'Şube bilgileri güncellendi',
  'branch.geofence': 'Konum görünürlüğü değişti',
  'branch.wifi': 'Wi-Fi ayarı değişti',
  'branch.whatsapp': 'WhatsApp düğmesi değişti',
  'member.invite': 'Ekip daveti gönderildi',
  'member.invite_revoke': 'Davet iptal edildi',
  'member.revoke': 'Üye çıkarıldı',
  'invite.accept': 'Davet kabul edildi',
  'qr_table.create': 'Masa QR oluşturuldu',
  'qr_table.rotate': 'Masa QR yenilendi',
  'qr_table.revoke': 'Masa QR iptal edildi',
};
export const auditLabel = (a: string) => AUDIT_LABELS[a] ?? a;

/**
 * License end-date input helper. Grants always end at the end of the chosen calendar day in the
 * operator's zone, so "31 Aralık" means the menu stays open through that day.
 */
export function endOfDayIso(yyyyMmDd: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return null;
  const [y, m, d] = yyyyMmDd.split('-').map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d, 23, 59, 59, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt.toISOString();
}

/** Local calendar date (yyyy-mm-dd) of `base` plus N months, clamped to the month's last day. */
export function plusMonths(base: Date, months: number): string {
  const y = base.getFullYear();
  const m = base.getMonth() + months;
  const last = new Date(y, m + 1, 0).getDate();
  const dt = new Date(y, m, Math.min(base.getDate(), last));
  return toDateInput(dt);
}

export const toDateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
