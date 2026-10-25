# Public / Partner API and Channel Integration Contract
Status: Architecture specification; endpoints are proposed, not implemented.

## Goal
`https://api.qmenux.com/v1` is the canonical API for QMenuX first-party clients and authorized external software, including owner's own programs and future Telegram/WhatsApp integrations. This does **not** mean arbitrary third parties can access any tenant's data. All write and private read operations require scoped credentials and tenant authorization.

## Authentication modes and use cases
1. First-party admin PWA: authenticated user session/OIDC with CSRF controls or BFF pattern; RBAC and tenant membership. Do not embed long-lived API keys in browser/PWA.
2. External server-to-server: tenant-owned integration credentials (OAuth 2.0 client credentials or carefully managed scoped API keys); credentials created by authorized tenant admin; server-side use only. Prefer OAuth 2.0 authorization code + PKCE for user-authorized third-party apps.
3. Platform automation: distinct service principals and platform scopes, no implicit superadmin bypass.
4. Webhooks: inbound provider signature verification (e.g. provider-specific Meta/Telegram mechanisms), timestamps/replay protection where supported, allowlisted event types and tenant mapping. Outbound webhooks signed with per-endpoint secrets, idempotent event ids, retry/backoff/dead-letter and secret rotation.

## Token/key lifecycle
- Generate cryptographically strong opaque secrets, display once, store only keyed hash (or secret manager reference), support rotation, revoke, expiry, last-used metadata, IP restrictions optional. No credentials in source code, browser storage, logs, URLs or QR payloads.
- Default deny; scopes such as `catalog:read`, `catalog:write`, `menu:publish`, `analytics:read`, `qr:read`, `exports:create`, `integration:manage`. Platform-only scopes are separate and never tenant-grantable.
- Integration access must be bound to tenant and optional branch. Every query and mutation checks effective tenant context and PostgreSQL RLS; ignore client-supplied tenant IDs for authority.

## API contract
- Prefix `/v1`; OpenAPI 3.1 generated/validated in CI; consistent JSON error envelope, request IDs, UTC timestamps and ISO 8601, stable pagination, cursor support and explicit breaking-change/version policy.
- `GET /v1/catalog/products`, `PATCH /v1/catalog/products/{id}`, `GET /v1/menus/published`, `POST /v1/menus/publish`, `GET /v1/analytics/qr-scans`, `POST /v1/exports/menu-a4` are examples, not promises of immediate V1 delivery. Respect existing API_SPEC.md routes and consolidate during T000/T035.
- Idempotency keys for mutations with side effects (publishing, AI spending, exports where necessary). Validate content type, schema, payload size and pagination bounds.
- Quotas: per tenant, principal, IP and endpoint class; explicit 429 + Retry-After; expensive PDF/AI tasks have stricter concurrency and wallet rules.
- Audit: credential creation/revocation, scope changes, publish/price changes and integration events; redact PII, passwords, tokens and webhook payload secrets.

## Telegram integration (future)
- Telegram Bot API adapter with per-tenant bot linkage, explicit permission and secret management. Verify webhook secret token if configured, validate event provenance, deduplicate update_id, restrict allowed bot actions and avoid granting raw platform/admin credentials.
- Example authorized workflows: read menu, alert owner about license expiry, report QR stats, update stock after explicit role/scope validation.

## WhatsApp integration (future)
- Meta WhatsApp Business Platform or approved provider adapter; provider-specific verification/signatures, app permissions, template/opt-in rules, message rate limits, consent/marketing compliance and provider policy review.
- The existing guest-facing WhatsApp contact link is **not** the same as a WhatsApp Business API integration.

## Release and documentation
- External developer portal/API key self-service is optional later; V1 foundation requires scope model, security design, OpenAPI contracts, and internal API use. External production access is a separately gated feature.
- No public API write access until threat modeling, penetration tests, rate-limit tests, credential revocation and tenant-isolation tests pass.
