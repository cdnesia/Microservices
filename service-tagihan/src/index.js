const express = require('express');
const helmet = require('helmet');
const { z } = require('zod');
const { getPool, assertConfigured } = require('./db/pools');
const ApiResponse = require('./utils/ApiResponse');
const { parseOrThrow } = require('./utils/validate');
const tagihanService = require('./services/tagihan.service');

const REQUIRED_DATABASES = ['PAYMENT', 'SIADE', 'SIMAKU'];
assertConfigured(REQUIRED_DATABASES);

const JENIS_TAGIHAN = ['SPP', 'KKN', 'SIDANG TUGAS AKHIR', 'SEMINAR PROPOSAL', 'PKL', 'PMB'];

const jenisTagihanSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
  z.enum(JENIS_TAGIHAN)
);

const detailItemSchema = z
  .object({
    nominal: z.union([z.string(), z.number()]),
    idBipot: z.union([z.string(), z.number()]),
    namaBipot: z.string().trim().min(1),
  })
  .strict();

const waktuBerakhirSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: 'waktuBerakhir harus tanggal yang valid, misal 2026-12-31T16:59:59.000Z',
  });

const tahunAkademikSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-zA-Z0-9]+$/, 'tahunAkademik hanya boleh berisi angka dan huruf');

const createTagihanSchema = z
  .object({
    npm: z.string().trim().min(1).max(30),
    tahunAkademik: tahunAkademikSchema,
    waktuBerakhir: waktuBerakhirSchema,
    detailTagihan: z.array(detailItemSchema).min(1, 'detailTagihan minimal 1 item'),
    detailPotongan: z.array(detailItemSchema).optional(),
    jenisTagihan: jenisTagihanSchema.optional(),
  })
  .strict();

const updateTagihanSchema = z
  .object({
    idRecordTagihan: z.string().trim().min(1),
    npm: z.string().trim().min(1).max(30),
    waktuBerakhir: waktuBerakhirSchema.optional(),
    detailTagihan: z.array(detailItemSchema).min(1, 'detailTagihan minimal 1 item').optional(),
    detailPotongan: z.array(detailItemSchema).optional(),
    nominalDitagih: z.union([z.string(), z.number()]).optional(),
    jenisTagihan: jenisTagihanSchema.optional(),
    statusAktif: z.enum(['Y', 'T']).optional(),
  })
  .strict();

// Beda dari tahunAkademikSchema di atas (yang cuma label bebas): endpoint
// SPP otomatis mem-parsing tahunAkademik jadi {tahun}{1|2} untuk menghitung
// semester (lihat bipot.service.js), jadi formatnya wajib ketat.
const createTagihanSppSchema = z
  .object({
    npm: z.string().trim().min(1).max(30),
    tahunAkademik: z
      .string()
      .trim()
      .regex(/^\d{4}[12]$/, 'tahunAkademik harus format YYYY1 (ganjil) atau YYYY2 (genap), contoh 20241'),
  })
  .strict();

const cekTagihanSchema = z
  .object({
    npm: z.array(z.string().trim().min(1)).min(1, 'npm minimal 1 item'),
    tahunAkademik: z.array(tahunAkademikSchema).min(1, 'tahunAkademik minimal 1 item').optional(),
    jenisTagihan: jenisTagihanSchema.optional(),
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
    service: 'service-tagihan',
    routes: [
      { method: 'POST', path: '/tagihan/create', scope: 'tagihan:create', description: 'Buat tagihan' },
      {
        method: 'POST',
        path: '/tagihan/create-spp',
        scope: 'tagihan:create-spp',
        description: 'Buat tagihan SPP otomatis dari rincian bipot',
      },
      { method: 'POST', path: '/tagihan/update', scope: 'tagihan:update', description: 'Perbarui tagihan' },
      { method: 'POST', path: '/tagihan/cek', scope: 'tagihan:cek', description: 'Cek tagihan' },
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

app.post('/tagihan/create', async (req, res, next) => {
  try {
    const data = parseOrThrow(createTagihanSchema, req.body);
    const tagihan = await tagihanService.createTagihan(data);
    ApiResponse.success(res, { data: tagihan, message: 'Tagihan berhasil dibuat.', statusCode: 201 });
  } catch (err) {
    next(err);
  }
});

app.post('/tagihan/create-spp', async (req, res, next) => {
  try {
    const data = parseOrThrow(createTagihanSppSchema, req.body);
    const { skipped, tagihan } = await tagihanService.createTagihanSpp(data);

    ApiResponse.success(res, {
      data: tagihan,
      message: skipped
        ? 'Tagihan SPP untuk NPM dan tahun akademik ini sudah ada, dilewati.'
        : 'Tagihan SPP berhasil dibuat.',
      statusCode: skipped ? 200 : 201,
    });
  } catch (err) {
    next(err);
  }
});

app.post('/tagihan/update', async (req, res, next) => {
  try {
    const { idRecordTagihan, npm, ...data } = parseOrThrow(updateTagihanSchema, req.body);
    const tagihan = await tagihanService.updateTagihan(idRecordTagihan, npm, data);
    ApiResponse.success(res, { data: tagihan, message: 'Tagihan berhasil diperbarui.' });
  } catch (err) {
    next(err);
  }
});

app.post('/tagihan/cek', async (req, res, next) => {
  try {
    const data = parseOrThrow(cekTagihanSchema, req.body);
    const tagihan = await tagihanService.cekTagihan(data);
    ApiResponse.success(res, { data: tagihan, message: 'Berhasil mengambil data tagihan.' });
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
  console.log(`service-tagihan listening on port ${port}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
