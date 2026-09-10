const express = require('express');
const helmet = require('helmet');
const { z } = require('zod');
const { getPool, assertConfigured } = require('./db/pools');
const ApiResponse = require('./utils/ApiResponse');
const { parseOrThrow } = require('./utils/validate');
const pegawaiService = require('./services/pegawai.service');

const REQUIRED_DATABASES = ['SIADE_OLD'];
assertConfigured(REQUIRED_DATABASES);

const cekPegawaiSchema = z
  .object({
    nik: z.string().trim().min(1).optional(),
    nidn: z.string().trim().min(1).optional(),
    id: z.union([z.string(), z.number()]).optional(),
  })
  .strict()
  .refine((data) => data.nik || data.nidn || data.id, {
    message: 'Salah satu dari nik, nidn, atau id harus diisi',
  });

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
    service: 'service-pegawai',
    routes: [
      { method: 'GET', path: '/pegawai/list', scope: 'pegawai:list', description: 'List pegawai' },
      {
        method: 'POST',
        path: '/pegawai/cek',
        scope: 'pegawai:cek',
        description: 'Cek pegawai by nik/nidn/id',
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

app.get('/pegawai/list', async (req, res, next) => {
  try {
    const pegawai = await pegawaiService.findAll();
    ApiResponse.success(res, { data: pegawai, message: 'Berhasil mengambil data pegawai.' });
  } catch (err) {
    next(err);
  }
});

app.post('/pegawai/cek', async (req, res, next) => {
  try {
    const data = parseOrThrow(cekPegawaiSchema, req.body);
    const pegawai = await pegawaiService.findByIdentifier(data);
    ApiResponse.success(res, { data: pegawai, message: 'Berhasil mengambil data pegawai.' });
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
  console.log(`service-pegawai listening on port ${port}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
