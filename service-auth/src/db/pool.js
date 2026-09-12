const mysql = require('mysql2/promise');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL env var wajib di-set');
}

// Parse manual (bukan lewat opsi `uri` mysql2) supaya konfigurasi pool (connectionLimit,
// timezone, dst.) pasti kepakai — bukan bergantung ke bagaimana mysql2 mem-parsing query
// string di URI, yang tidak terdokumentasi jelas untuk opsi selain host/user/password/db.
const parsed = new URL(DATABASE_URL);

const pool = mysql.createPool({
  host: parsed.hostname,
  port: parsed.port ? Number(parsed.port) : 3306,
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database: parsed.pathname.replace(/^\//, ''),
  waitForConnections: true,
  // Configurable lewat DB_POOL_SIZE tanpa rebuild image — total connectionLimit semua
  // service yang nempel ke instance database yang sama harus punya headroom di bawah
  // max_connections instance itu, bukan asal di-set besar di satu sisi saja (lihat
  // CLAUDE.md bagian "Kapasitas Database").
  connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
  // DATETIME di MariaDB disimpan tanpa timezone — paksa koneksi selalu UTC ('Z') supaya
  // konsisten dengan asumsi lama (TIMESTAMPTZ Postgres yang implisit UTC), tidak ikut
  // timezone host/container yang menjalankan Node.
  timezone: 'Z',
});

module.exports = pool;
