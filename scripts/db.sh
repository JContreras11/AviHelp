#!/usr/bin/env bash
# Deploy de migraciones a DEV o PROD. Flujo: edita migración -> push dev -> prueba -> push prod.
# Uso:
#   ./scripts/db.sh new <nombre>   # crea nueva migración vacía
#   ./scripts/db.sh push dev       # aplica migraciones + seed a DEV
#   ./scripts/db.sh push prod      # aplica migraciones a PROD (sin seed)
#   ./scripts/db.sh psql dev|prod  # consola psql
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env.local; set +a

PW="${SUPABASE_DB_PASSWORD}"
PROD_REF="lowapicvmzywihkdjazd"
DEV_REF="vcbitzupradnikgxrqjo"
url() { local ref="$1"; echo "postgresql://postgres:${PW}@db.${ref}.supabase.co:5432/postgres"; }
ref_for() { [ "$1" = "prod" ] && echo "$PROD_REF" || echo "$DEV_REF"; }

case "${1:-}" in
  new)  pnpm exec supabase migration new "${2:?nombre requerido}" ;;
  push)
    env="${2:?dev|prod}"; REF="$(ref_for "$env")"
    pnpm exec supabase db push --db-url "$(url "$REF")" --yes
    if [ "$env" = "dev" ]; then
      echo "Seeding DEV..."; psql "$(url "$DEV_REF")" -f supabase/seed.sql
    fi ;;
  psql) psql "$(url "$(ref_for "${2:?dev|prod}")")" ;;
  *) grep '^#' "$0" | sed 's/^# \?//'; exit 1 ;;
esac
