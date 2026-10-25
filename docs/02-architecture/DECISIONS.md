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
