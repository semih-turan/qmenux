'use client';
import { ClipboardList, KeyRound, ScrollText, Store } from 'lucide-react';
import { Banner, Card, List, ListRow, Section, Stat, buttonClass } from '@qmenux/ui';
import { Link } from '@/components/link';
import { Page } from '@/components/page';
import { useOperator } from '@/components/session';
import { Loadable } from '@/components/states';
import { useApi } from '@/lib/api';
import { ROLE_LABELS, formatCount } from '@/lib/format';
import type { PlatformStats } from '@/lib/types';

export default function OverviewPage() {
  const op = useOperator();
  const q = useApi<PlatformStats>('control/stats');
  return (
    <Page title="Genel bakış" subtitle={ROLE_LABELS[op.role]}>
      <Loadable q={q} rows={5}>
        {(s) => (
          <>
            {s.pendingApplications > 0 ? (
              <Banner
                tone="primary"
                title={`${formatCount(s.pendingApplications)} başvuru incelemenizi bekliyor`}
                action={
                  <Link href="/more/applications" className={buttonClass('primary', 'sm')}>
                    <span className="qx-btn__label">Başvuruları aç</span>
                  </Link>
                }
              >
                Onaylanan işletme, lisans tanımlanana kadar yayına açılmaz.
              </Banner>
            ) : (
              <p className="qx-small qx-muted">Bekleyen başvuru yok.</p>
            )}

            <div className="qx-grid-2">
              <Card>
                <Stat label="Aktif işletme" value={<span className="qx-num">{formatCount(s.activeTenants)}</span>} />
              </Card>
              <Card>
                <Stat label="Bu ay QR okutma" value={<span className="qx-num">{formatCount(s.scansThisMonth)}</span>} meta="Tüm işletmeler" />
              </Card>
              <Card>
                <Stat label="14 gün içinde dolacak" value={<span className="qx-num">{formatCount(s.expiringSoon)}</span>} meta="Lisans" />
              </Card>
              <Card>
                <Stat label="Ek sürede" value={<span className="qx-num">{formatCount(s.graceTenants)}</span>} meta="Süresi dolmuş, hâlâ açık" />
              </Card>
            </div>

            {s.unlicensedTenants > 0 && (
              <Banner tone="warning" title={`${formatCount(s.unlicensedTenants)} işletmenin lisansı yok ya da dolmuş`} action={<Link href="/licenses?view=unlicensed" className={buttonClass('secondary', 'sm')}><span className="qx-btn__label">Listele</span></Link>}>
                Bu işletmelerin müşteri menüsü kapalı.
              </Banner>
            )}

            <Section title="Hızlı erişim" id="quick">
              <Card flush>
                <List label="Hızlı erişim">
                  <li>
                    <ListRow href="/more/applications" Link={Link} lead={<ClipboardList size={20} />} title="Başvurular" sub="Onayla veya reddet" chevron />
                  </li>
                  <li>
                    <ListRow href="/tenants" Link={Link} lead={<Store size={20} />} title="İşletme ara" sub="Ad veya adresle bul" chevron />
                  </li>
                  <li>
                    <ListRow href="/licenses" Link={Link} lead={<KeyRound size={20} />} title="Lisanslar" sub="Yakında dolacak, ek süre, lisanssız" chevron />
                  </li>
                  <li>
                    <ListRow href="/more/audit" Link={Link} lead={<ScrollText size={20} />} title="Denetim kaydı" sub="Tüm platform işlemleri" chevron />
                  </li>
                </List>
              </Card>
            </Section>
          </>
        )}
      </Loadable>
    </Page>
  );
}
