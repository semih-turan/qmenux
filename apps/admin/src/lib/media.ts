// Same limits the API enforces (it also sniffs the bytes); checked here only to fail fast on the phone.
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function imageError(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return 'JPEG, PNG veya WebP görsel seçin.';
  if (file.size > MAX_IMAGE_BYTES) return 'Görsel en fazla 5 MB olabilir.';
  return null;
}
