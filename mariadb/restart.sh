#!/usr/bin/env bash
# Tarik perubahan terbaru lalu restart mariadb. Tidak pakai --build (image publik, tidak ada
# Dockerfile lokal) dan TIDAK pakai --force-recreate sembarangan — restart biasa sudah cukup
# untuk baca ulang env/command, dan menghindari risiko recreate tidak sengaja kalau suatu saat
# ada perubahan ceroboh di compose file ini (volume sudah `external: true` jadi aman, tapi
# tetap defensif).
set -euo pipefail
cd "$(dirname "$0")"

git pull
docker compose up -d

echo
echo "Log terbaru (Ctrl+C untuk keluar):"
docker compose logs -f --tail=30 mariadb
