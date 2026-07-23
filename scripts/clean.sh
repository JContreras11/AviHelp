#!/usr/bin/env bash
# Limpieza de datos AviHelp. Deja el sistema listo para cargar data real.
#
# Uso:
#   ./scripts/clean.sh dev  transaccional   # borra movimiento, conserva instituciones/usuarios
#   ./scripts/clean.sh dev  total           # borra TODO (menos auth.users); re-siembra categorias
#   ./scripts/clean.sh prod transaccional   # idem en PROD (pide confirmacion escrita)
#
# Lee credenciales de .env.local (SUPABASE_DB_PASSWORD). NUNCA siembra data de prueba.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env.local; set +a

PW="${SUPABASE_DB_PASSWORD:?falta SUPABASE_DB_PASSWORD en .env.local}"
PROD_REF="lowapicvmzywihkdjazd"
DEV_REF="vcbitzupradnikgxrqjo"

env="${1:-}"
modo="${2:-}"
[ -n "$env" ] && [ -n "$modo" ] || { echo "uso: clean.sh dev|prod transaccional|total"; exit 1; }
[ "$modo" = "transaccional" ] || [ "$modo" = "total" ] || { echo "modo debe ser transaccional o total"; exit 1; }

case "$env" in
  dev)  REF="$DEV_REF" ;;
  prod) REF="$PROD_REF"
        echo "ATENCION: vas a LIMPIAR ($modo) la base de PRODUCCION."
        read -r -p "Escribe exactamente 'LIMPIAR PROD' para continuar: " ok
        [ "$ok" = "LIMPIAR PROD" ] || { echo "Cancelado."; exit 1; } ;;
  *) echo "env debe ser dev o prod"; exit 1 ;;
esac

URL="postgresql://postgres:${PW}@db.${REF}.supabase.co:5432/postgres"
echo "Limpiando $env ($REF) - modo $modo..."
psql "$URL" -v ON_ERROR_STOP=1 -f "supabase/clean_${modo}.sql"
echo "Listo. Conteos:"
psql "$URL" -tAc "
select 'hospitales', count(*) from hospitales union all
select 'centros_acopio', count(*) from centros_acopio union all
select 'categorias', count(*) from categorias union all
select 'profiles', count(*) from profiles union all
select 'personas', count(*) from personas union all
select 'insumos', count(*) from insumos union all
select 'inventario', count(*) from inventario union all
select 'ingresos', count(*) from ingresos union all
select 'donaciones', count(*) from donaciones union all
select 'entregas', count(*) from entregas order by 1"
