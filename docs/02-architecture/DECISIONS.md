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

### ADR-ORM-047 review proposal — 2026-10-25

**Status: Proposed; reviewer/name/date pending. ORM remains OPEN.** This review recommends **Drizzle + node-postgres (`pg`)** for the next database implementation, subject to explicit ADR acceptance. It does not install an application ORM or start T002/T003/T048.

| Criterion | Drizzle + pg | Prisma v7 + adapter-pg | Assessment |
|---|---|---|---|
| Typed queries and transaction-local RLS | Existing probe passes using `db.transaction` and its transaction handle | Same probe passes using interactive `$transaction` and its transaction handle | No isolation winner in the tested scope |
| Schema/client workflow in this repository | TypeScript table definition consumed directly by the probe | Prisma schema plus generated client, generated before typecheck | Drizzle avoids a separate client-generation step here |
| Reviewed migrations | Drizzle Kit can generate SQL for review | Prisma Migrate can create draft SQL for editing before application | Both need explicit role/RLS review and a rollback drill; neither workflow was executed |
| SQL/RLS maintenance | Existing typed queries and parameterized context SQL remain close to PostgreSQL | Typed model queries plus parameterized context SQL also work | Prefer Drizzle for this project's SQL-focused approach; engineering judgment |
| Serverless/Neon suitability | ORM-enabled Function and Neon pooled endpoint NOT TESTED | ORM-enabled Function and Neon pooled endpoint NOT TESTED | Health-only deployments do not decide this criterion |

**Proposed contract:** use the tested transaction-capable `pg` driver initially; runtime uses the isolated environment's pooled URL, migration tooling uses its direct URL. Resolve and authorize tenant context server-side, set it with parameterized transaction-local SQL before tenant queries, and use only the same transaction handle for those queries. Runtime credentials must not own tables or bypass RLS. Sanitize errors before logging. An ORM change cannot substitute for these controls.

**Tradeoffs:** QMenuX owns SQL policy/migration review and transaction discipline with either candidate. Prisma remains a viable alternative if the team prefers its generated model/client workflow. Do not choose from the local 11ms/84ms diagnostics or claim a bundle-size/cost advantage without an ORM-enabled artifact measurement. Keep the experiment pins unchanged; check compatibility and advisories before application installation.

**Acceptance and follow-up:** record reviewer name/date and acceptance or rejection here before adopting the proposal. T002 must generate/review an isolated migration including grants, RLS and tenant constraints, apply it through a direct connection, and demonstrate rollback/data preservation. T003/T048 must prove missing/invalid context denial, cross-tenant reads/writes, commit/rollback cleanup, overlapping tenant transactions and connection reuse on Neon pooled runtime with an unprivileged role. T047 still needs ORM-enabled native Function packaging, controlled startup/plan-limit evidence and reviewer acceptance; its Preview criterion is not silently waived by Production-target evidence.

**Migration/rollback for this step:** documentation only; no application package, migration or live data changed. Reverse only this proposal and its linked evidence records if rejected.

Sources checked 2026-10-25: [Drizzle transactions](https://orm.drizzle.team/docs/transactions), [Drizzle SQL generation](https://orm.drizzle.team/docs/drizzle-kit-generate), [Prisma v7 interactive transactions](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions), [Prisma v7 migration customization](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/customizing-migrations), [Neon transaction pooling and pooled/direct connections](https://neon.com/docs/connect/connection-pooling). Prisma's unversioned transaction URL currently redirects to v8 documentation; the proposal deliberately uses v7 documentation matching the pinned probe. Official documentation supports workflow descriptions, not unexecuted acceptance claims.

## T047 dependent branch exception — 2026-10-25
Owner explicitly answered “Evet, bağımlı T047 dalını aç” to creating `feat/T047-vercel-nestjs-spike` from clean unmerged foundation commit `d9b2df4`. This permits the task-specific branch, not merging PR #1 or changing the default branch. Local spike work is authorized; new Vercel Preview projects were separately presented for approval. T000/legal gates and production/commit/push restrictions remain in force.

## T047 cloud scope decision — 2026-10-25
Owner explicitly answered “Hayır, şimdilik yalnızca yerel deneme” to the four-project Vercel Preview proposal. Scope is local experiments only. Do not create/link/deploy projects or substitute other hosted resources. The Preview plan is deferred, with no pending approval request; new explicit authorization is required to resume cloud work. This decision neither approves an ORM nor satisfies INFRA-001/T048, legal or production gates.

## Existing Vercel project direction — 2026-10-25
- Owner stated they connected QMenuX to Vercel and requested development on the provider's Production target. This supersedes the earlier local-only preference for work on the existing qmenux project. The four separate qmenux-t047-* projects remain uncreated; no new projects, Git merge/commit/push, database credentials or real-business activation are inferred.
- ORM preference question was superseded by this deployment steering; no Drizzle/Prisma choice was supplied. ADR-ORM-047 remains Proposed, not approved.
- Read-only inspection found existing qmenux deployment serving main as Other from repository root, not the Next.js app. Root returned 404; AGENTS.md and docs/01-product/PRD.md returned 200. No successful application build can be inferred from that deployment's Ready status.
- Applied a bounded, reversible configuration correction to the existing project only: framework nextjs and rootDirectory apps/menu-pwa; Node 24.x retained. This assigns the existing provider project to the first public menu shell; it does not make qmenux.vercel.app a canonical product domain or implement the landing.
- No deployment triggered. Current live static deployment remains unchanged until an authorized source publication/rebuild; production settings correction is not a release acceptance. Source is absent from main and PR #1 has a failed PR Quality check despite its successful push check. Preserve required Git review/check/merge gates; no automatic merge.
- Production target labeling does not satisfy T000/legal/security release gates. Current app has no operational identity/RLS/approval/license enforcement; real tenant use cannot be marked approved. Vercel-native API packaging, Neon pooled/direct proof and ORM production acceptance remain open.

## Owner-authorized CLI Production deployment — 2026-10-25
- Evidence: owner explicitly instructed “vercel cli üzreinden direk production da geliştirmeye devam et.” Vercel CLI Production mode is authorized for work on the existing qmenux project within subsequently authorized task scope. This supersedes local-only hosting for that project and permits this deployment from the working tree without first merging main; Git commit/push/merge authorization is still separate. No general waiver of release/security/legal gates, database migrations or activation follows.
- Deployed existing customer menu-unavailable shell, framework Next.js/root apps/menu-pwa/Node 24.x. No landing, API, admin or superadmin project created; no DB use or tenant activation implemented. Provider URL remains diagnostic, not canonical domain assignment.
- Added .vercelignore so credentials, caches, generated spike outputs and internal docs are not upload inputs. Vercel link automatically created an ignored development env file and downloaded a fresh provider OIDC token; task-created .env.local removed without logging/using its values. Remote environment settings were not changed.
- New Production deployment dpl_83G3UTU1t9HXxfuYTes7R4esHhTa is READY and serves qmenux.vercel.app. Owner separately approved deletion of only old static deployment dpl_ABkso91tmnt8Q7AydhywMeWFQccc after its immutable URL was confirmed to expose docs; deleted exactly that deployment. New alias unaffected; Git history untouched.
- ORM remains OPEN; existing provider Neon env variables are not RLS/pooling/identity evidence. No task DONE or legal approval inferred.

## T047 native API runtime correction — 2026-10-25
- User requested the next step under the already chosen direct CLI Production mode. Created one separate health-only qmenux-api project (NestJS, apps/api, Node 24.x, frozen pnpm install) without Git integration, DB credentials or canonical-domain changes. Existing menu project/settings retained.
- Native NestJS build initially passed but invocation failed with ERR_REQUIRE_ESM: CommonJS entrypoint tried requiring NestJS 12 ESM. Corrected API package to type module, compiler module/moduleResolution to NodeNext and all three local import sites to .js specifiers. No custom serverless adapter or framework downgrade introduced.
- Regression guard: existing real HTTP API test runs with --no-experimental-require-module, so local Node compatibility cannot hide the CommonJS/ESM mismatch. Local tests/build and actual serverless health/concurrency passed after correction.
- Runtime choice implements accepted Vercel/NestJS direction; it does not approve ORM, data region, licensing, legal rules or tenant access. T047 retains outstanding acceptance/reviewer items; T048 not run.

## Development database-readiness boundary — 2026-10-25
- Owner authorized remaining Vercel/Neon development work without routine confirmation. Extended only infrastructure verification and API readiness: pg driver metadata query, no tenant/application tables, ORM or external-client access. ADR-ORM-047 stays Proposed; using the already-probed pg driver for readiness does not select a canonical application ORM.
- Owner direct credentials are used only by local development fixture/migration tooling; API receives the separate qmenux_runtime pooled Secret on the existing owner-selected Production target. No owner URL or production-tenant secret was copied into API/Preview/browser builds. Existing menu integration configuration was preserved; its full environment separation is not asserted complete.
- New `/v1/health/ready` reports minimal uncached ready/unavailable status; `/v1/health` stays process liveness. Runtime connection settings and role/context are checked before a ready response. Vercel's attachDatabasePool hook handles suspension cleanup; pg query/connection timeouts and pool size are bounded. Future tenant operations still require server authorization plus one transaction-local RLS boundary; readiness is not that boundary.
- This implements the approved Neon/Vercel platform choice, without business activation/schema or legal approval. Canonical schema/migrations and any broader database application contract require their task/ADR review. [Evidence](../01-product/PROGRESS.md#pooled-rls-direct-migrations-and-api-readiness--2026-10-25).

## ADR-TENANT-003 — Proposed: narrow development tenant bootstrap
Status: Proposed, reviewer/name/date pending; not approved production architecture. Date 2026-10-25.

Existing tenant RLS requires a server-derived UUID before tenant-scoped queries can run. Proposed contract: the tenancy module alone calls `qmenux.resolve_tenant_slug(text)`, a fixed static owner-definer lookup of ACTIVE slug to UUID, with `search_path=pg_catalog,pg_temp`, fully qualified table, PUBLIC execute revoked and runtime-only execution grant. This is an explicit proposed bootstrap read contract, not general cross-module table access. All subsequent context, authorization and work stay on one checked-out transaction. RLS remains forced on business tables; runtime cannot activate tenants.

Host selects a candidate only. The internal service requires trusted server policy and has no registered business controller until identity/membership/license or published-public-read policy is reviewed. Forwarded headers and client tenant IDs cannot supply tenant authority. Custom domains/admin tenant selection remain unimplemented. No ORM/provider, identity, license or legal decision is finalized.

Owner authorized development implementation and the dependent task branch from 467f1e2 (“evet”); this is not reviewer architecture approval. Alternative broad tenant SELECT/policy bypass is rejected. Rollback removes callers, then only migration 0002 resolver/ledger entry. [Tests/evidence](../01-product/PROGRESS.md#t003-tenant-resolution-and-transaction-isolation--2026-10-25).

## ADR-IDENTITY-004 — Proposed: disabled Google API sessions development slice
Status Proposed; reviewer/name/date pending. Date 2026-10-25.

Use established openid-client 6.8.8 for Google's real Authorization Code/PKCE validation rather than custom token cryptography. Persist one-use browser-bound attempts, stable issuer+subject users and hashed opaque sessions in an identity-owned `qmenux_identity` schema. Five fixed-search-path owner-definer functions form the identity module's runtime contract; runtime has no table permissions and PUBLIC has no function execution. Tables are global identity/security records, not tenant records; they contain no membership/license/platform grants. Existing tenant FORCE RLS is unchanged. Other modules must not query these tables directly.

The API host owns its own cookies and exposes only REGISTERED identity/no entitlement. Separate admin BFF and operator audience/Access/MFA remain required; a social login cannot grant tenant/platform privileges. Authentication is disabled by default and not enabled on Vercel. No ORM, identity federation for Microsoft/Apple, provider/privacy or production review is approved by this implementation. Scope includes synthetic-only development migration/test execution under the owner's continue-without-routine-confirmation direction. The existing dependent-branch pattern continues from 9638d18 (T003 committed externally before branch creation); prior work is preserved.

Rollback disables/removes callers then applies empty-only 0003 down; never delete identity records to bypass the guard. Before real-user enablement: reviewed retention/deletion, distributed rate limits, secure admin handoff, role/license contracts, provider configuration and named architecture/security/legal acceptance. [Evidence](../01-product/PROGRESS.md#t004-google-oidc-and-durable-sessions--2026-10-25).

## ADR-AUTHZ-004 — Proposed: tenant membership read contract
Status Proposed, reviewer/name/date pending, 2026-10-25. Continues T004 on feat/T004-identity-foundation from externally committed 9cf9171; no new branch or Git publication needed for this cohesive task slice.

Identity owns tenant/user membership records (OWNER/EDITOR, pending by default), with relational FK references to the existing tenant/user keys. Runtime gets no membership table privileges. Only identity-owned `tenant_membership(hash)` reads its own users/sessions/memberships and returns current user UUID/role for the transaction-local tenant. The fixed-search-path definer function has PUBLIC execution revoked and an explicit tenant predicate independent of owner RLS bypass. Membership table also uses FORCE RLS. This is a proposed application contract, not permission for other modules to query identity tables.

Private management code must use TenantAuthorization and a server-selected known capability plus a mandatory reviewed entitlement policy on the same client. Existing raw TenantTransactions remains a lower-level boundary for trusted application policies/public-read work; it is not sufficient private API authorization by itself. No production business controller is registered. Actual license policy remains T010; none is default-allowed or fabricated by this change. OWNER grants no platform or license authority. No role configuration framework/additional roles added.

Database triggers revoke sessions on membership and user-status changes, covering direct owner maintenance as well as eventual audited application writes. Changes affect subsequent transactions; already-admitted in-flight work is not aborted. No membership-write API or runtime grants are added until an audited privileged/invitation contract is implemented. Rollback removes callers and applies empty-only 0004 down; baseline migrations remain immutable. Production/provider/legal approval is not implied.

## ADR-OPERATOR-004 — Proposed: independent Access signature boundary
Status Proposed; reviewer/name/date pending. Date 2026-10-25. Continues the existing T004 branch from externally committed b8d87a2.

Use the already installed jose 6.2.13 as a declared direct dependency for an internal Cloudflare Access identity verifier, separate from Google OIDC and tenant opaque sessions. Server-only issuer/operator AUD pinning, remote-key validation with bounded fetch/cache and signed claim checks precede any future platform authorization. Verified issuer+subject carries no platform permission, MFA proof or step-up. No request controller, database migration, operator grant, Cloudflare configuration or new session is part of this slice. Actual operator sessions and role/MFA/step-up contracts remain required; do not use this verifier alone as authorization.

The fifteen-minute issuance-age limit is a proposed fail-closed application constraint, not evidence of an existing Access policy or fresh IdP authentication. The future deployment must align Access refresh/session behavior and verify actual phishing-resistant MFA independently. This choice does not finalize an identity-aware proxy setup or approve real-user rollout. Rollback removes the unused provider/dependency/config entries after checking later callers; no data deletion. [Contract and limitations](../04-backend/IDENTITY_OIDC_ONBOARDING.md#t004-operator-access-verifier-slice--2026-10-25).

## ADR-OPERATOR-SESSION-004 — Proposed: separate operator security records
Status Proposed; reviewer/name/date pending. Date 2026-10-25. Continues the clean existing T004 branch from externally committed 0a1890c; owner asked for the next step and offered Cloudflare setup assistance.

Keep provisioned platform operator identities and short opaque sessions separate from tenant/Google users and membership records. Bind each session to the verified Access issuer/subject/application audience, store only its hash and check current provisioned role/status per transaction. Identity verification now returns the verified audience so replacing an Access application cannot reuse sessions minted for its predecessor. Three explicit operator-owned SQL functions are the sole runtime data contract; no other module directly accesses these tables and no new tenant bypass is granted.

Require an explicit trusted server MFA policy at the internal application boundary without a production default. This defines the dependency, not a real MFA implementation. No operator controller may be registered until the concrete MFA/Access/BFF/audit policy is verified; a constant-true callback is test-only. Only platform:read is recognized; privileged mutations require separately implemented step-up/idempotency/audit. Empty-only migration rollback protects actual records. This proposal neither approves Cloudflare configuration/legal rollout nor marks T004/T036 complete. [Contract](../04-backend/IDENTITY_OIDC_ONBOARDING.md#t004-separate-operator-sessions-and-role-contract--2026-10-25).
