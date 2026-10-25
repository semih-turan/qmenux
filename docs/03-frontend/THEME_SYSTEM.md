# Theme Engine Specification

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## Requirements
Exactly ten public themes, with stable IDs defined in [PUBLIC_THEME_CATALOG.md](PUBLIC_THEME_CATALOG.md). One edition includes all ten themes. Admin and superadmin use one fixed shared design system. Tenant may choose theme, brand color, logo and supported tokens. Theme switching must not modify catalog data.

## Design
ThemeRegistry maps immutable `{themeId, version}` to a component bundle. Each implements Header, CategoryNavigation, ProductCard, ProductDetail and Footer. Typed design tokens drive colors, typography, spacing and radius; validate contrast and unsafe CSS inputs.

## Data flow
Published menu view model -> theme renderer -> responsive PWA. Theme config belongs to tenant/branch and stores pinned version. Preview reads draft config; publish updates assignment revision and invalidates CDN keys.

## Safety
No tenant-supplied arbitrary JavaScript or untrusted HTML. Uploaded assets scanned/validated; CSS customization restricted to safe tokens. Provide fallback theme when a pinned bundle is unavailable and alert operator.

## Testing
Visual regression per theme at 320/390/768px; RTL/long names if localization later; missing photos, long prices, allergens, keyboard and screen readers.

## Theme contract update
- V1 ships **10 distinct public-menu themes**, versioned in registry; every tenant can select any theme with live preview and atomic publish.
- Public themes can vary in layout, typography, colors and imagery but MUST render identical required food/price/allergen disclosures, optional Wi-Fi rules, and accessibility semantics.
- Admin PWA and superadmin PWA use exactly one shared design system; no tenant-level admin theming.
- Themes must support no-image products (never require a placeholder image) and one active product image maximum.
- Snapshot, accessibility, long-content, 320px and PDF-independence regression tests run across all ten themes.

## v7 authoritative theme inventory
See `PUBLIC_THEME_CATALOG.md` for exactly 10 theme IDs and design briefs. Theme registry must use these stable IDs. Public theme styling never changes `admin.qmenux.com` or `superman.qmenux.com`. Keep print PDF layout independent.
