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
