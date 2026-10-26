/** Turkish copy for API problem codes. Unknown codes fall back to the API title. */
const MESSAGES: Record<string, string> = {
  NETWORK: 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.',
  UNAUTHENTICATED: 'Oturumunuz sona erdi. Lütfen tekrar giriş yapın.',
  FORBIDDEN: 'Bu işlem için yetkiniz yok.',
  CSRF: 'İstek doğrulanamadı. Sayfayı yenileyip tekrar deneyin.',
  LICENSE_INACTIVE: 'Lisansınız etkin değil. Değişiklik yapmak için lisansın tanımlanması gerekiyor.',
  RATE_LIMITED: 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.',
  VALIDATION_FAILED: 'Bazı alanlar hatalı. Lütfen kontrol edin.',
  CONFLICT: 'Bu kayıt siz düzenlerken başka biri tarafından değiştirildi.',
  NOT_FOUND: 'Kayıt bulunamadı. Silinmiş olabilir.',
  PAYLOAD_TOO_LARGE: 'Dosya çok büyük. En fazla 5 MB yükleyebilirsiniz.',
  UNSUPPORTED_MEDIA: 'Yalnızca JPEG, PNG veya WebP görsel yükleyebilirsiniz.',
  SLUG_TAKEN: 'Bu adres kullanılıyor. Başka bir adres deneyin.',
  SLUG_INVALID: 'Adres yalnızca küçük harf, rakam ve tire içerebilir.',
  ALREADY_PENDING: 'İncelemede bekleyen bir başvurunuz zaten var.',
  INVITE_INVALID: 'Bu davet geçersiz, süresi dolmuş ya da kullanılmış.',
  REGIONS_NOT_AVAILABLE: 'Bölge seçimi henüz kullanılamıyor. Yarıçap modunu kullanın.',
  CATEGORY_NOT_EMPTY: 'Kategoride ürün varken silinemez. Önce ürünleri taşıyın ya da silin.',
  NOTHING_TO_PUBLISH: 'Yayınlanacak bir değişiklik yok.',
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
};
