#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")"
for tool in initdb pg_ctl createdb psql; do
  command -v "$tool" >/dev/null || { printf 'Missing PostgreSQL tool: %s\n' "$tool" >&2; exit 1; }
done
probe_dir=$(mktemp -d /tmp/qmenux-t002.XXXXXX)
cleanup() {
  if pg_ctl -D "$probe_dir/data" status >/dev/null 2>&1; then
    pg_ctl -D "$probe_dir/data" stop -m fast >/dev/null
  fi
  rm -rf "$probe_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir "$probe_dir/socket"
unset PGOPTIONS PGSERVICE PGSERVICEFILE PGPASSFILE PGPASSWORD PGHOSTADDR
export PGHOST="$probe_dir/socket" PGPORT=5432 PGDATABASE=qmenux_t002 PGUSER=neondb_owner
initdb -D "$probe_dir/data" -U qmenux_test_owner --auth=trust --no-locale --encoding=UTF8 >"$probe_dir/init.log"
pg_ctl -D "$probe_dir/data" -l "$probe_dir/server.log" -o "-c listen_addresses='' -k '$PGHOST'" start >/dev/null
createdb -U qmenux_test_owner "$PGDATABASE"
psql -X -v ON_ERROR_STOP=1 -U qmenux_test_owner >"$probe_dir/roles.log" <<'SQL'
CREATE ROLE neondb_owner LOGIN CREATEROLE BYPASSRLS;
CREATE ROLE qmenux_runtime LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER DATABASE qmenux_t002 OWNER TO neondb_owner;
GRANT qmenux_runtime TO neondb_owner WITH ADMIN TRUE;
SQL
psql -X -v ON_ERROR_STOP=1 -U qmenux_test_owner -c 'ALTER ROLE qmenux_runtime BYPASSRLS' >/dev/null
if psql -X --single-transaction -v ON_ERROR_STOP=1 -f migrations/0001_tenant_catalog.up.sql >"$probe_dir/unsafe.log" 2>&1; then
  printf 'Unsafe runtime role unexpectedly accepted\n' >&2; exit 1
fi
if ! grep -q 'A restricted qmenux_runtime role is required' "$probe_dir/unsafe.log"; then cat "$probe_dir/unsafe.log" >&2; exit 1; fi
if [ "$(psql -X -Atc "SELECT to_regnamespace('qmenux') IS NULL")" != t ]; then exit 1; fi
psql -X -v ON_ERROR_STOP=1 -U qmenux_test_owner -c 'ALTER ROLE qmenux_runtime NOBYPASSRLS' >/dev/null
psql -X --single-transaction -v ON_ERROR_STOP=1 -f migrations/0001_tenant_catalog.up.sql >"$probe_dir/up.log"
psql -X -v ON_ERROR_STOP=1 -f test.sql >"$probe_dir/test.log"
printf 'Schema, constraints, non-owner RLS and draft-only CRUD: PASS\n'
psql -X -v ON_ERROR_STOP=1 -c 'ALTER TABLE qmenux.products DISABLE ROW LEVEL SECURITY' >/dev/null
if psql -X -v ON_ERROR_STOP=1 -f test.sql >"$probe_dir/no-rls.log" 2>&1; then
  printf 'Disabled RLS unexpectedly passed\n' >&2; exit 1
fi
if ! grep -q 'Unexpected structure' "$probe_dir/no-rls.log"; then cat "$probe_dir/no-rls.log" >&2; exit 1; fi
psql -X -v ON_ERROR_STOP=1 -c 'ALTER TABLE qmenux.products ENABLE ROW LEVEL SECURITY' >/dev/null
if psql -X --single-transaction -v ON_ERROR_STOP=1 -f migrations/0001_tenant_catalog.up.sql >"$probe_dir/repeat.log" 2>&1; then
  printf 'Repeated migration unexpectedly succeeded\n' >&2; exit 1
fi
psql -X -v ON_ERROR_STOP=1 -c "INSERT INTO qmenux.tenants(slug,name) VALUES ('synthetic-guard','Synthetic rollback guard')" >/dev/null
if psql -X --single-transaction -v ON_ERROR_STOP=1 -f migrations/0001_tenant_catalog.down.sql >"$probe_dir/guard.log" 2>&1; then
  printf 'Populated rollback unexpectedly succeeded\n' >&2; exit 1
fi
if ! grep -q 'Rollback refused' "$probe_dir/guard.log"; then cat "$probe_dir/guard.log" >&2; exit 1; fi
psql -X -v ON_ERROR_STOP=1 -U qmenux_test_owner -c 'ALTER ROLE neondb_owner NOBYPASSRLS' >/dev/null
if psql -X --single-transaction -v ON_ERROR_STOP=1 -f migrations/0001_tenant_catalog.down.sql >"$probe_dir/hidden.log" 2>&1; then
  printf 'Rollback incorrectly treated RLS-hidden data as empty\n' >&2; exit 1
fi
if ! grep -q 'row-level security' "$probe_dir/hidden.log"; then cat "$probe_dir/hidden.log" >&2; exit 1; fi
psql -X -v ON_ERROR_STOP=1 -U qmenux_test_owner -c 'ALTER ROLE neondb_owner BYPASSRLS' >/dev/null
if [ "$(psql -X -Atc "SELECT count(*) FROM qmenux.tenants WHERE slug='synthetic-guard'")" != 1 ]; then
  printf 'Rollback guard lost data\n' >&2; exit 1
fi
psql -X -v ON_ERROR_STOP=1 -c "DELETE FROM qmenux.tenants WHERE slug='synthetic-guard'" >/dev/null
psql -X -v ON_ERROR_STOP=1 -c "INSERT INTO qmenux.schema_migrations(version) VALUES ('synthetic_later_migration')" >/dev/null
if psql -X --single-transaction -v ON_ERROR_STOP=1 -f migrations/0001_tenant_catalog.down.sql >"$probe_dir/later.log" 2>&1; then
  printf 'Rollback with later migration unexpectedly succeeded\n' >&2; exit 1
fi
if ! grep -q 'Rollback refused' "$probe_dir/later.log"; then cat "$probe_dir/later.log" >&2; exit 1; fi
psql -X -v ON_ERROR_STOP=1 -c "DELETE FROM qmenux.schema_migrations WHERE version='synthetic_later_migration'" >/dev/null
psql -X --single-transaction -v ON_ERROR_STOP=1 -f migrations/0001_tenant_catalog.down.sql >"$probe_dir/down.log"
if [ "$(psql -X -Atc "SELECT to_regnamespace('qmenux') IS NULL")" != t ]; then
  printf 'Empty rollback left schema behind\n' >&2; exit 1
fi
psql -X --single-transaction -v ON_ERROR_STOP=1 -f migrations/0001_tenant_catalog.up.sql >"$probe_dir/reapply.log"
psql -X -v ON_ERROR_STOP=1 -f test.sql >"$probe_dir/retest.log"
printf 'Unsafe role/disabled RLS rejection, duplicate guard, populated/later rollback refusal, empty down and reapply: PASS\n'
