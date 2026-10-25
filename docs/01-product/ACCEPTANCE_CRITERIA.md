# Acceptance Criteria

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## Identity and tenancy
- Anonymous visitor to valid slug sees only that tenant's published menu.
- Authenticated editor for A cannot read/write B even with guessed IDs, manipulated headers or job payloads.
- Disabled tenant cannot publish; suspended public menu behavior follows documented policy.
## Catalog
- Owner adds product with name, price, category, image and ingredients from 390px viewport.
- Price change persists in minor units, writes audit entry and invalidates stale public cache.
- Draft and published states are distinct; unsaved changes never silently appear publicly.
- Product image uploads validate type, size, dimensions and ownership.
## Theme
- Switching themes never changes product data; preview does not publish.
- Old pinned theme version remains functional after registry update.
## License
- Owner sees status, server-derived expiry and remaining days.
- Admin extension writes actor/reason/old/new expiry to append-only history.
- Duplicate payment event never extends license twice.
## PWA
- Primary actions usable on 320px, 375px, 390px, 430px; touch targets >=44px; keyboard never hides primary submit action.
- Offline public view displays last-updated and clear stale-data warning; payment/admin publishing not falsely confirmed offline.
## Compliance
- All legally required fields per approved current rule version are validated; unverified AI suggestions are never marked confirmed.
## Operations
- Backup restoration, alerting, rate limiting, audit log, error boundaries and accessibility checks evidenced before production.

## Additional product acceptance criteria
1. Owner can toggle geofence and select radius/provinces/districts from mobile settings, with understandable denied-location behavior.
2. Owner and superadmin can perform all essential operations using only phone PWA.
3. AI tools are visibly locked until enabled/credited; every action shows exact credit cost before confirmation.
4. Owner can download A4 full menu PDF and separate allergen PDF from phone.
5. Wi-Fi appears only when configured and enabled; otherwise no empty block.
6. Exactly ten public themes can be switched by owner; admin themes never change.
7. Product displays zero or one active image; replacement cannot produce two.
8. Owner sees total and current-month QR scans with clear counting definition.

## v4 feature acceptance
- Owner marks products sold-out/hidden and restores from phone; customer state matches.
- Owner previews past published menus and restores a revision without overwriting history.
- Owner imports CSV/XLSX from phone, resolves errors, publishes only reviewed draft content.
- Customer searches/filters accurately with allergen uncertainty disclosed.
- Owner creates and prints/revokes table QR codes and sees aggregate per-table opens.
- Owner edits supported locales and schedules menus/prices with clear timezone and conflicts.
- Owner views anonymous category/product/time analytics; no identity tracking.
- WhatsApp CTA is optional and hidden when off.
- Owner opts into/out of push; in-app inbox works without push support.

## Domain and API acceptance
- QMenuX branding and canonical production domains match DOMAINS_AND_TRUST_BOUNDARIES.md.
- Business owner PWA is reachable at admin.qmenux.com, platform PWA at superman.qmenux.com, API at api.qmenux.com/v1, and guest menus at tenant subdomains.
- Platform routes reject business credentials and bypass attempts, including direct API calls; Access/MFA and server authorization both apply.
- External integrations use scoped, revocable credentials and cannot read another tenant; provider webhook events are authenticated and idempotent.


## v6 additional acceptance
- User may register/sign in with Google, Microsoft (Outlook), Apple after provider setup, but remains pending until explicit superadmin approval.
- Only a licensed approved tenant can publish or manage live menu; tenant API enforces this independently of UI.
- Superadmin can approve/reject applications and grant/extend/revoke licenses from phone with audit.
- Initial release has **no online checkout**; PayTR integration is future.
- Full marketing landing with Login and Sign up is developed **last**, after menu and admin/superadmin apps.

## v7 brand / onboarding acceptance
- Admin and superadmin look and behave consistently for a café and a restaurant; no sector-specific UI fork.
- New approved tenant can select business type, preview editable starter categories and recommended public theme, skip suggestions and publish only after review.
- Ten customer themes meet shared feature and accessibility requirements; café/restaurant imagery is tenant-driven.
- Landing (last milestone) represents both café and restaurant use cases with accurate claims.


## v8 hosting acceptance
- Public menu, owner admin and superadmin run on Vercel; API deploys on Vercel Functions and reads/writes Neon securely.
- Neon RLS prevents cross-tenant leakage under pooled serverless concurrency.
- PDF/AI/import jobs are not coupled to the lifetime of Vercel Functions; external worker completion is observable.
- Preview environments cannot access production Neon. Landing is still built last and no V1 checkout exists.

## v9 Git acceptance
- GIT-001: no existing Git history or remote overwritten; ignore patterns verified; no secrets staged; reviewed baseline; commits only with user approval.
- GIT-002: CI checks execute on a real PR or test branch, record lint/typecheck/test/build/secret-scan results, and avoid production credentials.
