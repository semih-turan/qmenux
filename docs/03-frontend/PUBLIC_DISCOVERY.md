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

## 2026-10-27 guest interaction clarification — T028
Product details open inline in the menu using a native disclosure, not a product modal or a separate page. Full descriptions, the current product image, tags and allergen disclosures stay available; multiple products may be open, with unique accessible allergen headings. Expanded card/grid products span the row so details remain readable. The filter dialog remains a short, separate task.

Filters include category, owner-entered tags, sold-out visibility, declared CONTAINS allergens and exclusions. A contains filter requires a published CONTAINS status; MAY_CONTAIN and unknown do not match it. Exclusions still separate unverified/unknown items and never report them as allergen-free. Category descriptions remain present in filtered results, and clearing filters resets category/contains/excludes together. Search announces pending work while its deferred results update; no query text is sent to analytics.

Product information remains readable without JavaScript; no route loading boundary may hide the server-rendered menu or mask offline cache state. Missing product images/logos remain optional, with no fabricated placeholders or food claims. Unit evidence: `apps/menu/test/item.test.ts`, `apps/menu/test/discovery.test.ts`; browser/mobile evidence in PROGRESS.md.
