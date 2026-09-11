#!/usr/bin/env bash
# Tarik perubahan terbaru lalu restart traefik supaya config (traefik.yml, dynamic/*.yml,
# certs/) benar-benar kepakai. `docker compose up -d` saja sering TIDAK cukup untuk
# perubahan dynamic/*.yml — meski file provider punya `watch: true`, reload otomatisnya
# kadang tidak trigger lewat `git pull` (pernah kejadian: hash BasicAuth dashboard sudah
# benar di file tapi tetap ditolak sampai container di-restart manual). --force-recreate
# memaksa container baca ulang semua file yang di-mount dari awal, jadi selalu aman dipakai
# setelah `git pull`.
set -euo pipefail
cd "$(dirname "$0")"

git pull
docker compose up -d --force-recreate

echo
echo "Log terbaru (Ctrl+C untuk keluar):"
docker compose logs -f --tail=30 traefik
