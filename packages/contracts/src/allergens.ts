/** EU/TR 14 major allergens. Order is display order. */
export const ALLERGEN_CODES = [
  'GLUTEN',
  'CRUSTACEANS',
  'EGGS',
  'FISH',
  'PEANUTS',
  'SOY',
  'MILK',
  'TREE_NUTS',
  'CELERY',
  'MUSTARD',
  'SESAME',
  'SULPHITES',
  'LUPIN',
  'MOLLUSCS',
] as const;
export type AllergenCode = (typeof ALLERGEN_CODES)[number];

export const ALLERGEN_LABELS_TR: Record<AllergenCode, string> = {
  GLUTEN: 'Gluten içeren tahıllar',
  CRUSTACEANS: 'Kabuklu deniz ürünleri',
  EGGS: 'Yumurta',
  FISH: 'Balık',
  PEANUTS: 'Yer fıstığı',
  SOY: 'Soya',
  MILK: 'Süt ve süt ürünleri (laktoz dahil)',
  TREE_NUTS: 'Sert kabuklu yemişler',
  CELERY: 'Kereviz',
  MUSTARD: 'Hardal',
  SESAME: 'Susam',
  SULPHITES: 'Kükürt dioksit ve sülfitler',
  LUPIN: 'Acı bakla (lupin)',
  MOLLUSCS: 'Yumuşakçalar',
};

/** Compact labels for chips on small screens; the full label is always one tap away in the item detail. */
export const ALLERGEN_SHORT_LABELS_TR: Record<AllergenCode, string> = {
  GLUTEN: 'Gluten',
  CRUSTACEANS: 'Kabuklular',
  EGGS: 'Yumurta',
  FISH: 'Balık',
  PEANUTS: 'Yer fıstığı',
  SOY: 'Soya',
  MILK: 'Süt',
  TREE_NUTS: 'Kabuklu yemiş',
  CELERY: 'Kereviz',
  MUSTARD: 'Hardal',
  SESAME: 'Susam',
  SULPHITES: 'Sülfit',
  LUPIN: 'Lupin',
  MOLLUSCS: 'Yumuşakça',
};

export const ALLERGEN_STATUSES = ['CONTAINS', 'MAY_CONTAIN', 'FREE', 'UNKNOWN'] as const;
export type AllergenStatus = (typeof ALLERGEN_STATUSES)[number];

export const ALLERGEN_STATUS_LABELS_TR: Record<AllergenStatus, string> = {
  CONTAINS: 'İçerir',
  MAY_CONTAIN: 'Eser miktarda içerebilir',
  FREE: 'İçermez',
  UNKNOWN: 'Bilgi yok',
};

export const VERIFICATION_STATES = ['UNVERIFIED', 'VERIFIED'] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];

export const DATA_SOURCES = ['MANUAL', 'IMPORT', 'AI_SUGGESTION', 'SUPPLIER'] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

/**
 * Only human-VERIFIED values reach guests. UNKNOWN / unverified / AI-sourced
 * values are never presented as safe ("içermez").
 */
export function publicAllergenStatus(input: {
  status: AllergenStatus;
  verification: VerificationState;
}): AllergenStatus {
  if (input.verification !== 'VERIFIED') return 'UNKNOWN';
  return input.status;
}

/** A code missing from the list means nobody recorded it: that is UNKNOWN, never FREE. */
export function statusOf(allergens: readonly { code: AllergenCode; status: AllergenStatus }[], code: AllergenCode): AllergenStatus {
  return allergens.find((a) => a.code === code)?.status ?? 'UNKNOWN';
}

export type AllergenBucket = 'safe' | 'excluded' | 'uncertain';

/**
 * "Show me items without X" for guests. Only a verified FREE for every excluded code is `safe`;
 * CONTAINS / MAY_CONTAIN on any code is `excluded`; anything unrecorded is `uncertain` and must be
 * shown separately with an explanation, never silently merged into the safe list.
 */
export function allergenBucket(
  allergens: readonly { code: AllergenCode; status: AllergenStatus }[],
  exclude: readonly AllergenCode[],
): AllergenBucket {
  let bucket: AllergenBucket = 'safe';
  for (const code of exclude) {
    const s = statusOf(allergens, code);
    if (s === 'CONTAINS' || s === 'MAY_CONTAIN') return 'excluded';
    if (s !== 'FREE') bucket = 'uncertain';
  }
  return bucket;
}
