# QR Menu SaaS — Documentation Index

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## Product baseline
Single-price, single-edition, multi-tenant restaurant QR menu SaaS. Public menus at `{slug}.qmenux.com`, business admin at `admin.qmenux.com`, restricted platform control at `superman.qmenux.com`. All administration is **mobile-primary PWA**. Future AI features consume separately purchased credits; payment gateway is provider-agnostic. The canonical production domain is `qmenux.com`.

## Non-negotiables
- Public QR menu works without account or app installation.
- Tenant isolation at API and database; never trust a client-supplied tenant ID.
- One subscription product; no Starter/Pro/Enterprise tiers. Optional AI credit top-ups.
- Price and legally required food information are business-owned, human-verified data.
- Regulatory compliance must be reviewed against current official sources before release.
- Mobile workflows first; desktop is secondary.

## Document navigation
Start with `docs/01-product/PRD.md`, then `docs/02-architecture/ARCHITECTURE.md`, `docs/02-architecture/DOMAIN_MODEL.md`, `docs/02-architecture/MULTI_TENANCY.md`, `docs/03-frontend/UI_UX.md`, and `docs/07-quality/TESTING.md`. Follow `AGENTS.md` for agent behavior and `docs/01-product/TASKS.md` for execution.

## Repository target
`apps/{landing,menu-pwa,admin-pwa,superadmin-pwa,api,worker}`; `packages/{ui,contracts,themes,config,database}`; `infrastructure/`; `docs/`. These are planned directories, not implemented code.

## Open product decisions
Brand/domain, exact fixed price and billing interval, payment provider, legal entity/merchant account, grace-period policy, custom-domain launch timing, number of branches covered, retention periods, official regulatory legal sign-off.

## Task-driven execution and legal review
Begin with `docs/01-product/TASKS.md` (T000). Legal workflow documents are in `docs/05-compliance/`. Official source links are included, but their applicability requires legal/accounting review.

## v3 requirements update (2026-10-25)
See `docs/01-product/FEATURE_TRACEABILITY.md` for new feature/task/test links, `docs/02-architecture/GEOLOCATION_GEOFENCING.md` for geo policy, `docs/03-frontend/MOBILE_ADMIN_FLOWS.md` for phone-first operations, and `docs/03-frontend/PDF_EXPORT_SPEC.md` for A4 exports.
Ten public themes, one fixed admin theme, one active image/product, optional guest Wi-Fi, monthly/total QR scans, geofence settings, and optional AI credits are now binding scope decisions. AI generation remains a future phase.

## v4 update
Ten approved feature additions are documented in `docs/01-product/FEATURE_TRACEABILITY.md`, with implementation tasks T025–T034 in `TASKS.md`. New specs: `CATALOG_WORKFLOWS.md`, `PUBLIC_DISCOVERY.md`, `ENGAGEMENT_ANALYTICS.md`. Prior v3 requirements remain intact.

## Canonical QMenuX production endpoints (approved)
- Marketing: `https://qmenux.com`
- Business admin mobile PWA: `https://admin.qmenux.com`
- Platform superadmin mobile PWA: `https://superman.qmenux.com`
- Versioned API: `https://api.qmenux.com/v1`
- Guest menu: `https://{slug}.qmenux.com`

The API is designed for secure first-party and **future authorized** external integrations (Telegram, WhatsApp Business, other Bisetra software). See `docs/02-architecture/DOMAINS_AND_TRUST_BOUNDARIES.md`, `docs/06-integrations/PUBLIC_API_AND_CHANNELS.md` and `docs/04-backend/INTEGRATION_SECURITY.md`. Never use subdomain obscurity as an access-control mechanism.


## v6 delivery and onboarding decisions
- Landing at `qmenux.com` is **built last**, but will include Login and Sign up for Google, Microsoft/Outlook and Apple federated identity.
- Auth foundations and minimal entry screens ship early so `admin.qmenux.com` and `superman.qmenux.com` are usable.
- Initial business access requires superadmin approval and a manually granted license. **No online payments in V1**; PayTR-like gateway is later.
- New specs: `docs/03-frontend/LANDING_PAGE_SPEC.md`, `docs/04-backend/IDENTITY_OIDC_ONBOARDING.md`, `docs/04-backend/MANUAL_ACTIVATION_AND_FUTURE_PAYMENTS.md`.

## v7 brand / café + restaurant scope
QMenuX uses terracotta `#E86A33`, charcoal `#252420`, ivory `#F7F5F0` for a sector-neutral identity. Admin/superadmin use one design system; customers can choose from 10 public menu themes. Café/restaurant business type only affects editable onboarding recommendations. New specs: `BRAND_DESIGN_SYSTEM.md`, `PUBLIC_THEME_CATALOG.md`, `BUSINESS_TYPE_ONBOARDING.md`.


## v8 infrastructure (confirmed)
- **Neon PostgreSQL** database with RLS and tenant isolation.
- **Vercel** for public menu, admin PWA, superadmin PWA, eventual landing, and stateless NestJS REST API.
- **Cloudflare R2** for media/PDF. **External durable worker host** for background jobs (provider not yet chosen).
- ORM, Redis/queue provider, Vercel plan and region remain open decisions. Detailed operational spec: `docs/08-operations/VERCEL_NEON_INFRASTRUCTURE.md`.

## v9 Git workflow
An existing Git repository is assumed. Read `docs/08-operations/GIT_WORKFLOW.md` before Codex implementation. Work in per-task branches, preserve user modifications, use task-scoped Conventional Commits, and require explicit authorization before commits, pushes or merges. Root `.gitignore` is a template; merge it with existing ignore rules rather than overwriting custom rules.

## 2026-10-26 implementation status (agent-recorded)
Implemented locally and manually tested, pending reviewer approval: NestJS API, guest menu (`apps/menu`), business admin PWA (`apps/admin`), platform superadmin PWA (`apps/ops`, `superman.<root>`, TOTP-mandatory), PDF worker (`apps/worker`), CI workflow. CSV/XLSX import (T027) and the marketing landing (`apps/landing`, T043) were added later the same day. Not implemented: real OIDC provider keys, R2/Vercel/Neon/Cloudflare Access configuration, legal sign-offs. See `docs/01-product/PROGRESS.md` (2026-10-26) and `docs/02-architecture/DECISIONS.md` (OD-17..25).

### Local run (all apps)
`pnpm db:start`, `pnpm db:migrate`, `pnpm db:seed`; then API `pnpm --filter @qmenux/api build && pnpm --filter @qmenux/api start` (127.0.0.1:4000), menu `next start -p 3000`, admin `next dev -p 3001`, ops `next dev -p 3002` (`http://superman.qmenux.localhost:3002`), landing `next dev -p 3003` (`http://qmenux.localhost:3003`), worker `pnpm --filter @qmenux/worker build && pnpm --filter @qmenux/worker start`. Operator TOTP enrolment: `pnpm --filter @qmenux/api ops:totp <operator-user-id>`.

## First MVP source baseline (2026-10-26)
This is a development MVP, not a production launch approval. Use Node from `.node-version` and the pnpm version in `package.json`; run `pnpm install --frozen-lockfile`. Copy `.env.example` to `.env`, fill the three independent random keys, and set `QX_DEV_IDP=1` only for local testing. Export the local values in each app terminal (`set -a; source .env; set +a` from the repository root) so Next.js servers receive them. Set `QX_MEDIA_DIR` to the same absolute local directory for API and worker. Run `pnpm db:start`, `pnpm build`, `pnpm db:migrate`, then `pnpm db:seed` on the disposable local database only. Start apps using their package scripts; the ports are listed above.

Quality checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm audit --audit-level=low`. Tests reset **only disposable** `qmenux_test` and `qmenux_api_test` databases; never supply production URLs. CI provisions PostgreSQL 17 and runs these suites sequentially because database roles are cluster-wide. Browser/mobile acceptance remains a separate pre-release gate; the current CI runs unit and API/database integration tests.

Gitleaks scans fetched history; `.gitleaksignore` contains only 25 reviewed historical false-positive fingerprints (SQL migration names and public deployment IDs). Production remains gated on R2, real OIDC provider verification, protected superadmin access, infrastructure/restore evidence and legal approvals. The previous schema under `infrastructure/database` has been replaced; an existing database requires a reviewed data migration before adopting the new `qx` schema. No production database migration or deployment is authorised by these local setup instructions.
