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

## T052 review findings — 2026-10-25
Status: OPEN review record, not an approval of new architecture or legal rules. Owner: Product/Engineering; named reviewer and dated decisions pending. Record decisions here and synchronize TASKS.md/ROADMAP.md before affected implementation. T052 authorization covers repository governance only.

| Finding | Required decision or clarification | Gate |
|---|---|---|
| Legal IDs have two meanings | TASKS LEG-001 is source-register work; LEGAL_REQUIREMENTS_REGISTER LEG-001 is printed-menu obligation. Separate task/requirement namespaces and map CT tests explicitly; do not infer equivalence from matching IDs. No IDs renamed in T052. | Before legal-sensitive implementation or compliance completion claims |
| T001/T053 CI overlap | T001 currently includes CI and requires CI green; T053 depends on T001 and implements CI. Proposed: T001 provides locally verified scripts/scaffold; T053 owns actual PR CI execution. Acceptance change requires owner approval. | Before T001 acceptance |
| ORM selection order | Proposed: T001 → T047 deployment/ORM spike → ORM-dependent T002 schema → T003 isolation → T048 Neon pool proof. Do not choose ORM incidentally in scaffold. | Before schema implementation |
| Identity and approval sequencing | Make amended T006/T011 auth and T044 UI dependencies explicit. Build relevant T040 auth and T011 operator shell before T041 approval; enable tenant operation only through T041/T042. | Before operational panels |
| Publication and async dependencies | T018 needs immutable published snapshots (T026 or an explicitly approved earlier contract). T018/T027/T031/T034/T024 require T049 before production activation, as v8 already states. | Before affected feature activation |
| T046 contract timing | Proposed: define registry contracts before T020, finish ten-theme regression evidence afterward; current task depends on T020. | Before theme implementation |
| Missing T023 | Confirm intentionally unused/reserved; do not invent a task. | Backlog review |
| Legacy wording | PRD/THEME_SYSTEM opening sections aligned with exactly ten catalog IDs during T000 preparation on 2026-10-25, using existing v3/v7 decisions; no new scope approval inferred. DEPLOYMENT legacy containers/hosts are superseded by v8/canonical domains. Future billing sections do not authorize V1 checkout. | Consolidate before affected work; keep explicit overrides authoritative |
| Approval metadata | ADR-001/002 remain Proposed although the user's architecture-review instruction identifies modular monolith/RLS as approved stack. Record formal reviewer/date/evidence; do not fabricate signed approval or mark T000 complete. | T000 architecture sign-off |
| Session and public routing contract | Decide management-origin session/BFF arrangement and trusted tenant forwarding to api.qmenux.com; API host alone cannot resolve the guest tenant. BFF is a candidate, not an accepted architecture. | Before auth/public API implementation |

T000 decision checklist remains open: legal entity, price/term, tenant/branch licensing, merchant approval and initial privileged-operator bootstrap, expiry/grace/public-menu behavior, Microsoft account audience, password policy, redirect/session contract, region/transfer review, retention, geofence denial/accuracy/AND-OR policy, Wi-Fi reveal policy, scan counting/deduplication and sold-out PDF rules. Worker/Redis/ORM/plan choices require their designated spikes. No legal item is approved by this review.

## T000 decision worksheet — 2026-10-25
Status: IN_PROGRESS; user authorized moving to the next review step. This worksheet is preparation, not signed approval. Continue on the existing documentation branch to preserve uncommitted T052 work; no new branch, commit or merge performed.

### Confirmed baseline
QMenuX/canonical hosts, café-and-restaurant scope, TypeScript/Next.js/NestJS modular monolith with hexagonal boundaries, pnpm/Turborepo, Neon/RLS, Vercel HTTP hosting, R2, ten public themes/one fixed management design, manual privileged approval/licensing, no V1 checkout, early identity and landing last. These derive from the explicit architecture-review request and binding v6–v9 decisions; they do not demonstrate deployment or legal readiness.

### Owner inputs required
| Decision | Current state | Proposed option for review | Evidence |
|---|---|---|---|
| Operating legal entity | Unknown; Bisetra is mentioned as a possibility only | Supply contracting entity, or explicitly record not yet established; do not add tax/personal identifiers to Git | Awaiting owner; counsel/accountant review separate |
| License scope | Tenant/branch coverage undecided | One license per tenant; one operational branch in V1; extra-branch entitlement undecided | Awaiting owner |
| License period and price | Undecided | Annual manually granted license; price remains unpublished/TBD until separately decided | Awaiting owner; no free-trial promise |
| Merchant approval | Superadmin approval mandatory; criteria undecided | Manual business/contact/classification review, explicit approval then separate dated license grant | Awaiting owner; legal review of collected data pending |
| Microsoft audience | Outlook personal required; organizational accounts optional | Personal + work/school if owner wants both, with explicit issuer/audience validation | Awaiting owner; provider tests pending |
| Password policy | Optional email/password not decided | Federated Google/Microsoft/Apple only initially; platform MFA/access remains separate | Awaiting owner; recovery and account-linking design pending |

### Decisions reserved for relevant work
- Before license implementation: grace period, expiry/suspension public-menu policy, term calculation and initial operator provisioning.
- Before schema/deployment: T047 ORM/driver proof, regions/plan and legal transfer review; no production services authorized.
- Before async feature activation: T049 worker/queue choice, budget, recovery and outbox delivery evidence.
- Before sensitive features: counsel-reviewed rule/task ID mapping, retention/subprocessors, geofence permission/accuracy/combination policy, Wi-Fi reveal, analytics validity/dedup and PDF sold-out rules.
- Before T001 acceptance: owner decision on T001/T053 CI ownership proposal. T000/LEG-001–005 gates remain in force; worksheet preparation does not waive them.

Approval format: decision ID/topic, selected value, reviewer name/role, date, evidence reference. Unknown answers remain OPEN; no inferred legal or architectural sign-off. T000 is not DONE.
