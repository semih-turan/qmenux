# Architecture and Boundaries

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## Style
Modular monolith (NestJS) with bounded contexts and hexagonal boundaries. Next.js applications are separate deployable frontends. Background worker handles async tasks. Do not deploy microservices prematurely.

## Bounded contexts
Identity/Tenants, Catalog, Presentation/Themes, Subscription, Billing, AI Studio, Compliance, Analytics/Media. Each owns its write model; communicate via exported application services or domain events. Cross-module SQL joins restricted to approved read projections.

## Layering per module
- `domain/`: entities, value objects, invariants, domain events; no framework imports.
- `application/`: use cases, ports, transactions, authorization policies.
- `infrastructure/`: DB repositories, external provider adapters, queue implementations.
- `presentation/`: REST controllers, DTO validation and OpenAPI.

## Important patterns
Repository only at aggregate boundaries; Strategy/Adapter for payment and AI providers; State Machine for subscriptions/payments/jobs; Transactional Outbox for reliable events; CQRS-lite for complex read models. Avoid class-per-table and generic mega-repositories.

## Consistency and events
Persist domain state and outbox event atomically; worker retries with exponential backoff and idempotent consumers. Never assume exactly-once queue delivery. Separate durable DB transactions from network calls.

## Scaling
Start with API, frontends, worker, PostgreSQL, Redis, object storage and CDN. Add read replicas, cache and independent workers based on measured bottlenecks. Public menus cache by tenant/branch/theme version and content revision; invalidate on publish.

## Failure modes
Provider downtime, Redis outage, partial upload, stale menu cache, expired session, duplicated webhook, tenant context loss. Define fail-closed behavior for auth/payment and explicit user feedback for admin.

## v4 bounded-context changes
- `Catalog`: availability state, localized fields, imports, published menu snapshots, scheduled changes. Domain commands own state transitions; a read projection serves fast public search.
- `Publishing`: immutable revision snapshots and atomic pointer to current published revision; rollback creates a new publication event. Cache invalidation uses outbox events.
- `QR & Analytics`: stable table tokens and privacy-preserving aggregates; event deduplication and retention separated from catalog.
- `Engagement`: optional WhatsApp link configuration and push notification preferences/delivery jobs.
- Background worker: import validation/apply, schedule activation, PDF exports, push delivery, aggregation. Queue jobs idempotent and tenant-scoped.
- Avoid new microservices. Use application ports for spreadsheet parsing, push providers and time source; avoid leaking vendor SDKs into domain.

## QMenuX hostname / trust architecture
`qmenux.com` marketing; `admin.qmenux.com` business PWA; `superman.qmenux.com` platform PWA; `api.qmenux.com` REST API; `{slug}.qmenux.com` public menus. Do not infer privileges from host alone; identity, audience, role, scope and tenant context are validated at API boundaries. Dedicated integration adapters and service principals for Telegram, WhatsApp and third-party programs; adapters call application use cases rather than bypassing domain logic. See DOMAINS_AND_TRUST_BOUNDARIES.md and PUBLIC_API_AND_CHANNELS.md.


## v6 authentication and delivery sequencing
- Shared identity bounded context with external IdP adapter ports (Google, Microsoft, Apple) and provider subject mappings; OAuth/OIDC code+PKCE and secure callback handler.
- Onboarding/Approval bounded context is distinct from Identity and Subscription: registered identity ≠ approved tenant ≠ licensed tenant.
- `qmenux.com` marketing app is built last; early auth endpoints and minimal login/onboarding screens are prerequisites for admin/superadmin, not a marketing launch.
- Billing gateway adapters are future-only; superadmin manual license grant is a supported first-class application use case.
- `api.qmenux.com/v1` enforces same entitlement and tenant isolation for all channels; external integrations cannot bypass approval.

## v7 presentation boundaries
Shared QMenuX UI package provides fixed admin/superadmin tokens/components. Separate public theme registry contains 10 themes and theme-specific layouts. Versioned business-type starter template service provides only initial suggestions. Do not fork application per business type or theme.


## v8 binding deployment decision: Neon + Vercel
- Neon PostgreSQL is the only canonical production relational DB; preserve tenant_id, PostgreSQL RLS and transactional outbox.
- Deploy public menu, tenant admin, superadmin and (last) landing Next.js applications to Vercel.
- Deploy stateless NestJS HTTP API to Vercel Functions using a validated adapter and cold-start performance spike. Do not depend on always-on NestJS lifecycle hooks.
- Background work (BullMQ, PDF, AI, imports, scheduled publications, notifications, outbox relay) requires separately hosted durable worker; worker provider and Redis compatibility are T000/T047 open choices.
- Cloudflare R2 remains media/PDF storage; direct uploads and expiring signed URLs. Cloudflare edge controls and Vercel host routing must be tested.
- ORM not finalized: Drizzle recommended, Prisma alternative. See `docs/08-operations/VERCEL_NEON_INFRASTRUCTURE.md`.
