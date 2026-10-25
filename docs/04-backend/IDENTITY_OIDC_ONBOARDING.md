# Identity, OAuth/OIDC and Approval-Gated Onboarding
Status: Design specification; provider configurations to be verified against current documentation.

## Identity model
- One internal User identity can link multiple verified external IdP identities via `auth_identities(provider, provider_subject, user_id, issuer, linked_at)`.
- Providers: Google; Microsoft identity platform (personal Outlook and optionally organizational Entra ID); Sign in with Apple. Implement Authorization Code + PKCE with OIDC identity validation where available. Validate state, nonce, issuer, audience, signature, exp, redirect URI and PKCE; reject token substitution.
- Microsoft accounts: specify allowed audiences explicitly (personal only vs personal + work/school), test tenant restrictions and issuer variants; "Outlook" is not a separate OAuth provider.
- Apple: plan for private relay addresses, name supplied only on initial authorization, account deletion/revocation obligations and provider-specific redirect requirements.
- Never treat email alone as stable identity key; link accounts only after proof of control and explicit confirmation. Verify email state per provider and do not auto-link unverified addresses.
- Avoid exposing provider access/refresh tokens to browser or logs. Encrypt server-held tokens if needed; do not request unnecessary scopes. Authentication does not grant business entitlement.

## User, tenant and license state machine
- User identity: REGISTERED → VERIFIED (where required) → ACTIVE or SUSPENDED.
- Tenant onboarding: DRAFT → PENDING_APPROVAL → APPROVED → ACTIVE; possible REJECTED/SUSPENDED.
- License entitlement: NOT_GRANTED → ACTIVE → GRACE/EXPIRED/REVOKED, independent of payment processing.
- Signup creates user and draft application only; NO public menu publishing, admin write privileges for active tenant, AI credits or automatic license.
- Superadmin approves/declines tenant application and grants time-bounded license with reason and audit. Existing tenant staff invitation is separate from creating a new tenant.
- Duplicate email/provider accounts, pending approvals, invitations, account recovery, deleted accounts and suspended users have defined UI states.
- Sign-in from `qmenux.com` to `admin.qmenux.com` uses secure redirect handoff; host-only session cookies, no `.qmenux.com` shared cookie, no open redirects.
- Superadmin `superman.qmenux.com` uses separate privileged auth audience, mandatory MFA/passkey and identity-aware proxy. A normal owner account cannot become platform admin via social login.

## Suggested API
- `GET /v1/auth/providers` (public supported provider metadata)
- `GET /v1/auth/:provider/start` / `GET /v1/auth/:provider/callback` (browser redirects; allowlisted origins)
- `POST /v1/onboarding/applications` / `GET /v1/onboarding/me` (authenticated)
- `GET /v1/superadmin/onboarding/applications` / `POST /v1/superadmin/onboarding/:id/approve|reject`
- `POST /v1/superadmin/tenants/:id/licenses/grant` (step-up + idempotency + audit)
- Actual endpoint naming/CSRF method contract must be finalized in OpenAPI.

## Tests
AUTH-004 provider success/failure/cancel, state/nonce/PKCE validation, email changes, duplicate account prevention.
AUTH-005 Apple relay and Microsoft personal/organization account cases.
ONB-001 unapproved account denied tenant writes/publish/API keys; pending status visible.
ONB-002 superadmin approval/license grants are audited, idempotent and privileged.
AUTH-006 domain-scoped session isolation and safe redirect targets.

## T004 first development slice — 2026-10-25
Google only: pinned openid-client 6.8.8 discovers the fixed `https://accounts.google.com` issuer over verified HTTPS with five-second request timeouts. Code flow always uses S256 PKCE, random state and nonce, exact API callback, RS256 and explicit signature checking (`enableNonRepudiationChecks`), issuer/audience/expiry/nonce validation. Scope is only `openid`. No provider tokens, email, display name, external role claims or browser redirect target are persisted/returned. Microsoft and Apple are explicitly unavailable, not substituted with Google or fake sessions.

Server-owned 0003 contracts in `qmenux_identity` store five-minute login attempts (hashed state/browser binding; private verifier/nonce), stable Google issuer+subject identities and one-hour opaque sessions (token hash only). Consumption is an atomic DELETE committed before token exchange, preventing replays even after provider failure. Browser binding uses a separate random HttpOnly cookie, not state alone. First-login races serialize per external identity; there is no email auto-linking. A subsequent login rotates the presented prior session. Every session lookup checks expiry and user suspension; logout revokes on the server. Users are REGISTERED and have zero tenant access; this does not implement membership/RBAC/license or platform roles.

API-only session cookies are `__Host-qmenux_login` and `__Host-qmenux_session`: host-only on the exact configured API origin, Secure/HttpOnly/Path=/, SameSite=Lax, bounded Max-Age; no Domain. Neither cookie is an admin/superadmin PWA session. The admin BFF/handoff/CSRF contract and actual browser mobile tests remain unimplemented. Logout currently requires same-origin API POST; no credentialed CORS is enabled. Provider callback accepts only its fixed path/origin and rejects ambiguous state/missing browser binding. Host/Forwarded/returnTo input cannot choose a redirect or privileged auth audience.

Data inventory for review: stable internal UUID, Google issuer/subject (personal identifiers), registration/suspension status, creation time, hashed session/state/browser tokens, ephemeral PKCE/nonce and expiry timestamps. No real data was collected; only synthetic tests, cleaned afterward. Expiry denies access but does not physically delete old rows. Retention/deletion jobs, distributed abuse limits, session/recovery/account deletion and provider/privacy/transfer review are required before enabling real users. No legal or provider acceptance is inferred.

Activation requires deliberate `AUTH_GOOGLE_ENABLED=true`, server-only Google client ID/secret and exact AUTH_BASE_URL (`https://api.qmenux.com` or the isolated API provider alias `https://qmenux-api.vercel.app`), with the corresponding exact `/v1/auth/google/callback` registered in Google Cloud. No arbitrary Preview origin, request-supplied callback or client-side secret. Configuration is currently absent/disabled; no remote environment values changed. Real-provider console configuration and end-to-end login have not been performed. Provider enablement must wait for the gates above.

Tests use a private signed provider simulation and real disposable PostgreSQL HTTP handlers; the manual Neon probe exercises the actual identity store with synthetic subjects only, not a Google account. Sources checked 2026-10-25: [Google OIDC setup/server flow](https://developers.google.com/identity/openid-connect/openid-connect), [openid-client code grant](https://github.com/panva/openid-client/blob/main/docs/functions/authorizationCodeGrant.md), [explicit JWS signature checks](https://github.com/panva/openid-client/blob/main/docs/functions/enableNonRepudiationChecks.md).
