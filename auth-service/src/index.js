const express = require('express');
const helmet = require('helmet');
const tokenRouter = require('./routes/token');
const verifyRouter = require('./routes/verify');
const revokeRouter = require('./routes/revoke');
const { discoverScopes, getRouteScopeMap } = require('./scopeRegistry');

const SCOPE_REFRESH_INTERVAL_MS = 60 * 1000;

const app = express();
app.disable('x-powered-by');
// Traefik adalah satu-satunya reverse proxy di depan service ini (1 hop) — trust proxy
// dibutuhkan supaya express-rate-limit membaca X-Forwarded-For dengan benar.
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/oauth', tokenRouter);
app.use('/oauth', revokeRouter);
app.use('/', verifyRouter);

// Internal-only (tidak ada router publik di Traefik untuk path ini) — buat debug/admin
// melihat & memaksa refresh hasil scope discovery tanpa restart service.
app.get('/internal/scopes', (req, res) => {
  res.json({ routes: getRouteScopeMap() });
});
app.post('/internal/scopes/refresh', async (req, res, next) => {
  try {
    const routes = await discoverScopes();
    res.json({ refreshed: true, routes });
  } catch (err) {
    next(err);
  }
});

app.use((req, res) => res.status(404).json({ error: 'not_found' }));

// Safety net terakhir: kalau ada error tak terduga, jangan pernah bocorkan stack trace
// ke client — cukup log di server dan balas 500 generik.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'internal_error' });
});

const port = process.env.PORT || 4000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function start() {
  // Tunggu discovery pertama selesai dulu sebelum menerima traffic, supaya /verify
  // tidak deny-by-default semua request gara-gara map masih kosong saat baru boot.
  // Retry beberapa kali karena service lain (mis. service-a) mungkin belum siap
  // tepat di detik yang sama saat auth-service boot.
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    await discoverScopes();
    if (getRouteScopeMap().length > 0) break;
    await sleep(2000);
  }

  setInterval(() => {
    discoverScopes().catch((err) => console.error('Scope refresh gagal:', err.message));
  }, SCOPE_REFRESH_INTERVAL_MS);

  app.listen(port, () => {
    console.log(`auth-service listening on port ${port}`);
  });
}

start().catch((err) => {
  console.error('Gagal start auth-service:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
