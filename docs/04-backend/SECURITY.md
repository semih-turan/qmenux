# Security Threat Model and Controls

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## Assets and threats
Tenant catalogs, account credentials, merchant credentials, payment events, AI assets and operational logs. Threats: IDOR/cross-tenant access, privilege escalation, webhook forgery, SSRF through media URLs, malicious uploads, cache mixing, CSRF/XSS, token theft, brute force, billing double fulfillment.

## Controls
MFA for platform owner, RBAC + membership checks, secure cookie settings, CSRF protection where needed, session rotation, credential rate limits, short-lived signed media URLs, upload MIME/magic validation, malware scanning where feasible, content security policy, dependency scanning and secret management.

## Payment security
Never store PAN/CVV; use hosted/tokenized provider flows and minimize PCI scope. Verify provider-specific signatures/hashes against raw payload, exact amount/currency/order, timestamps when available; log event ID, not sensitive payload. Idempotent settlement and reconciliation required.

## Privacy
Data minimization, purpose limitation, appropriate legal basis and notices, retention/deletion/export policy, processor agreements, overseas transfer review, cookie consent where required. Do not collect unnecessary guest identifiers.

## Operational security
Separate production/staging credentials, least privilege DB roles, encrypted backups, disaster recovery drills, patch cadence, audit trail, alerting and incident response runbook. Security sign-off before production.

## Geo, Wi-Fi, AI and export controls
- Browser geolocation is permission-based and can be spoofed. Do not infer exact location without consent or represent radius policy as a security boundary. Minimize storage of precise coordinates; do not log visitor coordinates by default.
- Guest Wi-Fi password, if displayed, is public by design. Encrypt at rest, mask in admin by default, audit configuration changes without plaintext, and advise separate guest network.
- Restrict PDF download to tenant and role; use short-lived signed URLs and prevent cross-tenant job access. Never embed private internal admin notes in PDF.
- AI jobs must be tenant-scoped; verify quote price, wallet balance and idempotency server-side; sanitize prompt input and ensure no unreviewed nutrition/allergen content is published.
- QR analytics should not rely on device fingerprinting; rate-limit obvious bot traffic and avoid collecting visitor identity unnecessarily.

## v4 safeguards
- Import: virus/type/size checks, CSV formula injection neutralization on exports, XLSX zip-bomb defense, parser limits, staged object storage, per-tenant quotas and retention; never execute spreadsheet macros.
- QR: random high-entropy tokens, rate limits, revoke/rotate, avoid sequential IDs and leak of internal tenant data.
- Menu history: immutable revisions, tenant authorization, audit and access-controlled rollback; restore does not erase prior history.
- Analytics: no device fingerprinting or user-level profiling by default; aggregate and minimize, bot filtering and privacy review before trackers.
- WhatsApp: validate phone and link scheme, sanitize prefilled text, no unconsented outbound messaging.
- Push: explicit browser permission, revoke endpoints, protect VAPID/private keys, encrypt subscription endpoint/keys, avoid sensitive lock-screen payloads, bounded retry and expiry.
- Scheduling: protect against unauthorized future price edits, race conditions, clock/timezone ambiguity and cache-stale prices.

## Host-specific security baseline
- `admin.qmenux.com`: tenant membership, RBAC, session security, CSRF, optional/encouraged MFA, rate limits.
- `superman.qmenux.com`: identity-aware access proxy (Cloudflare Access or equivalent), mandatory phishing-resistant MFA/passkey, separate IdP audience and server-side platform RBAC, short sessions, step-up and immutable audit for high-impact actions.
- `api.qmenux.com`: server-side verification of principal, tenant, branch, audience and granular scopes; per-key/per-tenant/IP quotas; API key rotation/revocation; OpenAPI schema validation; signed inbound/outbound webhooks.
- Cookies must be host-only and Secure/HttpOnly; no parent-domain `.qmenux.com` session cookie. Authenticated CORS origins are exact allowlisted; no wildcard credentials. Validate Host and trusted reverse proxy headers; reserve privileged tenant slugs.
- No secret URL or uncommon subdomain is considered a security control. Security must withstand hostname disclosure.


## v6 OIDC / onboarding security controls
- Authorization Code + PKCE, validated OIDC ID token claims (issuer/audience/signature/nonce/exp), CSRF state, exact callback URI allowlists; no implicit grant.
- Provider subject identity, explicit safe account linking, verified email policy, session rotation on login and privilege changes, no open redirects.
- Prevent `PENDING_APPROVAL` from tenant writes, menu publish, license grants or integration key issuance, even via direct API calls.
- Superadmin approval requires separate operator audience, MFA/passkey, Access and audit; social login alone cannot assign operator role.
- Host-only secure cookies and provider callback cookie/SameSite integration tests across apex/admin/superman; avoid wildcard credentialed CORS.


## v8 deployment-specific security
- Neon credentials server-only; separate pooled and direct URLs, least-privilege roles, environment isolation, secret rotation and RLS transaction-context leakage tests.
- Vercel preview must never access production Neon or production IdP credentials. Protect preview URLs and superadmin app with identity-aware access.
- Validate Cloudflare/WAF-to-Vercel forwarded host handling and reserved subdomains; hostnames alone do not establish role.
- External worker uses separate least-privilege service identity; R2 signed URLs expire; Redis/queue never public.
