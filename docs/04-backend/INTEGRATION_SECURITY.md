# Integration Security Checklist
Status: Proposed release controls.

- [ ] Explicit auth matrix: guest/public, owner PWA, superadmin PWA, external machine, third-party delegated user, inbound webhook.
- [ ] Tenant and branch scope enforced server-side; RLS tests for cross-tenant reads/writes.
- [ ] Fine-grained scopes, least privilege, short-lived tokens or rotatable API keys, revocation tested.
- [ ] No browser-exposed long-lived integration keys; secrets encrypted/hashed and shown once.
- [ ] Provider webhook signatures verified; replay/deduplication, queue isolation, retries and dead-letter queues.
- [ ] API rate limiting per key/tenant/IP; payload size limits, request timeouts, abuse alerts.
- [ ] Credentialed CORS exact allowlist; host-only secure cookies; CSRF and session fixation tests.
- [ ] Superadmin IdP/Access + mandatory MFA/passkey; backend enforces separate platform role and step-up for destructive actions.
- [ ] Log sensitive changes without tokens/credentials or raw visitor geolocation; retention and privacy review.
- [ ] API versioning, OpenAPI schema, deprecation, usage quotas and support process documented.
- [ ] WhatsApp/Telegram provider and Turkish privacy/commercial-message rules reviewed before launch.
