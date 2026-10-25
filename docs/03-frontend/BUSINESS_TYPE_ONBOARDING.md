# Business Type Onboarding and Sample Catalog
Version: v7 | Status: Proposed defaults; owner-editable

## Objective
A new café or restaurant can publish a suitable first menu quickly without building different software per sector. Business type is a recommendation hint, not a rigid catalog constraint.

## Supported initial types
- Specialty coffee / espresso bar
- General café / coffeehouse
- Bakery / patisserie
- Brunch / breakfast café
- Full-service restaurant
- Pizzeria
- Burger / fast-food
- Other (fully custom)

## First-use mobile flow
1. Superadmin-approved and licensed owner opens `admin.qmenux.com`.
2. Select business type or Other; select locale and branch.
3. Preview recommended public theme and editable starter categories; explicitly choose whether to import sample data.
4. Edit/remove categories, prices, photos, allergens and ingredients; nothing unverified is published by default.
5. Preview customer menu; publish explicitly.
6. Revisit type, categories and public theme later with no destructive resets.

## Suggested starter categories (not mandatory)
- Specialty coffee: Espresso, Filter Coffee, Cold Coffee, Tea, Pastries.
- General café: Hot Drinks, Cold Drinks, Desserts, Snacks.
- Bakery/patisserie: Pastries, Cakes, Desserts, Drinks.
- Brunch: Breakfast Plates, Eggs, Sandwiches, Drinks.
- Restaurant: Starters, Mains, Sides, Desserts, Drinks.
- Pizzeria: Pizza, Sides, Salads, Drinks.
- Fast-food: Burgers, Sides, Drinks, Desserts.
- Other: empty/custom template.

## Data and architecture
- `business_type` is a stable, extensible code on tenant/branch profile; it is not a hard tenant partition.
- Seed templates (`starter_catalog_templates`) and suggestions (`business_type_theme_recommendations`) are versioned configuration, not hard-coded branching across UI.
- All sample prices/ingredients/allergens are fictional demo data; owner must replace/verify them before publication. Prefer blank prices and unverified food facts in starter catalogs.
- Applying a starter template is an explicit, idempotent operation with preview; never overwrite existing products without confirmation.
- API: `GET /v1/admin/onboarding/business-types`, `GET /v1/admin/onboarding/templates?type=...`, `POST /v1/admin/onboarding/apply-template` (proposed contract).
- Keep tenant-scoped audit of template choice and later changes; respect manual approval and license gate.

## Tests
ONB-003: all business types get appropriate category suggestions; owner can edit/delete freely.
ONB-004: changing business type never resets published catalog or admin theme.
ONB-005: no unverified ingredients/allergens/price become published automatically.
