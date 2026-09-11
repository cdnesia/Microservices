#!/usr/bin/env bash
# Tarik perubahan terbaru lalu rebuild + restart service-tagihan.
set -euo pipefail
cd "$(dirname "$0")"

git pull
docker compose up -d --build

echo
echo "Log terbaru (Ctrl+C untuk keluar):"
docker compose logs -f --tail=30 service-tagihan
