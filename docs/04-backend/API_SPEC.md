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
This is a bounded API-only slice; Google, Microsoft and Apple provider configurations are currently disabled. All responses below use `Cache-Control: no-store`.

| Route | Configured behavior | Disabled behavior |
|---|---|---|
| GET /v1/auth/providers | Provider IDs and independent Google/Microsoft/Apple configured flags only | 200, all false |
| GET /v1/auth/google/start | 302 to fixed Google issuer, short-lived browser-binding cookie | 503 unavailable, no cookie/redirect |
| GET /v1/auth/google/callback | Consume browser-bound state, verify code/ID token, issue opaque API session; registered user UUID/status and tenantAccess=false | 503 unavailable, no cookie |
| GET /v1/auth/microsoft/start | 302 to fixed Microsoft consumer issuer, separate browser-binding cookie | 503 unavailable, no cookie/redirect |
| GET /v1/auth/microsoft/callback | Consume Microsoft-bound state, verify code/ID token, issue opaque API session; REGISTERED user and tenantAccess=false | 503 unavailable, no cookie |
| GET /v1/auth/apple/start | 302 to fixed Apple issuer, code/query, separate browser-binding cookie, no optional scopes | 503 unavailable, no cookie/redirect |
| GET /v1/auth/apple/callback | Consume Apple-bound state, verify token-endpoint ID token/nonce; REGISTERED opaque API session and tenantAccess=false | 503 unavailable, no cookie |
| GET /v1/auth/me | 200 registered user UUID/status and tenantAccess=false; invalid/expired/revoked/suspended session 401 | 503 unavailable |
| POST /v1/auth/logout | Exact API Origin required; revoke presented session, clear cookie, 200 signed_out | 503 unavailable |

HEAD on Google, Microsoft and Apple `/v1/auth/{provider}/start` and `/v1/auth/{provider}/callback` returns405/no-store before configuration, provider or database work, with no cookies or redirect. These stateful auth flows require explicit GET; POST remains unregistered404. Read-only health/providers/me HEAD handling is unchanged.

Callback validation failures/cancel/replay return generic 401; storage/provider discovery failures are sanitized 503. No tokens/SQL/connection values returned. Noncanonical Host fails 401 when enabled; forwarded headers never establish host authority. No returnTo parameter/open redirect, browser bearer-token login, credentialed CORS, tenant selection or superadmin session is implemented. Proposed OpenAPI auth naming/CSRF contracts for the eventual admin BFF remain pending; this slice is not AUTH-001..006 full acceptance.

## T004 implemented internal maintenance endpoint
`GET /v1/internal/maintenance/auth-expiry` is a narrow machine-maintenance capability, separate from tenant/user/operator authentication. Require exactly one `Authorization: Bearer <CRON_SECRET>` header. Server configuration must be43 base64url characters (32 random bytes); missing/malformed configuration returns503 unavailable. Missing/wrong/duplicate authorization returns401 before DB access. Cookies, query values, forwarded authorization and cron User-Agent confer no authority. HEAD returns405; POST is not registered.

Authorized response:200 `{ "status":"ok", "deleted":{ "identity":0, "operator":0 } }`. Counts refer only to the bounded0006 expired-credential contracts; requests cannot choose tenant/principal/limit or expiry. All handler responses are no-store; no cookie/session/credential/record identifier is returned. DB errors return minimal503 unavailable. The existing draft RFC9457/OpenAPI normalization remains a separate API-contract gate; this development route uses the current minimal unavailable/Nest401 envelopes and does not claim full T037 acceptance.

No cron schedule is installed by this slice. The endpoint performs one bounded runtime transaction; it is not a long-running worker or a tenant/platform admin operation. Actual user access remains disabled.

## Historical T004 Microsoft adapter prerequisite
The initial Microsoft adapter had no controller or persistence; Microsoft paths returned404. That prerequisite is superseded by0007 storage and the configured-but-disabled HTTP integration below. [Internal verification contract and remaining integration gates](IDENTITY_OIDC_ONBOARDING.md#t004-microsoft-personal-account-adapter-prerequisite--2026-10-25).

## T004 Microsoft HTTP integration — 2026-10-25
Microsoft start/callback are now registered and disabled503/no-store/no cookies until complete server-only Microsoft config plus exact AUTH_BASE_URL is supplied. HEAD405 precedes config/provider/storage; POST404. Successful configured start uses `__Host-qmenux_microsoft_login` (Secure/HttpOnly/Path=/, SameSite=Lax, Max-Age300, no Domain) independently of Google's temporary cookie. Callback requires exact host/origin/path, one43-character state and unambiguous provider browser cookie; issuer-bound state consumption commits before token exchange. Failure/cancel/replay is401, infrastructure failures sanitized503. Only verified Microsoft subject reaches the Microsoft-only session function; response is REGISTERED internal UUID/status and tenantAccess=false. One shared normal API-only `__Host-qmenux_session` cookie lasts3600s; rotation/revocation are server-side. This is never a privileged operator or admin-host cookie.

Provider metadata reflects each server configuration independently; the later Apple integration is described below. Google routes still require Google config, Microsoft routes Microsoft config. In this two-provider slice me/logout accepted either Google or Microsoft; the Apple slice below extends the shared gate to all three, with all off still503. Flags do not select DB identity/role or selectively revoke an already-issued provider's shared normal session; actual revocation/suspension uses existing DB contracts. Credentialed CORS, browser-selected redirects, admin BFF/handoff/mobile sign-in and real provider activation are not added. No Vercel provider variables were enabled by this step.

## T004 Apple client-secret prerequisite (internal only)
Historical prerequisite, superseded by Apple HTTP integration below: AppleClientSecret initially had no HTTP caller or database. The original phase reported Apple false/routes404; the current configured-but-disabled HTTP contract is below. No developer JWT/private key, user token or authority is exposed through this API. [Protocol/PKCE/browser-binding gates](IDENTITY_OIDC_ONBOARDING.md#t004-apple-client-secret-prerequisite--2026-10-25).

## T004 Apple internal protocol adapter (still unavailable)
Historical adapter phase, superseded below: owner-delegated selection added unused AppleOidc and0008 storage. Current HTTP integration preserves mandatory token-endpoint nonce/signature/issuer/audience/expiry checks and is still disabled remotely. [Selected profile and gates](../02-architecture/APPLE_OIDC_PROTOCOL_PROPOSAL.md).

## T004 Apple HTTP integration — 2026-10-25
Apple GET start/callback are now registered, disabled503/no-store/no cookie/redirect until explicit API-only signing/OIDC config and exact AUTH_BASE_URL. HEAD405 before work; POST/form_post404 with no fallback. Configured start requests code/query with no scope/PKCE/hybrid, using independent five-minute __Host-qmenux_apple_login Secure/HttpOnly/Path=/ SameSite=Lax/no Domain. Callback resolves exact API host/path and unambiguous state/browser binding, commits0008 one-use consumption before token exchange and requires verified nonce/signature/issuer/audience/expiry before any session. Cancellation/bad token/front-channel identity/replay is401; infrastructure failures minimal503. Injected browser token/user payloads never become authority; consumed failures cannot retry the same state.

Only a verified subject reaches createAppleSession; normal API session rotates the presented prior cookie, returning exactly user UUID/REGISTERED and tenantAccess=false. No membership/license/platform authority or email linking. Shared me and exact-Origin POST logout work with any one of Google/Microsoft/Apple configured; all off503. Provider metadata indicates server configuration presence, not successful provider/key verification or launch readiness. Actual key validation happens on signing/start; no private key/JWT/provider token is returned. Existing flags/keys remain absent/disabled remotely. Admin/superadmin BFF, actual Apple scope/query/nonce/Safari/provider acceptance, token lifecycle/privacy/abuse/security/legal/reviewer gates remain.

## T004 internal admin-audience persistence and BFF API adapter
0009 isolates api/admin normal attempts/sessions with admin session-bound CSRF hashes. The additive server-only POST routes /v1/internal/admin-auth/{provider}/start, /{provider}/finish, /me and /logout require a dedicated single Bearer ADMIN_BFF_SECRET; no key is configured yet, so they fail503. Legacy API callbacks/sessions stay api-only; all real providers remain disabled. The disabled-by-default admin browser BFF and cookie/Origin/CSRF transport are now implemented; see the [browser delivery contract](ADMIN_BFF_SESSION_CONTRACT.md#admin-browser-bff-development-delivery--2026-10-26).

Exact bodies/results,8192-byte flat JSON allowlist, duplicate key/header/input denial, fixed admin callbacks, error/status semantics and remaining gates are in the [implemented API adapter contract](ADMIN_BFF_SESSION_CONTRACT.md#api-adapter-slice--2026-10-26). Internal session/CSRF responses must never pass into browser JSON; no provider tokens/keys/claims/tenant privilege escape. Only the admin BFF writes admin host cookies. No generic authenticated proxy/CORS allowance or API/operator token fallback.

## T005 internal draft catalog use cases — 2026-10-26

`DraftCatalog` implements validated create/read/list/update/history behind mandatory TenantAuthorization/entitlement, with0010 append-only product audit and optimistic revisions. The subsequent0011 lookup supports explicitly server-selected admin audience with session-bound CSRF on mutations, preserving API defaults and mandatory entitlement. It has no registered HTTP controller; the business/public routes listed above remain proposed. No browser-selected actor/tenant/role, default license, publication, deletion or verified food fields are accepted. [Exact internal contract, local tests and release prerequisites](DRAFT_CATALOG_CONTRACT.md).

The later0012 `DraftStructure` provider adds internal menu/category create/read/cursor-list/edit/history with the same membership/entitlement/admin-CSRF boundary, composite parent ownership and immutable revision audit. It is not an HTTP controller or a public-menu endpoint. [Input/output and audit contract](DRAFT_CATALOG_CONTRACT.md#draft-menus-and-categories-0012--2026-10-26).

## T041 internal pre-tenant applications — 2026-10-26

OnboardingApplications now provides internal own draft create/edit/explicit pending-submit/list backed by0013 and admin session-bound CSRF. The later gated application adapters are described below; no privileged approval route is registered. The proposed endpoints above remain proposed; submission grants no tenant/member/license access. [Precise input/output, idempotency/isolation and release gates](ONBOARDING_APPLICATION_CONTRACT.md).

### T041 dedicated internal application HTTP adapter

POST /v1/internal/admin-onboarding/list|drafts|drafts/:id/edit|drafts/:id/submit is implemented, disabled unless the explicit application flag and independent onboarding machine credential are configured. Admin sessions remain mandatory, with database-bound CSRF on mutations. No browser cookie/redirect/public approval/license route. [Bodies, limits, errors and release gates](ONBOARDING_APPLICATION_CONTRACT.md#dedicated-internal-http-adapter--2026-10-26).

### T041 admin browser application routes

Fixed GET/POST /api/onboarding/applications, PATCH /:id and POST /:id/submit are now implemented in the admin app. Both default-off gates and an independent server-only application key are required. Host-only admin cookie, exact Origin and session-bound CSRF remain mandatory; numeric revisions/closed inputs and bounded sanitized outputs apply. No approval/tenant/license access is granted. [Full BFF/mobile contract and verification limits](ONBOARDING_APPLICATION_CONTRACT.md#admin-bff-and-mobile-applicant-delivery--2026-10-26).


## T004 internal operator passkey prerequisite —2026-10-26

OperatorPasskeys now verifies enrollment/authentication and supplies the existing mandatory OperatorAuthorization MFA policy through short-lived browser-bound evidence. It is default-off and has no registered controller, public credential/recovery route or privileged operation. Access and current platform role remain separate requirements; approval/license/role mutations still deny. [Internal use cases, input bounds, proof lifecycle, tests and release gates](OPERATOR_PASSKEY_CONTRACT.md).
