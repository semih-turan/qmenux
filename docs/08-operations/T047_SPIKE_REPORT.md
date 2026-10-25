# T047 — Local runtime and ORM spike

Date: 2026-10-25. Status: IN_PROGRESS; customer menu and native NestJS Production deployment verified after owner-authorized CLI continuation; Neon/ORM, controlled cold-start/limits evidence and reviewer acceptance pending. No production readiness or final ORM approval.

## Scope and Git authorization

The owner requested the next infrastructure step and explicitly approved branching from clean `d9b2df4` on the unmerged foundation branch. Work is on `feat/T047-vercel-nestjs-spike`; the default-branch-only rule has this one task-scoped exception. PR #1 remains unmerged. No commit/push/merge or production connection is authorized by this spike.

Application code, root AGENTS.md, production domains, existing Vercel projects and production secrets remain untouched. Both ORMs live only in a separately locked experiment workspace under `infrastructure/spikes/orm`, not the application's dependency graph. Root development dependencies add `@vercel/nft` 1.11.0 for the trace probe.

## Local API packaging evidence

Run `pnpm spike:api-trace` after root dependency installation. It compiles the API, uses Node File Trace to collect its runtime files, copies those files/symlinks to a disposable directory, starts the copied entrypoint with no inherited provider credentials, checks minimal uncached health and 20 concurrent health requests, then stops/removes its own output. Readiness and subsequent health requests have five-second abort deadlines; root `pnpm test` includes a regression test for an API that accepts connections but never responds.

Initial Node 24.22.1 result: PASS; 1,093 traced files, 2,865,850 file bytes, 234ms local process startup; 20 concurrent requests passed. These are local diagnostics, not Vercel cold-start/latency or production bundle measurements. The copied artifact is a dependency trace, not a Vercel Function build. Vercel native framework packaging, architecture-specific files, billing limits and deployed concurrency are still unproven.

Seven trace warnings concern optional Nest microservices/WebSocket and class-validator/class-transformer imports. They do not prevent the current health-only app from running. Do not silence them or add unused packages to make a count disappear. Validation/serialization or other features must add/test the dependencies they actually require when implemented; this probe proves only the current health route.

Official source: [Node File Trace API](https://github.com/vercel/nft). Its tracing approach collects required files rather than generating a framework adapter.

## ORM transaction evidence

Run the commands in [the isolated probe README](../../infrastructure/spikes/orm/README.md). Local PostgreSQL 17.11 is used because Docker is unavailable. A new private Unix-socket cluster is created per run, with TCP disabled and an unprivileged runtime role; no existing DB or remote URL is accepted. Cleanup stops/removes the task's cluster, including on failure.

| Check | Drizzle 0.45.4 + pg 8.23.1 | Prisma Client/adapter-pg 7.10.1 |
|---|---|---|
| Runtime is not superuser/BYPASSRLS/table owner | PASS | PASS |
| Missing tenant context returns no rows | PASS | PASS |
| Missing context/cross-tenant insert rejected by RLS | PASS | PASS |
| Own-tenant typed insert works, rollback removes it | PASS | PASS |
| Context cleared after rollback and commit | PASS | PASS |
| 20 submitted alternating-tenant transactions, pool max=1 | PASS, one backend | PASS, one backend |
| Local diagnostic duration (typed API run) | 10ms | 84ms |
| Neon/PgBouncer pooled/direct proof | NOT RUN | NOT RUN |
| Migration generation/rollback drill | NOT RUN | NOT RUN |
| ORM-enabled Vercel artifact/performance | NOT RUN | NOT RUN |

Both candidates use typed ORM APIs for data reads/inserts and parameterized transaction-local `set_config(..., true)`. Pool max=1 intentionally forces physical reuse; it serializes queries and is not a throughput benchmark. The stable Prisma v7 CLI is pinned explicitly because npm's current latest CLI points to an 8.0 release candidate while the tested client/adapter are v7. No release candidate was selected for the application.

The first assertion harness failed because Drizzle wraps the database error in `cause`. The harness now checks the actual RLS message through Error causes; it still requires RLS denial rather than accepting an arbitrary exception. This also demonstrates why application adapters must sanitize ORM errors/SQL parameters before logging tenant data.

Official sources: [Drizzle PostgreSQL/Neon drivers](https://orm.drizzle.team/docs/connect-neon), [Prisma v7 transactions](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions), [Prisma v7 client/driver adapters](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/introduction). These support the APIs; test results above come from this repository's actual local runs.

## Proposed decision, not acceptance

Both candidates satisfy the tested transaction boundary. Drizzle remains the provisional recommendation for explicit SQL/RLS control, based on engineering judgment and the existing architectural direction. The single local timing sample does not justify choosing it on performance. Keep ORM OPEN until the owner reviews this comparison and the remaining deployment/driver/migration evidence is assigned; production acceptance still requires T048 Neon isolation proof. No `packages/database` package or production migration was created.

## Deferred Preview plan — not authorized

The existing Vercel CLI session is usable and the only listed team is Semih's projects (`semihs-projects-fff996f3`). No QMenuX project exists there at inspection; existing unrelated projects were only listed, not modified. The owner answered “Hayır, şimdilik yalnızca yerel deneme” on 2026-10-25. New project creation/deployment is not authorized; retain the following as a future proposal only. No approval request remains pending, and do not retry or substitute another cloud deployment without new explicit authorization:

| New project | Repository root directory | Framework/runtime | Content |
|---|---|---|---|
| qmenux-t047-api | apps/api | Native NestJS / Node 24.x | `/v1/health` only |
| qmenux-t047-menu | apps/menu-pwa | Next.js / Node 24.x | Unavailable-state page |
| qmenux-t047-admin | apps/admin-pwa | Next.js / Node 24.x | Unavailable-state page |
| qmenux-t047-superadmin | apps/superadmin-pwa | Next.js / Node 24.x | Unavailable-state page |

All deployment commands must explicitly target Preview. Use no GitHub project link, production domains, production env pull, DB/IdP/R2 credentials or existing project. Verify each new project has no production/shared secret bindings before building. Use the monorepo root as CLI working directory, with project root settings selecting the app and shared workspace sources available. Prefer native framework detection; no custom handler/adapter is justified until the actual build demonstrates a need.

[Vercel NestJS support](https://vercel.com/docs/frameworks/backend/nestjs) documents native entrypoint detection and Function deployment. [Vercel monorepos](https://vercel.com/docs/monorepos) documents separate root directories/projects. Account login alone is not evidence of a successful deployment.

Before INFRA-001 acceptance, record preview/deployment IDs and URLs; build/runtime/framework versions; actual health/page responses; fresh and repeated request timings with honest cold/warm classification; concurrent request behavior; deployed function/artifact size and applicable plan limits; error/timeout behavior; environment isolation; teardown/retention decision; named/dated review. Unknown cloud measurements remain NOT RUN. Native Vercel packaging must be exercised before feature modules.

## Rollback and limits

Remove only task-created spike files/development tooling after checking for later user edits. Application/database schema and live data are unchanged. Do not delete existing projects or reset Git history. Any future preview projects must have their lifecycle explicitly recorded; creation does not authorize removing unrelated resources.

T000/legal gates, default-branch protection, PR #1 human review, ORM/region/plan/worker decisions and T048 remain open. Local scans and tests do not satisfy hosted INFRA-001. No task is DONE.

## Local final review — 2026-10-25
Reviewed commit 16623d7 and connected callers at the expected load of one developer running local probes. Confirmed one defect: a nonresponding HTTP server bypassed the nominal readiness loop timeout because fetch had no abort signal. Reproduced waiting past seven seconds with a temporary API fixture, then added readiness/request abort deadlines and a regression test that requires self-failure around five seconds and output cleanup. No new infrastructure stage, cloud action or ORM choice was performed. Other local checks remain subject to the scope limits above.

The timeout fix at `5087032` also passed [actual Ubuntu push CI](https://github.com/semih-turan/qmenux/actions/runs/40199917283) on 2026-10-25: Quality and Secret scan successful; the five-second deadline/cleanup regression passed in 5142ms. This is root workflow evidence, not a Vercel deployment or execution of the isolated ORM/PostgreSQL probe. Cloud scope remains deferred.

## Existing Vercel project inspection/configuration — 2026-10-25
Owner subsequently connected an existing project named qmenux and requested Vercel Production-target development. This changes the earlier local-only direction for that existing project; it does not approve the four proposed spike projects or complete the ORM decision.

Observed deployment: qmenux.vercel.app, ID dpl_ABkso91tmnt8Q7AydhywMeWFQccc, Production, main alias, Ready with no application build. Initial settings were framework Other and root directory `.`. Actual HTTP: `/` 404, `/AGENTS.md` 200, `/docs/01-product/PRD.md` 200. The repository was being served as static output rather than as the intended app.

Corrected only existing-project metadata: framework Next.js, root directory apps/menu-pwa, retained Node 24.x/default framework build/output. Verified with project inspect. No new deployment/project/domain/environment pull or credentials change. Rechecking HTTP still gives the old static results; settings do not rebuild an existing deployment. Do not describe the live site as fixed until a new authorized deployment is verified.

Main lacks the application source; PR #1 is open. Its d9b2df4 PR run 40196232076 failed on global button count 1 vs expected 0, while the same commit's push run succeeded. The smoke check now scopes no-button/no-textbox assertions to application main content, excluding framework development UI. Local lint/typecheck/tests/build pass after this test-only fix; it is uncommitted and has no hosted CI evidence yet. Do not bypass the failed PR check or merge without explicit authorization.

INFRA-001 remains unsatisfied: metadata correction/static serving is not a Next.js/NestJS deployment proof; API is not deployed by the single menu project. Production readiness and real tenant use remain gated separately.

## Authorized CLI Production deployment — 2026-10-25
Owner explicitly authorized Vercel CLI Production deployment from the current working tree. This supersedes the previous local-only direction for existing qmenux, without authorizing Git writes or removing production-use gates. Only the current customer menu shell was published.

- New immutable deployment: `dpl_83G3UTU1t9HXxfuYTes7R4esHhTa`, [deployment URL](https://qmenux-bj7zlrebk-semihs-projects-fff996f3.vercel.app), target Production, READY; alias [qmenux.vercel.app](https://qmenux.vercel.app).
- CLI command: `vercel deploy --prod --yes --scope semihs-projects-fff996f3`, from repository root, project root apps/menu-pwa. Source was HEAD 0368230 plus existing staged work; this is a CLI working-tree snapshot, not a main-branch merge or claim that the current uncommitted snapshot passed GitHub CI.
- Cloud build: iad1, 2 cores/8GB, Node 24.x project runtime, remote CLI 65.1.0, Next 16.4.3 and pnpm 10.29.2. Native monorepo detection selected only @qmenux/menu-pwa; shared config resolved; compilation/typecheck/prerender succeeded; native output completed in 32s. No custom Next adapter added.
- Upload preflight: before .vercelignore, CLI included 269 files/~63.3MB of caches/generated content. After filtering: 55 files/196,234 bytes; asserted no env, provider metadata, node_modules, internal docs or experiment inputs. .vercelignore is deployment input policy; Git ignore rules alone did not exclude all build artifacts.
- `vercel link` auto-created .env.local and downloaded development/provider variables/OIDC token. This task-created local file was removed; no values logged/used and no DB connected. Existing remote environment variables were not edited. Turbo warned about unused DB/Neon variables not forwarded to the frontend build; no forwarding added merely to silence warnings. Environment separation still needs T051 verification.
- Actual public HTTP: `/` 200 with QMenuX/menu-unavailable content; `/AGENTS.md`, `/docs/01-product/PRD.md`, `/package.json`, `/pnpm-lock.yaml`, `/.env.local` all 404. Production Chromium verified Turkish document/main/heading and no horizontal overflow at 320/375/390/430px. This is not physical iOS/Android/PWA QA.
- Old immutable deployment still exposed AGENTS.md after alias replacement. Owner explicitly approved deleting only `dpl_ABkso91tmnt8Q7AydhywMeWFQccc`; removed exactly one deployment with CLI. Its old immutable AGENTS.md URL now 404; current root still 200. Old static rollback target is intentionally removed with owner approval; new deployment retained.
- No new project/domain, DB connection/migration, tenant activation, API/identity deployment, Git staging/commit/push/merge or production legal acceptance performed. Existing user-staged changes preserved. Next source publication/CI and project work remain separately scoped.

This proves the menu Next.js monorepo build/deployment only. INFRA-001 still needs NestJS API deployment evidence; Neon pooling/RLS remains T048, and ORM is not approved. No cloud cold-start or database performance conclusion from the static page.

## Native NestJS API Production proof — 2026-10-25

One separate qmenux-api project was created for the next health-only API step. Settings: native NestJS, root apps/api, Node 24.x, `pnpm install --frozen-lockfile`, no Git integration and zero configured environment variables. Menu project's default local linkage/settings and live alias were preserved. Provider API URL is diagnostic; api.qmenux.com DNS is not configured here.

First create request rejected unsupported nodeVersion parameter (400); no project created until retry without it, then verified default Node 24.x. This was a provider request correction, not an application deployment failure.

Initial immutable deployment `dpl_EmcKGG2xfKVc6mAVfDRw8zH6z7tN` built successfully but returned HTTP 500/FUNCTION_INVOCATION_FAILED. Runtime logs showed ERR_REQUIRE_ESM loading @nestjs/core from CommonJS main.js. Build Ready status was not treated as health success. This failed artifact is retained for diagnosis; it is not the current alias or a valid rollback target.

Fix: API package type module, TypeScript NodeNext module/resolution, three explicit relative .js imports (bootstrap/module/test). Existing HTTP test now uses Node's `--no-experimental-require-module` option to prevent local CJS-to-ESM compatibility from concealing this failure class. No dependency upgrade/downgrade, custom adapter or business endpoint added.

Healthy immutable deployment: `dpl_H2tCAT9KsRki2MzSh7pmxSdiE1ZP`, [deployment URL](https://qmenux-ih7u1uz3q-semihs-projects-fff996f3.vercel.app), Production alias [qmenux-api.vercel.app/v1/health](https://qmenux-api.vercel.app/v1/health). Native Vercel builder used remote CLI 65.1.0, NestJS 12.2.0, TypeScript 5.9.3 and pnpm 10.29.2; cached install, selected only API workspace build, native output completed in 11s. Inspect shows one index Function, displayed size 1.2MB, iad1. Displayed artifact size is not a measured memory limit or plan guarantee.

Actual HTTP proof:
- Four observed health calls: 200, exact `{status: "ok"}`, `Cache-Control: no-store`; end-to-end client samples 468/354/311/195ms. First observed call is not proven cold: Vercel may warm Functions. No controlled cold-start/p95/load-budget claim.
- 20 concurrent health calls: all 200 and correct minimal body. This tests bounded health concurrency, not tenant isolation, DB pooling or sustained load.
- GET `/`, `/health`, `/v1/admin/products`, `/AGENTS.md`, `/docs/01-product/PRD.md`, `/.env.local`, `/src/main.ts` and POST `/v1/billing/checkout`: 404.
- Customer menu alias still returns 200. No menu redeployment, secret copy, database connection/migration, auth or tenant activation performed.

Local Node 24.22.1 checks after ESM change: frozen install, root lint/typecheck/five tests/four builds and isolated trace passed. Additional strict ESM API HTTP test passed. API trace: 1,093 files/2,865,419 bytes, 20 health responses, 174ms local startup diagnostic. Upload preflight selected native NestJS and 55 source files/197,135 bytes with env/docs/experiments excluded. Source is working-tree changes atop 0368230, not a committed/CI-tested runtime fix. No Git staging/commit/push/merge performed.

Native Next.js/NestJS deployment feasibility is now demonstrated in the owner-selected Production target. T047 is not DONE: ORM acceptance, controlled cold-start/selected-plan limits and named/dated review remain open; originally specified Preview execution is not claimed. T048 requires actual Neon pooled/direct/RLS proof. Neither health readiness nor the new project approves real tenant access.
