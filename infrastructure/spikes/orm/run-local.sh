#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")"
for tool in initdb pg_ctl createdb psql; do
  command -v "$tool" >/dev/null || { printf 'Missing PostgreSQL tool: %s\n' "$tool" >&2; exit 1; }
done
probe_dir=$(mktemp -d /tmp/qmenux-orm.XXXXXX)
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
initdb -D "$probe_dir/data" -U qmenux_probe_owner --auth=trust --no-locale --encoding=UTF8 >"$probe_dir/init.log"
# Socket directory is private (0700); no TCP listener or existing database used.
pg_ctl -D "$probe_dir/data" -l "$probe_dir/server.log" \
  -o "-c listen_addresses='' -k '$probe_dir/socket'" start >/dev/null
createdb -h "$probe_dir/socket" -U qmenux_probe_owner qmenux_probe
psql -h "$probe_dir/socket" -U qmenux_probe_owner -d qmenux_probe -v ON_ERROR_STOP=1 >"$probe_dir/setup.log" <<'SQL'
CREATE ROLE qmenux_probe_runtime LOGIN NOSUPERUSER NOBYPASSRLS;
CREATE TABLE isolation_probe (id integer PRIMARY KEY, tenant_id uuid NOT NULL);
INSERT INTO isolation_probe VALUES
  (1, '00000000-0000-4000-8000-000000000001'),
  (2, '00000000-0000-4000-8000-000000000002');
ALTER TABLE isolation_probe ENABLE ROW LEVEL SECURITY;
ALTER TABLE isolation_probe FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON isolation_probe USING (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
) WITH CHECK (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
);
GRANT USAGE ON SCHEMA public TO qmenux_probe_runtime;
GRANT SELECT, INSERT ON isolation_probe TO qmenux_probe_runtime;
SQL
export PROBE_DATABASE_URL="postgresql://qmenux_probe_runtime@localhost/qmenux_probe?host=$probe_dir/socket"
pnpm generate
pnpm typecheck
pnpm exec tsx probe.ts
