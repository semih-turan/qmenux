# QMenuX — Documentation Index

> Status: Draft v0.1 | Date: 2026-10-25 | Owner: Product/Engineering | Review before production.

## Product baseline
Single-price, single-edition, multi-tenant QR menu SaaS for cafés, coffee shops, bakeries, restaurants and other foodservice businesses. Public menus at `{slug}.qmenux.com`, business admin at `admin.qmenux.com`, restricted platform control at `superman.qmenux.com`. All administration is **mobile-primary PWA**. Future AI features consume separately purchased credits; payment gateway is provider-agnostic. The canonical production domain is `qmenux.com`.

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
Local scaffold: `apps/{menu-pwa,admin-pwa,superadmin-pwa,api}` and `packages/{config,ui}`. Landing, worker, contracts/themes/database packages and further infrastructure remain planned; they are added only when their tasks require them. These application names describe their target roles; installable PWA/offline/auth features are not implemented yet.

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

## Local development — T001
Use Node.js **24.22.1** (`.node-version`) and pnpm **10.29.2** (root `packageManager`). No database, OAuth, R2 or production credentials are needed. The scaffold contains only unavailable-state pages and an API liveness endpoint; it does not activate tenants or implement authentication.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

| Application | Local URL | Workspace |
|---|---|---|
| Customer menu shell | http://127.0.0.1:3000 | `@qmenux/menu-pwa` |
| Tenant management shell | http://127.0.0.1:3001 | `@qmenux/admin-pwa` |
| Platform management shell | http://127.0.0.1:3002 | `@qmenux/superadmin-pwa` |
| API health | http://127.0.0.1:3003/v1/health | `@qmenux/api` |

All development servers bind to loopback. `.env.example` contains public local configuration only; it is not needed to run these static shells. Do not place production secrets in local/preview configuration. API CORS and authenticated cross-domain sessions are intentionally not enabled by this foundation task.

```sh
pnpm lint
pnpm typecheck
pnpm exec playwright install chromium
pnpm test
pnpm build
pnpm audit
```

`pnpm test` runs the real HTTP API smoke test and Chromium tests for all three frontend shells at 320/375/390/430px. The browser tests start and stop their own dev servers; ports 3000–3002 must be free. These checks do not replace iOS/Android PWA, keyboard, assistive-technology, auth, tenant-isolation or deployment testing. `pnpm typecheck` generates Next route types first. Build outputs, generated `next-env.d.ts`, test output and local environment files are ignored.

After a build, run one application with `pnpm --filter @qmenux/menu-pwa start` (or another workspace name). API `start` serves its compiled entrypoint. A health response `{ "status": "ok" }` proves process liveness only, not database/dependency readiness. Production hosting remains subject to T047 and later release gates; no deployment configuration is asserted ready.

Tooling compatibility: TypeScript 5.9.3 is pinned within typescript-eslint's supported peer range. Next's current lint dependencies require ESLint 9; the pinned 9.39.5 release is deprecated by its publisher. Upgrade the lint dependency set together when compatible ESLint 10 support is available; do not suppress peer errors. This tooling limitation remains open before production readiness.

The workspace override pins NestJS's transitive Multer to 2.5.0 for [GHSA-q7qp-rjg7-q26m](https://github.com/advisories/GHSA-q7qp-rjg7-q26m); remove it when upstream includes the fix. No upload endpoint is implemented.

## CI preparation — T053
[GitHub Actions workflow](.github/workflows/ci.yml) defines `Quality` (locked install, dependency audit, lint, typecheck, API/browser tests, all builds) and `Secret scan` (redacted Gitleaks scan of fetched Git history). It runs on PRs, pushes and manual dispatch, without production secrets or deployment steps. Actions are pinned to commit SHAs; the Gitleaks release archive is SHA-256 verified. Node/pnpm use the repository pins. CI rejects focused Playwright tests (`test.only`).

Local validation and actual Ubuntu CI evidence are recorded in [PROGRESS.md](docs/01-product/PROGRESS.md#t053-hosted-ci-evidence--2026-10-25). Both the [PR run](https://github.com/semih-turan/qmenux/actions/runs/40195730650) and [push run](https://github.com/semih-turan/qmenux/actions/runs/40195729972) passed at commit `a7cc4b9`. T053 stays IN_REVIEW pending named/dated reviewer acceptance; main branch protection is not configured. See [Git workflow](docs/08-operations/GIT_WORKFLOW.md#t053-checks-and-branch-protection) for the required-check recommendations and first-run evidence checklist.

## T047 local infrastructure probes
The [T047 report](docs/08-operations/T047_SPIKE_REPORT.md) distinguishes local evidence from pending Vercel/Neon validation. `pnpm spike:api-trace` builds and starts a disposable copy of traced API runtime files; this is not a Vercel Function deployment. The [separately locked ORM probe](infrastructure/spikes/orm/README.md) compares Drizzle and stable Prisma v7 against a new private local PostgreSQL cluster, without selecting an application ORM. It requires local PostgreSQL tools and is not run by root CI. No production DB, credentials or tenant data are used.

## Current Vercel deployment
The owner authorized direct Vercel CLI Production-target development. The existing `qmenux` project builds `apps/menu-pwa` as Next.js on Node 24. At the latest hosting check its current immutable deployment serves the menu-unavailable shell, but `qmenux.vercel.app` returns DEPLOYMENT_NOT_FOUND and the menu project domain list is empty; see the progress record before relying on that old alias. This provider URL is a development/deployment address, not a new canonical QMenuX domain. The separate `qmenux-api` project provides [API liveness](https://qmenux-api.vercel.app/v1/health) and the development readiness/identity foundations described below. The separate `qmenux-admin` project now publishes the existing [business-management unavailable shell](https://qmenux-admin.vercel.app), without configured environment variables, sign-in, tenant operations or installable/offline PWA features. The separate [qmenux-superadmin.vercel.app](https://qmenux-superadmin.vercel.app) project also publishes only the platform-management unavailable shell, with zero configured environment variables and no privileged controls or sign-in. Actual Access/MFA/operator enablement remains gated; the marketing site remains pending. Provider URLs are diagnostic addresses; custom admin domain setup and real-user enablement remain separate.

`.vercelignore` excludes local environment files, caches, generated ORM artifacts and internal documentation from CLI uploads. Use `vercel deploy --dry --prod --json` to inspect inputs before publishing. Production deployment direction does not authorize Git writes or bypass real-business security/legal gates. See [the T047 report](docs/08-operations/T047_SPIKE_REPORT.md) for immutable deployment IDs, verification and remaining acceptance gaps.

The API uses native ESM (`type: module`, TypeScript NodeNext and explicit relative `.js` imports) for NestJS 12 on Vercel. Its HTTP smoke test disables CommonJS-to-ESM require compatibility to catch the runtime failure found during deployment. To deploy a workspace, name the project explicitly from the repository root, e.g. `vercel deploy --prod --yes --project qmenux-api --scope semihs-projects-fff996f3`; do not replace the menu project's settings with API settings. Health confirms process liveness only, not DB or tenant readiness.

## Development Neon readiness and isolation evidence

The existing API project now connects to **qmenux-dev**, through a restricted `qmenux_runtime` pooled credential stored only in the API project's owner-selected Vercel Production target. That provider target is used for development here; real-tenant launch is still gated. No owner/direct migration credential is attached to the API, menu build or Preview deployments by this change.

- `GET /v1/health` remains uncached liveness: `{ "status": "ok" }`.
- [`GET /v1/health/ready`](https://qmenux-api.vercel.app/v1/health/ready) returns uncached `200 { "status": "ready" }` only after a database role/context check; missing/invalid configuration, unsafe role or database failure returns minimal `503 { "status": "unavailable" }`. It exposes no URLs, role names or database errors.
- The API uses pg 8.23.1 with verified TLS/channel binding, max=2 pool, five-second connection/query deadlines, and Vercel's pool-suspension lifecycle helper. This is an infrastructure metadata query, not a tenant-data API or approved ORM selection.

The [manual Neon RLS probe](infrastructure/spikes/orm/README.md#authenticated-pooled-rls-and-direct-migration-probe) exercises synthetic tenant reads/writes with separate owner/runtime roles, pooled reuse, overlapping transactions and direct migration rollback. It removes its fixture schema/grants afterward. Cloud credentials never run in root CI. Execution/deployment evidence and remaining gates are in [PROGRESS.md](docs/01-product/PROGRESS.md#pooled-rls-direct-migrations-and-api-readiness--2026-10-25).

The workspace scopes a Zod override to `@vercel/cli-config` at 4.6.7 for [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), found through the Vercel helper's transitive dependency. Remove the override once upstream includes the patch. Full dependency audit passed after this fix.

## T003 development tenant boundary
The API now has an internal `TenantTransactions` service: canonical tenant host → active candidate lookup → transaction-local RLS → mandatory trusted server authorization → work → commit/rollback. No business controller is registered; membership, public publication and license policies remain separate gates. Hostname alone never grants access. See [tenant isolation](docs/02-architecture/MULTI_TENANCY.md) and [execution evidence](docs/01-product/PROGRESS.md#t003-tenant-resolution-and-transaction-isolation--2026-10-25).

Root `pnpm test` now also requires local PostgreSQL server/client tools (`initdb`, `pg_ctl`, `createdb`, `psql`) on PATH. Its integration test creates and removes a private socket-only cluster with synthetic data and no cloud credentials. CI exposes the Ubuntu runner's PostgreSQL binaries; this working-tree CI change has not run on GitHub.

## T004 development identity slice
The API includes Google Authorization Code + S256 PKCE, state/nonce and signed ID-token validation through pinned `openid-client`, with one-use browser-bound attempts and server-side revocable sessions. Migration 0003 creates the isolated identity module. Only issuer+subject identifies a user; provider tokens/email are not retained. Signing in creates only REGISTERED identity, never tenant membership, activation or license. [Implementation and remaining gates](docs/04-backend/IDENTITY_OIDC_ONBOARDING.md#t004-first-development-slice--2026-10-25).

`GET /v1/auth/providers` reports availability. Google start/callback/me and POST logout are disabled (503/no-store/no cookies) unless explicitly configured with all server-only values in `.env.example`. No provider configuration or remote environment was changed by this slice; Microsoft/Apple stay disabled. This is API groundwork: admin/mobile login, membership/RBAC, superadmin Access/MFA, rate limits, retention and provider/privacy acceptance remain required before real users. Do not enable real-user access from credentials alone. [Evidence](docs/01-product/PROGRESS.md#t004-google-oidc-and-durable-sessions--2026-10-25).

## T004 tenant authorization development slice
Internal TenantAuthorization now checks an unexpired server session, unsuspended user and ACTIVE per-tenant OWNER/EDITOR membership before a server-selected capability and mandatory entitlement policy. Memberships default PENDING; signup cannot create/promote them. Role/user-status changes revoke existing sessions. No membership mutation or private business HTTP route is exposed, and license implementation remains T010. [Role matrix and remaining gates](docs/04-backend/IDENTITY_OIDC_ONBOARDING.md#t004-tenant-membership-and-rbac-slice--2026-10-25).

## Current Microsoft development callback integration
The API now has Microsoft personal-account start/callback integration with0007 provider-bound storage and revocable normal API sessions. Both Google and Microsoft remain disabled on Vercel: GET start/callback returns503, HEAD405, metadata false. Configured synthetic tests cover both providers, including Microsoft-only session read/logout and cross-provider state isolation. No real Microsoft app registration/credential, tenant activation or mobile/admin BFF login was enabled. [Current contract and gates](docs/04-backend/IDENTITY_OIDC_ONBOARDING.md#t004-microsoft-callback-integration--2026-10-25).

## Current Apple development callback integration
Apple code/query callback now uses the owner-selected confidential nonce profile and0008 provider-bound one-use attempts/sessions. Google/Microsoft keep S256 PKCE. Server configs remain disabled on Vercel: all provider flagsfalse, GET start/callback503, HEAD405, Apple POST/form_post404. Synthetic signed HTTP/PostgreSQL tests cover Apple-only me/logout and cross-provider/replay isolation; real Apple account/Safari/mobile/BFF/provider/privacy/security acceptance remains pending. [Current contract](docs/04-backend/IDENTITY_OIDC_ONBOARDING.md#t004-apple-callback-http-integration--2026-10-25).

## Admin sign-in development entry

The admin app now contains a minimal Turkish sign-in/registered-access screen and a narrow server BFF at `/api/auth/*`. It remains unavailable by default: `ADMIN_AUTH_ENABLED=false`, empty independent `ADMIN_BFF_SECRET`, fixed canonical HTTPS admin/API origins, and no Preview enablement. No real provider, tenant activation or license is enabled. Never put the BFF key into public/build configuration. The screen grants no tenant or operator permissions. See the [BFF contract](docs/04-backend/ADMIN_BFF_SESSION_CONTRACT.md#admin-browser-bff-development-delivery--2026-10-26) for cookie/CSRF/timeout behavior, synthetic test scope, rollback and remaining real-provider/security/legal gates. Existing provider-URL development hosts cannot enable canonical-host browser auth.

## Shared management UI development foundation

`@qmenux/ui` owns the fixed admin/superadmin brand tokens, native button and management shell. Import `@qmenux/ui/admin.css` in management layouts and use its explicit component exports; public menus retain their independent styles. The package ships workspace TypeScript/CSS source for Next.js to bundle and has no new external library/version. Remaining controls are added with their actual consuming screens. [Brand specification](docs/03-frontend/BRAND_DESIGN_SYSTEM.md), [test/review evidence](docs/01-product/PROGRESS.md#t044-shared-management-foundation--2026-10-26).

## Draft catalog development use cases

The internal API `DraftCatalog` service now validates and authorizes product creates, reads, cursor lists, edits and immutable history. Migration0010 supplies revision conflicts and atomic old/new/actor audit; it has been exercised only in disposable local PostgreSQL. No product HTTP route, cloud migration, license grant, deletion or publication is enabled. Existing manual Neon probes remain guarded at0009. See the [draft catalog contract](docs/04-backend/DRAFT_CATALOG_CONTRACT.md) and [execution evidence](docs/01-product/PROGRESS.md#t005-draft-product-catalog-and-audit--2026-10-26).

The subsequent local0011 contract enables explicit admin-audience tenant membership and session-bound CSRF for internal catalog mutations, preserving API defaults and mandatory entitlement. It adds no public business route or license. See [admin tenant authorization](docs/02-architecture/MULTI_TENANCY.md#t004-admin-audience-tenant-authorization--2026-10-26).

`DraftStructure` and local-only0012 extend this to draft menus/categories with parent ownership, optimistic edits and immutable audit, completing the internal branch-fixture→menu→category→product path. No business/public endpoint or publication is enabled. [Structure contract](docs/04-backend/DRAFT_CATALOG_CONTRACT.md#draft-menus-and-categories-0012--2026-10-26).

## Pre-tenant application development

The internal0013 OnboardingApplications service supports current admin users' own draft create/edit, explicit pending submission and status listing, with idempotency, session-bound CSRF and immutable audit. It creates no tenant, membership, license or approval. The subsequent default-off HTTP/mobile adapters do not enable real-user data collection. [Contract, tests and remaining privacy/approval gates](docs/04-backend/ONBOARDING_APPLICATION_CONTRACT.md).

The dedicated internal application HTTP adapter is now registered but disabled by ADMIN_ONBOARDING_ENABLED=false and its empty independent ADMIN_ONBOARDING_SECRET. The sign-in key cannot authorize it. No browser application form or real-user setup is enabled by this API step. [Transport contract](docs/04-backend/ONBOARDING_APPLICATION_CONTRACT.md#dedicated-internal-http-adapter--2026-10-26).

The admin BFF and mobile applicant screen now implement own draft creation/editing, explicit submission and pending status, using the separate server-only application credential and existing host-only session/CSRF boundary. Both runtime flags remain off with empty keys. Uncertain creates retain one in-memory retry payload; conflicts preserve typed input. The shared UI now exports TextField for the actual business-name form. [Browser behavior, limits, tests and remaining release gates](docs/04-backend/ONBOARDING_APPLICATION_CONTRACT.md#admin-bff-and-mobile-applicant-delivery--2026-10-26).


## Operator passkey development prerequisite

The API now contains a disabled internal OperatorPasskeys verifier, backed by local-only0014 and pinned @simplewebauthn/server. It requires verified Access identity, an explicitly ACTIVE platform operator, independent enrollment grant, required passkey user verification and a browser-bound short-lived proof. It adds no operator route/BFF/UI, real key, tenant/license access or enabled configuration. `pnpm test` uses Chromium's native virtual authenticator inside the local API/PostgreSQL fixture; install the pinned browser first as above. [Protocol, enrollment/recovery, privacy, rollback and actual-provider/mobile release gates](docs/04-backend/OPERATOR_PASSKEY_CONTRACT.md).

The subsequent operator API adapter is implemented and tested in a private module with actual HTTP/native WebAuthn/local PostgreSQL. It remains deliberately unregistered in production AppModule under the named-review gate; its placeholder flags/key do not enable routes. Privileged BFF/mobile and reviewed enrollment/recovery/audit/step-up remain unfinished. See the operator contract for exact boundaries.

The superadmin browser BFF handler is now prepared for review with separate operator cookies, exact Origin/CSRF and minimal credential-free JSON. No route file registers it, so the application remains unavailable as before. Browser cookie fixtures validate the handler locally with synthetic upstream; actual routing/mobile UI/provider/recovery review remains pending.


The superadmin root includes a local-review mobile passkey sign-in/enrollment screen, shared controls, explicit cancel/retry/offline/expiry/logout states and no browser token persistence. The operator API/BFF remain unregistered: normal runtime shows unavailable with a retry control, not a working sign-in. Enrollment requires an independently provisioned grant and never creates a login.0017 allows a fresh start to replace the same browser/purpose's pending challenge; local database and browser tests cover this. Full registration transport, real devices/provider setup, recovery/session audit/step-up and named security/privacy/legal review remain pending. See `docs/04-backend/OPERATOR_PASSKEY_CONTRACT.md` for exact evidence and rollback limits.
