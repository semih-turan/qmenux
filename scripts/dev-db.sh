#!/usr/bin/env bash
# Local-only PostgreSQL cluster for development and RLS integration tests.
# Never used for staging/production (Neon is canonical there).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/.local/pgdata"
PORT="${QX_DEV_PG_PORT:-54329}"
if [ -z "${PG_BIN:-}" ]; then
  for c in "/c/Program Files/PostgreSQL/17/bin" "/c/Program Files/PostgreSQL/16/bin" "/usr/lib/postgresql/17/bin" "/usr/lib/postgresql/16/bin"; do
    [ -x "$c/pg_ctl" ] || [ -x "$c/pg_ctl.exe" ] && PG_BIN="$c" && break
  done
fi
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl)")}"

case "${1:-start}" in
  start)
    if [ ! -f "$DATA/PG_VERSION" ]; then
      mkdir -p "$DATA"
      "$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust --encoding=UTF8 --locale=C >/dev/null
    fi
    if ! "$PG_BIN/pg_isready" -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1; then
      "$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -c listen_addresses=127.0.0.1" -l "$ROOT/.local/pg.log" start >/dev/null
      for _ in $(seq 1 30); do "$PG_BIN/pg_isready" -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1 && break; sleep 0.5; done
    fi
    for db in qmenux_dev qmenux_test qmenux_api_test; do
      "$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 \
        || "$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" -U postgres "$db"
    done
    echo "PostgreSQL ready on 127.0.0.1:$PORT (databases: qmenux_dev, qmenux_test, qmenux_api_test)"
    ;;
  stop)
    "$PG_BIN/pg_ctl" -D "$DATA" stop >/dev/null && echo "stopped"
    ;;
  reset-dev)
    # Local throwaway only: drops and recreates qmenux_dev (then run db:migrate and db:seed).
    "$PG_BIN/dropdb" -h 127.0.0.1 -p "$PORT" -U postgres --if-exists qmenux_dev
    "$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" -U postgres qmenux_dev
    echo "qmenux_dev recreated"
    ;;
  *) echo "usage: dev-db.sh start|stop|reset-dev"; exit 1 ;;
esac
