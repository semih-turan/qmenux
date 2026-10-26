'use client';
import { ClipboardList, LogOut, ScrollText, ShieldCheck, UserRound } from 'lucide-react';
import { Card, List, ListRow, Section } from '@qmenux/ui';
import { Link } from '@/components/link';
import { Page } from '@/components/page';
import { useOperator } from '@/components/session';
import { ROLE_LABELS, formatDateTime } from '@/lib/format';

export default function MorePage() {
  const op = useOperator();
  return (
    <Page title="Daha fazla">
      <Section title="Platform" id="platform">
        <Card flush>
          <List label="Platform">
            <li>
              <ListRow href="/more/applications" Link={Link} lead={<ClipboardList size={20} />} title="Başvurular" sub="Bekleyen, onaylanan ve reddedilen" chevron />
            </li>
            <li>
              <ListRow href="/more/audit" Link={Link} lead={<ScrollText size={20} />} title="Denetim kaydı" sub="Kim, ne zaman, neden" chevron />
            </li>
          </List>
        </Card>
      </Section>

      <Section title="Hesap" id="account">
        <Card flush>
          <List label="Hesap">
            <li>
              <ListRow static lead={<UserRound size={20} />} title={<span className="qx-break">{op.user.displayName ?? op.user.email}</span>} sub={<span className="qx-break">{`${op.user.email} · ${ROLE_LABELS[op.role]}`}</span>} />
            </li>
            <li>
              <ListRow static lead={<ShieldCheck size={20} />} title="İki adımlı doğrulama etkin" sub={`Oturum ${formatDateTime(op.expiresAt)} tarihine kadar; 30 dk hareketsizlikte kapanır`} />
            </li>
            <li>
              {/* Plain form POST: the route checks Origin, revokes the session server-side and clears the cookie. */}
              <form action="/auth/logout" method="post">
                <ListRow type="submit" lead={<LogOut size={20} />} title="Çıkış yap" />
              </form>
            </li>
          </List>
        </Card>
      </Section>
      <p className="qx-small qx-muted">Doğrulayıcı (TOTP) kurulumu yalnızca sunucu tarafında, komut satırından yapılır; bu panelden değiştirilemez.</p>
    </Page>
  );
}
