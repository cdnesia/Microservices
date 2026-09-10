# Microcervices

API Gateway berbasis **Traefik** untuk melayani banyak microservice di belakangnya,
dipakai oleh banyak client/partner eksternal. Autentikasi & otorisasi berbasis
**Client + Scope** (mirip OAuth2 Client Credentials), bukan sekadar API key polos.

> Dokumentasi arsitektur lengkap (alasan setiap keputusan desain, status implementasi
> per bagian, checklist produksi) ada di [`CLAUDE.md`](./CLAUDE.md). README ini cuma
> ringkasan untuk mulai cepat.

## Arsitektur

```
Client (App/Partner)
      │  Authorization: Bearer <token>
      ▼
┌─────────────────────────────────────────────┐
│                  TRAEFIK                     │
│  entrypoints: web (80→redirect), websecure (443) │
│                                               │
│  Middleware chain per router:                │
│   1. cloudflare-ips  (IPAllowList)           │
│   2. rate-limit-ip   (kasar, per IP)         │
│   3. security headers                        │
│   4. auth + scope-check (forwardAuth)        │
│   5. rate-limit-client (halus, per client)   │
│   6. stripprefix/rewrite                     │
└───────────────┬───────────────────────────────┘
                │
     ┌──────────┼─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
     ▼          ▼         ▼         ▼         ▼         ▼         ▼         ▼
 auth-service  ruangan  pegawai   bipot     jadwal     khs     tagihan   telegram
 (MariaDB,     (SIADE_  (SIADE_  (SIMAKU,  (SIADE,   (SIADE,  (PAYMENT, (no DB,
  token+scope)  OLD)     OLD)     SIADE)    SIADE_    SIADE_   SIADE,    cuma
                                             OLD)      OLD)     SIMAKU)   Bot API)
```

- **`auth-service`** — control plane: Client Credentials grant, refresh token
  (opaque, rotasi tiap dipakai) + revoke, scope discovery otomatis dari manifest
  `/scopes` tiap service, CLI admin (`manage-client.sh`) untuk kelola client tanpa SQL
  manual.
- **7 service bisnis** — hasil port dari project lama (`RESTFULL-API-EXPRESSJS`),
  masing-masing connect ke database eksternal kampus miliknya sendiri
  (SIADE/SIADE_OLD/SIMAKU/PAYMENT), dengan envelope response seragam
  `{ success, message, data }`.
- **Traefik** — single entrypoint, routing via file provider (bukan Docker
  labels/socket), `forwardAuth` ke `auth-service` untuk auth + scope-check sekaligus.

## Struktur Folder

```
Microcervices/
├── traefik/              # proxy stateless — static + dynamic config
├── auth-service/          # MariaDB + auth-service, 1 compose (schema owner)
└── services/
    ├── service-ruangan/   # contoh paling sederhana — 1 DB, 1 route
    ├── service-pegawai/
    ├── service-bipot/
    ├── service-jadwal/
    ├── service-khs/       # generate PDF (puppeteer)
    ├── service-tagihan/   # paling berat — 3 DB eksternal
    └── service-telegram/  # satu-satunya tanpa database
```

Setiap folder punya `docker-compose.yml` sendiri — **tidak ada compose file di
root**. Lihat [`CLAUDE.md`](./CLAUDE.md#struktur-folder-usulan) untuk detail isi
tiap service.

## Tech Stack

- **Gateway**: Traefik v3 (file provider, `forwardAuth`, native `RateLimit`/`IPAllowList`)
- **Auth**: Node.js (Express) + MariaDB 11.6 (`mysql2`), JWT (HS256) + refresh token opaque
- **Service bisnis**: Node.js (Express), `zod` untuk validasi, `mysql2` ke database eksternal
- **TLS**: Cloudflare Origin CA, mode *Full (strict)*
- **Testing**: Postman/Newman (auth flow, scope enforcement, rate limit, negative test)

## Cara Menjalankan

```bash
# 0. Network bersama — sekali saja
docker network create gateway-net

# 1. MariaDB + Auth Service
cd auth-service && cp .env.example .env   # isi JWT_SECRET & DB_PASSWORD
docker compose up -d --build

# 2. Traefik
cd ../traefik && docker compose up -d

# 3. Service bisnis (ulangi untuk tiap service, isi DATABASE_URL_<NAMA> asli)
cd ../services/service-ruangan && cp .env.example .env && docker compose up -d --build
# ...sama untuk service-pegawai, service-bipot, service-jadwal, service-khs,
#    service-tagihan, service-telegram (lihat tabel DATABASE_URL di CLAUDE.md)
```

Gateway tersedia di `https://localhost:8443` (self-signed placeholder, butuh
`-k`/`--insecure` saat testing lokal — lihat [`CLAUDE.md`](./CLAUDE.md#tls--ssl-cloudflare)).

```bash
# Client Credentials grant
curl -k -X POST https://localhost:8443/oauth/token \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"client_credentials","client_id":"demo-client","client_secret":"demo-secret"}'

# Akses service bisnis lewat gateway
curl -k https://localhost:8443/api/ruangan/list -H "Authorization: Bearer <access_token>"
```

Kelola client (create/rotate secret/ubah scope/suspend) lewat CLI interaktif:

```bash
./auth-service/manage-client.sh
```

## Testing

Collection Postman/Newman untuk test end-to-end (auth flow, scope enforcement,
rate limit, negative test) disimpan **lokal saja** (`postman/`, tidak ikut ke
repo — berisi kredensial demo client). Lihat [`CLAUDE.md`](./CLAUDE.md#postman-collection)
untuk cara pakainya.

## Status

Scaffolding (routing, auth, scope-check, rate limit, TLS) sudah teruji end-to-end.
Query SQL ke database eksternal kampus belum bisa diverifikasi penuh karena butuh
kredensial produksi/staging asli. Daftar lengkap yang sudah/belum dikerjakan ada di
bagian **"Status Implementasi"** pada [`CLAUDE.md`](./CLAUDE.md).
