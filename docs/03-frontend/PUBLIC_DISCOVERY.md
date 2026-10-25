# Public Menu Search, Languages and Table QR
Status: DRAFT — T028/T029/T030.

## Search and filtering
Mobile-first search within published, visible and time-active products. Filter by category, dietary labels, spice and declared allergens. `UNKNOWN` is not safe; do not label unverified food allergen-free. Turkish case folding, diacritics, locale fallback and no-results states. Preserve theme design but keep accessible filter controls in all 10 themes.

## Table QR
Owner generates stable table QR codes (branch/table labels) with printable vector output and PDF sheets; support rename, revoke, reissue. Token is opaque and cannot grant admin access. QR opens same public menu with optional table context and aggregate analytics. No ordering or guest identity required.

## Languages
Admin chooses enabled languages; translation completeness visible by category/product. Locale picker on public menu. Fallback to approved default language with visible indication where legally significant text is missing; prevent unverified translation of mandatory allergen/ingredient labels from being silently published. Currency/price unchanged by locale.

## Test gates
SEARCH-001, TABLEQR-001, I18N-001 plus geofence and theme cross-tests.
