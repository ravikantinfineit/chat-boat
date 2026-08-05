#!/usr/bin/env bash
# Local Postgres for development, without Docker or root.
#
# Creates a private cluster under .devdata/postgres and runs it on port 5433, so
# it never collides with a system Postgres on 5432. Use `docker compose up -d`
# instead if you have a working Docker daemon.
#
#   ./scripts/dev-db.sh start | stop | status
set -euo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDATA="$ROOT/.devdata/postgres"
PGPORT=${PGPORT:-5433}
PGUSER=${PGUSER:-diamond}
PGDB=${PGDB:-diamond_chatbot}

export PATH="$PGBIN:$PATH"

case "${1:-start}" in
  start)
    if [ ! -f "$PGDATA/PG_VERSION" ]; then
      echo "Creating cluster in $PGDATA"
      mkdir -p "$ROOT/.devdata"
      initdb -D "$PGDATA" -U "$PGUSER" --auth=trust --encoding=UTF8 > "$ROOT/.devdata/initdb.log"
    fi
    if pg_isready -h localhost -p "$PGPORT" > /dev/null 2>&1; then
      echo "Already running on port $PGPORT"
    else
      pg_ctl -D "$PGDATA" -o "-p $PGPORT -k /tmp" -l "$ROOT/.devdata/postgres.log" start
    fi
    createdb -h localhost -p "$PGPORT" -U "$PGUSER" "$PGDB" 2>/dev/null || true
    echo "postgres://$PGUSER@localhost:$PGPORT/$PGDB"
    ;;
  stop)
    pg_ctl -D "$PGDATA" stop
    ;;
  status)
    pg_isready -h localhost -p "$PGPORT"
    ;;
  *)
    echo "Usage: $0 {start|stop|status}" >&2
    exit 1
    ;;
esac
