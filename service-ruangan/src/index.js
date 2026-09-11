const express = require('express');
const helmet = require('helmet');
const { getPool, assertConfigured } = require('./db/pools');
const ApiResponse = require('./utils/ApiResponse');
const ruanganService = require('./services/ruangan.service');

const REQUIRED_DATABASES = ['SIADE_OLD'];
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

// Manifest scope milik service ini — di-poll langsung oleh auth-service (internal network,
// tidak lewat Traefik) supaya auth-service tidak perlu ada daftar route->scope manual yang
// harus disinkronkan tiap kali endpoint di service ini berubah.
app.get('/scopes', (req, res) => {
  res.json({
    service: 'service-ruangan',
    routes: [
      { method: 'GET', path: '/ruangan/list', scope: 'ruangan:list', description: 'List ruangan' },
    ],
  });
});

// Defense in depth: tolak request yang tidak lewat gateway (tidak ada X-Client-Id
// dari auth-service). Scope-check sesungguhnya sudah dilakukan di Traefik/auth-service.
app.use((req, res, next) => {
  if (!req.headers['x-client-id']) {
    return ApiResponse.error(res, {
      message: 'Request harus lewat API gateway',
      statusCode: 403,
    });
  }
  next();
});

app.get('/ruangan/list', async (req, res, next) => {
  try {
    const ruangan = await ruanganService.findAll();
    ApiResponse.success(res, { data: ruangan, message: 'Berhasil mengambil data ruangan.' });
  } catch (err) {
    next(err);
  }
});

app.use((req, res) => ApiResponse.error(res, { message: 'Route tidak ditemukan.', statusCode: 404 }));

// Centralized error handler: AppError yang dikenal balas status/message-nya sendiri,
// selain itu di-log dan dibalas 500 generik supaya internal (stack trace, error DB, dll)
// tidak pernah bocor ke client.
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
  console.log(`service-ruangan listening on port ${port}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
