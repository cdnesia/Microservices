const path = require('path');
const fs = require('fs');
const ejs = require('ejs');
const express = require('express');
const helmet = require('helmet');
const { z } = require('zod');
const { getPool, assertConfigured } = require('./db/pools');
const ApiResponse = require('./utils/ApiResponse');
const { parseOrThrow } = require('./utils/validate');
const { renderHtmlToPdf } = require('./utils/pdf');
const akademikService = require('./services/akademik.service');

const REQUIRED_DATABASES = ['SIADE', 'SIADE_OLD'];
assertConfigured(REQUIRED_DATABASES);

const TEMPLATE_PATH = path.join(__dirname, 'views/khs.ejs');
const LOGO_PATH = path.join(__dirname, 'assets/favicon-32x32.png');

const cetakKhsSchema = z
  .object({
    npm: z.string().trim().min(1).max(20),
    periode: z
      .string()
      .trim()
      .regex(/^\d{4}[12]$/, 'Format periode tidak valid. Gunakan format YYYY1 (Ganjil) atau YYYY2 (Genap), contoh: 20241.'),
    view: z.enum(['inline', 'download']).optional(),
  })
  .strict();

// Font judul fakultas mengecil seiring panjang nama, biar tetap muat satu baris.
function fakultasFontSize(nama) {
  const len = nama.length;
  if (len <= 25) return '24px';
  if (len <= 40) return '22px';
  if (len <= 50) return '20px';
  return '22px';
}

function tahunAkademikLabel(periode) {
  const tahun = Number(periode.slice(0, 4));
  const sem = Number(periode.slice(-1));
  return `${tahun}/${tahun + 1} ${sem % 2 === 0 ? 'Genap' : 'Ganjil'}`;
}

function getLogoDataUri() {
  try {
    const buffer = fs.readFileSync(LOGO_PATH);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

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
    service: 'service-khs',
    routes: [
      {
        method: 'POST',
        path: '/khs/cetak',
        scope: 'khs:cetak',
        description: 'Cetak KHS (kartu hasil studi) sebagai PDF',
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

// Satu-satunya endpoint di seluruh gateway (selain OAuth) yang tidak balas lewat
// ApiResponse — response-nya buffer PDF mentah, bukan JSON, jadi envelope
// {success,message,data} tidak relevan di sini.
app.post('/khs/cetak', async (req, res, next) => {
  try {
    const { npm, periode, view = 'download' } = parseOrThrow(cetakKhsSchema, req.body);

    const [saya, krs] = await Promise.all([akademikService.getStudent(npm), akademikService.getKhs(npm, periode)]);

    const html = await ejs.renderFile(TEMPLATE_PATH, {
      saya,
      krs,
      periode,
      tahunAkademikLabel: tahunAkademikLabel(periode),
      fakultasFontSize: fakultasFontSize(saya.namaFakultas),
      logoDataUri: getLogoDataUri(),
      tanggal: new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date()),
    });

    const pdfBuffer = await renderHtmlToPdf(html);

    // npm bebas karakter dari sisi validasi, jadi disaring dulu sebelum
    // masuk ke header Content-Disposition (periode sudah pasti \d{4}[12]).
    const safeNpm = npm.replace(/[^a-zA-Z0-9_-]/g, '') || 'npm';
    const filename = `KHS_${safeNpm}_${periode}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${view === 'inline' ? 'inline' : 'attachment'}; filename="${filename}"`);
    res.send(pdfBuffer);
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
  console.log(`service-khs listening on port ${port}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
