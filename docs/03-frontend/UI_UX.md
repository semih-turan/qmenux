# Mobile-Primary UI/UX Specification

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## Principle
Phone is the primary admin computer. Build at 320/375/390/430px first; desktop responsive adaptation only after mobile usability is proven. Public menu does not require install; admin and control are installable PWAs.

## Navigation
Business admin bottom tabs: Home, Menu, QR, Reports, More. Superadmin: Overview, Tenants, Licenses, Alerts, More. Primary actions anchored in thumb zone; sheets for short edits, dedicated pages for complex flows. Use accessible back behavior and breadcrumbs only when useful.

## Critical journeys
- Change price: Home/Menu -> search product -> price sheet -> save -> server confirmation -> public cache refresh.
- Mark unavailable: Menu -> product action -> toggle -> immediate server-confirmed status.
- Add product: camera/gallery -> name/category/price -> ingredients/allergens -> preview -> publish.
- View license: Home visible days-left summary -> Subscription screen -> expiry, history, renewal options.
- Superadmin extend license: tenant search -> details -> extend -> confirmation + reason + audit.

## Interaction rules
>=44x44px targets, >=16px text inputs to avoid mobile zoom, safe-area-aware sticky controls, short forms, keyboard-aware submit, autosave drafts, optimistic UI only when safely reversible, undo for non-destructive actions, confirmation for irreversible operations. Skeletons, empty states, validation errors, offline and reconnect behavior specified for each screen.

## Accessibility
WCAG 2.2 AA target, semantic labels, focus order, contrast, screen reader announcements, reduced motion, dynamic font sizing, touch alternatives to drag, keyboard operability.

## PWA/offline
Separate manifests and service-worker scopes by app/origin. Public menu can cache last published revision but must show offline/staleness banner and timestamp; do not imply prices are current. Admin drafts may persist locally with explicit sync status; no offline payment or publication confirmation.

## Design system
Shared tokens for spacing, type, color, radii and states; test iOS Safari and Android Chrome, small devices and landscape. Never put essential actions behind hover.

## Mobile-primary non-negotiable requirements (2026-10-25)
- Design baseline: 320/360/375/390/430 px widths, safe-area insets, touch targets >=44x44 CSS px, bottom navigation, contextual bottom sheets, thumb-zone primary actions, accessible keyboard/VoiceOver/TalkBack, large-text and reduced-motion tests.
- Every owner action (geo settings, PDF export, Wi-Fi, theme switch, AI credits, QR statistics, subscription expiry) must work without desktop, hover, drag-only, or horizontal scrolling tables.
- Geofence Settings screen: visibility toggle; current branch map/location; radius slider + numeric km field; province/district multiselect with search; boundary preview; explicit save and guest-access test; clearly state radius (not diameter). Permission-denied public state has a clear retry button.
- Product editor: single active image slot; replace/remove actions; AI enhancement buttons visible but locked if credits/feature absent. Show exact credit cost **before** submission and confirmation, remaining credits, progress, review and publish.
- Public menu optional Wi-Fi section renders only when enabled with valid data. Avoid empty placeholder.
- Owner dashboard: total valid QR opens, this month's valid QR opens, time window label and timezone. Display count source definition in help.
- Menu PDF and allergen PDF have separate download buttons and preview; loading, errors and regeneration statuses are accessible.
- Public menu has 10 theme choices; admin and superadmin share one neutral, fixed visual system. Switching public theme never alters admin appearance.

## v4 phone-first interaction rules
- Home/Menu quick `Tükendi` / `Gizle` / `Yeniden göster` action with optimistic feedback only after server confirmation and undo affordance.
- Version history timeline with compare/preview and explicit `Bu sürümü yeni sürüm olarak yayınla` confirmation.
- CSV/XLSX import wizard fully usable on iOS/Android: select file → map columns → preview errors → import drafts → publish.
- Public menu search bar and dietary/allergen filters; always explain unknown allergens and show clear reset.
- QR section: create/edit table labels, download/share print-ready table QR in bulk.
- Language selector and translation completeness badges in owner editor; customer locale picker accessible.
- Schedule editor uses native-friendly time/date controls, timezone label, conflict explanation and upcoming changes list.
- Reports: category/product/table charts as readable cards and accessible tables, explicit anonymized metrics.
- WhatsApp toggle/number input and live preview; hide CTA completely when off.
- Push settings: enable notifications on supported devices via user gesture; in-app inbox fallback and disable control. No desktop-only functionality.

## Production mobile PWA destinations
Owner PWA uses `admin.qmenux.com`; superadmin PWA uses `superman.qmenux.com`. Both retain one fixed shared design system, separate role-aware navigation and distinct auth sessions. Owner Settings → Integrations (future): list connected apps, create scoped credentials (display once), revoke/rotate, usage and last-access status. No API keys are embedded in public menu or browser source. Superadmin phone PWA must support MFA/passkey and step-up prompts without desktop dependencies.


## v6 login/signup and delivery priorities
- Admin PWA is the first operational management UI; login/signup entry from marketing apex is future landing work, but usable minimal login and pending-approval screens ship with identity foundation.
- Provider buttons: Continue with Google / Microsoft / Apple, with loading, popup blocked, cancellation, error, account-linking and mobile Safari handling.
- Unapproved owners see application status, not editable menu screens; approved but unlicensed owners see license status/renewal contact.
- Superadmin phone PWA includes application queue, approve/reject, grant/extend/revoke license and audit details.
- Full marketing landing design must not delay menu/admin/superadmin work; see `LANDING_PAGE_SPEC.md`.

## v7 visual and sector-neutral UX
- Follow `BRAND_DESIGN_SYSTEM.md` tokens and shared admin component system. Admin should be neutral enough for coffee, patisserie, full-service restaurant and fast-food.
- Onboarding type selection only changes suggestions, not management navigation or fixed palette.
- Show 10 public themes with meaningful layout differences; preserve optional image, allergen, Wi-Fi, QR and multilingual behavior.
- Mobile-first acceptance remains mandatory for all admin and superadmin workflows.
