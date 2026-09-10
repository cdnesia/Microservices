#!/usr/bin/env bash
# Jalankan CLI interaktif "npm run manage-client" di dalam container auth-service yang
# sedang jalan — supaya pakai koneksi Postgres & DATABASE_URL yang sama dengan API-nya
# (docker-compose.yml di folder ini juga, project name "gateway"), bukan .env lokal terpisah.
set -euo pipefail
cd "$(dirname "$0")" # folder auth-service/ — tempat docker-compose.yml-nya sendiri

COMPOSE="docker compose"
SERVICE="auth-service"

running=$($COMPOSE ps --status running --services 2>/dev/null | grep -x "$SERVICE" || true)
if [ -z "$running" ]; then
  echo "Container '$SERVICE' belum jalan. Jalankan 'docker compose up -d' dulu."
  exit 1
fi

$COMPOSE exec "$SERVICE" npm run manage-client
