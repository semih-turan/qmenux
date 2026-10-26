# QMenuX Brand & Shared Admin Design System
Version: v7 — 2026-10-25 | Status: Approved direction; visual QA pending

## Positioning
QMenuX serves coffee shops, specialty cafés, bakeries, patisseries, brunch cafés, restaurants, pizzerias, fast-food and other foodservice businesses. Brand must be hospitality-friendly but NOT visually tied exclusively to pizza/burgers or exclusively to coffee. Marketing photos and sample data represent both.

## Approved palette
| Token | Hex | Usage |
|---|---|---|
| `brand.primary` | `#E86A33` | Terracotta; primary actions and brand accents |
| `brand.ink` | `#252420` | Charcoal; titles, primary copy |
| `brand.canvas` | `#F7F5F0` | Warm ivory; admin shell and marketing surfaces |
| `brand.red` | `#C94B3B` | Restrained editorial accent, NOT the sole error indicator |
| `brand.mustard` | `#D9A441` | Restrained secondary highlight |
| `brand.sage` | `#66745C` | Optional natural accent |
- Use neutrals, clear borders, legible dark text and adequate contrast. Do not use orange on white for small text unless WCAG contrast verified; define darker text-on-light variants and independent semantic danger/success/warning tokens.
- Design tokens must be defined centrally in `packages/ui` and exported to landing/admin/superadmin; public themes own independent token sets.
- Typography: legible Turkish glyph support; restrained display styles, strong readable body; avoid dense mobile tables.
- Iconography: simple consistent line icons; no default food-specific iconography in the core admin shell.
- Photography: café drinks, pastries, breakfast, savory restaurant meals in balanced distribution; no false product claims or fabricated usage statistics.
- Components: buttons, inputs, selects, dialogs, bottom sheets, navigation, data cards, tables/list cards, snackbars, skeletons, error/empty states; accessible states and keyboard/touch semantics.

## Fixed management UI
`admin.qmenux.com` and `superman.qmenux.com` use ONE shared design system with the above palette. Business type must never change the admin layout or colors. Superadmin adds privileged controls but retains same component library.
- 320px minimum viewport, 44px touch targets, bottom navigation, safe-area support, one-hand primary actions, screen reader semantics, reduced-motion support.
- Business type affects suggested initial categories, demo content and suggested PUBLIC menu theme only; owner can change all suggestions.

## Marketing website
`qmenux.com` uses the brand palette and represents cafés AND restaurants. Landing is implemented LAST (T043); this file is design direction only, not a landing implementation task.
- Do not use invented KPI counts, fabricated reviews, false price/free-trial claims or unlaunched AI/payment features.
- Login/Signup and provider sign-in requirements remain as specified in v6.

## QA / signoff
BRAND-001: palette tokens consistent across admin and superadmin; accessible contrast verified.
BRAND-002: café and restaurant demo data render correctly; no forced food-type-specific admin layout.
BRAND-003: public menu themes can differ radically from QMenuX brand without leaking into admin.
BRAND-004: mobile 320/375/430px, iOS/Android, dynamic text, dark OS setting, reduced motion.
