# Testing and Quality Strategy

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## Test pyramid
Domain unit tests for state transitions, money, licensing and rules. Integration tests with real PostgreSQL/RLS and Redis where possible. Contract tests for payment and AI adapters. E2E browser tests for public menu, mobile admin and control panel. Visual tests per theme.

## Mandatory scenarios
- Tenant A/B isolation across list/detail/update/media/cache/export/job; no tenant context -> deny.
- Mobile 320/375/390/430 widths, iOS Safari and Android Chrome, software keyboard, screen reader and slow network.
- Price update invalidates cache; offline page labels stale data; admin never claims unsynced publish succeeded.
- Subscription active/grace/expired/suspended transitions, timezone boundaries, repeated manual extensions.
- Payment duplicate/out-of-order/forged callbacks, amount mismatch, provider timeout, refund and replay; fulfillment exactly once logically.
- AI job retry, cancellation, credit refund, approval and no unverified nutrition/allergen publication.
- Theme switching/version pinning and long/empty product data.

## Gates
CI: lint, typecheck, unit, integration, migration check, security dependency scan, build. Pre-release: E2E mobile, accessibility audit, backup restore, load test, privacy/legal sign-off. Track flaky tests and coverage of critical invariants, not vanity percentage alone.

## Test fixtures
At least two tenants with overlapping product IDs/names and distinct media; multiple roles; expired and active subscriptions; adversarial hostname and callback samples. Never use production personal data.

## Additional acceptance test groups
- GEO-001: geofence disabled -> menu public without geolocation prompt.
- GEO-002: radius enabled -> inside allowed, outside denied; boundary distance math, coordinate validity and 1km radius label.
- GEO-003: province/district allowlists, combined policies, no location permission, spoofing limitation disclosure.
- UX-001: owner can complete every admin task at 320/375/430px on iOS Safari and Android Chrome; superadmin also mobile-only.
- AI-001: locked controls without credits, quote shown before spending, correct debit/refund/idempotency, human approval required.
- PDF-001: long A4 menu paginates, includes prices/ingredients/required disclosures; allergen PDF independent; Turkish characters and tenant isolation.
- WIFI-001: hidden when disabled/empty; enabled Wi-Fi visible without broken layout; secret never leaks via admin logs.
- THEME-001: ten public themes selectable; admin/superadmin remain visually fixed; compliance info retained across themes.
- IMG-001: product has at most one active image; replace and rollback work.
- QR-001: all-time and current month valid scan counts accurate at Europe/Istanbul month boundary, bots/refreshes treated per event definition.

## v4 test matrix
- AV-001: sold-out remains visible with badge; hidden removed from public search/menu; restoration and tenant isolation.
- REV-001: immutable history, diff accuracy, rollback produces new revision, concurrent publish conflict and cache invalidation.
- IMP-001: CSV UTF-8 BOM/TR characters, XLSX, mapping, duplicate rows, malformed/oversized files, injection, validation, dry run and partial failure.
- SEARCH-001: Turkish `İ/i/ı/I`, localized text, combined category/diet/allergen filters, unknown allergen not treated as absent, accessible mobile search.
- TABLEQR-001: distinct per-table tokens, revoke/rotate, print export, counts per table and cross-tenant denial.
- I18N-001: locale fallback, untranslated warnings, price/allergen consistency, long translations and right-to-left readiness.
- SCH-001: schedule overlap rejection, Europe/Istanbul boundary, DST for other configured timezones, delayed/retried jobs, future price activation and cache refresh.
- ANA-001: aggregate counts reconcile with scan definitions, privacy retention, bot filtering, no visitor-level drilldown.
- WA-001: valid E.164 link, off hides CTA, missing number no layout gap, safe external link.
- PUSH-001: permission denied, unsupported device, subscription expiry, delivery retry, in-app fallback, opt-out, no sensitive notification text.
- Every feature: owner + superadmin mobile regression, RLS isolation, WCAG checks and PWA offline/resume handling.

## QMenuX host/API integration acceptance tests
- HOST-001: expected five hostname classes route correctly; reserved slugs rejected; host-header injection blocked.
- AUTH-001: business admin token cannot access superadmin use cases, including when requests target API directly.
- AUTH-002: superadmin Access gate + mandatory MFA/passkey, session expiry, revocation, mobile Safari/Chrome PWA flows.
- AUTH-003: host-only cookies never sent to sibling subdomains; CORS/CSRF tests block malicious origins.
- API-001: external token scopes, tenant/branch restrictions and RLS deny cross-tenant data.
- API-002: API key creation/rotation/revocation/expiry, secret displayed once, no secret logs, last-used audit.
- API-003: quotas/rate limits, 429, pagination, request size, idempotency and versioned OpenAPI validation.
- HOOK-001: signed webhook verification, invalid signature rejection, replay/dedup, retries and dead-letter handling.
- CHANNEL-001 (future): Telegram update authentication/dedup and WhatsApp provider verification/opt-in policy.
- OPS-001: superadmin and owner critical workflows remain fully operable on phone PWAs.


## v6 auth, approval, marketing and payment gates
- AUTH-004..006: Google/Microsoft/Apple OIDC login, cancel/failure, nonce/state/PKCE, account-linking, redirect allowlist and cookie isolation.
- ONB-001..002: new registration is pending; only authorized superadmin can approve/grant license; API and publish remain denied otherwise.
- PAY-001..003: no V1 checkout or card collection; payment status never grants license; license decisions audited.
- LAND-001..005: login/signup entry, provider buttons, pending state, mobile accessibility and legal/SEO truthfulness; LAND tests belong to last landing milestone.
- Tests must use provider mocks and configured sandbox/test accounts; do not claim external provider integration verified without credentials and actual test runs.

## v7 branding and cross-segment QA
- BRAND-001..004: token consistency, café/restaurant examples, public theme isolation, accessible mobile.
- ONB-003..005: editable category suggestions, non-destructive business-type changes, no unverified publishing.
- THEME-002: snapshot/accessibility/functional matrix across all ten theme IDs, café and restaurant content, no-photo products, long Turkish text and allergen visibility.
- Verify color contrast on text/controls; semantic status colors distinct from decorative red/mustard/sage.


## v8 infrastructure test matrix
- INFRA-001: deploy Next.js + NestJS API on Vercel preview, validate `/v1/health`, cold starts and limits.
- INFRA-002: Neon pooled/direct URLs, migrations, transaction-local RLS, pool reuse and parallel tenant isolation.
- INFRA-003: external worker consumes jobs, retries safely and preserves idempotency when API function terminates.
- INFRA-004: wildcard subdomain vs reserved host routing, TLS, CSP, CORS, cookie isolation and Cloudflare Access on mobile.
- INFRA-005: preview/prod isolation, backups/restore drill, secrets and Neon region/privacy checks.
