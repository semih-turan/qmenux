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

## 2026-10-26 implementation-start log (T052/T000) — agent-recorded, NOT approved
Recorded by the coding agent when implementation started on explicit user request. Nothing below is an approval; each item stays **OPEN** until a named owner signs it with a date.

| ID | Topic | Status | Interim implementation default (reversible) |
|---|---|---|---|
| OD-01 | T000 scope sign-off | OPEN | Code follows TASKS.md order; no task marked DONE. |
| OD-02 | Git baseline (T052) | OPEN | No `.git` directory exists in the working copy although v9 policy assumes one. Agent did **not** run `git init`, commit or push. Owner must initialise/attach the repository. |
| OD-03 | ORM (T047) | OPEN (proposal) | Raw `pg` + hand-written, reversible SQL migrations (`packages/database/migrations/NNNN_name.{up,down}.sql`). Keeps RLS/`SET LOCAL` explicit; Drizzle can be adopted later without schema change. |
| OD-04 | Redis / queue provider (T049) | OPEN | No Redis. Durable `outbox_events` table polled by `apps/worker` with `FOR UPDATE SKIP LOCKED`. |
| OD-05 | Worker host (T049) | OPEN | `apps/worker` is a plain Node process (Docker-able); no host chosen. |
| OD-06 | Neon/Vercel region & plan | OPEN | Not configured; env placeholders only. |
| OD-07 | License length / price / grace days | OPEN | Superadmin enters `ends_at` per grant; grace = `QX_LICENSE_GRACE_DAYS` (default 7, placeholder). No price stored as fact. |
| OD-08 | Geofence: permission denied behaviour | OPEN | Show explanation + retry; menu stays hidden while geofence is ON. |
| OD-09 | Geofence: COMBINED semantics | OPEN | AND (radius AND region). Region mode disabled until a boundary dataset is provided (no dataset in repo). |
| OD-10 | Sold-out items in PDFs | OPEN | Included with "Tükendi" marker is NOT assumed; default = excluded HIDDEN, included SOLD_OUT with marker. Configurable per export. |
| OD-11 | QR scan dedupe window | OPEN | One count per client event id per browser session (sessionStorage); bot UA filtered; Europe/Istanbul day buckets. |
| OD-12 | Microsoft account audience | OPEN | `common` tenant placeholder via env; must be decided. |
| OD-13 | Email/password login | OPEN | Not implemented; federated OIDC only (+ dev-only mock IdP, refused when `NODE_ENV=production`). |
| OD-14 | Legal texts (KVKK, cookie, terms) | OPEN | UI shows placeholder "Hukuki inceleme bekliyor" texts; no binding text generated. |
| OD-15 | Superadmin MFA method | OPEN | TOTP mandatory for operators; WebAuthn/passkey noted as follow-up. |
| OD-16 | AI credits | OUT OF V1 | No AI features implemented; no charging code. |

## 2026-10-26 operator panel + worker decisions — agent-recorded, NOT approved
| ID | Topic | Status | Interim implementation default (reversible) |
|---|---|---|---|
| OD-17 | Identity-aware proxy for `superman` | OPEN | Not configured (deployment item). Code-level defences in place: ops session audience, mandatory TOTP, server-side role checks, `__Host-qx_ops` host-only cookie, BFF allowlist limited to `/v1/control`, MFA verification only via server route `/auth/mfa` (token rotation never reaches the browser), no service worker, `no-store` on every operator response, `noindex`. |
| OD-18 | Step-up for licence grants | Interim | A fresh TOTP code in the grant body, even inside an MFA session; API verifies and burns the time-step (10 attempts / 5 min per operator). |
| OD-19 | Licence period semantics | Interim | Extensions start at the later of now / current end; a not-yet-started period shows as "Planlı" and can be revoked separately; dates end at 23:59:59 of the chosen day in the operator's zone. |
| OD-20 | Support role | Interim | `PLATFORM_SUPPORT` is read-only in UI and API; only `PLATFORM_ADMIN` approves, grants, revokes, suspends. |
| OD-21 | Worker queue | Interim | `apps/worker` polls `qx.outbox_events` (`FOR UPDATE SKIP LOCKED`, 5 attempts, 1-minute backoff, 10-minute lock expiry). Only `pdf.requested` has a consumer; other events are acknowledged. |
| OD-22 | PDF rendering | Interim | pdfkit with the Geist font (SIL OFL, bundled from Next.js) because PDF standard fonts lack ş/ğ/İ. A4, 48pt margins; menu PDF lists price, description, "contains" allergens and unverified notice; allergen PDF prints ●/○/? for the 14 allergens with the legend that unverified ≠ free. Files expire after 30 days (`expires_at`). |
| OD-23 | PDF storage/serving | Interim | Same local media tree as images (`QX_MEDIA_DIR`), tenant-prefixed unguessable keys; `.pdf` keys are refused by the public `/v1/media` route and served only via `GET /v1/admin/exports/:id/file` (tenant RLS, `attachment`, `no-store`). R2 still open (D-API-04). |
| OD-24 | Audit cursor | Fix | `GET /v1/control/audit?before=` is an id cursor (bigint), matching `listAudit`; it was validated as a datetime. |
| OD-25 | Shared UI helpers | Done | `.qx-stack/.qx-item/.qx-check/.qx-row/.qx-grid-2` moved from `apps/admin/admin.css` into `@qmenux/ui` so admin and superadmin share one fixed design system (v7). |

## 2026-10-26 import + landing decisions — agent-recorded, NOT approved
| ID | Topic | Status | Interim implementation default (reversible) |
|---|---|---|---|
| OD-26 | Import file handling | Interim | CSV (UTF-8/BOM or Windows-1254 fallback; `;`/`,`/tab sniffed) and XLSX first sheet via exceljs; ≤2 MB, ≤2000 rows, ≤20 columns. Formulas never evaluated (cached result only), cell text sanitised (control chars, leading `=`/`@`). Parsed grid stored in `qx.import_batches.rows`; no original file kept. |
| OD-27 | Import price parsing | Interim | Minor units; "12,50"/"12.50" decimal; both separators → last one decimal; a lone separator with three trailing digits = thousands ("1.250"). |
| OD-28 | Import commit semantics | Interim | Draft only, never publishes. Categories matched case-insensitively by name; same-name product in the same category → update price/description/tags or skip (owner's choice); image, allergens and calories untouched; rows with errors skipped; audit `import.apply`/`import.discard`. |
| OD-29 | Landing architecture | Interim | Separate static Next app `apps/landing` (qmenux.com, local port 3003); own marketing CSS on top of `@qmenux/ui` tokens; no cookies, analytics or third-party scripts; `/giris` redirects to the admin login (single identity store); `/kayit` explains approval before sending to admin login + onboarding. |
| OD-30 | Landing claims | Interim | No price shown until T000 fixes it; roadmap items (i18n, scheduling, payments, AI) listed as "yol haritası"; legal pages are explicit drafts (LEG-012 pending). |
