# QMenuX — Vercel + Neon Infrastructure (v8)
Status: Binding platform choice; implementation TODO. Date: 2026-10-25.

## Confirmed choices and non-choices
- **Neon PostgreSQL** is the production relational database. PostgreSQL RLS and tenant isolation remain mandatory.
- **Vercel** hosts all Next.js frontends and the stateless NestJS HTTP API (through supported Vercel Functions adapter/bundling). Confirm NestJS compatibility and cold-start behavior with a minimal spike before building feature modules.
- Cloudflare R2 stores images and generated PDFs; Cloudflare DNS/WAF/Access remains proposed subject to actual DNS, TLS, proxy and Vercel domain verification.
- **Separate worker hosting is REQUIRED for continuously consuming queues**, long-running imports/PDF/AI processing, retries and cron-driven workloads. Exact worker host is an OPEN T000 decision; do not assert it runs on Vercel.
- Redis provider is OPEN. Upstash Redis is a candidate for caching/rate limiting; verify BullMQ command/connection compatibility before choosing a queue Redis. Do not assume every serverless Redis REST product supports BullMQ.
- ORM is OPEN: Drizzle recommended for lean SQL and RLS-aware patterns; Prisma also possible. Select in T000/T047 with a proof of concept.

## Proposed deployment topology
| Service | Host | Domain | Runtime |
|---|---|---|---|
| Public QR menu Next.js | Vercel | `{slug}.qmenux.com` | SSR/ISR and cache revalidation |
| Business Admin PWA Next.js | Vercel | `admin.qmenux.com` | PWA |
| Super Admin PWA Next.js | Vercel | `superman.qmenux.com` | PWA, Cloudflare Access/equivalent |
| Marketing Next.js (last) | Vercel | `qmenux.com` | SSR/SSG |
| NestJS REST API | Vercel Functions | `api.qmenux.com/v1` | Stateless HTTP; no always-on process |
| Database | Neon | private provider connection | PostgreSQL with RLS |
| Image/PDF storage | Cloudflare R2 | private bucket + signed links | Object storage |
| Async worker | **External worker host TBD** | no public port required | Durable background consumer |
| Redis/cache/queue | Provider TBD | private authenticated connection | Verify BullMQ compatibility |

## Vercel Functions constraints
- No reliance on process memory for sessions, scheduled jobs, tenant state or cross-request cache.
- No in-process NestJS cron, long-lived queue worker or websocket server. Use scheduled external triggers/Vercel Cron for bounded enqueue-only actions if appropriate, with authenticated idempotent handlers and provider plan verification.
- Set explicit execution limits, concurrency, memory, request size and cold-start budgets after checking current Vercel plan docs; do not hardcode unsupported limits.
- NestJS bootstrapping must be reused within warm invocation only as an optimization, not correctness dependency. Test package bundling, native modules, file upload limits and deployment size.
- Direct-to-R2 presigned uploads for images, validate content type/size/virus policy; no large uploads through API memory.
- PDF/AI/import actions: create tenant-scoped durable job, return 202 + job ID, poll status or receive notification; worker writes result to R2; API returns expiring signed URL.
- Outbox events stored transactionally in Neon and delivered at-least-once with idempotent handlers; separate outbox relay must not rely on Vercel function process lifetime.

## Neon database practices
- `DATABASE_URL` uses **Neon pooled endpoint** for runtime, where compatible with the chosen driver/transaction/RLS approach.
- `DATABASE_DIRECT_URL` uses **direct connection** for schema migrations, maintenance and tools that need session semantics.
- Neon connection pooling mode may be transaction pooling. Session-level state and transaction-local `SET LOCAL`/`set_config(..., true)` for tenant RLS must be tested **inside the same explicit transaction**; never rely on connection/session state persisting between pooled requests.
- Tenant RLS policies must fail closed without valid context; no application superuser bypass; restrict owner roles, apply `FORCE ROW LEVEL SECURITY` where appropriate and test connection reuse for leakage.
- Driver and pool size must be compatible with serverless concurrency; measure DB connection counts, query latency and query timeout behavior.
- Use Neon isolated development/staging/production branches or projects as appropriate; never run destructive test migrations on production. Branch creation and deletion require controlled privileges.
- Validate Neon PITR/backup/restore capabilities for the chosen plan and perform periodic restore drills; Neon branch creation is not a complete backup strategy by itself.
- Configure region with attention to Vercel function region and Neon database region; benchmark latency and document KVKK/cross-border transfer implications before choosing a foreign region.

## Secrets and environment boundaries
- Separate Vercel projects and environment variables for development, preview, staging and production as needed. Preview deployments must not connect to production database or privileged production R2 bucket.
- Store Neon pooled/direct URLs, IdP client secrets, R2 keys, webhook secrets, Cloudflare credentials in environment secret managers; never in `NEXT_PUBLIC_*` variables or Git.
- `NEXT_PUBLIC_API_BASE_URL=https://api.qmenux.com/v1` is public config; secrets stay server-only.
- Explicit allowlisted CORS origins, host-only cookies, CSRF checks and protected API audience across admin/superadmin/tenant domains.
- Reserved tenant slugs include `admin`, `superman`, `api`, `www`, `auth`, `assets` and `qmenux` plus any operational names. Configure Vercel wildcard/custom domains carefully; explicit host routing wins.

## Delivery pipeline and validation
1. CI: pnpm install, lint, typecheck, unit/integration/security tests.
2. Migration: preview generated SQL, run against isolated Neon branch; direct connection only, migration lock/rollback plan.
3. Deploy API + admin + superadmin + menu preview; run auth, RLS, PDF job enqueue and cache tests.
4. Staging smoke and mobile PWA QA, performance and accessibility.
5. Production deploy, monitor errors, DB connection exhaustion, worker backlog, queue latency and CDN cache freshness.
6. Landing deployment is last milestone, no V1 online payment checkout.

## Operational failure tests
- Neon unavailable, cold starts, pooled connection exhaustion, Redis unavailable, worker down, delayed jobs, failed R2 uploads, signed URL expiry, stale public menu cache, invalid tenant context, provider login callback failures.
- Provide status/retry UX and avoid duplicate AI charges or repeated scheduled publications.

## Acceptance
INFRA-001 Vercel Next.js apps and NestJS `/v1/health` deploy in isolated preview.
INFRA-002 Neon pooled runtime and direct migrations work; RLS tenant isolation proven under connection reuse.
INFRA-003 job enqueue/worker processing/retries/idempotency tested with external worker.
INFRA-004 wildcard tenant host and reserved host routing, TLS, cookies and CORS tested.
INFRA-005 separate environment secrets, DB branches and restore test documented.

## Vercel-managed Neon development checkpoint — 2026-10-25

Owner requested stepwise Vercel/Neon development and confirmed access through Vercel. Used the existing Vercel resource's Open in Neon SSO; a separate Neon plugin is not required for this workflow.

| Resource | Observed state |
|---|---|
| Menu project | `qmenux`, Next.js, `apps/menu-pwa`, Node 24.x |
| API project | `qmenux-api`, NestJS, `apps/api`, Node 24.x; environment variable list empty |
| Existing integration | Neon `qmenux-db`, Vercel store `store_Chqjcpgcs8GWLQda`; connected only to `qmenux` |
| Neon project | `icy-tooth-77695631`, Free plan, PostgreSQL 18, AWS US East 1 (N. Virginia) |
| Default branch | `main`, `br-lingering-king-b8dx6np5`; retained as default |
| New development branch | `qmenux-dev`, `br-crimson-sky-b8i9xve7`; created from main with **schema only**, no parent rows copied |
| Development lifecycle | No automatic expiration; retained for continued development. No paid-plan upgrade selected |

Created the child branch through the Neon Console and verified the success state, branch ID, retained default main and total branch count of two. This isolates subsequent development writes; it does not establish application tenant isolation. The project's existing region is recorded, not newly approved for real tenant data or cross-border compliance.

Executed one read-only SQL Editor query on `qmenux-dev/neondb`: connected successfully, one result row, console execution diagnostic 155ms. PostgreSQL reports `18.6 (fd34222)`; console role `neondb_owner` has `rolsuper=false`, **`rolbypassrls=true`**. Nine non-system tables exist in the schema-only branch; no table contents were read. This privileged console/owner role must not become the application runtime credential. This is SQL Editor connectivity evidence, not a pooled-driver/RLS or API-to-database test.

Vercel environment metadata lists `DATABASE_URL` and `DATABASE_URL_UNPOOLED` on the menu project for development/preview/production, without Git-branch scoping. Values were not decrypted/pulled; this does not prove separate endpoints per environment. No environment variable, integration attachment or deployment was changed in this step. API remains health-only and has no configured database connection.

Next bounded step: verify the development database/roles and test transaction-local RLS with an unprivileged runtime role on this isolated branch. Then bind only the appropriate runtime credential to the API's intended environment; keep privileged direct migration credentials server-side and out of frontend projects. Verify exact branch/endpoint mapping before wiring any Vercel environment. Do not treat the existing menu project's shared target metadata as an isolation test or copy its owner credential blindly into the API.

Sources checked 2026-10-25: [Vercel-managed Neon integration](https://neon.com/docs/guides/vercel-managed-integration), [Neon branch creation and schema-only option](https://neon.com/docs/manage/branches). No migration, RLS acceptance or production approval is claimed by branch creation. T047 and T048 acceptance gates remain open.

### Development runtime role verification — 2026-10-25

After explicit owner action-time confirmation, executed [the prepared SQL](../../infrastructure/spikes/orm/neon-runtime-role.sql) on qmenux-dev/neondb only. All 22 statements succeeded, including role-safety/RLS and cleanup assertion blocks; COMMIT retained qmenux_runtime with NOLOGIN, NOINHERIT, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE and NOREPLICATION. No password created. Probe-only schema, table, synthetic rows and grants were rolled back.

An independent post-commit query confirmed the role flags, no remaining probe schema/tenant context, zero parent memberships for the runtime role and zero accessible non-system ordinary/partitioned tables under the tested table privilege set. The owner remains privileged; it was not changed or used as the runtime role in assertions. SQL Editor evidence is not a pooled-driver, concurrent-session, runtime-login or API test. Next: prepare isolated pooled/reuse verification before wiring a development credential to the API. Main, Vercel bindings and application data were unchanged. [Full evidence](../01-product/PROGRESS.md#neon-runtime-role-execution--2026-10-25).

### Authenticated pooled-context checkpoint — 2026-10-25

After the user manually activated LOGIN and supplied a new password locally, authenticated qmenux_runtime against the verified development pooled endpoint with TLS certificate verification/channel binding enabled. [Manual pg probe](../../infrastructure/spikes/orm/neon-context.mjs) PASS: 20 alternating tenant transactions, both commit/rollback cleanup for both tenants, one reused client connection/one observed backend, two overlapping transactions occupying different backends with independent contexts. No table queries or writes. Runtime role flags remain non-superuser/non-BYPASSRLS/non-creator/non-replicating/non-inheriting.

The local credential remains in an ignored mode-0600 file, excluded from CLI uploads; no Vercel project environment variable changed. Root CI only lints this manual credential-dependent probe. This supplements earlier SQL Editor RLS assertions but does not combine them into pooled row-level isolation proof: authenticated pooled RLS reads/writes and direct migration/rollback testing are still required before INFRA-002 acceptance. API remains health-only and unconnected. [Command evidence](../01-product/PROGRESS.md#authenticated-neon-pooled-context--2026-10-25).
