import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Banner, buttonClass, Wordmark } from '@qmenux/ui';
import { safeReturnTo } from '@/lib/bff-policy';
import { LOGIN_ERRORS } from '@/lib/messages';
import { serverGet, sessionToken, upstream } from '@/lib/upstream';

export const metadata: Metadata = { title: 'Giriş yap' };

type Provider = { id: string; label: string };

async function providers(): Promise<Provider[] | null> {
  try {
    const res = await upstream('/v1/auth/providers');
    if (!res.ok) return null;
    return ((await res.json()) as { providers: Provider[] }).providers;
  } catch {
    return null;
  }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const returnTo = safeReturnTo(typeof sp.returnTo === 'string' ? sp.returnTo : null);
  const error = typeof sp.error === 'string' ? sp.error : null;
  // Already signed in: skip the login screen. The cookie alone proves nothing (an idle-expired
  // session would bounce login ↔ app forever), so the API is asked first.
  if (!error && (await sessionToken()) && (await serverGet('/v1/me')).ok) redirect(returnTo ?? '/');
  const list = await providers();

  return (
    <main className="qx-center" id="qx-main" tabIndex={-1}>
      <div className="qx-center__panel qx-stack">
        <Wordmark suffix="İşletme" />
        <div>
          <h1 className="qx-h1">Menünüzü yönetmek için giriş yapın</h1>
          <p className="qx-muted">Kafe, kahve dükkânı ve restoranlar için QR menü paneli.</p>
        </div>
        {error && (
          <Banner tone="danger" live="alert" title="Giriş yapılamadı">
            {LOGIN_ERRORS[error] ?? 'Bir hata oluştu. Tekrar deneyin.'}
          </Banner>
        )}
        {list === null ? (
          <Banner tone="warning" title="Giriş servisine ulaşılamıyor">
            Birkaç dakika sonra tekrar deneyin.
          </Banner>
        ) : list.length === 0 ? (
          <Banner tone="warning" title="Giriş yöntemi yapılandırılmamış">
            Platform yöneticisinin en az bir giriş sağlayıcısını etkinleştirmesi gerekiyor.
          </Banner>
        ) : (
          <div className="qx-stack qx-stack--tight">
            {list.map((p) => (
              <form key={p.id} method="post" action="/auth/start">
                <input type="hidden" name="provider" value={p.id} />
                {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
                <button type="submit" className={buttonClass(p.id === list[0]!.id ? 'primary' : 'secondary', 'lg', true)}>
                  <span className="qx-btn__label">{p.label} ile devam et</span>
                </button>
              </form>
            ))}
          </div>
        )}
        <p className="qx-small qx-muted">
          Yeni işletme hesapları başvuru incelemesinden sonra açılır. Giriş yapmak tek başına bir ücret veya abonelik başlatmaz.
        </p>
      </div>
    </main>
  );
}
