# Multi-Tenancy Security

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## Tenant resolution
Parse and normalize trusted host after proxy validation; allow only configured base domain and verified custom domains. Reject unknown, homograph-risk and reserved subdomains. Resolve hostname -> tenant -> branch/publication. Authenticated admin tenant selection must be membership-authorized server-side.

## Isolation defense in depth
1. Tenant context created on trusted server boundary.
2. Authorization checks membership and role per use case.
3. All tenant tables scoped via PostgreSQL RLS; missing context denied.
4. Object storage keys and signed URLs tenant-bound and time-limited.
5. Cache keys include tenant, branch, locale, revision and authorization class.
6. Queue payloads include signed/trusted tenant reference, revalidated by worker.
7. Analytics/export/search enforce tenant filters; logs avoid sensitive payloads.

## Test matrix
Cross-tenant GET, PATCH, DELETE, list, search, bulk export, media URL, cache poisoning, queue replay, custom domain collision, multi-membership switching, expired role, missing RLS context and concurrency under pooled connections.

## Platform owner
Separate platform authorization and MFA; optional Zero Trust/IP policy; audit all support access. Never give a business account a bypass-RLS DB credential. Support impersonation requires explicit, time-limited, visible audited session.

## External principal tenant resolution
For integration requests, tenant scope comes from verified credential/token claims and server-side mapping, not a client-supplied `tenant_id`, hostname alone, query parameter or Telegram/WhatsApp chat identifier. Branch restrictions and RLS remain active. A platform principal must use explicitly audited platform-only use cases.

## T003 development implementation — 2026-10-25
`TenantTransactions.run(host, authorize, work)` is an internal application contract. Host must be a canonical ASCII `{slug}.qmenux.com` single DNS label; reserved hosts, punycode, ports, trailing dots, URLs, Unicode and multiple hosts fail closed. No custom-domain or trusted-proxy forwarding configuration exists. HTTP clients cannot choose `app.tenant_id`; candidate UUID comes from the restricted tenancy lookup. API/admin/superadmin hosts cannot use this tenant-menu resolver; their authenticated tenant-selection contracts belong to T004/T035/T037.

The same checked-out transaction performs runtime-role/context verification, candidate lookup, parameterized transaction-local RLS, mandatory server authorization and work. Missing/denied authorization never executes work. Commit/rollback clears local context; failed reset destroys the connection. There are no automatic retries. Readiness uses the same role/context boundary and a rollback without tenant lookup.

ACTIVE lookup is not license/membership/publication authorization. Until reviewed identity and license/publication policies exist, no business controller is registered in AppModule. Tests use a separate test module and synthetic principals/fixtures. See proposed ADR-TENANT-003 in DECISIONS.md; production architecture approval remains pending.

## T004 private-management authorization boundary — 2026-10-25
TenantAuthorization composes the existing candidate/RLS transaction with IdentityStore.tenantMembership on that exact PoolClient. It accepts an opaque API session token and server-selected permission, not client-provided user IDs/roles/tenant UUIDs. Current database membership and user/session status are checked afresh every transaction; a mandatory trusted entitlement callback must return exactly true before work. Returned tenant/user/role context is server-derived and frozen. Missing/unknown capability or policy denies access.

OWNER/EDITOR are business roles only; no platform or license-grant capability exists. New memberships default PENDING and cannot be created/promoted by runtime SQL or signup. Forced RLS and an explicit definer tenant predicate protect membership lookup; runtime cannot enumerate/mutate memberships. Session revocation triggers cover membership/user-status changes. Real management HTTP routes, licensed entitlement contracts, admin tenant selection and operator audience/MFA remain gated; test-only HTTP controllers never belong to AppModule.

## T004 admin-audience tenant authorization — 2026-10-26

TenantAuthorization.run now accepts a closed authenticated-server app context after the existing arguments, defaulting to api for legacy callers. Admin context calls the identity-owned0011 `admin_tenant_membership(token_hash,csrf_hash)` contract on the same checked-out tenant transaction. It requires an unexpired admin-audience session, REGISTERED user, ACTIVE current-tenant membership and optionally the exact session CSRF hash; API and operator tokens cannot substitute. Current OWNER/EDITOR capabilities and mandatory entitlement remain unchanged.

Application code requires a valid43-character session-bound CSRF proof for every admin capability except catalog:read; a proof supplied on a read must also match. API context rejects a CSRF argument rather than ambiguously switching audience. The adapter must pin the app, validate browser Origin/cookie/header and pass the proof independently of business input; audience is never selected by a catalog payload. Role/user changes still revoke both normal session audiences. There is no new role, membership write, license policy, platform grant or public business controller.

DraftCatalog consumes this exact boundary. The same local database suite tests cross-audience denial, owner/editor differences, missing/wrong proof, issuer namespaces, unlicensed policy denial, expiry/revocation, RLS/definer grants and safe0011 down/reapply with audit preserved. Actual BFF tenant selection/HTTP transport, license/approval and release evidence remain required.
