# Tenant-admin BFF session contract

Status: Proposed development contract; named architecture/security reviewer and dated acceptance pending | 2026-10-25

## Problem and selected recommendation
Current OIDC callbacks and __Host-qmenux_session belong to api.qmenux.com. The admin host cannot read that cookie, and a parent-domain cookie is forbidden. Do not forward arbitrary browser Cookie/Authorization headers or build a generic authenticated proxy to work around this boundary.

Recommend a fixed first-party admin BFF: the browser's OIDC callback terminates at admin.qmenux.com, while provider credentials, code/token validation and identity/session persistence remain in the NestJS identity module. The BFF authenticates itself to narrowly scoped internal API endpoints. It has no database or IdP signing key. No extra browser handoff grant, token-in-URL bridge, worker, broker, Redis or new service is needed.

This is an additive future admin flow. Existing direct API development callbacks/cookies remain isolated and backward compatible. This document does not change runtime origins, create credentials, register provider return URLs or enable a real login. Marketing stays last; privileged superadmin remains a separate Access/MFA/operator audience.

## Fixed origins and trust
| Surface | Authority / credential |
|---|---|
| Browser → admin BFF | Exact https://admin.qmenux.com, admin-only host cookies and CSRF checks |
| Admin BFF → identity API | Fixed https://api.qmenux.com; dedicated server-only ADMIN_BFF_SECRET for admin identity endpoints only |
| API → IdP | Existing server-owned provider config/signers; fixed trusted admin callback URI per provider |
| API → Neon | Existing restricted runtime/module contracts; owner used only for reviewed migrations |

ADMIN_BFF_SECRET is a new independent machine credential, not CRON_SECRET, an OIDC client secret, operator token or user session. Plan32 random bytes/base64url; exact single Bearer validation, constant-time equal-length comparison, fail closed before database work. Keep it in API/admin server runtime only, never NEXT_PUBLIC_, next.config env, browser bundles, Preview, logs or examples. No key is generated in this contract step. Creation/binding, rotation/redeployment and retirement of old deployments require a concrete later operations step; changing one environment value is not global revocation. It cannot impersonate an IdP user, mint an operator or bypass tenant/license checks.

Internal requests select no arbitrary target URL, callback, user ID, role, issuer or audience. Paths bind provider to google/microsoft/apple; the server chooses app audience admin and the corresponding fixed callback. Incoming Host/Forwarded/Origin/returnTo values do not establish authority.

## Browser / server sequence
```mermaid
sequenceDiagram
    participant Browser
    participant BFF as admin.qmenux.com
    participant API as api.qmenux.com
    participant IdP as Google / Microsoft / Apple
    Browser->>BFF: Same-origin POST start(provider)
    BFF->>API: Authenticated admin begin + random browser proof
    API-->>BFF: Validated provider authorization URL
    BFF-->>Browser: Set admin login cookie; redirect to IdP
    IdP-->>Browser: Code + state to fixed admin callback
    Browser->>BFF: Callback GET + host-only login cookie
    BFF->>API: Authenticated finish(code, state, browser proof)
    API->>IdP: Code exchange and signed ID-token validation
    API-->>BFF: Admin-audience session + CSRF secret, no IdP tokens
    BFF-->>Browser: Host-only admin cookies; 303 fixed admin root
```

The browser proof is fresh32-byte randomness, never a user identity. BFF stores it only in a short-lived HttpOnly admin-host cookie; API stores its hash. State/nonce and Google/Microsoft PKCE verifier remain server-owned. No process-local login state is relied upon. On callback, the API atomically consumes provider+admin-audience+browser-bound state and commits before contacting the provider. Failed/cancelled/expired/mixed/replayed flows cannot retry the consumed state.

## Endpoint contract (proposed, none implemented)
All responses no-store; errors sanitized. BFF server fetch uses the fixed API origin, bounded deadlines, redirect rejection and explicit credential/body allowlists. Do not blindly forward upstream cookies, headers, error text or response fields.

| Browser-facing admin route | Behavior |
|---|---|
| GET /api/auth/providers | Sanitized public provider/config flags via the API; no session, arbitrary upstream or credentials |
| POST /api/auth/{provider}/start | Exact admin Origin, JSON and required same-origin custom request header; generate browser proof, call internal begin, set temporary cookie, redirect only to validated fixed provider endpoint |
| GET /api/auth/{provider}/callback | Exact configured callback/path; one state/code or allowlisted error; read temporary cookie, call internal finish; clear login cookie; on success set admin cookies and303 fixed https://admin.qmenux.com/ |
| GET /api/auth/me | Read only admin-session cookie, call internal admin session lookup; sanitized UUID/status and tenantAccess=false until reviewed entitlement flow exists |
| POST /api/auth/logout | Exact admin Origin + session-bound CSRF; revoke via internal API before clearing cookies/claiming signed_out |

| Server-only API route | Required input / result |
|---|---|
| POST /v1/internal/admin-auth/{provider}/start | Dedicated BFF auth + browser proof → server-generated state/nonce/PKCE and allowlisted auth URL |
| POST /v1/internal/admin-auth/{provider}/finish | Dedicated BFF auth + code/state or provider error + browser proof + optional prior admin session → validated admin-audience session/CSRF/expiry and minimal identity |
| POST /v1/internal/admin-auth/me | Dedicated BFF auth + admin session → minimal current identity, never API/operator audience fallback |
| POST /v1/internal/admin-auth/logout | Dedicated BFF auth + admin session + bound CSRF proof → server revocation |

Internal credentials travel only in server Authorization/body over TLS, never query parameters. Identity API does not set browser cookies for this contract; only BFF writes admin cookies. Unknown fields/methods/providers, duplicate parameters/cookies/authorization and unsupported content types deny. Framework HEAD dispatch must not begin/consume state or mutate sessions. Apple remains code/query/no optional scopes; POST/form_post and front-channel token/user payloads have no fallback.

## Audience and persistence changes required first
A new separately tested migration must add app audience api/admin to login attempts and normal sessions, default api for old rows, plus a session-bound CSRF hash required only for admin sessions (api rows keep it NULL). Existing public API begin/consume/create/read/revoke/membership contracts must remain api-only, including prior-session rotation; new admin contracts are fixed to admin. A shared cookie name or a BFF header alone is not an audience boundary. Test both token/state directions, including replay of an API token through the authenticated BFF and admin token through legacy API functions. Existing operator audience/schema stays wholly separate.

IdP issuer+subject still identifies the same normal user across these first-party channels. No email auto-linking or duplicated users just because app audience changes. Reuse provider registrations only where the actual provider permits the added exact callback and preserves subject identity; verify Apple Services ID/group behavior. Keep legacy AUTH_BASE_URL restricted to existing API origins. New authenticated admin app context resolves exactly https://admin.qmenux.com/api/auth/{provider}/callback from a server-owned provider enum, never by broadening that legacy resolver or accepting a browser-selected URI/client ID. Keep Google/Microsoft S256; retain only the owner-selected Apple confidential-client nonce exception. Token-endpoint signature/issuer/audience/expiry/nonce checks precede any session issuance.

Reuse existing tables/indexed expiry cleanup if possible; preserve100/table caps and the single cron scope. Do not change old migration files. Down must preserve api rows and refuse admin-audience attempts/sessions or other incompatible data rather than deleting it. Remove callers before rollback; version guards must refuse newer schemas. User suspension/membership changes revoke all relevant normal-user sessions; restoration cannot revive them.

## Cookie and CSRF contract
| Admin cookie | Attributes / meaning |
|---|---|
| __Host-qmenux_admin_{provider}_login | Secure, HttpOnly, Path=/, SameSite=Lax, no Domain, Max-Age300; browser proof only; fixed provider enum gives independent bindings |
| __Host-qmenux_admin_session | Secure, HttpOnly, Path=/, SameSite=Lax, no Domain; opaque admin-audience token, server expiry at most existing3600s policy |
| __Host-qmenux_admin_csrf | Secure, Path=/, SameSite=Lax, no Domain; readable by same-origin UI, separate random CSRF value, never authentication |

Store only session/CSRF hashes, with CSRF bound to that admin session. Mutating signed-in requests require exact Origin and X-CSRF-Token checked against the cookie and server session binding. Merely SameSite, a fixed header, Origin, or an unsigned double-submit value is insufficient by itself. A sibling tenant host must fail even though it is same-site. Reject missing/null/wrong origins and duplicate cookie/header values. No credentialed cross-origin allowlist or wildcard is added.

Pre-login start has no session CSRF token: require exact Origin, JSON and the explicit same-origin request header, with no cross-origin CORS allowance; its random login proof then binds the callback. IdP callback GET uses state+browser proof, not an Origin exemption for other mutations. Lost CSRF/session or failed callback restarts login; never weaken checks or silently fall back to API cookies. If logout cannot reach the API, do not report server revocation; browser-only cleanup cannot promise it.

## Errors, latency and real-user gates
No IdP tokens/email/name/roles, machine credentials, login proof, session/CSRF secrets or raw provider errors in browser JSON/logs. Only HttpOnly session cookie carries normal browser authority; no localStorage or sessionStorage tokens. No authenticated HTML/API/service-worker caching. Callback no-referrer, fixed redirects and no third-party callback resources. Review platform query/body logging before real users.

No automatic retry of a consumed finish. A lost response after session commit can leave an unusable expiring session; user restarts login and normal expiry cleanup removes it. Timeouts, response/body limits and malformed/oversized inputs need bounded implementation tests; verify actual provider codes and platform timing budgets before launch. No new unverified production capacity/SLA is selected here.

Required before enablement: synthetic real HTTP/API/BFF tests; audience confusion/replay/nonce/CSRF/cookie fixation/sibling-origin/redirect/timeout/error tests; existing pooled RLS/license denial; actual provider callback registration/test accounts; Safari/iOS/Android/PWA/keyboard/offline cases; reviewed token lifecycle/revocation/privacy/legal/MFA/abuse/security and named acceptance. A normal REGISTERED session still grants no tenant entitlement, license or platform role. T004/T040 stay IN_PROGRESS; T005 remains gated.

## Current implementation and next boundary
The separately requested0009_admin_audience implements internal audience-bound persistence/module contracts and migration rollback/tests. No public route, secret generation or provider registration is added. Then add BFF-authenticated API adapters; then admin handlers/browser tests and reviewed secret/provider setup as separately requested steps. No generic proxy, marketing page or Super Admin changes.

Evidence for this checkpoint: installed Next16.4.3 Route Handlers/BFF guides inspected; current root/identity/trust/integration/Git docs read. Existing API-host callbacks and the admin unavailable screen remain unchanged. Persistence delivery is recorded below; browser/server BFF adapters remain a proposal, not implemented or reviewer-approved behavior.

## Persistence slice evidence — 2026-10-26
0009 defaults legacy attempts/sessions to api, requires valid CSRF hash only for admin sessions and pins legacy consume/read/revoke/rotation/membership contracts to api. Five admin-only module contracts begin/consume/create/read/revoke use fixed admin audience and an allowlisted provider issuer; read returns minimal identity, revoke requires matching unexpired session/CSRF. Shared provider lock namespace prevents API/admin first-login duplication. Existing status/membership triggers revoke both audiences, shared expiry caps remain unchanged.

Down refuses any admin attempt/session (including expired rows not yet cleaned), locks both tables and preserves API rows; old0001–0008 unchanged. This schema boundary is not BFF client authentication, provider validation, browser CSRF/Origin enforcement or real admin login. Those remain later adapters/handlers with their own tests/keys/setup. [Actual local/Neon/deployment evidence](../01-product/PROGRESS.md#t004-admin-audience-persistence--2026-10-26).
