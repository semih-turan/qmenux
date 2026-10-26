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
  // Already signed in: the shell decides between the MFA step and the app. The cookie alone proves
  // nothing (an idle-expired session would bounce login ↔ app forever), so the API is asked.
  if (!error && (await sessionToken()) && (await serverGet('/v1/control/session')).ok) redirect(returnTo ?? '/');
  const list = await providers();

  return (
    <main className="qx-center" id="qx-main" tabIndex={-1}>
      <div className="qx-center__panel qx-stack">
        <Wordmark suffix="Platform" />
        <div>
          <h1 className="qx-h1">Platform operatörü girişi</h1>
          <p className="qx-muted">Yalnızca yetkili QMenuX operatörleri içindir. Girişten sonra iki adımlı doğrulama istenir.</p>
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
            En az bir giriş sağlayıcısının etkinleştirilmesi gerekiyor.
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
        <p className="qx-small qx-muted">Bu adres gizli değildir; erişim kimlik, operatör rolü ve iki adımlı doğrulama ile sunucu tarafında denetlenir.</p>
      </div>
    </main>
  );
}
