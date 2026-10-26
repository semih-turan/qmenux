/** Turkish copy for API problem codes on the operator panel. Unknown codes fall back to the API title. */
const MESSAGES: Record<string, string> = {
  NETWORK: 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.',
  UNAUTHENTICATED: 'Oturumunuz sona erdi. Lütfen tekrar giriş yapın.',
  FORBIDDEN: 'Bu işlem için yetkiniz yok. Değişiklikler yalnızca platform yöneticilerine açıktır.',
  MFA_REQUIRED: 'Devam etmek için iki adımlı doğrulama gerekiyor.',
  MFA_INVALID: 'Doğrulama kodu hatalı ya da kullanılmış. Uygulamadaki güncel kodu girin.',
  MFA_NOT_ENROLLED: 'Bu hesap için iki adımlı doğrulama kurulmamış. Kurulum yalnızca sunucu tarafında (CLI) yapılır.',
  CSRF: 'İstek doğrulanamadı. Sayfayı yenileyip tekrar deneyin.',
  RATE_LIMITED: 'Çok fazla deneme yapıldı. Birkaç dakika bekleyip tekrar deneyin.',
  VALIDATION_FAILED: 'Bazı alanlar hatalı. Lütfen kontrol edin.',
  CONFLICT: 'Bu işlem mevcut durumla çelişiyor. Sayfayı yenileyip tekrar deneyin.',
  NOT_FOUND: 'Kayıt bulunamadı.',
  PAYLOAD_TOO_LARGE: 'İstek çok büyük.',
  UNSUPPORTED_MEDIA: 'Desteklenmeyen içerik türü.',
};

export function problemMessage(code: string, fallback?: string): string {
  return MESSAGES[code] ?? fallback ?? 'Bir hata oluştu. Tekrar deneyin.';
}

/** Errors that come back to /login?error=… from the auth routes. */
export const LOGIN_ERRORS: Record<string, string> = {
  CANCELLED: 'Giriş iptal edildi.',
  IDP_ERROR: 'Giriş sağlayıcısı bir hata döndürdü. Tekrar deneyin.',
  FLOW_INVALID: 'Giriş oturumu doğrulanamadı ya da süresi doldu. Tekrar deneyin.',
  FLOW_FAILED: 'Giriş başlatılamadı. Tekrar deneyin.',
  PROVIDER_UNAVAILABLE: 'Bu giriş yöntemi şu an kullanılamıyor.',
  RATE_LIMITED: MESSAGES.RATE_LIMITED!,
  EMAIL_NOT_VERIFIED: 'E-posta adresiniz giriş sağlayıcısında doğrulanmamış.',
  FORBIDDEN: 'Bu hesap bir platform operatörü değil. İşletme paneli için admin adresini kullanın.',
  MFA_NOT_ENROLLED: MESSAGES.MFA_NOT_ENROLLED!,
};
