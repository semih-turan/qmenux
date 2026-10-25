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
