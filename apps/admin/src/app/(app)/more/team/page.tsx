'use client';
import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { Copy, Share2, UserMinus, UserPlus, X } from 'lucide-react';
import { Badge, Banner, Button, Card, ConfirmDialog, IconButton, Segmented, Sheet, TextField, useFocusFirstError, useToast } from '@qmenux/ui';
import { Page } from '@/components/page';
import { useCan, useSession } from '@/components/session';
import { Loadable, NoAccess } from '@/components/states';
import { api, isProblem, useApi, useSubmit } from '@/lib/api';
import { ROLE_LABELS_TR, formatDate, formatDateTime } from '@/lib/format';
import type { Team } from '@/lib/types';

type Member = Team['members'][number];
type Invite = Team['invites'][number];
type InviteRole = 'MANAGER' | 'STAFF';
type Created = { email: string; url: string };

const ROLE_HINTS: Record<InviteRole, string> = {
  MANAGER: 'Menüyü düzenler, yayınlar, raporları görür ve PDF alır. Ayarlara ve ekibe erişemez.',
  STAFF: 'Yalnızca ürünleri “tükendi” ya da “gizli” yapar. Fiyat ve içerik değiştiremez.',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function TeamPage() {
  const allowed = useCan('members.manage');
  const { me } = useSession();
  const toast = useToast();
  const q = useApi<Team>(allowed ? 'admin/team' : null);
  const [inviting, setInviting] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [revoking, setRevoking] = useState<Invite | null>(null);

  const closeInvite = () => {
    setInviting(false);
    setCreated(null);
  };

  return (
    <Page
      title="Ekip"
      back="/more"
      actions={
        allowed ? (
          <IconButton label="Kişi davet et" onClick={() => setInviting(true)}>
            <UserPlus size={22} />
          </IconButton>
        ) : undefined
      }
    >
      {!allowed ? (
        <NoAccess />
      ) : (
        <Loadable q={q} rows={3}>
          {({ members, invites }) => (
            <>
              <section className="qx-stack qx-stack--tight" aria-labelledby="members">
                <h2 id="members" className="qx-section__title">
                  Üyeler
                </h2>
                <Card flush>
                  <ul className="qx-list" aria-label="Üyeler">
                    {members.map((m) => {
                      const self = m.userId === me.user.id;
                      const name = m.displayName || m.email || 'Adsız üye';
                      return (
                        <li key={m.userId} className="qx-item">
                          <span className="qx-item__body">
                            <strong className="qx-break">{name}</strong>
                            <span className="qx-small qx-muted qx-break">
                              {m.displayName && m.email ? `${m.email} · ` : ''}
                              {formatDate(m.since)} tarihinden beri
                            </span>
                          </span>
                          <span className="qx-cat-row__tools">
                            {self && <Badge tone="info">Siz</Badge>}
                            <Badge tone={m.role === 'OWNER' ? 'primary' : 'neutral'}>{ROLE_LABELS_TR[m.role]}</Badge>
                            {!self && m.role !== 'OWNER' && (
                              <IconButton label={`${name} adlı üyeyi çıkar`} onClick={() => setRemoving(m)}>
                                <UserMinus size={18} />
                              </IconButton>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
                {members.length === 1 && invites.length === 0 && (
                  <Button variant="primary" block icon={<UserPlus size={16} />} onClick={() => setInviting(true)}>
                    Yönetici veya personel davet et
                  </Button>
                )}
              </section>

              {invites.length > 0 && (
                <section className="qx-stack qx-stack--tight" aria-labelledby="invites">
                  <h2 id="invites" className="qx-section__title">
                    Bekleyen davetler
                  </h2>
                  <Card flush>
                    <ul className="qx-list" aria-label="Bekleyen davetler">
                      {invites.map((i) => (
                        <li key={i.id} className="qx-item">
                          <span className="qx-item__body">
                            <strong className="qx-break">{i.email}</strong>
                            <span className="qx-small qx-muted">
                              {ROLE_LABELS_TR[i.role]} · {formatDateTime(i.expiresAt)} tarihine kadar geçerli
                            </span>
                          </span>
                          <span className="qx-cat-row__tools">
                            <IconButton label={`${i.email} davetini iptal et`} onClick={() => setRevoking(i)}>
                              <X size={18} />
                            </IconButton>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                </section>
              )}

              <p className="qx-small qx-muted">
                İşletme sahipliği bu ekrandan devredilemez veya kaldırılamaz. Sahiplik değişikliği için QMenuX ile iletişime geçin.
              </p>
            </>
          )}
        </Loadable>
      )}

      <Sheet open={inviting} onClose={closeInvite} title={created ? 'Davet bağlantısı hazır' : 'Kişi davet et'}>
        {inviting &&
          (created ? (
            <InviteLink created={created} onDone={closeInvite} />
          ) : (
            <InviteForm
              onCreated={(c) => {
                setCreated(c);
                void q.reload();
              }}
            />
          ))}
      </Sheet>

      <ConfirmDialog
        open={removing !== null}
        title={`${removing?.displayName || removing?.email || 'Bu üye'} ekipten çıkarılsın mı?`}
        confirmLabel="Ekipten çıkar"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await api(`admin/team/members/${removing.userId}`, { method: 'DELETE' });
            toast({ message: 'Üye ekipten çıkarıldı.' });
          } catch (e) {
            toast({ message: isProblem(e, 'NOT_FOUND') ? 'Bu üye zaten ekipte değil.' : isProblem(e, 'CONFLICT') ? 'Kendinizi ekipten çıkaramazsınız.' : e instanceof Error ? e.message : 'Çıkarılamadı.' });
          }
          void q.reload();
          setRemoving(null);
        }}
      >
        Bu işletmenin paneline hemen erişemez. Yaptığı değişiklikler kayıt geçmişinde kalır. Tekrar eklemek için yeni davet gönderebilirsiniz.
      </ConfirmDialog>

      <ConfirmDialog
        open={revoking !== null}
        title="Davet iptal edilsin mi?"
        confirmLabel="Daveti iptal et"
        onClose={() => setRevoking(null)}
        onConfirm={async () => {
          if (!revoking) return;
          try {
            await api(`admin/team/invites/${revoking.id}/revoke`, { method: 'POST' });
            toast({ message: 'Davet iptal edildi.' });
          } catch (e) {
            toast({ message: isProblem(e, 'NOT_FOUND') ? 'Bu davet zaten kullanılmış veya iptal edilmiş.' : e instanceof Error ? e.message : 'İptal edilemedi.' });
          }
          void q.reload();
          setRevoking(null);
        }}
      >
        <span className="qx-break">{revoking?.email}</span> adresine gönderdiğiniz bağlantı artık çalışmaz.
      </ConfirmDialog>
    </Page>
  );
}

function InviteForm({ onCreated }: { onCreated: (c: Created) => void }) {
  const { busy, errors, setErrors, run } = useSubmit();
  const formRef = useFocusFirstError(errors);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('STAFF');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!v) return setErrors({ email: 'E-posta adresini girin.' });
    if (!EMAIL_RE.test(v)) return setErrors({ email: 'Geçerli bir e-posta adresi girin.' });
    await run(async () => {
      const r = await api<{ id: string; inviteUrl: string; expiresInHours: number }>('admin/team/invites', { json: { email: v, role } });
      onCreated({ email: v, url: r.inviteUrl });
    });
  }

  return (
    <form ref={formRef} className="qx-stack" onSubmit={submit} noValidate>
      <TextField
        label="E-posta"
        type="email"
        inputMode="email"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        maxLength={254}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        hint="Kişi panele bu adresle giriş yapmalı; başka bir adresle bağlantı çalışmaz."
        required
      />
      <div className="qx-stack qx-stack--tight">
        <Segmented<InviteRole>
          label="Yetki"
          value={role}
          onChange={setRole}
          options={[
            { value: 'STAFF', label: 'Personel' },
            { value: 'MANAGER', label: 'Yönetici' },
          ]}
        />
        <p className="qx-small qx-muted">{ROLE_HINTS[role]}</p>
      </div>
      {errors._ && (
        <p className="qx-error" role="alert">
          {errors._}
        </p>
      )}
      <Button type="submit" variant="primary" block loading={busy}>
        Davet bağlantısı oluştur
      </Button>
    </form>
  );
}

const noop = () => () => {};
const hasShare = () => typeof navigator.share === 'function';

// No e-mail provider in V1 (DECISIONS.md D-API-05): the owner sends the one-time link through their own channel.
function InviteLink({ created, onDone }: { created: Created; onDone: () => void }) {
  const toast = useToast();
  const canShare = useSyncExternalStore(noop, hasShare, () => false);

  async function share() {
    try {
      await navigator.share({ title: 'QMenuX daveti', text: 'İşletme paneline katılmak için bağlantıyı açın:', url: created.url });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) toast({ message: 'Paylaşılamadı. Bağlantıyı kopyalayın.' });
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(created.url);
      toast({ message: 'Davet bağlantısı kopyalandı.' });
    } catch {
      toast({ message: 'Kopyalanamadı. Bağlantıyı basılı tutarak kopyalayın.' });
    }
  }

  return (
    <div className="qx-stack">
      <Banner tone="warning" title="Bağlantıyı şimdi gönderin">
        Güvenlik için bu bağlantı bir daha gösterilmez. Kaybederseniz daveti iptal edip yenisini oluşturun.
      </Banner>
      <p className="qx-small">
        Bağlantıyı <strong className="qx-break">{created.email}</strong> adresinin sahibine kendiniz iletin; QMenuX e-posta göndermez. Bağlantı 72 saat geçerlidir, tek
        kullanımlıktır ve yalnızca bu adresle giriş yapan kişide çalışır.
      </p>
      <div className="qx-url">{created.url}</div>
      <div className="qx-row-actions">
        {canShare && (
          <Button variant="primary" size="sm" icon={<Share2 size={16} />} onClick={share}>
            Paylaş
          </Button>
        )}
        <Button variant={canShare ? 'secondary' : 'primary'} size="sm" icon={<Copy size={16} />} onClick={copy}>
          Bağlantıyı kopyala
        </Button>
      </div>
      <Button variant="ghost" block onClick={onDone}>
        Tamam
      </Button>
    </div>
  );
}
