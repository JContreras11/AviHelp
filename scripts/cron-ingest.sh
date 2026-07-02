#!/bin/zsh
# Ingesta periódica conecta-salud → PROD (idempotente). Instalado en crontab.
cd /Users/jesusc/Code/AviHelp || exit 1
set -a; . ./.env.local 2>/dev/null; set +a
: "${SUPABASE_DB_PASSWORD:=4v1d3s4str3s}"
export DB_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.lowapicvmzywihkdjazd.supabase.co:5432/postgres"
echo "===== $(date) =====" >> logs/ingest.log
/Users/jesusc/.nvm/versions/node/v22.18.0/bin/node scripts/ingest-conecta-salud.mjs >> logs/ingest.log 2>&1
