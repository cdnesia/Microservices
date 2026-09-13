const express = require('express');
const helmet = require('helmet');

const { getPool, assertConfigured } = require('./db/pools');
const ApiResponse = require('./utils/ApiResponse');
const simawaRoutes = require('./routes');

// service-simawa punya 5 database eksternal (SAMA persis dengan database yang dipakai
// SIMAWA Laravel — lihat CLAUDE.md/memori sesi ini): SIMAWA (data app sendiri: tabel
// `users`), SIADE (akademik utama), SIADE_OLD (pegawai/ruang), PAYMENT + SIMAKU (tagihan,
// nama koneksi mengikuti konvensi service-tagihan/service-bipot di project ini).
const REQUIRED_DATABASES = ['SIMAWA', 'SIADE', 'SIADE_OLD', 'PAYMENT', 'SIMAKU'];
assertConfigured(REQUIRED_DATABASES);

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json());

app.get('/health', async (req, res) => {
  const databases = {};
  await Promise.all(
    REQUIRED_DATABASES.map(async (name) => {
      try {
        await getPool(name).query('SELECT 1');
        databases[name] = 'up';
      } catch (err) {
        databases[name] = 'down';
      }
    })
  );

  const allUp = Object.values(databases).every((status) => status === 'up');
  res
    .status(allUp ? 200 : 503)
    .json({ success: allUp, message: allUp ? 'ok' : 'degraded', data: { databases } });
});

// Manifest scope — digabung dari tiap file di src/routes/*.routes.js (lihat
// src/routes/index.js). Route yang di aplikasi Laravel asli TIDAK PERNAH terdaftar sama
// sekali (show/edit/update/destroy untuk pendaftaran-seminar-proposal/pendaftaran-sidang-
// tugas-akhir) SENGAJA tidak ikut termanifes — lihat komentar di routes file masing-masing.
app.get('/scopes', (req, res) => {
  res.json({ service: 'service-simawa', routes: simawaRoutes.scopes });
});

// Defense in depth: tolak request yang tidak lewat gateway (tidak ada X-Client-Id dari
// service-auth). Scope-check sesungguhnya sudah dilakukan di Traefik/service-auth.
app.use((req, res, next) => {
  if (!req.headers['x-client-id']) {
    return ApiResponse.error(res, { message: 'Request harus lewat API gateway', statusCode: 403 });
  }
  next();
});

// Semua route bisnis di-mount di bawah /simawa (dipertahankan sebagai namespace domain,
// konsisten dengan pola service lain di project ini — mis. service-ruangan punya route
// '/ruangan/list', bukan '/list' polos). Lapis auth kedua (identitas mahasiswa,
// X-Student-Token) diterapkan per-route di dalam masing-masing file src/routes/*.routes.js
// lewat middleware/requireStudent.js.
app.use('/simawa', simawaRoutes.router);

app.use((req, res) => ApiResponse.error(res, { message: 'Route tidak ditemukan.', statusCode: 404 }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const statusCode = err.isOperational ? err.statusCode : 500;
  const message = err.isOperational ? err.message : 'Terjadi kesalahan pada server.';
  if (!err.isOperational) {
    console.error('Unhandled error:', err);
  }
  ApiResponse.error(res, { message, statusCode });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`service-simawa listening on port ${port}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
