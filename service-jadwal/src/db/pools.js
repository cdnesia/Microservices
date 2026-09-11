const mysql = require('mysql2/promise');

// Beberapa service (bipot, jadwal, khs, tagihan) butuh lebih dari satu database eksternal
// sekaligus (SIADE, SIADE_OLD, SIMAKU, PAYMENT) — pola ini digeneralisasi dari
// services/service-a/src/db/pool.js (parse URL manual, bukan opsi `uri` mysql2, supaya
// connectionLimit/timezone pasti kepakai) tapi dengan satu pool per nama DB, dibuat lazy
// saat pertama dipakai. Sama seperti getPool(name) di project lama (RESTFULL-API-EXPRESSJS).
const pools = new Map();

function parseDatabaseUrl(name) {
  const url = process.env[`DATABASE_URL_${name}`];
  if (!url) {
    throw new Error(`DATABASE_URL_${name} env var wajib di-set`);
  }
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
  };
}

function getPool(name) {
  if (pools.has(name)) return pools.get(name);

  const pool = mysql.createPool({
    ...parseDatabaseUrl(name),
    waitForConnections: true,
    // Configurable lewat DB_POOL_SIZE (docker-compose.yml service ini) supaya bisa
    // disesuaikan ke DB_MAX_CONNECTIONS database tanpa rebuild image — lihat CLAUDE.md
    // bagian "Kapasitas Database" untuk budget total lintas service.
    connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
    timezone: 'Z',
  });
  pools.set(name, pool);
  return pool;
}

// Dipanggil sekali saat boot dengan nama DB yang dibutuhkan service ini, supaya
// DATABASE_URL_<NAME> yang belum di-set ketahuan langsung saat start, bukan nanti pas
// request pertama yang kebetulan butuh DB itu.
function assertConfigured(names) {
  names.forEach((name) => getPool(name));
}

module.exports = { getPool, assertConfigured };
