'use client';
import { ArrowLeftRight, FileSpreadsheet, FileText, KeyRound, LogOut, MapPin, MessageCircle, Palette, Store, UserRound, Users, Wifi } from 'lucide-react';
import { Card, List, ListRow, Section } from '@qmenux/ui';
import { Link } from '@/components/link';
import { Page } from '@/components/page';
import { useCan, useSession } from '@/components/session';
import { ROLE_LABELS_TR } from '@/lib/format';

const SETTINGS = [
  { href: '/more/profile', title: 'Profil ve tema', sub: 'Ad, logo, menü görünümü', icon: <Palette size={20} /> },
  { href: '/more/branch', title: 'Şube bilgileri', sub: 'Adres, telefon, çalışma saatleri', icon: <Store size={20} /> },
  { href: '/more/wifi', title: 'Wi-Fi', sub: 'Menüde ağ bilgisini göster', icon: <Wifi size={20} /> },
  { href: '/more/whatsapp', title: 'WhatsApp düğmesi', sub: 'İsteğe bağlı iletişim düğmesi', icon: <MessageCircle size={20} /> },
  { href: '/more/visibility', title: 'Konum görünürlüğü', sub: 'Menüyü işletme çevresiyle sınırla', icon: <MapPin size={20} /> },
];

export default function MorePage() {
  const { me, role, tenant } = useSession();
  const canSettings = useCan('settings.write');
  const canTeam = useCan('members.manage');
  const canExport = useCan('exports.create');

  return (
    <Page title="Daha fazla">
      {canSettings ? (
        <Section title="İşletme" id="business">
          <Card flush>
            <List label="İşletme ayarları">
              {SETTINGS.map((s) => (
                <li key={s.href}>
                  <ListRow href={s.href} Link={Link} lead={s.icon} title={s.title} sub={s.sub} chevron />
                </li>
              ))}
            </List>
          </Card>
        </Section>
      ) : (
        <p className="qx-small qx-muted">İşletme ayarlarını (tema, Wi-Fi, konum) işletme sahibi değiştirir.</p>
      )}

      <Section title="Ekip ve belgeler" id="docs">
        <Card flush>
          <List label="Ekip ve belgeler">
            {canTeam && (
              <li>
                <ListRow href="/more/team" Link={Link} lead={<Users size={20} />} title="Ekip" sub="Yönetici ve personel davet et" chevron />
              </li>
            )}
            {canExport && (
              <li>
                <ListRow href="/more/exports" Link={Link} lead={<FileText size={20} />} title="PDF menüler" sub="A4 menü ve alerjen tablosu" chevron />
              </li>
            )}
            {canSettings && (
              <li>
                <ListRow href="/more/import" Link={Link} lead={<FileSpreadsheet size={20} />} title="Menü içe aktar" sub="Excel veya CSV'den ürün yükle" chevron />
              </li>
            )}
            <li>
              <ListRow href="/more/license" Link={Link} lead={<KeyRound size={20} />} title="Lisans" sub="Durum ve süre" chevron />
            </li>
          </List>
        </Card>
      </Section>

      <Section title="Hesap" id="account">
        <Card flush>
          <List label="Hesap">
            <li>
              <ListRow
                static
                lead={<UserRound size={20} />}
                title={<span className="qx-break">{me.user.displayName ?? me.user.email}</span>}
                sub={<span className="qx-break">{`${tenant.displayName} · ${ROLE_LABELS_TR[role]}`}</span>}
              />
            </li>
            {me.memberships.length > 1 && (
              <li>
                <ListRow href="/select" Link={Link} lead={<ArrowLeftRight size={20} />} title="İşletme değiştir" sub={`${me.memberships.length} işletme`} chevron />
              </li>
            )}
            <li>
              {/* Plain form POST: the route checks Origin, revokes the session server-side and clears the cookie. */}
              <form action="/auth/logout" method="post">
                <ListRow type="submit" lead={<LogOut size={20} />} title="Çıkış yap" />
              </form>
            </li>
          </List>
        </Card>
      </Section>
    </Page>
  );
}
