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

## T044 development foundation — 2026-10-26

`packages/ui` now centrally exports `admin.css` (six approved palette tokens plus explicit high-contrast control colors), `ManagementShell` (brand/title/main/safe-area layout) and `Button` (native accessible control, default type button). Both management apps consume the shared shell/styles; the actual admin sign-in/logout buttons consume the button. Public-menu styles are independent and have a regression assertion against management-token leakage. No theme chooser or business-type styling is added to management.

The workspace exports source directly for existing Next.js/Turbopack bundling, with its own lint/typecheck and existing React peer. There is no parallel UI framework, CSS toolchain or new external dependency/version. CSS keeps light colors under dark OS settings and has no animation requiring a reduced-motion override. Other inputs, sheets/dialogs, navigation and data controls remain for their actual feature screens rather than unused components. This is an implemented foundation, not a completed entire component library.

Automated Chromium checks: identical approved tokens on both management apps; WCAG normal-text contrast >=4.5 for body and rendered controls; 320/375/390/430px with enlarged root text;44px controls; dark OS/reduced-motion preference; existing keyboard/auth behavior and public style separation. Built-app smoke additionally checked actual production CSS and mobile widths;390px screenshots were visually reviewed. Physical iOS/Android, assistive-technology and named visual/accessibility review remain pending. See [progress](../01-product/PROGRESS.md#t044-shared-management-foundation--2026-10-26); T044 remains IN_PROGRESS, not DONE.


T041's actual business-name form adds the shared TextField export: native associated label/input, inherited16px-or-larger font,44px minimum control, high-contrast border/text/focus and explicit disabled state. The mobile applicant list/form uses the fixed management palette and existing Button. No unused dialog/table/form framework or business-type fork is introduced. Browser and built-app checks are recorded with the T041 delivery evidence; physical-device and named accessibility acceptance remain pending.


## Operator access screen implementation —2026-10-26

Superadmin reuses ManagementShell, Button and TextField for native passkey authentication and separately granted enrollment. Shared Button now accepts React19's standard button props including ref for keyboard focus restoration; rendered markup is unchanged. Collapsible enrollment has44px summary/focus outline, masked16px input, explicit labels, status/error messages and cancellable native prompt. Layout uses the existing safe-area shell and brand tokens. Unregistered transport shows only unavailable/retry. Production-built320/375/390/430px, short viewport scrolling, enlarged text and keyboard checks passed locally; physical software keyboards, iOS/Android installed PWA and assistive technology acceptance remain pending.


## Applicant rejected-state delivery —2026-10-26

Existing shared applicant cards now show terminal REJECTED with explicit no-access wording, including an authoritative decision returned after stale submission. Edit/submit controls remain draft-only; internal review notes/operator identifiers are absent. No palette/component/layout fork. Production-built320/375/390/430px,44px controls, keyboard, short viewport/enlarged text and390px visual QA passed with intercepted synthetic BFF data. Physical mobile/assistive technology and actual privileged review UI remain pending.


## Operator mobile review confirmation —2026-10-26

Superadmin uses existing Button/TextField/safe-area shell for pending list, explicit reason/verification and separate final rejection confirmation. Full frozen reason wraps even long words; native cancel and result/retry focus are explicit. Uncertain payload survives in-memory reauthentication and conflict preserves editable reason while requiring current-row reselection. Auth controls pause during active review. No theme/palette fork, raw credentials or request IDs in product flow; approval/license controls remain unavailable. Rendered four-width keyboard/confirmation/retry evidence and production visual QA are recorded in PROGRESS.md; physical iOS/Android/assistive validation remains pending.
