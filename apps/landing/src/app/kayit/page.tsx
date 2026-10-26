import type { Metadata } from 'next';
import { buttonClass } from '@qmenux/ui';
import { ContentPage } from '@/components/page';
import { SITE } from '@/lib/site';

export const metadata: Metadata = { title: 'Hesap oluştur' };

/**
 * Sign-up is the same federated login followed by the application form in the admin PWA
 * (IDENTITY_OIDC_ONBOARDING). This page sets expectations before sending the visitor there.
 */
export default function SignupPage() {
  return (
    <ContentPage title="Hesap oluştur" prose lead="Google, Microsoft veya Apple hesabınızla giriş yapıp işletme başvurusunu doldurursunuz.">
      <ol>
        <li>Giriş yapın (yeni hesap otomatik oluşur; şifre belirlemezsiniz).</li>
        <li>İşletme adı, türü, şehir ve menü adresinizi yazın; kullanım koşullarını kabul edin.</li>
        <li>Başvurunuz incelenir. Onay ve lisans tanımlandığında menünüz yayına açılabilir.</li>
      </ol>
      <p>Kayıt tek başına ücret veya abonelik başlatmaz. Onay süresince paneli açıp menünüzü hazırlayabilirsiniz.</p>
      <div className="ld-cta">
        <a href={`${SITE.adminOrigin}/login?returnTo=%2Fonboarding`} className={buttonClass('primary', 'lg')}>
          <span className="qx-btn__label">Giriş yap ve başvur</span>
        </a>
      </div>
    </ContentPage>
  );
}
