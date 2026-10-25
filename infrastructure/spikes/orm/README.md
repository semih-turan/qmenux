# T047 isolated ORM transaction probe

This is disposable experiment code, not QMenuX's database package or an approved ORM selection. Its own workspace/lockfile keeps both candidates out of application dependencies and builds.

Prerequisites: pinned root Node/pnpm; local PostgreSQL 17 tools (`initdb`, `pg_ctl`, `createdb`, `psql`) on PATH. The script creates a private `/tmp/qmenux-orm.*` cluster, disables TCP, uses an owner-only Unix socket directory and removes/stops its own cluster on exit. It never accepts a remote database URL. Local socket trust is confined to this disposable, private directory; this is not a production authentication pattern.

```sh
pnpm --dir infrastructure/spikes/orm install --frozen-lockfile
pnpm --dir infrastructure/spikes/orm test
```

The test generates Prisma Client and typechecks before running the same assertions against Drizzle 0.45.4/pg 8.23.1 and Prisma Client/adapter-pg 7.10.1. Prisma CLI is explicitly pinned to 7.10.1 because its current npm latest tag points to an 8.0 release candidate; this probe compares the stable v7 API, not the v8 release candidate.

Runtime role must be neither superuser, BYPASSRLS nor table owner. Reads and inserts use each ORM's typed query/model API. Transaction-local tenant context and backend inspection use parameterized SQL. Checks cover missing context, cross-tenant insert denial, permitted insert rollback, context cleanup, and 20 concurrently submitted alternating-tenant transactions through a pool of size one. Backend IDs prove physical reuse; this pool intentionally serializes database work and is not a throughput benchmark.

This is PostgreSQL RLS/driver evidence only. It does not test Neon/PgBouncer, HTTP/WebSocket drivers, migrations/backfills, serverless scaling, query plans or production authorization. Root CI lints the probe source but does not install this isolated workspace or run its database test. T048 must repeat relevant assertions against isolated Neon pooled/direct connections before an ORM can be accepted for production.

The CLI prints pass/diagnostic timings without database URLs or credentials. Timings are local diagnostics and must not be used as a production ORM ranking. Failed ORM errors can include SQL/parameters: later application adapters must sanitize errors before logging tenant data.

## Neon runtime privilege preparation

[`neon-runtime-role.sql`](neon-runtime-role.sql) is a separate, manually reviewed SQL Editor step for **qmenux-dev/neondb only** (`br-crimson-sky-b8i9xve7`, project `icy-tooth-77695631`). Confirm the exact branch in the Console before execution: SQL does not independently attest Neon branch identity. It is not a canonical application migration or part of the local ORM command above.

The script creates `qmenux_runtime` with NOLOGIN, NOINHERIT, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE and NOREPLICATION, without a password. It temporarily creates an owner-controlled probe schema/table, grants only SELECT/INSERT on synthetic rows, assumes the runtime role and asserts missing/invalid context denial, tenant A/B read isolation, cross-tenant insert denial and own-insert rollback. A savepoint rollback removes the entire probe, grants and tenant context before the transaction commits only the disabled-login role. The final SELECT reports PASS and role flags. Existing roles/schemas with the same names cause failure instead of being altered.

Execute the complete file as one transaction/session through SQL Editor; stop on any error, issue ROLLBACK if the session remains aborted, and inspect role/schema metadata before retrying. Do not execute selected fragments or run it on main. Browser-based role/permission creation requires action-time confirmation under the computer-use tool policy; prepare/review the script and local checks first. If rejected before execution, Neon is unchanged.

Local validation used a disposable PostgreSQL 17 cluster and a non-superuser CREATEROLE database owner. Positive assertions passed; removing ENABLE ROW LEVEL SECURITY caused the expected missing-context assertion failure, with no role/schema surviving that failed transaction. This is not Neon PostgreSQL 18, pooled connections, concurrent sessions, network authentication or API authorization evidence.

After successful execution the role cannot log in and has no retained probe privileges. Credential activation and application-table grants are separate, reviewed steps; no owner password should be copied into API runtime. Do not infer application-ready least privilege from role flags alone: inherited PUBLIC/function/schema privileges and eventual application grants also need review. Rollback after execution: inspect for later role usage/dependencies and obtain the necessary confirmation before dropping the created role; never use DROP OWNED/CASCADE against existing objects.

Sources checked 2026-10-25: [PostgreSQL role options](https://www.postgresql.org/docs/18/sql-createrole.html), [PostgreSQL RLS and bypass behavior](https://www.postgresql.org/docs/18/ddl-rowsecurity.html), [Neon SQL-created versus Console-created roles](https://neon.com/docs/manage/roles). Use SQL for the restricted role: Neon Console/API/CLI-created roles receive neon_superuser membership according to the provider documentation.

Execution checkpoint: owner confirmed this exact action on 2026-10-25; all 22 statements passed on qmenux-dev/neondb (PostgreSQL 18.6), followed by independent role/cleanup checks. qmenux_runtime now exists there with NOLOGIN; **do not rerun** this creation script against that branch. Its deliberate duplicate-name failure protects existing state. [Actual evidence and limits](../../../docs/01-product/PROGRESS.md#neon-runtime-role-execution--2026-10-25).

## Authenticated Neon pooled context probe

User subsequently enabled LOGIN manually. [`neon-context.mjs`](neon-context.mjs) verifies the restricted role through the existing pg driver, without adding an application ORM or running migrations. Put the complete qmenux_runtime pooled URL in the Git/Vercel-ignored root `.env.neon-development.local`, with file permissions 0600; never paste it in chat. It must target the verified qmenux-dev endpoint/database with `sslmode=verify-full&channel_binding=require`. Do not export a different DATABASE_URL: Node's env-file loader preserves existing environment variables; the probe rejects unexpected endpoints/users/query parameters before connecting.

```sh
# Run with the repository's pinned Node 24.22.1 after installing this workspace.
pnpm --dir infrastructure/spikes/orm test:neon-context
```

The probe checks authenticated role flags, then 20 alternating synthetic tenant contexts on a max=1 client pool, testing both commit and rollback for each tenant. It verifies no context before/after each transaction and stable backend identity within each transaction. It records observed backend reuse rather than requiring PgBouncer to assign one server backend across all transactions. Two held transactions on distinct backends additionally verify overlapping A/B contexts and that finishing one does not clear the other's context. All transaction statements use their checked-out client. Connection/query timeouts are 10 seconds; failed/overlap clients are destroyed and pools closed.

No application or fixture tables are read/written; only role metadata, backend IDs and transaction-local settings are queried. This is authenticated pooled-context/cleanup evidence, **not pooled RLS row isolation**, migration/direct-URL proof, API authorization or load testing. Root lint covers the script; root CI does not run this credential-dependent command. Errors report a stage/safe SQLSTATE only, never raw driver details/URLs. Local synthetic-invalid-URL/wrong-endpoint checks confirmed rejection and no value printing.

2026-10-25 actual result: PASS, 20 serial transactions, one reused client connection/one observed backend, two overlapping transactions, zero table queries. [Evidence](../../../docs/01-product/PROGRESS.md#authenticated-neon-pooled-context--2026-10-25). Sources: [pg transaction client requirements](https://node-postgres.com/features/transactions), [pg TLS/channel binding](https://node-postgres.com/features/ssl), [Neon transaction pooling](https://neon.com/docs/connect/connection-pooling).

## Authenticated pooled RLS and direct migration probe

`pnpm --dir infrastructure/spikes/orm test:neon-rls` runs [`neon-rls.mjs`](neon-rls.mjs) with [`neon-rls-fixture.sql`](neon-rls-fixture.sql). It loads the runtime pooled URL from root `.env.neon-development.local` and the development-only owner direct URL (`DATABASE_DIRECT_URL`) from `.env.neon-migration.local`. Both files must remain ignored, excluded from deployment inputs and mode 0600. Exact verified development hosts, roles, database, TLS and query parameters are checked before connection. Never point this command at main or production tenant data.

The script refuses an existing `qmenux_rls_probe` schema. Using the direct owner connection, it applies and rolls back the entire synthetic fixture, confirms schema absence, then reapplies/commits it. A different authenticated runtime role owns no fixture objects and has only schema USAGE/table SELECT, INSERT, UPDATE, DELETE. Twenty pooled transactions test absent/invalid tenant context, cross-tenant read/write denial (including tenant-ID reassignment), denied DDL, own-row CRUD, commit/rollback cleanup and physical client/backend reuse. Two simultaneously open transactions read their own tenant rows on distinct server backends. Owner inspection finally confirms exactly the two original synthetic seed rows.

Success/failure cleanup closes runtime clients, drops only the created fixture table and empty schema (no CASCADE), then verifies schema absence. An existing schema is never removed. Connection/query deadlines are ten seconds. A failure prints only its phase/SQLSTATE; inspect the development branch before rerunning if cleanup fails. No application migration or role credential change occurs. This command is manual and is not run by CI or the local disposable ORM command.

Actual 2026-10-25 cloud execution passed, including direct rollback, pooled non-owner RLS checks and fixture cleanup. A synthetic wrong-direct-host configuration failed before connection without printing its value. This validates the synthetic contract, not the future application schema, authorization, exports/caches/jobs or production restore process. [Detailed evidence](../../../docs/01-product/PROGRESS.md#pooled-rls-direct-migrations-and-api-readiness--2026-10-25).

## T003 application-schema pooled isolation
After installing this workspace and building `@qmenux/api`, run `pnpm --dir infrastructure/spikes/orm test:tenant-neon` with pinned Node 24.22.1. This manual command imports the actual compiled Database/TenantTransactions services; no ORM selection is implied. It uses the same two private mode-0600 ignored development env files and validates exact development endpoints/roles/TLS before connecting. Root CI never loads cloud credentials.

Requires baseline 0001 and empty business tables. On first execution, migration 0002 is tested by rollback, commit/down/reapply; later executions preserve it. Only synthetic `t003-fixture.sql` tenants/catalog records are created. Tests cover candidate rejection, mandatory authorization, cross-tenant denial, own write rollback, 20 serial pooled transactions and two overlapping transactions with cleared context. Finally closes the runtime pool, removes only known synthetic fixture IDs in reverse FK order and verifies zero tenants. It retains migrations 0001/0002. Failed cleanup requires inspection before rerunning; never point it at main or real tenant data. Local HTTP tests provide separate controller-boundary coverage; no production business route is added.
