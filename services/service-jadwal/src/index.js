const express = require('express');
const helmet = require('helmet');
const { z } = require('zod');
const { getPool, assertConfigured } = require('./db/pools');
const ApiResponse = require('./utils/ApiResponse');
const { parseOrThrow } = require('./utils/validate');
const jadwalService = require('./services/jadwal.service');

const REQUIRED_DATABASES = ['SIADE', 'SIADE_OLD'];
assertConfigured(REQUIRED_DATABASES);

const listBodySchema = z
  .object({
    tahunAkademik: z
      .string()
      .trim()
      .regex(/^\d{4}[12]$/, 'tahunAkademik harus format YYYY1 (ganjil) atau YYYY2 (genap), contoh 20241'),
  })
  .strict();

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

app.get('/scopes', (req, res) => {
  res.json({
    service: 'service-jadwal',
    routes: [
      {
        method: 'POST',
        path: '/jadwal/list',
        scope: 'jadwal:list',
        description: 'List jadwal perkuliahan per tahun akademik',
      },
    ],
  });
});

app.use((req, res, next) => {
  if (!req.headers['x-client-id']) {
    return ApiResponse.error(res, {
      message: 'Request harus lewat API gateway',
      statusCode: 403,
    });
  }
  next();
});

app.post('/jadwal/list', async (req, res, next) => {
  try {
    const { tahunAkademik } = parseOrThrow(listBodySchema, req.body);
    const jadwal = await jadwalService.findByTahunAkademik(tahunAkademik);
    ApiResponse.success(res, { data: jadwal, message: 'Berhasil mengambil data jadwal perkuliahan.' });
  } catch (err) {
    next(err);
  }
});

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
  console.log(`service-jadwal listening on port ${port}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
