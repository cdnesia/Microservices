const mysql = require('mysql2/promise');

// service-simawa butuh lebih dari satu database eksternal sekaligus (SIMAWA data lokal +
// SIADE, SIADE_OLD, PAYMENT, SIMKEU akademik/keuangan kampus) — pola ini sama persis dengan
// service-bipot/service-jadwal/service-khs/service-tagihan: satu pool per nama DB, dibuat
// lazy saat pertama dipakai. Lihat src/db/pools.js di service-tagihan sebagai referensi asal.
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
