# T047 — Local runtime and ORM spike

Date: 2026-10-25. Status: IN_PROGRESS; local experiments verified, cloud execution deferred by owner; reviewer acceptance pending. No production readiness or final ORM approval.

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
