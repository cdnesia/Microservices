const services = require('./config/services');
const pool = require('./db/pool');

const FETCH_TIMEOUT_MS = 3000;

// In-memory route -> scope map, dibangun ulang oleh discoverScopes(). Deny-by-default:
// kalau kosong atau tidak ada yang cocok, resolveRequiredScope() mengembalikan null
// dan /verify menolak request (lihat routes/verify.js).
let routeScopeMap = [];

async function fetchManifest(service) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${service.baseUrl}/scopes`, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`status ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// Ambil manifest /scopes dari setiap service terdaftar (lihat config/services.js),
// bangun ulang route->scope map, dan upsert katalog scope ke DB (tabel `scopes`)
// supaya scope yang dimiliki tiap service terlihat terpusat tanpa didata ulang manual.
async function discoverScopes() {
  const nextMap = [];

  for (const service of services) {
    try {
      const manifest = await fetchManifest(service);
      const routes = Array.isArray(manifest.routes) ? manifest.routes : [];

      for (const route of routes) {
        if (!route.method || !route.path || !route.scope) continue;

        nextMap.push({
          method: String(route.method).toUpperCase(),
          prefix: service.gatewayPrefix + route.path,
          scope: route.scope,
        });

        await pool.query(
          `INSERT INTO scopes (scope_name, description, service_name, updated_at)
           VALUES (?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             description = VALUES(description),
             service_name = VALUES(service_name),
             updated_at = NOW()`,
          [route.scope, route.description || null, service.name]
        );
      }
    } catch (err) {
      console.error(
        `Gagal ambil scope manifest dari ${service.name} (${service.baseUrl}): ${err.message}`
      );
      // Service ini sedang down — pertahankan mapping-nya yang lama supaya request yang
      // sebelumnya jalan tidak langsung ke-deny semua gara-gara satu service bermasalah.
      nextMap.push(...routeScopeMap.filter((r) => r.prefix.startsWith(service.gatewayPrefix)));
    }
  }

  routeScopeMap = nextMap;
  return routeScopeMap;
}

function resolveRequiredScope(method, path) {
  const match = routeScopeMap.find(
    (r) => r.method === String(method).toUpperCase() && path.startsWith(r.prefix)
  );
  return match ? match.scope : null;
}

function getRouteScopeMap() {
  return routeScopeMap;
}

module.exports = { discoverScopes, resolveRequiredScope, getRouteScopeMap };
