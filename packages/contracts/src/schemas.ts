import { z } from 'zod';
import { ALLERGEN_CODES, ALLERGEN_STATUSES, DATA_SOURCES, VERIFICATION_STATES } from './allergens.js';
import { AVAILABILITY, LICENSE_STATUSES, MEMBER_ROLES, TENANT_STATUSES } from './enums.js';
import { GEOFENCE_MODES, MAX_RADIUS_KM, MIN_RADIUS_KM } from './geo.js';
import { MAX_PRICE_MINOR } from './money.js';
import { SLUG_RE } from './slug.js';
import { BUSINESS_TYPES, THEME_IDS } from './themes.js';

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const uuid = z.string().uuid();
export const slugSchema = z.string().regex(SLUG_RE);
/** E.164-ish, digits only after optional +. */
export const phoneSchema = z.string().trim().regex(/^\+?[0-9]{10,15}$/);

// ---------- Catalog ----------
export const allergenEntrySchema = z.object({
  code: z.enum(ALLERGEN_CODES),
  status: z.enum(ALLERGEN_STATUSES),
  verification: z.enum(VERIFICATION_STATES).default('UNVERIFIED'),
  source: z.enum(DATA_SOURCES).default('MANUAL'),
});
export type AllergenEntry = z.infer<typeof allergenEntrySchema>;

export const categoryInputSchema = z.object({
  name: trimmed(80),
  description: optionalText(300),
  isVisible: z.boolean().default(true),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const itemInputSchema = z.object({
  categoryId: uuid,
  name: trimmed(120),
  description: optionalText(600),
  priceMinor: z.number().int().min(0).max(MAX_PRICE_MINOR),
  tags: z.array(trimmed(24)).max(8).default([]),
  calories: z
    .object({
      kcal: z.number().int().min(0).max(10000),
      verification: z.enum(VERIFICATION_STATES).default('UNVERIFIED'),
      source: z.enum(DATA_SOURCES).default('MANUAL'),
    })
    .nullable()
    .optional(),
  allergens: z.array(allergenEntrySchema).max(ALLERGEN_CODES.length).default([]),
});
export type ItemInput = z.infer<typeof itemInputSchema>;

export const itemPatchSchema = itemInputSchema.partial().extend({ expectedVersion: z.number().int().min(1) });
export type ItemPatch = z.infer<typeof itemPatchSchema>;

export const availabilitySchema = z.object({ availability: z.enum(AVAILABILITY) });
export const reorderSchema = z.object({ ids: z.array(uuid).min(1).max(500) });

export const publishSchema = z.object({
  expectedRevisionNo: z.number().int().min(0),
  note: optionalText(200),
});
export const restoreSchema = z.object({ expectedRevisionNo: z.number().int().min(0) });

// ---------- Tenant / branch settings ----------
export const brandingSchema = z.object({
  displayName: trimmed(80),
  themeId: z.enum(THEME_IDS),
  businessType: z.enum(BUSINESS_TYPES),
  tagline: optionalText(140),
});

export const branchInfoSchema = z.object({
  name: trimmed(80),
  address: optionalText(240),
  phone: phoneSchema.nullable().optional(),
  hoursText: optionalText(240),
});

export const wifiSchema = z.object({
  enabled: z.boolean(),
  ssid: z.string().trim().max(32).optional(),
  password: z.string().max(63).optional(),
}).refine((v) => !v.enabled || (v.ssid && v.ssid.length > 0), { message: 'SSID gerekli', path: ['ssid'] });

export const whatsappSchema = z.object({
  enabled: z.boolean(),
  phone: phoneSchema.nullable().optional(),
  message: optionalText(200),
}).refine((v) => !v.enabled || !!v.phone, { message: 'Telefon gerekli', path: ['phone'] });

export const geofenceSchema = z
  .object({
    mode: z.enum(GEOFENCE_MODES),
    center: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable().optional(),
    radiusKm: z.number().min(MIN_RADIUS_KM).max(MAX_RADIUS_KM).nullable().optional(),
    regions: z
      .array(z.object({ provinceCode: z.string().regex(/^\d{2}$/), districtName: optionalText(60) }))
      .max(20)
      .default([]),
  })
  .refine((v) => !(v.mode === 'RADIUS' || v.mode === 'COMBINED') || (v.center && v.radiusKm), {
    message: 'Merkez ve yarıçap gerekli',
    path: ['radiusKm'],
  });
export type GeofenceSettings = z.infer<typeof geofenceSchema>;

export const geofenceCheckSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(100000).optional(),
});

// ---------- Onboarding / platform ----------
export const applicationSchema = z.object({
  businessName: trimmed(80),
  slug: slugSchema,
  businessType: z.enum(BUSINESS_TYPES),
  contactPhone: phoneSchema,
  city: trimmed(40),
  note: optionalText(500),
  acceptedTermsVersion: trimmed(40),
});
export type ApplicationInput = z.infer<typeof applicationSchema>;

export const decisionSchema = z.object({ reason: trimmed(500) });

export const licenseGrantSchema = z.object({
  endsAt: z.string().datetime(),
  note: optionalText(300),
  totp: z.string().regex(/^\d{6}$/),
});

export const memberInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(MEMBER_ROLES).exclude(['OWNER']),
});

// ---------- Public / analytics ----------
export const scanEventSchema = z.object({
  clientEventId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  source: z.enum(['qr', 'table', 'direct']),
  tableToken: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/).optional(),
});

export const tenantStatusSchema = z.enum(TENANT_STATUSES);
export const licenseStatusSchema = z.enum(LICENSE_STATUSES);
