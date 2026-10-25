# Printable A4 Export Specification
Status: Draft.

## Export types
- MENU_A4: all published menu categories and products, TL prices, ingredients, legally required labels and optional product photo per item (at most one).
- ALLERGEN_A4: independent, legible product-by-14-allergen matrix and explanations, including unknown/unverified states; never imply allergen-free from missing data.

## Requirements
- A4 portrait by default, correct margins, headers, page numbers, page breaks, Turkish font coverage, deterministic pagination and long-product wrapping.
- Export from **published immutable revision**, display generated timestamp and business/branch identity.
- Mobile admin: preview, download, share/print with accessible progress, retries and explicit error states.
- Worker queue for long exports, tenant-scoped authorization and signed expiring download links.
- Mandatory disclosures derived from approved compliance rule set, not theme appearance; validate against current official requirements.
- Test 1, 50 and 500 products, missing images, very long titles, allergen matrices, and mobile Safari/Chrome downloads.
