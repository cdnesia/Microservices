# Microcervices — API Gateway (Traefik)

Project ini adalah **API Gateway** berbasis **Traefik** untuk melayani banyak microservice
di belakangnya, dipakai oleh **banyak user/client eksternal**. Dokumen ini adalah acuan
arsitektur yang harus diikuti setiap kali mengerjakan/menambah service di project ini.

## Status Implementasi

Sudah ada dan **teruji jalan** (`docker compose up -d` di masing-masing folder, di-curl
end-to-end):
- `traefik/` — static + dynamic config, dijalankan dari **`traefik/docker-compose.yml`**
  (cuma berisi service `traefik`, proxy stateless murni tanpa data — tidak lagi di root,
  root project sekarang tidak punya compose file sendiri).
- `mariadb` (**MariaDB 11.6**, satu instance dipakai bersama oleh semua service — bukan
  Postgres lagi, lihat "Kenapa MariaDB" di bawah) + `auth-service/` (Express + `mysql2`)
  digabung satu compose di **`auth-service/docker-compose.yml`** — auth-service adalah
  satu-satunya pemilik skema di database ini (`clients`, `scopes`, `refresh_tokens`), jadi
  lifecycle keduanya digabung daripada nebeng di compose traefik. `auth-service` sendiri:
  Client Credentials grant, **refresh token** (opaque, hash SHA-256 tersimpan di DB, rotasi
  tiap dipakai) + `/oauth/revoke`, dan **scope discovery**: auto-fetch manifest `/scopes` dari
  service lain (lihat `auth-service/src/config/services.js`) tiap boot + tiap 60 detik,
  di-upsert ke tabel `scopes`, dipakai `/verify` untuk scope-check — jadi mapping route→scope
  tidak perlu ditulis manual dua kali (sekali di service, sekali di auth-service). CRUD client
  (create/rotate secret/ubah scope/suspend) lewat CLI `auth-service/manage-client.sh` —
  lihat bawah.
- **7 service bisnis**, hasil port dari `RESTFULL-API-EXPRESSJS` (project lama milik user —
  lihat "Kenapa MariaDB" di bawah untuk gaya catatan serupa, dan "Response Envelope" tepat di
  bawah ini untuk konteks porting-nya): `service-ruangan`, `service-pegawai`, `service-bipot`,
  `service-jadwal`, `service-khs`, `service-tagihan`, `service-telegram` — masing-masing
  `services/<nama>/`, compose sendiri (join `gateway-net` sebagai network eksternal),
  `GET /scopes`, guard `X-Client-Id`. `service-ruangan` adalah yang paling sederhana (1 DB
  eksternal, 1 route) — jadikan contoh kalau mau lihat pola dasarnya sebelum baca yang lain.
  **Scaffolding-nya teruji jalan** (build, health check, `/scopes`, auth+scope enforcement,
  validasi zod) — logic bisnis (query SQL ke database eksternal) **belum bisa diverifikasi
  end-to-end** karena butuh kredensial produksi/staging asli yang belum ada di `.env`
  masing-masing (lihat tabel & catatan di bawah).
- **Rate limit per-client** di gateway (bukan per-IP) — lihat bagian Middleware di bawah.
- **Sembilan compose file terpisah, satu per folder** (`traefik/`, `auth-service/`, dan satu
  per `services/*/` — tidak ada `docker-compose.yml` di root sama sekali). `traefik/` dan
  `auth-service/` di-pin `name: gateway` yang **sama** supaya di Docker Desktop tetap kebaca
  sebagai satu grup "gateway" walau dijalankan dari `docker compose up -d` yang berbeda-beda
  folder; tiap `services/*/` memang sengaja grup terpisah (nama service masing-masing) karena
  bisa dideploy/discale sendiri. Konsekuensi dua compose file berbagi nama project: `docker
  compose ps`/`down` dari salah satu compose file itu cuma melihat/mematikan service yang
  didefinisikan di file itu sendiri (compose akan warning "orphan containers" untuk service
  dari compose file "gateway" satunya — bukan error, cuma informasi bahwa grup itu diisi
  lebih dari satu file).

### Response Envelope

Semua 7 service bisnis balas dengan envelope seragam:
`{ success: boolean, message: string, data: any }` — diadopsi dari
`RESTFULL-API-EXPRESSJS/src/utils/ApiResponse.js` (project lama milik user). Tiap service
punya salinan `src/utils/ApiResponse.js` + `src/utils/AppError.js` + `src/utils/validate.js`
(helper `parseOrThrow(schema, body)` untuk validasi zod) sendiri-sendiri — **bukan** package
bersama, karena tidak ada mekanisme service-to-service call di arsitektur ini, setiap
container harus tetap bisa jalan sendiri.

**Dua pengecualian yang SENGAJA tidak pakai envelope ini** (jangan "diperbaiki" supaya
konsisten — ini keputusan sadar, bukan bug):
1. `auth-service`'s endpoint `/oauth/token` dan `/oauth/revoke` — tetap pakai shape
   RFC-style (`access_token`/`token_type`/`error` di top level), karena envelope
   `{success,data}` akan merusak ekspektasi client OAuth2 standar.
2. `service-khs`'s `POST /khs/cetak` — balas buffer PDF mentah (`Content-Type:
   application/pdf`), bukan JSON, jadi envelope tidak relevan di endpoint itu.

### Service bisnis baru — database eksternal, bukan `mariadb` gateway

`service-ruangan`, `service-pegawai`, `service-bipot`, `service-jadwal`, `service-khs`, dan
`service-tagihan` (semua kecuali `service-telegram`) connect ke database **eksternal** milik
sistem akademik/keuangan kampus yang sudah ada — **BUKAN** instance `mariadb` yang dipakai
`auth-service` (itu database kosong khusus punya gateway sendiri, cuma `clients`/`scopes`/
`refresh_tokens`). Tiap service baca `DATABASE_URL_<NAMA>` env var sendiri-sendiri lewat
helper `src/db/pools.js` — file identik di keenam service itu (parse URL manual, bukan opsi
`uri` mysql2, supaya `connectionLimit`/`timezone` pasti kepakai; satu pool lazy per nama DB,
mirip `getPool(name)` di project lama `RESTFULL-API-EXPRESSJS`). Lihat
`services/service-ruangan/src/db/pools.js` sebagai contoh.

| Service | `DATABASE_URL_<NAMA>` yang dibutuhkan |
|---|---|
| `service-ruangan` | `SIADE_OLD` |
| `service-pegawai` | `SIADE_OLD` |
| `service-bipot` | `SIMAKU`, `SIADE` |
| `service-jadwal` | `SIADE`, `SIADE_OLD` |
| `service-khs` | `SIADE`, `SIADE_OLD` |
| `service-tagihan` | `PAYMENT`, `SIADE`, `SIMAKU` |
| `service-telegram` | — (tidak butuh database, cuma `TELEGRAM_BOT_TOKEN`) |

Kredensial belum diisi (`.env.example` di tiap folder masih placeholder) — **service-service
ini tidak akan benar-benar bisa query data sampai kredensial asli diisi di `.env` masing-
masing**. `/health` di tiap service akan legitimately balas `503`/`"degraded"` sampai itu
terisi — itu bukan bug, itu bukti `pools.js` sudah benar mencoba connect dan gagal secara
graceful (bukan crash).

**Duplikasi kode yang disengaja**: `service-bipot` dan `service-tagihan` masing-masing punya
salinan privat `src/services/mahasiswa.service.js` (dan `service-tagihan` juga
`bipot.service.js`) — bukan diimpor dari service lain, karena tidak ada mekanisme
service-to-service call di arsitektur ini dan tiap container harus tetap self-contained.
File-file ini kecil (~50 baris) dan jarang berubah (query read-only ke skema akademik yang
stabil) — duplikasi diterima sebagai trade-off, bukan sesuatu yang perlu "dibersihkan" jadi
shared package nanti.

**Kenapa MariaDB (bukan lagi Postgres)**: keputusan project, bukan karena Postgres
bermasalah — semua service sudah dikonversi penuh (`pg` → `mysql2`, schema, semua query).
Konsekuensi teknis yang perlu diingat kalau menambah kode baru di sini:
- Tidak ada tipe array/`TEXT[]` seperti Postgres — `allowed_scopes` (tabel `clients`) dan
  `scopes` (tabel `refresh_tokens`) disimpan sebagai **TEXT comma-separated**, di-parse jadi
  array JS di layer data (`auth-service/src/data/clients.js`,
  `auth-service/src/data/refreshTokens.js`). JSON native MariaDB sengaja tidak dipakai —
  cuma alias `LONGTEXT` + CHECK constraint, servernya tidak melaporkan tipe JSON asli lewat
  wire protocol jadi driver (`mysql2`) tidak bisa auto-parse balik seperti kolom JSON asli
  MySQL — comma-separated TEXT lebih predictable.
- Tidak ada `RETURNING` yang reliable lintas driver — habis `INSERT`, ambil lagi row-nya
  pakai `result.insertId` (auto-increment) atau primary key yang sudah diketahui, bukan
  mengandalkan clause `RETURNING`.
- `id` refresh token di-generate di app (`crypto.randomUUID()`), bukan `DEFAULT` di kolom —
  MariaDB tidak punya fungsi default UUID yang portable lintas versi.
- Upsert pakai `INSERT ... ON DUPLICATE KEY UPDATE` (bukan `ON CONFLICT ... DO UPDATE`).
- Koneksi `mysql2` di-set `timezone: 'Z'` (lihat `src/db/pool.js` di kedua service) supaya
  `DATETIME` konsisten UTC, menggantikan asumsi lama `TIMESTAMPTZ` Postgres yang implisit
  UTC.
- Env var database di-rename dari `POSTGRES_USER/PASSWORD/DB` jadi `DB_USER/DB_PASSWORD/
  DB_NAME` (lihat `auth-service/.env.example`) — netral terhadap mesin database.
- Healthcheck container `mariadb` pakai `mariadb-admin ping` dengan kredensial user
  aplikasi (bukan `pg_isready` yang bisa cek readiness tanpa auth) — root MariaDB dikasih
  `MARIADB_RANDOM_ROOT_PASSWORD` karena app tidak pernah pakai root sama sekali.

**Belum "paling aman"** — status keamanan real per 2026-09-10:
- Sudah ditemukan & di-fix (sesi sebelumnya): `/oauth/token` bisa dijatuhkan total (proses
  Node crash, semua client kena dampak) oleh payload `scope`/`client_secret` non-string.
  Sekarang ada validasi tipe input + `try/catch` + error-handling middleware yang tidak
  pernah bocorkan stack trace, di `auth-service` maupun tiap service bisnis. `trust proxy` juga
  di-set (Traefik = 1 hop reverse proxy) supaya `express-rate-limit` baca IP client dengan
  benar.
- Sudah dikerjakan (sesi-sesi sebelumnya): client & scope sekarang di **database** (bukan
  hardcode di source lagi), secret tetap di-hash bcrypt; **refresh token + expiry** dengan
  rotasi & revoke; **scope discovery otomatis** dari service lain; **rate limit
  per-`client_id`** (dua lapis: kasar per-IP sebelum auth, halus per-client setelah auth —
  lihat Middleware); **docker-compose dipisah per service** (traefik, auth-service+mariadb,
  dan tiap service bisnis masing-masing punya compose sendiri — lihat bagian Status
  Implementasi paling atas). Sudah diverifikasi dengan load test paralel: satu client yang
  dibanjiri kena `429`, client lain di IP yang sama tetap `200` tanpa terganggu.
- Sudah dikerjakan sesi ini: **CLI admin untuk kelola client** (`./auth-service/manage-client.sh`,
  jalankan `npm run manage-client` di dalam container `auth-service` yang sedang up lewat
  `docker compose exec` — pakai `DATABASE_URL` production yang sama, bukan koneksi lokal
  terpisah). Bisa daftarkan client baru (client_id slug + client_secret di-generate random,
  ditampilkan sekali lalu di-hash bcrypt sebelum disimpan), generate ulang secret, ubah
  `allowed_scopes`, dan suspend/aktifkan kembali — tanpa perlu SQL manual lagi. Pilihan scope
  di checklist-nya diambil dari tabel `scopes` (hasil auto-discovery yang sudah ada, lihat
  `auth-service/src/scopeRegistry.js`), bukan daftar hardcoded. Implementasi:
  `auth-service/scripts/manage-client.js` + `auth-service/src/data/clients.js`
  (`listClients`/`createClient`/`regenerateSecret`/`updateScopes`/`setStatus`/`listScopes`).
  Diverifikasi end-to-end: create → login berhasil, suspend → `/oauth/token` balas
  `invalid_client`, aktifkan lagi → login berhasil lagi, secret ter-rotasi & scope baru
  langsung berlaku di token berikutnya.
- Sudah dikerjakan (sesi sebelumnya): **migrasi database dari Postgres ke MariaDB 11.6** —
  lihat "Kenapa MariaDB" di atas untuk detail konsekuensi teknisnya. Semua query, schema,
  driver (`pg` → `mysql2`), dan env var (`POSTGRES_*` → `DB_*`) dikonversi di `auth-service`
  dan `service-a` (contoh service bisnis yang dipakai waktu itu untuk verifikasi — sudah
  dihapus, lihat catatan "service-a dihapus" di bawah). Diverifikasi end-to-end di container
  yang benar-benar jalan (bukan cuma syntax-check): token issuance, list/create data lewat
  gateway, rotasi refresh token, reuse refresh token lama ditolak, revoke manual, scope tidak
  cukup → 403, tanpa token → 401, akses langsung ke service tanpa gateway → 403, dan seluruh
  CLI admin (`manage-client.sh`: create/rotate secret/ubah scope/suspend) jalan normal di atas
  MariaDB.
- **`service-a` dihapus** (sesi ini) — awalnya cuma service contoh/demo (orders in-memory lalu
  di-MariaDB-kan) untuk membuktikan pola gateway sebelum ada service bisnis sungguhan; sekarang
  sudah ada 7 service bisnis nyata (hasil port `RESTFULL-API-EXPRESSJS`), jadi service-a tidak
  perlu dipertahankan. Yang ikut dibersihkan: folder `services/service-a/`, router+service
  block-nya di `traefik/dynamic/routers.yml`, entry-nya di
  `auth-service/src/config/services.js`, tabel `orders` (drop dari `auth-service/db/init.sql`
  dan dari database yang sedang jalan), scope `orders:read`/`orders:write` (dihapus dari tabel
  `scopes` dan dari `allowed_scopes` kedua demo client — diganti scope dari 7 service bisnis
  yang masih ada), serta folder "2. Service A" dan referensi `/api/orders` di Postman
  collection (dipindah ke `/api/ruangan/list` sebagai target uji rate-limit & negative test).
  `service-ruangan` sekarang jadi contoh referensi paling sederhana kalau mau lihat pola dasar
  sebuah service (lihat "Struktur Folder" di bawah).
- **TLS/HTTPS sudah aktif** (sesi ini) — entrypoint `websecure` (443, host `8443`) + sertifikat
  di-load dari `traefik/certs/` (lihat `traefik/dynamic/tls.yml`), `web` (80, host `8081`)
  sekarang cuma redirect paksa ke `websecure`. Ditujukan untuk dipakai di belakang **Cloudflare
  mode "Full (strict)"** — lihat bagian "TLS / SSL (Cloudflare)" di bawah untuk cara generate
  Origin CA certificate asli. Saat ini `traefik/certs/` masih berisi sertifikat **self-signed
  placeholder** (di-generate lewat `openssl` supaya Traefik bisa start) — **ganti dengan
  Cloudflare Origin CA certificate asli sebelum expose ke internet**, kalau tidak Cloudflare
  akan menolak koneksi ke origin (Full strict memvalidasi CA-nya).
- **Hardening produksi Cloudflare** (sesi ini, lihat "TLS / SSL (Cloudflare)" untuk detail) —
  tiga hal ini dikerjakan sekaligus dengan TLS karena saling terkait:
  1. **`cloudflare-ips`** — middleware `IPAllowList` baru di `traefik/dynamic/middlewares.yml`,
     jadi langkah pertama di `gateway-chain` dan di router `auth-token` — origin cuma menerima
     koneksi dari IP range Cloudflare (https://www.cloudflare.com/ips/, verifikasi ulang berkala
     kalau ganti) + loopback (`127.0.0.1`/`::1`, supaya curl/Newman lokal tetap jalan). Tanpa ini
     siapa pun yang tahu IP asli origin bisa bypass Cloudflare (WAF/DDoS-protection-nya) langsung.
     **Catatan dev Mac/Windows**: Docker Desktop tidak meneruskan `127.0.0.1` asli ke container
     (traffic host→published-port muncul dari gateway VM-nya, di mesin ini `192.168.65.0/24`) —
     baris itu juga ada di allowlist, khusus untuk dev; di server Linux produksi asli baris itu
     tidak relevan (boleh dihapus, `127.0.0.1/::1` saja cukup).
  2. **`forwardedHeaders.trustedIPs`** (di `traefik/traefik.yml`, entrypoint `web` & `websecure`)
     + `rate-limit-ip` sekarang pakai `sourceCriterion.ipStrategy.depth: 1` — supaya Traefik
     baca IP visitor asli dari `X-Forwarded-For` yang dikirim Cloudflare, bukan IP edge
     Cloudflare (yang sama untuk banyak visitor sekaligus, bisa bikin rate-limit-per-IP salah
     sasaran/terlalu ketat kalau tidak dibenerin). **Belum bisa diverifikasi dengan traffic
     Cloudflare asli** dari sesi ini (butuh domain live di belakang Cloudflare) — cek
     `ClientAddr`/`ClientHost` di access log Traefik setelah live, harus IP visitor asli bukan
     IP edge Cloudflare, dan uji rate-limit-ip dengan 2 visitor beda IP lewat Cloudflare tidak
     saling mempengaruhi kuota.
  3. Dashboard Traefik (`traefik/docker-compose.yml`) sekarang di-bind `127.0.0.1:8080:8080`
     (bukan `0.0.0.0`) — tidak reachable dari luar mesin ini sama sekali, terlepas dari IP
     allowlist di atas. Akses remote lewat SSH tunnel: `ssh -L 8080:localhost:8080 <host>`.
- **Belum dikerjakan** (urutan prioritas untuk sebelum dipakai produksi/multi-tenant nyata):
  1. ~~Tidak ada TLS~~ — selesai, lihat poin "TLS/HTTPS sudah aktif" di atas. Satu-satunya sisa:
     ganti sertifikat placeholder dengan Cloudflare Origin CA asli sebelum expose ke internet.
  2. Access token (JWT) masih tidak bisa di-revoke sebelum expired 15 menit — yang sudah
     bisa di-revoke cuma refresh token. Kalau butuh revoke access token instan, harus pindah
     ke pola introspeksi per-request (lebih lambat) atau token blocklist di Redis.
  3. ~~Traefik dashboard tanpa auth~~ — selesai (di-bind ke loopback, lihat "Hardening produksi
     Cloudflare" di atas). Kalau suatu saat butuh dashboard reachable dari luar tanpa SSH
     tunnel, tambahkan `BasicAuth` middleware + expose lewat router eksplisit, jangan buka
     `api.insecure` ke publik.
  4. JWT pakai HS256 (secret simetris) — aman selama hanya `auth-service` yang verifikasi;
     kalau nanti ada verifier lain (mis. plugin JWT di Traefik), pertimbangkan RS256/ES256.
  5. CRUD client sekarang bisa lewat CLI (`./auth-service/manage-client.sh`, lihat di atas), tapi belum ada
     **admin API via HTTP** — kalau nanti butuh dikelola dari luar terminal (mis. dashboard
     partner self-service), endpoint admin perlu dibuat terpisah dengan auth sendiri (jangan
     taruh di belakang scope client biasa).
  6. Refresh token yang expired/revoked tidak pernah dibersihkan dari tabel — perlu job
     cleanup periodik supaya tabel `refresh_tokens` tidak tumbuh tanpa batas.
  7. Rate limit per-client saat ini **satu tier untuk semua** (average 20/burst 40) — kolom
     `rate_limit_tier` di tabel `clients` belum benar-benar dipakai untuk membedakan kuota
     (Traefik native middleware tidak baca DB per-request). Kalau butuh kuota beda per tier,
     limiting harus pindah ke `auth-service` sendiri (token bucket di MariaDB/Redis, dicek
     di `/verify`, balas 429 dari sana) — sudah dicatat, belum dikerjakan.
  8. Setiap service masih pakai kredensial database yang sama (`DB_USER`) — belum ada role DB
     terpisah per service dengan akses dibatasi hanya ke tabelnya sendiri.
  9. 6 dari 7 service bisnis baru (semua kecuali `service-telegram`) butuh kredensial
     `DATABASE_URL_<NAMA>` asli ke database eksternal kampus (SIADE/SIADE_OLD/SIMAKU/PAYMENT)
     yang belum diisi — scaffolding (routing, auth, scope-check, validasi) sudah teruji jalan,
     tapi query SQL sesungguhnya belum pernah dieksekusi terhadap data nyata. Setelah
     kredensial diisi di `.env` masing-masing, uji ulang tiap endpoint terhadap data asli
     sebelum dianggap production-ready — lihat tabel "Service bisnis baru" di atas.
  10. `demo-client`/`readonly-client` belum diberi scope apa pun dari 7 service baru (`ruangan:
      list`, `pegawai:list`, dst.) — grant lewat `./auth-service/manage-client.sh` kalau mau
      dites lewat gateway.

Dua penyesuaian dari rencana awal di atas, dengan alasan:

1. **Routing pakai file provider Traefik, bukan Docker provider/labels.**
   Docker provider butuh mount `/var/run/docker.sock` ke container Traefik — itu artinya
   Traefik punya akses setara root ke Docker host (bisa start/stop container apa saja).
   Untuk API gateway yang diakses banyak user eksternal, ini memperbesar blast radius kalau
   Traefik ter-compromise. Jadi routing didefinisikan statis di `traefik/dynamic/routers.yml`
   (host ke container lain lewat nama service di `gateway-net`). Kalau nanti service makin
   banyak dan mau auto-discovery, boleh reconsider Docker provider tapi tambahkan socket-proxy
   (mis. `tecnativa/docker-socket-proxy`) di antaranya, jangan mount socket langsung.

2. **Auth + scope-check pakai `forwardAuth` (middleware native Traefik) ke `auth-service`,
   bukan Traefik plugin (Yaegi).** Plugin Traefik komunitas untuk JWT/scope butuh setup
   plugin registry/local plugin dev mode dan quality-nya bervariasi (banyak yang tidak
   ter-maintain). `forwardAuth` sudah built-in, well-tested, dan karena scope-check butuh
   data dinamis (client & scope tersimpan di Auth Service), tetap perlu ada network call ke
   luar Traefik — jadi keuntungan "plugin in-process" nggak terlalu kepakai di sini. Kalau ke
   depan mau murni JWT signature check tanpa scope dinamis, plugin JWT dari
   https://plugins.traefik.io bisa dipasang untuk mempercepat (skip 1 network hop), tapi
   scope-check tetap butuh sumber data terpusat.

## TLS / SSL (Cloudflare)

Traefik sekarang punya entrypoint `websecure` (443, dipetakan ke host `8443`) di samping `web`
(80 → host `8081`, sekarang cuma redirect paksa ke `websecure`, lihat `traefik/traefik.yml`).
Setup ini dibuat untuk dipakai di belakang **Cloudflare mode "Full (strict)"** — pilihan paling
aman karena traffic Cloudflare↔origin ikut terenkripsi (bukan cuma browser↔Cloudflare seperti
mode "Flexible").

### Kenapa "Full (strict)", bukan "Flexible"

- **Flexible** — origin (Traefik) boleh tetap HTTP polos. Cloudflare sendiri **tidak
  merekomendasikan** mode ini untuk situs produksi karena Cloudflare↔origin tidak terenkripsi
  (rawan kalau ada yang bisa menyadap jalur itu, mis. hosting di jaringan yang tidak sepenuhnya
  dipercaya).
- **Full (strict)** — Cloudflare memvalidasi CA sertifikat origin, jadi origin **wajib** pakai
  sertifikat yang Cloudflare percaya. Cloudflare menyediakan **Origin CA** gratis khusus untuk
  ini (bukan sertifikat publik biasa — cuma dipercaya oleh Cloudflare, yang memang satu-satunya
  pihak yang perlu percaya karena visitor publik cuma bicara dengan Cloudflare, tidak pernah
  langsung ke origin).

### Cara generate Cloudflare Origin CA Certificate

1. Dashboard Cloudflare → domain terkait → **SSL/TLS → Origin Server → Create Certificate**.
2. Biarkan Cloudflare generate private key (pilihan default, lebih simpel) — pilih key type
   RSA (2048), masukkan hostname yang dilindungi (mis. `api.domainmu.com` atau `*.domainmu.com`),
   masa berlaku bebas (default 15 tahun cukup).
3. Cloudflare akan menampilkan dua blok teks: **Origin Certificate** dan **Private Key** — ini
   cuma ditampilkan **sekali**, simpan segera.
4. Simpan sebagai dua file di `traefik/certs/` (folder ini sudah di-`.gitignore`, jangan pernah
   commit private key):
   ```bash
   # isi dengan blok "Origin Certificate" dari dashboard
   traefik/certs/cloudflare-origin.pem
   # isi dengan blok "Private Key" dari dashboard
   traefik/certs/cloudflare-origin.key
   ```
5. Set mode SSL/TLS domain ini di Cloudflare ke **Full (strict)** (SSL/TLS → Overview).
6. Restart Traefik supaya sertifikat baru ke-load: `cd traefik && docker compose up -d --force-recreate`.
7. Pastikan DNS record domain ini di Cloudflare **di-proxy** (awan oranye, bukan "DNS only") —
   kalau awan abu-abu, Cloudflare tidak pernah jadi perantara dan mode SSL/TLS di atas tidak
   berlaku sama sekali.

**Status saat ini**: `traefik/certs/` masih berisi sertifikat **self-signed placeholder**
(dibuat lewat `openssl req -x509 ...` supaya Traefik bisa start & config bisa dites end-to-end
tanpa akun Cloudflare) — kalau di-cek dari browser/curl akan muncul sebagai "not trusted"
karena memang bukan Origin CA asli. Ini **harus diganti** dengan sertifikat asli dari langkah di
atas sebelum domain benar-benar diarahkan lewat Cloudflare ke origin ini.

### Port di balik Laravel Herd (khusus dev di mesin ini)

Host port `80` dan `443` sudah dipakai Herd untuk domain `.test` lokal, makanya Traefik
dipetakan ke `8081`/`8443` (lihat `traefik/docker-compose.yml`) — pola yang sama seperti port
`8081` yang sudah ada sebelumnya. Kalau project ini di-deploy ke server sungguhan (bukan mesin
dev dengan Herd), ganti pemetaan itu jadi `"443:443"` langsung supaya Cloudflare bisa connect ke
origin port default tanpa konfigurasi tambahan. Kalau tetap mau pakai port non-standar di
deployment nyata (mis. di belakang load balancer lain), Cloudflare mendukung origin port custom
lewat **Origin Rules** (SSL/TLS → Origin Rules), tidak harus 443.

### Testing lokal

Newman/curl ke `https://localhost:8443` akan menolak sertifikat placeholder sebagai untrusted
(itu ekspektasi normal untuk self-signed) — pakai `--insecure`/`-k` selama masih placeholder:
```bash
npx newman run postman/Microcervices-Gateway.postman_collection.json --insecure
curl -k https://localhost:8443/api/ruangan/list -H "Authorization: Bearer <access_token>"
```
Begitu sertifikat Cloudflare Origin CA asli terpasang, flag `-k`/`--insecure` tetap dibutuhkan
untuk testing **langsung dari mesin lokal** (root CA Cloudflare Origin tidak otomatis ada di
trust store OS/browser lokal) — tapi traffic **asli dari Cloudflare** akan tervalidasi penuh
tanpa perlu itu, karena Cloudflare memang mempercayai CA-nya sendiri.

### Checklist pindah ke VPS

Project ini rencananya dipindah dari mesin dev (Mac + Laravel Herd) ke VPS. Beberapa bagian
config sengaja disesuaikan untuk keterbatasan mesin dev ini dan **wajib** diubah balik supaya
benar-benar production-ready di VPS:

1. **Port** — `traefik/.env` (copy dari `.env.example`) isi `TRAEFIK_HTTP_PORT=80` dan
   `TRAEFIK_HTTPS_PORT=443` (default sekarang 8081/8443 karena port 80/443 host dipakai Herd
   di mesin ini). Compose file (`traefik/docker-compose.yml`) sendiri tidak perlu diedit.
2. **Baris `192.168.65.0/24`** di `traefik/dynamic/middlewares.yml` (middleware
   `cloudflare-ips`) — **hapus baris ini**. Itu workaround khusus Docker Desktop Mac/Windows
   (host→published-port terlihat datang dari gateway VM-nya, bukan `127.0.0.1` asli) — di VPS
   (Docker Engine native di Linux) tidak dibutuhkan, dan mempertahankannya cuma menambah
   attack surface kalau kebetulan network internal VPS memakai subnet yang sama. Baris ini
   sudah ditandai jelas dengan blok komentar "DEV-ONLY — HAPUS..." di file itu.
3. **Sertifikat** — ganti `traefik/certs/cloudflare-origin.{pem,key}` placeholder dengan
   Cloudflare Origin CA asli (lihat langkah generate di atas) sebelum DNS domain diarahkan ke
   VPS ini.
4. **DNS** — A record domain di Cloudflare diarahkan ke IP VPS, status **proxied** (awan
   oranye), mode SSL/TLS **Full (strict)**.
5. **Kredensial** — semua `.env` (`auth-service/.env`, tiap `services/<nama>/.env`) masih
   berisi placeholder di repo ini, isi ulang dengan kredensial asli di VPS (`JWT_SECRET`,
   `DB_PASSWORD`, `DATABASE_URL_<NAMA>` per service, `TELEGRAM_BOT_TOKEN`).
6. **Opsional, defense-in-depth tambahan**: firewall level OS di VPS (`ufw`/`iptables`) yang
   juga cuma izinkan port 80/443 dari IP range Cloudflare (https://www.cloudflare.com/ips/) —
   di luar `IPAllowList` Traefik yang sudah jalan di layer aplikasi (poin 2 "Hardening produksi
   Cloudflare" di atas), jadi origin tetap terlindung meski suatu saat ada bug/bypass di layer
   Traefik.

## Kapasitas Database

Setiap database yang dipakai project ini (`mariadb` milik gateway sendiri, maupun database
eksternal kampus kalau kamu self-host salinannya sendiri di Docker) sekarang bisa di-tuning
lewat `.env` tanpa rebuild image — semua nilai di bawah sudah ada default aman untuk VPS
kecil (~1 vCPU/1-2GB RAM khusus database), **sesuaikan begitu tahu spek host asli**.

### Model budget koneksi

Tiap service buka connection pool sendiri-sendiri ke database (`connectionLimit`, sekarang
namanya `DB_POOL_SIZE` di `.env` masing-masing) — **total dari semua pool yang nempel ke
instance database yang SAMA harus punya headroom di bawah `max_connections` database itu**,
jangan pas-pasan (sisakan untuk koneksi admin/monitoring/replikasi). Kalau tidak, service yang
paling akhir connect akan gagal start (`ER_CON_COUNT_ERROR`) begitu database penuh.

Contoh perhitungan untuk `mariadb` milik gateway (default sekarang, cuma dipakai
`auth-service`):
```
DB_MAX_CONNECTIONS (mariadb)  = 300
AUTH_DB_POOL_SIZE              = 20   -> auth-service
--------------------------------------
Headroom tersisa               = 280  (jauh lebih dari cukup untuk 1 service)
```
Kalau nanti semua 7 service bisnis JUGA nempel ke instance database yang sama (bukan 4
database eksternal kampus terpisah seperti disain awal — lihat "Service bisnis baru" di atas),
hitung ulang:
```
DB_MAX_CONNECTIONS            = 300
AUTH_DB_POOL_SIZE              = 20
7x service bisnis x DB_POOL_SIZE(10) masing-masing, TAPI service yang connect ke >1 database
  (service-bipot: 2, service-jadwal: 2, service-khs: 2, service-tagihan: 3) buka SATU POOL
  TERPISAH per nama database (lihat src/db/pools.js: getPool(name), lazy per nama) — jadi
  kalau semua nama itu ujungnya nunjuk ke instance yang sama, pool-nya tetap kehitung
  masing-masing, bukan digabung jadi satu:
  service-ruangan(1) + service-pegawai(1) + service-bipot(2) + service-jadwal(2) +
  service-khs(2) + service-tagihan(3) = 11 pool x 10 = 110
--------------------------------------------------------------------------------------
Total                          = 20 + 110 = 130   -> masih di bawah 300, aman
```
Kalau tiap service nanti di-scale jadi beberapa replica, kalikan lagi dengan jumlah replica.
**Jangan naikkan `DB_POOL_SIZE` sembarangan di satu service tanpa hitung ulang total di atas.**

### Variabel yang bisa di-tuning

`auth-service/.env` (`mariadb` + `auth-service`, lihat `auth-service/docker-compose.yml`):
| Variabel | Default | Fungsi |
|---|---|---|
| `DB_MAX_CONNECTIONS` | 300 | `max_connections` mariadb |
| `DB_BUFFER_POOL_SIZE` | 512M | `innodb_buffer_pool_size` — lever utama untuk throughput baca/tulis (bukan jumlah koneksi), idealnya ~50-70% dari `DB_MEM_LIMIT` |
| `DB_MEM_LIMIT` / `DB_MEM_RESERVATION` | 1g / 512m | Limit & reservation memory container `mariadb` |
| `DB_CPUS` | 1.0 | Limit CPU container `mariadb` |
| `AUTH_DB_POOL_SIZE` | 20 | `connectionLimit` pool `auth-service` ke `mariadb` |
| `AUTH_SERVICE_MEM_LIMIT` / `AUTH_SERVICE_CPUS` | 512m / 1.0 | Limit resource container `auth-service` |

Tiap `services/<nama>/.env` (business service):
| Variabel | Default | Fungsi |
|---|---|---|
| `DB_POOL_SIZE` | 10 | `connectionLimit` — dipakai untuk SETIAP nama database yang di-`getPool()` service ini (lihat model budget di atas) |
| `SERVICE_MEM_LIMIT` / `SERVICE_CPUS` | 256m / 0.5 | Limit resource container service ini |

Selain itu, `mariadb` juga sudah di-tuning tetap (tidak lewat `.env`, jarang perlu diubah):
`innodb-flush-log-at-trx-commit=2` (trade throughput vs durability — lihat komentar di
`auth-service/docker-compose.yml` untuk detail trade-off-nya), `wait-timeout=180` (reclaim
koneksi idle lebih cepat dari default 8 jam), `ulimits.nofile=65536` (supaya tidak kehabisan
file descriptor begitu `max_connections` dinaikkan), dan log container dibatasi
(`max-size: 10m, max-file: 3`) supaya tidak mengisi disk host tanpa batas.

### Sebelum menaikkan angka-angka ini

1. **Load test dulu** (`k6`/`artillery`) untuk tahu komponen mana yang benar-benar jadi
   bottleneck — jangan naikkan `DB_MAX_CONNECTIONS`/`DB_POOL_SIZE` berdasarkan tebakan.
2. Kalau database-nya bukan `mariadb` gateway ini tapi kamu self-host salinan
   SIADE/SIADE_OLD/SIMAKU/PAYMENT sendiri di Docker juga, terapkan pola tuning yang sama
   (command flags + resource limit) di compose file database itu — bukan cuma di `mariadb`
   punya gateway.
3. `DB_BUFFER_POOL_SIZE`/`DB_MEM_LIMIT` jauh lebih menentukan throughput dibanding
   `DB_MAX_CONNECTIONS` — kalau cuma menaikkan jumlah koneksi tanpa menaikkan memory/buffer
   pool, request akan tetap antre menunggu I/O disk, cuma pindah dari "antre di pool" jadi
   "antre di database".

## Postman Collection

`postman/Microcervices-Gateway.postman_collection.json` — import ke Postman, isi seperti
biasa (collection variable `base_url` default `https://localhost:8443`, kredensial demo sudah
terisi; di Postman aktifkan **Settings → SSL certificate verification: OFF** selama sertifikat
masih placeholder self-signed). Cukup klik **Run collection** dari atas ke bawah (urutan folder penting: 1→2→3→4)
atau `npx newman run postman/Microcervices-Gateway.postman_collection.json`.

Isi: 6 request auth flow (token, refresh + rotasi, reuse-ditolak, revoke, revoke-lagi-ditolak),
2 request happy-path ke `service-ruangan` (dipakai sebagai contoh business service — request
2.1/2.2 tolerir 200 ATAU 500, lihat catatan di deskripsi request-nya: 500 itu ekspektasi normal
sampai `DATABASE_URL_SIADE_OLD` di `services/service-ruangan/.env` diisi kredensial asli, bukan
kegagalan test), 8 negative test (401/403/400 termasuk regression test payload jahat yang dulu
bikin crash), dan 2 request rate-limit yang **self-contained** — klik Send sekali di 4.1,
script-nya sendiri yang menembak ~60 request paralel dan assert campuran (200 atau 500)/429
muncul, lalu 4.2 membuktikan client lain tidak ikut kena limit. Sudah divalidasi lewat Newman:
35/35 assertion lolos (di atas `service-ruangan` dengan kredensial placeholder).

## Cara Jalankan & Test

Ada **tiga compose stack terpisah** — jalankan berurutan (network dulu, auth+db, baru
traefik, baru service):

```bash
# 0. Network bersama — dibuat manual SEKALI, tidak dimiliki compose file mana pun
docker network create gateway-net

# 1. MariaDB + Auth Service (1 kesatuan, folder auth-service/, project name "gateway")
cd auth-service
cp .env.example .env
# isi JWT_SECRET (openssl rand -hex 32) dan DB_PASSWORD (openssl rand -hex 24)
docker compose up -d --build
docker compose ps      # pastikan semua "healthy" — container bernama gateway-*

# 2. Traefik (folder traefik/, project name "gateway" juga — lihat catatan di bawah)
cd ../traefik
docker compose up -d
docker compose ps

# 3. Tiap service bisnis, compose sendiri, join gateway-net yang sudah dibuat di atas.
# Pola sama persis untuk ketujuh: ruangan, pegawai, bipot, jadwal, khs, tagihan, telegram —
# tapi kredensial DATABASE_URL_<NAMA>-nya BEDA (database eksternal kampus, bukan mariadb
# gateway) — lihat tabel "Service bisnis baru" di atas untuk tahu nama DB per service.
cd ../services/service-ruangan && cp .env.example .env && docker compose up -d --build
cd ../service-pegawai   && cp .env.example .env && docker compose up -d --build
cd ../service-bipot     && cp .env.example .env && docker compose up -d --build
cd ../service-jadwal    && cp .env.example .env && docker compose up -d --build
cd ../service-khs       && cp .env.example .env && docker compose up -d --build   # image lebih besar (bundle Chromium)
cd ../service-tagihan   && cp .env.example .env && docker compose up -d --build
cd ../service-telegram  && cp .env.example .env && docker compose up -d --build   # isi TELEGRAM_BOT_TOKEN dulu
```

**Penting**: langkah 3 di atas akan tetap `docker compose up -d` sukses (container start,
"healthy" kalau tidak butuh DB — `service-telegram` — atau "unhealthy"/`degraded` kalau butuh
DB tapi kredensialnya masih placeholder) — itu **bukan kegagalan port-nya**, cuma karena
`.env.example` di tiap service masih berisi placeholder `user:password@host`. Isi
`DATABASE_URL_<NAMA>` dengan kredensial asli sebelum mengetes endpoint yang benar-benar query
data.

Kenapa dipisah begini: setiap bagian punya `docker-compose.yml` sendiri di folder-nya
masing-masing — tidak ada compose file di root sama sekali. `mariadb` + `auth-service`
selalu naik/turun bareng (auth-service satu-satunya pemilik skema-nya) jadi digabung 1
`docker-compose.yml` di folder `auth-service/`. `traefik` punya compose sendiri di folder
`traefik/` karena murni proxy stateless, tidak punya data, tidak perlu ikut siklus hidup
database. Keduanya tetap di-pin `name: gateway` yang sama supaya di Docker Desktop grup-nya
kebaca jelas sebagai satu "gateway", bukan dua grup terpisah atau nama folder kebetulan
("traefik"/"auth-service"). Konsekuensinya: `docker compose down` dari salah satu folder
hanya mematikan service yang didefinisikan di file itu, dan compose akan warning "orphan
containers" untuk service dari compose file "gateway" satunya — itu bukan error, cukup
abaikan (atau matikan dari kedua folder kalau mau stop total). Tiap service bisnis
(`service-ruangan`, dst.) masing-masing bisa dideploy/discale/dimatikan sendiri sebagai
compose project terpisah — makanya muncul sebagai grup sendiri juga (nama service-nya
masing-masing) di Docker Desktop, bukan tercampur jadi satu.

Network `gateway-net` sengaja **tidak dimiliki** compose file mana pun (`external: true` di
semua compose) — dibuat manual sekali di awal. Kalau salah satu compose yang "memiliki"
network-nya (bukan external), compose lain akan warning "network exists but was not created
for project X" begitu ada lebih dari satu compose project yang memakainya.

Gateway di `https://localhost:8443` (HTTPS, entrypoint `websecure` — bukan port 443 langsung
karena port 443 host dipakai Laravel Herd; `http://localhost:8081` sekarang cuma redirect ke
situ). Testing lokal butuh `-k`/`--insecure` selama sertifikat masih placeholder self-signed —
lihat bagian "TLS / SSL (Cloudflare)" di atas. Dashboard Traefik (dev-only, tanpa auth):
`http://localhost:8080/dashboard/`.

Demo client di-seed lewat `auth-service/db/init.sql` (hanya jalan otomatis kalau volume
`mariadb_data` masih kosong / first run):
- `demo-client` / `demo-secret` — semua scope 7 service bisnis (baca + tulis, mis.
  `ruangan:list`, `tagihan:create`, `telegram:send-message`, dst.)
- `readonly-client` / `readonly-secret` — cuma scope baca/lookup (`ruangan:list`,
  `pegawai:list`, `pegawai:cek`, `bipot:list`, `jadwal:list`, `khs:cetak`, `tagihan:cek`),
  tidak termasuk yang membuat/mengubah data

Untuk client baru di luar seed itu (atau rotate secret / ubah scope / suspend client yang
sudah ada), pakai CLI interaktif — bukan SQL manual:
```bash
./auth-service/manage-client.sh   # butuh auth-service sudah "up" (docker compose ps)
```

```bash
# -k/--insecure di semua contoh di bawah cuma dibutuhkan selama traefik/certs/ masih
# sertifikat placeholder self-signed — begitu Cloudflare Origin CA asli terpasang dan
# request datang dari Cloudflare (bukan langsung dari mesin lokal), flag ini tidak relevan.

# 1. Client credentials grant -> dapat access_token (15 menit) + refresh_token (7 hari)
curl -k -X POST https://localhost:8443/oauth/token \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"client_credentials","client_id":"demo-client","client_secret":"demo-secret"}'

# 2. Pakai access_token ke salah satu service bisnis lewat gateway (contoh: service-ruangan —
# butuh DATABASE_URL_SIADE_OLD asli di services/service-ruangan/.env supaya balas 200 dengan
# data sungguhan, kalau belum tetap lolos gateway tapi service sendiri balas 500)
curl -k https://localhost:8443/api/ruangan/list -H "Authorization: Bearer <access_token>"

# 3. Tukar refresh_token jadi access_token baru (refresh_token lama otomatis di-revoke/rotasi)
curl -k -X POST https://localhost:8443/oauth/token \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"refresh_token","refresh_token":"<refresh_token>"}'

# 4. Revoke refresh_token secara manual (perlu autentikasi client, mirip RFC 7009)
curl -k -X POST https://localhost:8443/oauth/revoke \
  -H "Content-Type: application/json" \
  -d '{"client_id":"demo-client","client_secret":"demo-secret","token":"<refresh_token>"}'
```

Sudah diverifikasi: request tanpa token → 401, scope tidak cukup → 403 `insufficient_scope`,
client_secret salah → 401 `invalid_client`, token acak/invalid → 401, akses langsung ke
container service bisnis (mis. `service-ruangan:5000`) tanpa lewat gateway → 403 (defense in
depth), endpoint internal `/verify` tidak reachable dari luar, refresh token lama tidak bisa
dipakai lagi setelah rotasi, dan refresh token yang sudah di-revoke ditolak. Payload jahat
(`scope`/`client_secret` bukan string) sudah tidak lagi menjatuhkan service — hanya 400.

**Menambah service baru** (misalnya `service-b`), contoh ikuti pola salah satu dari 7 service
bisnis yang sudah ada — `service-ruangan` yang paling sederhana (1 DB eksternal, 1 route):
1. Buat folder `services/service-b` dengan `Dockerfile` + `docker-compose.yml` sendiri (lihat
   `services/service-ruangan/docker-compose.yml` sebagai contoh) — network `gateway-net`
   sebagai `external: true`. Compose file-nya berdiri sendiri, tidak digabung ke compose milik
   `traefik`/`auth-service`.
2. Expose `GET /scopes` di service itu — manifest berisi `{ service, routes: [{ method, path,
   scope, description }] }`. **Tidak perlu edit apa pun di `auth-service`** untuk
   mendaftarkan scope — auto-discovered.
3. Daftarkan service itu di `auth-service/src/config/services.js` (`name`, `baseUrl`,
   `gatewayPrefix` — harus sama dengan prefix router-nya di Traefik). Ini SATU-SATUNYA
   tempat di `auth-service` yang perlu disentuh untuk service baru.
4. Tambahkan router+service baru di `traefik/dynamic/routers.yml` dengan middleware
   `gateway-chain`.
5. Update `allowed_scopes` client yang relevan lewat `./auth-service/manage-client.sh`
   (atau SQL langsung kalau perlu).
6. Jalankan: `docker compose up -d --build` di `auth-service/` dulu kalau ada perubahan di
   sana (mis. `config/services.js`), lalu `docker compose up -d` di `traefik/` kalau ada
   perubahan dynamic config, baru `cd services/service-b && docker compose up -d --build`.

---

## Tujuan Utama

- Traefik sebagai **single entrypoint** ke semua microservice.
- Mendukung **banyak client/tenant** — bukan cuma satu aplikasi frontend.
- Autentikasi & otorisasi berbasis **Client + Scope** (mirip OAuth2 Client Credentials),
  bukan sekadar API key polos.
- **Utamakan Traefik plugin** untuk logic gateway (auth, rate limit, dll) dibanding
  menulis reverse-proxy custom — plugin dipasang lewat Traefik Plugin Catalog
  (https://plugins.traefik.io) atau lewat Traefik Hub/Yaegi plugin.
- Middleware harus reusable & terdefinisi di dynamic config, bukan hardcode di tiap service.

---

## Arsitektur Tingkat Tinggi

```
Client (App/Partner)
      │  Authorization: Bearer <token>  atau  X-Client-Id / X-Client-Secret
      ▼
┌─────────────────────────────────────────────┐
│                  TRAEFIK                     │
│  entrypoints: web (80), websecure (443)      │
│                                               │
│  Middleware chain (per router):              │
│   1. rate-limit          (plugin/native)     │
│   2. security-headers    (native)            │
│   3. auth (jwt / forwardAuth ke Auth Service)│
│   4. scope-check         (plugin/forwardAuth)│
│   5. strip-prefix / rewrite (native)         │
└───────────────┬───────────────────────────────┘
                │
     ┌──────────┼───────────┬─────────────┐
     ▼          ▼           ▼             ▼
 Auth Service  Service A  Service B   Service C ...
 (client, scope,
  token issuer)
```

- **Auth Service** (control plane) adalah service terpisah — bebas stack (Laravel/Node/Go) —
  yang menyimpan data **Client** dan **Scope**, serta menerbitkan & memvalidasi token.
  Traefik tidak menyimpan state, cukup memanggil Auth Service lewat `forwardAuth` atau
  memvalidasi JWT lewat plugin.

---

## Traefik: Konfigurasi Dasar

- Gunakan **dynamic configuration** via file provider (`dynamic/*.yml`) atau Docker labels
  jika service di-deploy via Docker Compose — jangan campur keduanya untuk hal yang sama.
- Setiap microservice = 1 `router` + 1 `service` di Traefik, dengan `middlewares` yang
  di-chain lewat middleware group, bukan didefinisikan ulang di tiap router.
- Aktifkan `websecure` (TLS) sebagai entrypoint utama untuk publik; `web` hanya redirect ke
  `websecure`.
- Aktifkan Traefik **access log** (JSON format) untuk audit trail per client (butuh untuk
  tracing pemakaian per scope/client).

---

## Middleware — Urutan Wajib

Urutan chain per router (dari luar ke dalam) — **implementasi aktual, dua lapis rate-limit**:

0. **cloudflare-ips** — `IPAllowList`, jalan PALING AWAL (sebelum rate-limit sekalipun) —
   tolak koneksi yang tidak datang dari IP range Cloudflare/loopback lokal. Ini yang mencegah
   bypass Cloudflare langsung ke origin lewat IP asli server (lihat "TLS / SSL (Cloudflare)").
1. **rate-limit-ip** — proteksi kasar per-IP, jalan SEBELUM auth (client belum punya
   identitas di titik ini, auth-service belum tentu sudah dipanggil) — cuma anti-flood
   dasar, limitnya longgar (average 20/burst 40 di router `/oauth`, atau 50/100 di
   `gateway-chain`). Pakai `ipStrategy.depth: 1` supaya baca IP visitor asli dari
   `X-Forwarded-For` yang dipercaya dari Cloudflare (`forwardedHeaders.trustedIPs` di
   `traefik.yml`), bukan IP edge Cloudflare yang sama untuk banyak visitor.
2. **security headers** — native `Headers` middleware (HSTS, X-Frame-Options, dll).
3. **auth** — validasi identitas client (`forwardAuth` ke Auth Service), sekaligus
   menyisipkan header `X-Client-Id` ke request untuk middleware/service berikutnya.
4. **rate-limit-client** — kuota per-`client_id` sesungguhnya (via `sourceCriterion.
   requestHeaderName: X-Client-Id`), jalan SETELAH auth supaya headernya sudah ada. Ini
   yang bikin satu client tidak bisa menghabiskan kuota client lain walau berbagi IP/NAT —
   sudah diverifikasi dengan load test paralel.
5. **scope-check** — digabung jadi satu hop dengan langkah auth di atas (endpoint `/verify`
   auth-service memvalidasi token DAN scope sekaligus), bukan middleware terpisah.
6. **stripprefix/rewrite** — normalisasi path sebelum diteruskan ke service.

Semua middleware didefinisikan sekali di `traefik/dynamic/middlewares.yml` lalu
direferensikan sebagai middleware group (`chain`) di setiap router, supaya konsisten
antar service.

---

## Traefik Plugin — Prioritas Pemakaian

**Prinsip: logic gateway (auth, rate limit, transformasi) lewat plugin/middleware native
Traefik dulu. Tulis service custom hanya untuk yang benar-benar butuh state (data client,
scope, token).**

Kategori plugin yang perlu dicari di Plugin Catalog (https://plugins.traefik.io) saat
implementasi — cek versi & maintenance status sebelum pin ke `traefik.yml`:

| Kebutuhan | Pendekatan |
|---|---|
| Validasi JWT (signature, exp, claim scope) | Plugin JWT di catalog, atau `forwardAuth` ke Auth Service kalau butuh cek scope dinamis dari DB |
| OAuth2 / OIDC login (kalau ada user login, bukan cuma client-to-client) | Plugin OIDC di catalog |
| Rate limiting per client/tenant | Native `RateLimit` middleware (per router) + plugin kalau butuh limit dinamis per client dari DB/Redis |
| API key auth sederhana (service internal) | Plugin API-key di catalog, atau header check via `forwardAuth` |
| IP allowlist / geoblock (opsional, untuk partner tertentu) | Native `IPAllowList` atau plugin geoblock |
| Request/response transform | Native `Headers`, `ReplacePath`, atau plugin body transform kalau perlu |
| Circuit breaker / retry ke backend | Native `CircuitBreaker` & `Retry` middleware |

Catatan: nama plugin di catalog berubah-ubah dan ada yang tidak ter-maintain — **selalu
verifikasi langsung di plugins.traefik.io saat mau install**, jangan asal pin versi lama.

---

## Model Data: Client & Scope

Ini bagian yang **wajib ada** di Auth Service (bukan di Traefik):

### Client
```
client_id        (public, unique)
client_secret    (hashed, never plaintext di DB/log)
name             (nama aplikasi/partner)
allowed_scopes   (list scope yang boleh diminta client ini)
status           (active / suspended / revoked)
rate_limit_tier  (basic / premium / internal — dipakai middleware rate-limit)
created_at / rotated_at
```

### Scope
```
scope_name       (mis. "ruangan:list", "tagihan:create", "khs:cetak")
description
service          (microservice mana yang punya resource ini)
```

### Token (issued oleh Auth Service)
- **Access token**: JWT (HS256) berisi `sub` (client_id), `scopes: []`, `exp`, `iat`. TTL 15
  menit, stateless — tidak tersimpan di DB, tidak bisa di-revoke sebelum expired.
- **Refresh token**: opaque random string (bukan JWT), TTL 7 hari, disimpan **di-hash**
  (SHA-256) di tabel `refresh_tokens`. Dipakai untuk minta access token baru tanpa kirim
  ulang `client_secret`. Rotasi otomatis tiap dipakai (token lama langsung di-revoke), dan
  bisa di-revoke manual lewat `/oauth/revoke`.
- Traefik middleware **auth** cukup verifikasi signature + expiry access token.
- Traefik middleware **scope-check** cocokkan `scopes` di token vs scope yang dibutuhkan
  route — route→scope map di-**discover otomatis** dari manifest `/scopes` tiap service
  (lihat `auth-service/src/scopeRegistry.js`), bukan ditulis manual.

### Alur Client Credentials
```
1. Client -> POST /oauth/token (client_id + client_secret) -> Auth Service
2. Auth Service validasi client, cek scope yang diminta vs allowed_scopes
3. Auth Service terbitkan JWT (scopes sesuai yang disetujui)
4. Client pakai JWT sebagai Bearer token ke semua request lewat Traefik
5. Traefik validasi token + scope di setiap request sebelum diteruskan ke service
```

---

## Struktur Folder (usulan)

```
Microcervices/                    # root TIDAK punya docker-compose.yml sendiri
├── traefik/
│   ├── docker-compose.yml        # HANYA traefik — proxy stateless, project name "gateway"
│   ├── traefik.yml               # static config (entrypoints, providers)
│   └── dynamic/
│       ├── middlewares.yml       # semua middleware & chain, reusable
│       └── routers.yml           # routers + services per microservice
├── auth-service/                 # control plane: client, scope, token issuer, refresh/revoke
│   ├── docker-compose.yml        # mariadb + auth-service, project name "gateway" juga
│   ├── .env                       # JWT_SECRET, DB_USER/DB_PASSWORD/DB_NAME
│   ├── manage-client.sh           # CLI admin: create/rotate secret/ubah scope/suspend client
│   ├── db/
│   │   └── init.sql               # schema + seed, jalan otomatis first run MariaDB
│   ├── scripts/
│   │   ├── manage-client.js       # npm run manage-client — dipanggil manage-client.sh
│   │   └── lib/ui.js
│   └── src/{config,data,db,routes}/
└── services/
    ├── service-ruangan/           # hasil port RESTFULL-API-EXPRESSJS — pola paling sederhana,
    │                               # jadikan contoh kalau mau lihat struktur dasar tiap service:
    │   ├── docker-compose.yml     # 1 DB eksternal (SIADE_OLD), 1 route
    │   ├── .env.example           # DATABASE_URL_SIADE_OLD
    │   └── src/{db,utils,services}/, index.js
    ├── service-pegawai/           # sama seperti service-ruangan, 2 route (list, cek)
    ├── service-bipot/             # +salinan privat services/mahasiswa.service.js (2 DB: SIMAKU, SIADE)
    ├── service-jadwal/            # 2 DB (SIADE, SIADE_OLD), 1 route POST
    ├── service-khs/                # 2 DB + puppeteer/ejs (generate PDF) — lihat src/views/khs.ejs,
    │                               # src/assets/favicon-32x32.png, src/utils/pdf.js, Dockerfile
    │                               # beda (install Chromium lewat apk sebelum npm install)
    ├── service-tagihan/           # paling berat: 3 DB (PAYMENT, SIADE, SIMAKU) + salinan privat
    │                               # mahasiswa.service.js DAN bipot.service.js, 4 route
    ├── service-telegram/          # satu-satunya TANPA database — cuma proxy ke Telegram Bot API
    └── service-b/                 # pola yang sama untuk tiap service baru berikutnya
```

Ketujuh service di atas (`service-ruangan` s.d. `service-telegram`) semuanya punya struktur
internal yang sama: `src/utils/{ApiResponse,AppError,validate}.js` (envelope + error class +
helper validasi zod, lihat "Response Envelope" di atas), `src/db/pools.js` (kalau butuh
database eksternal — lihat "Service bisnis baru" di atas), `src/services/*.service.js` (query
logic, port verbatim dari `RESTFULL-API-EXPRESSJS`), dan `src/index.js` (express app: health,
`/scopes`, guard `X-Client-Id`, route(s), 404, error handler — semua identik satu sama lain,
lihat `service-ruangan` sebagai contoh paling ringkas).

---

## Keamanan — Wajib Dicek

- `client_secret` di-hash (mis. bcrypt/argon2), tidak pernah di-log.
- Rotasi secret didukung tanpa downtime (client bisa punya 2 secret aktif sementara).
- Rate limit per `client_id`, bukan cuma per IP (banyak client bisa di belakang NAT/IP sama).
- Semua traffic publik lewat HTTPS (`websecure`), HTTP redirect paksa ke HTTPS.
- Access log per request minimal catat: `client_id`, route, status code, latency — untuk
  audit & billing/usage tracking per client.
- Scope check terjadi di gateway (Traefik), bukan diserahkan ke masing-masing service —
  supaya konsisten dan service tidak perlu re-implement auth logic.

---

## Next Steps

Checklist implementasi awal — **selesai semua**:
- [x] Setup `traefik.yml` (static config) + entrypoint `web` + `websecure` (TLS, lihat "TLS /
      SSL (Cloudflare)")
- [x] Setup Auth Service: model Client & Scope (di database), endpoint `/oauth/token`,
      `/oauth/revoke`, `/verify` (gabungan auth + scope-check + introspect)
- [x] `forwardAuth` ke Auth Service (bukan plugin Yaegi — lihat alasan di atas)
- [x] Middleware chain reusable di `dynamic/middlewares.yml`
- [x] Rate-limit per client (dua lapis: IP kasar + client_id halus)
- [x] Access logging JSON (Traefik `accessLog.format: json`)
- [x] Uji end-to-end: token → akses service → scope ditolak kalau tidak sesuai
- [x] TLS/HTTPS di entrypoint (`websecure`), redirect paksa `web`→`websecure`, disiapkan untuk
      Cloudflare "Full (strict)" — sertifikat asli (Origin CA) masih perlu di-generate manual,
      lihat "TLS / SSL (Cloudflare)"

Sisa pekerjaan menuju production — lihat daftar **"Belum dikerjakan"** di bagian
**Status Implementasi** paling atas file ini (itu daftar yang selalu up to date, bukan yang
di sini).
