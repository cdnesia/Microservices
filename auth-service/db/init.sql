-- Dijalankan otomatis oleh image mariadb saat data directory masih kosong (first run saja).
-- Untuk perubahan schema setelah itu, jalankan migrasi manual / tool migrasi terpisah.
--
-- File ini tinggal di auth-service/ karena compose yang men-start container mariadb
-- sekarang ada di auth-service/docker-compose.yml (lihat file itu untuk alasannya).
--
-- allowed_scopes & refresh_tokens.scopes disimpan sebagai TEXT comma-separated, bukan array
-- (MariaDB tidak punya tipe array seperti Postgres) — di-parse jadi array di layer JS
-- (lihat auth-service/src/data/clients.js & refreshTokens.js).

CREATE TABLE IF NOT EXISTS clients (
  client_id           VARCHAR(64) PRIMARY KEY,
  client_secret_hash  VARCHAR(255) NOT NULL,
  name                VARCHAR(255) NOT NULL,
  allowed_scopes      TEXT NOT NULL DEFAULT ('') ,
  status              VARCHAR(20) NOT NULL DEFAULT 'active',
  rate_limit_tier     VARCHAR(20) NOT NULL DEFAULT 'basic',
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rotated_at          DATETIME NULL
) ENGINE=InnoDB;

-- Katalog scope — diisi otomatis oleh auth-service lewat scope discovery
-- (baca manifest /scopes dari tiap service), bukan diketik manual di sini.
CREATE TABLE IF NOT EXISTS scopes (
  scope_name    VARCHAR(100) PRIMARY KEY,
  description   TEXT,
  service_name  VARCHAR(100) NOT NULL,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          VARCHAR(36) PRIMARY KEY,
  client_id   VARCHAR(64) NOT NULL,
  token_hash  VARCHAR(64) NOT NULL UNIQUE,
  scopes      TEXT NOT NULL,
  expires_at  DATETIME NOT NULL,
  revoked_at  DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_refresh_tokens_client (client_id),
  INDEX idx_refresh_tokens_expires (expires_at),
  CONSTRAINT fk_refresh_tokens_client FOREIGN KEY (client_id)
    REFERENCES clients(client_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Seed demo client (client_secret_hash = bcrypt("demo-secret") / bcrypt("readonly-secret")).
-- allowed_scopes adalah keputusan admin (siapa boleh scope apa) — bukan hasil discovery.
-- demo-client dapat semua scope (baca + tulis) dari 7 service bisnis; readonly-client cuma
-- yang sifatnya baca/lookup (list/cek/cetak), tidak termasuk yang membuat/mengubah data.
INSERT IGNORE INTO clients (client_id, client_secret_hash, name, allowed_scopes, status, rate_limit_tier)
VALUES
  ('demo-client', '$2a$10$zAWRAVI/ux9WO5va1x0ht.bv3pRvyYdvI2/1vUnnIiKh/3k/8ZeAS', 'Demo Full Access Client', 'ruangan:list,pegawai:list,pegawai:cek,bipot:list,jadwal:list,khs:cetak,tagihan:create,tagihan:create-spp,tagihan:update,tagihan:cek,telegram:send-message', 'active', 'basic'),
  ('readonly-client', '$2a$10$tJ4DlH.DTFzPkIip2YLWu.49Kj1rSFryDQR0wHg/9p9/36EQpAUjC', 'Demo Read-Only Client', 'ruangan:list,pegawai:list,pegawai:cek,bipot:list,jadwal:list,khs:cetak,tagihan:cek', 'active', 'basic');
