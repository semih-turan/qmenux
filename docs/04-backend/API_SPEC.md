# REST API Contract Draft

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## General
Version `/v1`; JSON; OpenAPI generated from DTOs; RFC 9457-style problem details for errors. Auth via secure session/token strategy with CSRF protection as appropriate; admin uses tenant membership context server-side. Rate limits per identity, tenant and IP. Idempotency keys for payments and sensitive mutations.

## Public
- `GET /v1/public/menus/current` resolves tenant from trusted hostname; returns published revision and freshness timestamp.
- `GET /v1/public/categories` and `GET /v1/public/products/:id` return published safe view models.

## Business admin
- `GET /v1/me/tenants`, `GET /v1/admin/dashboard`, `GET /v1/admin/subscription`.
- `GET/POST /v1/admin/products`; `GET/PATCH/DELETE /v1/admin/products/:id`.
- `POST /v1/admin/products/:id/publish`, `POST /v1/admin/media/upload-intent`.
- `GET/PATCH /v1/admin/theme`; `GET /v1/admin/qr-codes`; `POST /v1/admin/qr-codes`.
- `GET /v1/admin/compliance/checks`.

## Platform control
- `GET/POST /v1/control/tenants`, `GET /v1/control/tenants/:id`.
- `POST /v1/control/tenants/:id/license-extensions` (reason required).
- `GET /v1/control/audit`, `GET /v1/control/system-health`.

## Future billing/AI
- `POST /v1/billing/checkout`, `GET /v1/billing/orders/:id`.
- `POST /v1/webhooks/:provider` (raw body verification, never public status authority).
- `GET /v1/admin/ai/credits`, `POST /v1/admin/ai/jobs`, `GET /v1/admin/ai/jobs/:id`.

## Example error
`{ "type":"https://example.com/problems/forbidden", "title":"Forbidden", "status":403, "code":"TENANT_ACCESS_DENIED", "traceId":"..." }`. Never expose other tenants' existence in resource lookup errors.

## Next step
Generate authoritative OpenAPI YAML from implementation; this document is endpoint inventory, not final request/response schema.

## Additional endpoints (proposed; versioned under /v1)
- `GET/PUT /admin/branches/:id/visibility` — read/update geofence policy; server validates center, radius and administrative region codes.
- `POST /public/menu/:slug/location-check` — checks supplied coordinates against visibility policy; location permission obtained client-side with clear disclosure; never claim anti-spoofing.
- `GET/PUT /admin/branches/:id/wifi` — read/update Wi-Fi display settings; separate authorization for password retrieval; public menu endpoint returns Wi-Fi only if enabled.
- `GET /admin/analytics/qr-scans?period=this-month|all-time` — timezone Europe/Istanbul; event semantics documented.
- `POST /admin/exports/menu-a4` and `POST /admin/exports/allergens-a4` — enqueue snapshot export; `GET /admin/exports/:id` — status and signed download.
- `GET /admin/themes` and `PUT /admin/appearance/theme` — list ten themes and atomic switch.
- `GET /admin/ai/actions` — action, credit price, availability; `POST /admin/ai/quotes` and `POST /admin/ai/jobs` — quoted price confirmation, reservation, idempotency.
- `PUT /admin/products/:id/image` — replace sole active image; never append a second active image.
- All admin endpoints require tenant context and role checks; public menu payloads must not leak tenant-private configuration.

## v4 REST API contracts (proposed /v1)
- `PATCH /admin/products/:id/availability` `{status,reason?}`; authorized, audited, tenant scoped.
- `GET /admin/menus/:id/revisions`; `GET /admin/menus/:id/revisions/:revision`; `POST /admin/menus/:id/restore` `{revisionId,idempotencyKey}`; restoration publishes a **new** revision.
- `POST /admin/imports` signed upload/start; `POST /admin/imports/:id/map`; `GET /admin/imports/:id/preview`; `POST /admin/imports/:id/commit`; `GET /admin/imports/:id/errors` with CSV export. Uploaded rows remain drafts.
- `GET /public/menus/:slug/search?q=&locale=&category=&allergens_exclude=&diet=`; do not interpret unknown as absence.
- `GET/POST /admin/branches/:id/table-qrs`; `PATCH /admin/table-qrs/:id`; `POST /admin/table-qrs/:id/revoke`; `POST /admin/table-qrs/print-batch`; public token maps to published menu only.
- `GET/PUT /admin/menus/:id/locales`; `PUT /admin/products/:id/translations/:locale`; `GET /public/menus/:slug?locale=tr`.
- `GET/POST /admin/menu-schedules`; `PATCH /admin/menu-schedules/:id`; `POST /admin/scheduled-prices`; activation is idempotent and event-driven.
- `GET /admin/analytics/summary?from=&to=&granularity=` with scoped, aggregate-only dimensions.
- `GET/PUT /admin/branches/:id/whatsapp`; public menu returns CTA only if enabled.
- `POST/DELETE /admin/push-subscriptions`; `GET/PUT /admin/notification-preferences`; `GET /admin/notifications`.
Use OpenAPI DTO schemas, validation, stable error codes, tenant authorization and pagination on list endpoints.

## QMenuX API authority and external integrations
Canonical origin `https://api.qmenux.com`; versioned namespace `/v1`. First-party PWA routes and future external API share domain use cases but require distinct auth audiences, scopes, CORS rules, quotas and auditing. Public menu read routes may be unauthenticated but must return only published data and obey visibility policy. Add OpenAPI contract for integration-client management, token rotation/revocation, webhook subscriptions and delivery logs before public access. See PUBLIC_API_AND_CHANNELS.md for scope and provider requirements.


## v6 identity and approval API
- Versioned identity-provider initiation/callback and onboarding status; OpenAPI must distinguish public, authenticated-pending, tenant-licensed and platform-operator authorization.
- Superadmin-only approval and license grant endpoints with step-up auth, audit, idempotency and explicit validation.
- In V1 do not expose payment checkout, payment-success or credit-purchase endpoints; reserve future API versioned contracts separately.
- `api.qmenux.com` external clients must have tenant-scoped entitlement; an OAuth login does not mint a third-party integration key automatically.
See `IDENTITY_OIDC_ONBOARDING.md` and `MANUAL_ACTIVATION_AND_FUTURE_PAYMENTS.md`.

## v7 onboarding recommendation endpoints
- `GET /v1/admin/onboarding/business-types`: supported types and localized labels.
- `GET /v1/admin/onboarding/templates?type=...`: preview starter categories and suggested public theme.
- `POST /v1/admin/onboarding/apply-template`: explicit, idempotent import to draft only, tenant-scoped.
- `PUT /v1/admin/business-profile`: update type without resetting catalog or admin theme.


## v8 API runtime contract
- `api.qmenux.com/v1` is NestJS hosted as stateless Vercel Functions. All handlers must be bounded, retry-safe and free of process-local session assumptions.
- Long-running requests return `202 Accepted` with tenant-scoped job id; external worker processes queue and persists results in R2/Neon. Poll status endpoints require authorization.
- Protect API with origin allowlists, per-tenant/client rate limits and signed webhook verification. Validate serverless concurrency and Neon pooled DB usage.

## T004 implemented development auth surface
This is a bounded API-only slice; provider configuration is currently disabled. All responses below use `Cache-Control: no-store`.

| Route | Configured behavior | Disabled behavior |
|---|---|---|
| GET /v1/auth/providers | Provider IDs and enabled flags only; Microsoft/Apple false | 200, all false |
| GET /v1/auth/google/start | 302 to fixed Google issuer, short-lived browser-binding cookie | 503 unavailable, no cookie/redirect |
| GET /v1/auth/google/callback | Consume browser-bound state, verify code/ID token, issue opaque API session; registered user UUID/status and tenantAccess=false | 503 unavailable, no cookie |
| GET /v1/auth/me | 200 registered user UUID/status and tenantAccess=false; invalid/expired/revoked/suspended session 401 | 503 unavailable |
| POST /v1/auth/logout | Exact API Origin required; revoke presented session, clear cookie, 200 signed_out | 503 unavailable |

Callback validation failures/cancel/replay return generic 401; storage/provider discovery failures are sanitized 503. No tokens/SQL/connection values returned. Noncanonical Host fails 401 when enabled; forwarded headers never establish host authority. No returnTo parameter/open redirect, browser bearer-token login, credentialed CORS, tenant selection or superadmin session is implemented. Proposed OpenAPI auth naming/CSRF contracts for the eventual admin BFF remain pending; this slice is not AUTH-001..006 full acceptance.
