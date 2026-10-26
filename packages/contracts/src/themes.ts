/** Exactly ten public menu themes (PUBLIC_THEME_CATALOG.md). Admin/superadmin never change theme. */
export const THEME_IDS = [
  'coffee-minimal',
  'botanical-cafe',
  'dark-dining',
  'street-food',
  'classic-bistro',
  'elegant-serif',
  'mediterranean',
  'japanese-minimal',
  'modern-grid',
  'retro-diner',
] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME_ID: ThemeId = 'coffee-minimal';

/** Display names from PUBLIC_THEME_CATALOG.md (names stay as catalogued; descriptions are Turkish). */
export const THEME_META: Record<ThemeId, { name: string; suitableFor: string }> = {
  'coffee-minimal': { name: 'Coffee Minimal', suitableFor: 'Nitelikli kahve ve espresso barlar' },
  'botanical-cafe': { name: 'Botanical Café', suitableFor: 'Kafeler, brunch, pastaneler' },
  'dark-dining': { name: 'Dark Dining', suitableFor: 'Premium restoranlar, et restoranları' },
  'street-food': { name: 'Street Food', suitableFor: 'Burger, pizza, hızlı servis' },
  'classic-bistro': { name: 'Classic Bistro', suitableFor: 'Mahalle kafeleri ve restoranları' },
  'elegant-serif': { name: 'Elegant Serif', suitableFor: 'Fine dining ve pastane' },
  mediterranean: { name: 'Mediterranean', suitableFor: 'Akdeniz restoranları, sahil kafeleri' },
  'japanese-minimal': { name: 'Japanese Minimal', suitableFor: 'Suşi/Asya restoranları, çay barları' },
  'modern-grid': { name: 'Modern Grid', suitableFor: 'Karma menülü zincirler, modern kafeler' },
  'retro-diner': { name: 'Retro Diner', suitableFor: 'Diner, burger, tatlı barları' },
};

/**
 * Base palette per theme (page background, text, accent), derived from the catalogue's visual direction.
 * Shared by the admin theme picker and the public menu themes so previews never drift.
 * Pending design review (DECISIONS.md D-UI-04); accent is decorative, text contrast comes from `ink` on `bg`.
 */
export const THEME_SWATCHES: Record<ThemeId, { bg: string; ink: string; accent: string }> = {
  'coffee-minimal': { bg: '#F6F1E9', ink: '#2B1D14', accent: '#8A5A3B' },
  'botanical-cafe': { bg: '#F7F5EC', ink: '#233127', accent: '#4E6B4B' },
  'dark-dining': { bg: '#17171A', ink: '#F2ECE4', accent: '#C27A4A' },
  'street-food': { bg: '#FFF8EE', ink: '#1E1A17', accent: '#E4572E' },
  'classic-bistro': { bg: '#FAF6EE', ink: '#1F2430', accent: '#7A2E2E' },
  'elegant-serif': { bg: '#FFFFFF', ink: '#1C1C1C', accent: '#7A6640' },
  mediterranean: { bg: '#F5EEDF', ink: '#13324B', accent: '#1F6FA8' },
  'japanese-minimal': { bg: '#F4F2EE', ink: '#1A1A1A', accent: '#B23A2E' },
  'modern-grid': { bg: '#F3F4F6', ink: '#111827', accent: '#2563EB' },
  'retro-diner': { bg: '#FFF4DE', ink: '#2A1B12', accent: '#D7263D' },
};

export const BUSINESS_TYPES = [
  'COFFEE_SHOP',
  'CAFE',
  'BAKERY_PATISSERIE',
  'BRUNCH',
  'RESTAURANT',
  'FAST_FOOD',
  'OTHER',
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const BUSINESS_TYPE_LABELS_TR: Record<BusinessType, string> = {
  COFFEE_SHOP: 'Kahve dükkânı',
  CAFE: 'Kafe',
  BAKERY_PATISSERIE: 'Fırın / pastane',
  BRUNCH: 'Kahvaltı & brunch',
  RESTAURANT: 'Restoran',
  FAST_FOOD: 'Hızlı yemek',
  OTHER: 'Diğer',
};

/** Suggestions only; owner may change everything. No demo food facts are published. */
export const BUSINESS_TYPE_SUGGESTIONS: Record<BusinessType, { theme: ThemeId; categories: string[] }> = {
  COFFEE_SHOP: { theme: 'coffee-minimal', categories: ['Sıcak kahveler', 'Soğuk kahveler', 'Çaylar', 'Tatlılar'] },
  CAFE: { theme: 'botanical-cafe', categories: ['Sıcak içecekler', 'Soğuk içecekler', 'Atıştırmalıklar', 'Tatlılar'] },
  BAKERY_PATISSERIE: { theme: 'classic-bistro', categories: ['Ekmekler', 'Pastalar', 'Kurabiyeler', 'İçecekler'] },
  BRUNCH: { theme: 'mediterranean', categories: ['Kahvaltılıklar', 'Yumurtalar', 'Tostlar', 'İçecekler'] },
  RESTAURANT: { theme: 'elegant-serif', categories: ['Başlangıçlar', 'Ana yemekler', 'Tatlılar', 'İçecekler'] },
  FAST_FOOD: { theme: 'street-food', categories: ['Burgerler', 'Dürümler', 'Yan ürünler', 'İçecekler'] },
  OTHER: { theme: 'modern-grid', categories: ['Kategori 1'] },
};
