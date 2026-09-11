#!/usr/bin/env bash
# Tarik perubahan terbaru lalu rebuild + restart auth-service. `mariadb` tidak ikut
# di-rebuild (tidak punya build context) dan tidak di-restart kalau config-nya tidak
# berubah — cuma auth-service yang kena --build.
set -euo pipefail
cd "$(dirname "$0")"

git pull
docker compose up -d --build

echo
echo "Log terbaru (Ctrl+C untuk keluar):"
docker compose logs -f --tail=30 auth-service
