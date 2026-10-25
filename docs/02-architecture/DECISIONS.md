# Architecture Decision Log

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## ADR-001 — Modular monolith
**Status:** Proposed. **Decision:** NestJS modular monolith instead of microservices. **Why:** Lower cost and operational complexity; extract worker/services only when measured demand requires.

## ADR-002 — Tenant isolation
**Status:** Proposed. **Decision:** Shared PostgreSQL schema with tenant_id and RLS, server-resolved tenant context. **Why:** Scale operationally without per-tenant migrations while maintaining defense in depth.

## ADR-003 — Mobile-primary admin
**Status:** Accepted product direction. **Decision:** Business and platform admin PWAs designed for phones first; desktop secondary.

## ADR-004 — Single commercial edition
**Status:** Accepted product direction. **Decision:** One fixed-price subscription edition, optional future AI credits. No plan-tier feature flags.

## ADR-005 — Payment provider boundary
**Status:** Proposed. **Decision:** Billing port/adapters, verified server webhooks, outbox and idempotent fulfillment. **Why:** Avoid gateway lock-in.

## ADR-006 — Human-reviewed AI claims
**Status:** Accepted product direction. **Decision:** AI calorie/allergen suggestions require human verification before publishing.

## New ADR template
Context / Decision / Alternatives / Consequences / Security impact / Migration / Approval date. Do not change accepted architecture without ADR review.

## 2026-10-25 new product decisions
- Single subscription edition and fixed price; optional AI credits.
- Admin and superadmin fixed shared visual theme; ten independently selectable public themes.
- One active image per product.
- Phone PWA is primary and fully capable, not reduced desktop UI.
- Optional Wi-Fi block, A4 menu/allergen PDFs, QR counts, and geofence settings are V1 scope.
- Open ADR: geofence behavior on denied permission, province/district intersection semantics, scan deduplication window and AI credit pricing.

## v4 decisions — 2026-10-25
- V1: T025–T029; V1.5: T030–T034. Subject to T000 scope approval.
- No feature-based paid tiers; all core features under single subscription. Future AI credits separate.
- Published menu history is immutable; rollback is a new publication.
- Anonymous analytics are aggregate-only by default; no fingerprinting.
- Pending ADR: sold-out inclusion in PDF, translation fallback wording, scheduled price vs physical printed menu synchronization, analytics counting dedup and notification classification.

## ADR-2026-10-25-QMENUX-DOMAINS — APPROVED
Brand `QMenuX`; apex `qmenux.com`; owner PWA `admin.qmenux.com`; superadmin PWA `superman.qmenux.com`; REST API `api.qmenux.com`; guest menus `{slug}.qmenux.com`. `workspace` and `control` are not canonical hosts. Superadmin obscurity is not a security control; require identity-aware access, mandatory MFA and backend platform RBAC. API must support secure, scoped future integrations with Telegram, WhatsApp and Bisetra's external software. External API/adapter release date, provider choice and auth grant flows are still OPEN.


## 2026-10-25 v6 binding decisions
- `qmenux.com` landing includes Login and Sign up with Google, Microsoft/Outlook and Apple federated identity support.
- Build order: menu and admin/superadmin panels first; marketing landing LAST. Core auth is implemented early.
- Initial onboarding is **superadmin approval + manual license grant only**, no payment gateway in V1.
- PayTR-like payment integration is a future optional phase; one SaaS edition remains.
- Pending ADR: exact signup entry redirect, email/password policy, Microsoft account audience, approval criteria, license length/price.

## 2026-10-25 v7 approved branding
- Cross-segment QMenuX serves coffee shops, cafés, bakeries/patisseries, brunch and restaurants including fast-food.
- Brand: terracotta #E86A33, charcoal #252420, ivory #F7F5F0; secondary red #C94B3B, mustard #D9A441, sage #66745C.
- One fixed management UI for admin and superadmin; 10 independently styled public menu themes.
- Business type only recommends starter categories and a public theme; owner may freely change.
- Marketing landing stays LAST. No change to superadmin manual approval or V1 no-payment policy.


## ADR-DEPLOY-008 (2026-10-25): Neon + Vercel
**Accepted:** Neon PostgreSQL as DB; Vercel for public QR menu, admin, superadmin, landing (last), and stateless NestJS REST API. Cloudflare R2 retained. **External worker host required but not selected**. Drizzle and Upstash are recommendations, not signed decisions. Supersedes generic VPS/container production assumptions. Detailed ADR: `docs/08-operations/DEPLOYMENT_DECISIONS.md`.

## 2026-10-25 v9 Git policy
- Existing Git repository is authoritative; no `git init`, history rewrite or destructive cleanup.
- Task branches and task-tagged Conventional Commits; stable default branch, PR/CI reviews.
- Agent must request authorization for commits, pushes and merges; no autonomous remote writes.
- T052 Git baseline precedes T001; T053 CI after runnable project scripts exist.

## T001 local-only foundation exception — 2026-10-25
Evidence: user answered “evet devam et” to the explicit request to build only the local T001 monorepo while T000/legal decisions remain open. This authorizes local scaffolding/dependency installation and checks; it does not approve legal rules, commercial defaults, tenant activation, production connections, commits, pushes, merges or deployment.

- T000 and LEG tasks remain open. Unknown company, license term/price/scope and provider policies are not hardcoded.
- Branch `feat/T001-monorepo-setup` starts from clean local `main` at `111542c`; local remote-tracking information was inspected, not refreshed. Existing documentation branch `docs/T052-repository-baseline` at `6521b1b` is preserved and was not merged. Root ignore rules were carried into this branch as required for safe installation.
- Scope: pnpm/Turbo, shared lint/TypeScript config, three minimal Next.js application shells and a stateless NestJS `/v1/health` endpoint. This is not an architecture change: no ORM/Redis/worker/provider choice made.
- T001's existing CI-green acceptance is retained. Local checks do not complete it; T053 real PR execution and reviewer evidence remain outstanding. Do not mark T001 DONE.
- Package versions were checked against official framework documentation and npm metadata. Node 24 is the pinned local target; no Vercel runtime compatibility claim until T047.
- Tooling risk: Next lint dependencies currently reject ESLint 10 peer versions; ESLint 9.39.5 is pinned for compatibility despite publisher deprecation. This is a dev-tool limitation requiring follow-up, not a production-readiness approval.
- Security: a transitive NestJS Multer advisory was found by `pnpm audit --prod`; targeted override to 2.5.0 applies the upstream patch (GHSA-q7qp-rjg7-q26m). No upload feature added. Record final audit results in PROGRESS.md.

## ADR-ORM-047 — Transaction driver candidate (proposed, 2026-10-25)
- Context: Neon/Vercel are approved; ORM/driver is not. Tenant context must stay inside one explicit transaction and fail closed across pooled reuse.
- Evidence: [T047 report](../08-operations/T047_SPIKE_REPORT.md); local Drizzle/pg and stable Prisma v7/adapter-pg typed APIs both pass the same disposable PostgreSQL RLS/rollback/reuse probe. No production schema or application ORM installed.
- Proposal: retain Drizzle + a transaction-capable PostgreSQL driver as the leading candidate for explicit SQL/RLS control; Prisma v7 remains viable. This is engineering judgment, not a performance conclusion from one local duration sample.
- Alternatives: Prisma adapter-pg; Neon WebSocket-capable drivers. Do not assume an HTTP single-query driver supports the interactive transaction contract used by this probe.
- Consequences/security: one application-owned transaction boundary must set tenant context, authorize operations and sanitize ORM errors; neither ORM replaces server authorization or RLS. Error objects may contain SQL/parameters.
- Migration: experiment schema is disposable only. Canonical migrations/rollback strategy still belong to T002; no historical data or application package is changed.
- Approval: PENDING owner/reviewer name/date. No final ORM choice. Native Preview packaging, migration tradeoffs and T048 Neon pooled/direct evidence remain outstanding.

## T047 dependent branch exception — 2026-10-25
Owner explicitly answered “Evet, bağımlı T047 dalını aç” to creating `feat/T047-vercel-nestjs-spike` from clean unmerged foundation commit `d9b2df4`. This permits the task-specific branch, not merging PR #1 or changing the default branch. Local spike work is authorized; new Vercel Preview projects were separately presented for approval. T000/legal gates and production/commit/push restrictions remain in force.

## T047 cloud scope decision — 2026-10-25
Owner explicitly answered “Hayır, şimdilik yalnızca yerel deneme” to the four-project Vercel Preview proposal. Scope is local experiments only. Do not create/link/deploy projects or substitute other hosted resources. The Preview plan is deferred, with no pending approval request; new explicit authorization is required to resume cloud work. This decision neither approves an ORM nor satisfies INFRA-001/T048, legal or production gates.
