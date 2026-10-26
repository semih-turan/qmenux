import type { AllergenCode, AllergenStatus } from './allergens.js';
import type { Availability } from './enums.js';
import type { BusinessType, ThemeId } from './themes.js';

/**
 * Guest-facing read model. Built from an immutable published revision plus the
 * live availability overlay. Contains no tenant ids, member data or drafts.
 */
export interface PublicMenuItem {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  imageUrl: string | null;
  availability: Exclude<Availability, 'HIDDEN'>;
  tags: string[];
  /** Only human-verified kcal is exposed; otherwise null. */
  kcal: number | null;
  allergens: { code: AllergenCode; status: AllergenStatus }[];
}

export interface PublicMenuCategory {
  id: string;
  name: string;
  description: string | null;
  items: PublicMenuItem[];
}

export interface PublicMenu {
  slug: string;
  displayName: string;
  tagline: string | null;
  businessType: BusinessType;
  themeId: ThemeId;
  logoUrl: string | null;
  branch: {
    name: string;
    address: string | null;
    phone: string | null;
    hoursText: string | null;
  };
  wifi: { ssid: string; password: string | null } | null;
  whatsapp: { phone: string; message: string | null } | null;
  revision: { no: number; publishedAt: string };
  categories: PublicMenuCategory[];
}

export type PublicMenuResponse =
  | { state: 'OK'; menu: PublicMenu; geofence: { required: false } }
  | { state: 'GEOFENCE_REQUIRED'; displayName: string; themeId: ThemeId; geofence: { required: true; mode: string } }
  | { state: 'UNAVAILABLE'; reason: 'NOT_FOUND' | 'NOT_PUBLISHED' | 'LICENSE_INACTIVE' | 'SUSPENDED' };
