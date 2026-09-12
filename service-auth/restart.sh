#!/usr/bin/env bash
# Tarik perubahan terbaru lalu rebuild + restart service-auth. Database (mariadb) ada di
# compose TERPISAH (../mariadb/) sejak dipisah — restart ini tidak menyentuhnya sama sekali,
# itu tujuannya. Pastikan ../mariadb/ sudah up & healthy dulu sebelum jalankan ini.
set -euo pipefail
cd "$(dirname "$0")"

git pull
docker compose up -d --build

echo
echo "Log terbaru (Ctrl+C untuk keluar):"
docker compose logs -f --tail=30 service-auth
