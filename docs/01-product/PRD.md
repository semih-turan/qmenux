# Product Requirements Document

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## Vision
Enable Turkish food-service businesses to manage legally informative, attractive QR menus from a phone in seconds. One SaaS edition and fixed subscription price; future AI credits sold separately.

## Personas
- Guest: scans QR, browses without sign-in, views accurate TL prices, ingredients/allergens and any mandatory notices.
- Owner: manages menus, photos, prices, themes, staff, QR and license from mobile.
- Staff editor: limited menu editing rights.
- Platform owner: securely manages tenants, licensing, theme releases, support and compliance rule versions.

## V1 scope
1. Wildcard tenant menu routing, safe slug allocation, suspended/unavailable states.
2. Business onboarding, tenant membership and roles, password reset and MFA for privileged accounts.
3. Branch-aware domain model; minimum one branch in V1; multi-branch UI may follow later.
4. Categories, products, price in TRY minor units, image uploads, ingredients, 14 allergen categories, energy data fields and publication validation.
5. Product availability and scheduled/manual publication with change audit; QR print exports and printable physical menu.
6. Four curated themes with tenant configuration; theme version pinning and preview.
7. Business mobile PWA and isolated superadmin mobile PWA; public mobile-first menu with offline freshness warnings.
8. Single-license subscription, start/end/grace timestamps, manual activation/renewal by authorized operator; owner sees days left.
9. Baseline analytics with privacy-conscious event aggregation; no unnecessary visitor profiling.
10. Basic compliance checks with configurable, versioned rules; human legal review required.

## Explicitly out of V1
Live payment processing, automatic card renewals, AI generation, orders, POS integration, reservations, food delivery, advanced theme editor, enterprise-specific feature tiers.

## Later phases
Payment gateway adapters (PayTR/iyzico/eligible Stripe/bank POS), AI credit wallet and jobs, generated/edited images, description drafting, ingredient-based calorie estimates and allergen suggestions, translations, multi-branch UX, custom domains.

## Success metrics (targets to validate)
- Median routine price update <= 20 seconds on a modern phone after sign-in.
- Owner can hide an unavailable product in <= 3 interactions from product list.
- Zero cross-tenant data access in automated adversarial tests.
- Public menu remains usable without account or installation.
- Menu publish blocks only where a currently approved compliance rule explicitly requires it.

## Risks / unknowns
Food-information obligations vary by establishment category and effective date; verify official regulations and legal review. Payment recurring billing support and merchant eligibility vary by provider. Offline cache can show stale prices; use freshness timestamps and clear offline banner.

## V1 additions — binding product decisions (2026-10-25)
- Geofence visibility controls in mobile admin Settings: off (public everywhere), radius-based boundary, and/or explicitly allowed Turkish provinces/districts. Radius **unit must be configurable in km**; user wording "1 km çapında" is ambiguous (diameter vs radius), so UI explicitly labels **radius from business location** and displays approximate diameter. No default restriction. Define intersection/union behavior explicitly (see GEOLOCATION_GEOFENCING.md).
- All owner/admin/superadmin operations must be achievable in installed mobile PWA; desktop is secondary, not required for any business-critical workflow.
- One SaaS edition, fixed subscription price; AI is an optional credit-funded add-on, not a second subscription tier. Disabled AI controls are visible with explanatory lock and credit purchase entry, never silently active.
- Each product has **at most one active image**; AI image revisions may be stored as unpublished history but public/catalog product references one active image.
- Exactly **10 selectable public menu themes** are targeted for V1 (replaces four-theme plan); all tenants may switch anytime with preview and rollback. Business admin and superadmin use **one shared fixed design system** and no theme chooser.
- Full A4 printable menu PDF: product names, prices, ingredients and mandatory information; separate A4 allergen PDF; owner downloads from admin PWA. Support long menus, Turkish glyphs, pagination and print.
- Optional guest-facing Wi-Fi card: show SSID and optionally password only when explicitly enabled and populated; hide entirely otherwise. Warn owner that published credentials are public and rotate them.
- Privacy-aware QR scan counter: total and current calendar month, using explicit timezone Europe/Istanbul; define scan as valid QR landing event rather than raw page refresh. Avoid unique-user tracking by default.
- Geofence restrictions must not prevent owner/superadmin management, PDF export or authorized preview. Public menu handles denied/unknown location access without misleading legal/compliance claims.

## Pending explicit decisions
- Geofence fail-open vs fail-closed when guest denies location; legal/privacy review required. Product default recommendation: if geofence is enabled, show a non-sensitive explanation and ask for location; do not silently bypass restriction. Provide non-location alternatives only if owner policy permits.
- Geo boundaries: radius and province/district restrictions may be combined by intersection (recommended) or configured as OR; document decision in ADR.
- Menu geofencing is a **visibility UX restriction, not a secure perimeter**: GPS can be spoofed, browser permissions denied, and IP geo is imprecise.
- Define Wi-Fi password visibility (public on menu vs reveal-on-tap); do not assume credential sharing is risk-free.

## Approved feature extension — 2026-10-25 (v4)
- Product availability is independent of publication: `AVAILABLE`, `SOLD_OUT`, `HIDDEN`; sold-out products display a clear non-orderable label, hidden products are excluded from public menu/search/PDF as defined by export policy; restore without deleting.
- Every published menu has an immutable revision with actor, timestamp, reason and diff; authorized owner can preview and restore an old revision by publishing a **new** revision. Never rewrite audit history.
- CSV/XLSX import from phone: template download, upload, column mapping, preview, validation, duplicate matching, dry run, atomic or chunked apply, rollback report. Imported content remains draft until explicitly published.
- Public menu search and filters: name, category, dietary labels, spice, allergen **contains/excludes**; unknown allergen information must never be treated as allergen-free. Search supports Turkish casing and all enabled languages.
- Table QR codes: stable non-guessable public token per tenant/branch/table; bulk create, print/download, revoke/rotate; counts per QR, no customer identity or order feature implied.
- Multilingual menu: locale-aware names/descriptions and disclosure labels, owner-configurable supported locales and fallback with explicit missing-translation marker. Prices/currency and allergen meanings stay consistent.
- Scheduled menu visibility and future price changes use branch timezone `Europe/Istanbul` by default, explicit start/end windows, overlap conflict checks, idempotent activation, preview, and rollback; public cache refresh at boundaries.
- Expanded **anonymous** analytics: aggregate category/product views, QR opens by hour/day/table, without fingerprints or individual user tracking; clear definitions, bot filtering, retention, and privacy review.
- Optional WhatsApp contact CTA per branch, phone normalized to E.164 and safe `wa.me` link; hidden if disabled; no automated messaging without separate scope/legal review.
- Admin PWA push: opt-in device registration, in-app notification fallback, license expiry, PDF/AI job completion, operational alerts; per-user preferences, unsubscribe, no sensitive payload on lock screens, iOS/Android capability/fallback tests.
- All features are included in the **single fixed-price** subscription except separately purchased future AI credits. No Starter/Pro/Enterprise gates.

## Approved QMenuX brand, domains and integration direction (2026-10-25)
Product brand: **QMenuX**; primary domain: `qmenux.com`. Owner admin: `admin.qmenux.com`; platform superadmin: `superman.qmenux.com`; API: `api.qmenux.com`; public menu: `{slug}.qmenux.com`. The admin/superadmin UIs remain distinct, fully functional mobile-first PWAs with a single shared fixed visual design.

External integrations are a strategic API capability: authorized use from Bisetra's own systems and future Telegram/WhatsApp channels. Public API availability does not grant unscoped access or remove tenant isolation. WhatsApp contact link and WhatsApp Business API are distinct features. External write APIs and messaging adapters are gated behind security/legal review.


## v6 — landing, federated login and manual activation
- `qmenux.com` must eventually include **Login** and **Sign up** and offer Google, Microsoft (Outlook personal and optionally work/school) and Apple sign-in using secure OAuth 2.0/OIDC patterns.
- **Implementation priority:** public menu + tenant admin PWA + superadmin PWA first. Build identity/onboarding infrastructure early for these apps, but **marketing landing UI LAST**.
- Signup does not authorize operation: new tenant remains `PENDING_APPROVAL` until `superman.qmenux.com` explicitly approves and grants a valid license.
- **No online payment integration in V1.** Superadmin controls who can use the platform. PayTR-like payment gateway later only, behind feature flags and legal/security approval.
- Existing one-edition, fixed-price model remains; price and term not yet determined. Do not invent a free trial or immediate paid activation.

## v7 — Café + restaurant positioning and brand identity
- QMenuX is a cross-segment foodservice QR menu SaaS for coffee shops, cafés, bakeries, patisseries, brunch venues, restaurants, pizzerias and fast-food.
- Brand palette is warm and restrained: terracotta `#E86A33`, charcoal `#252420`, warm ivory `#F7F5F0`, with limited red `#C94B3B`, mustard `#D9A441`, sage `#66745C`.
- Admin and superadmin use one consistent fixed UI and no business-type theming. Public menu offers ten sector-flexible themes in `PUBLIC_THEME_CATALOG.md`.
- First-time onboarding can recommend starter categories and a public theme based on business type, but recommendations are editable and never publish unverified content.
- Landing design is still the LAST milestone; show cafés and restaurants equally, no fabricated claims.


## v8 infrastructure decision
QMenuX deploys Next.js customer menu and both management PWAs to Vercel; NestJS REST API runs as stateless Vercel Functions; Neon PostgreSQL stores application data. Cloudflare R2 retains images and PDF. Continuous background processing runs on a separately hosted worker (provider TBD). Marketing landing remains the final UI milestone; initial payment integration remains disabled.
