// Port dari app/Http/Controllers/KhsController.php (SIMAWA Laravel).
const ejs = require('ejs');
const path = require('path');
const ApiResponse = require('../utils/ApiResponse');
const { parseOrThrow } = require('../utils/validate');
const { renderHtmlToPdf } = require('../utils/pdf');
const { periodeQuerySchema } = require('../utils/schemas');
const { PERIODE_REGEX } = require('../utils/constants');
const { getLogoDataUri, tahunAkademikLabel, fakultasFontSize, tanggalHariIni } = require('../utils/pdfLabels');
const akademik = require('../services/akademik.service');

const KHS_TEMPLATE = path.join(__dirname, '../views/khs-print.ejs');

async function index(req, res) {
  const { periode: periodeInput } = parseOrThrow(periodeQuerySchema, req.query);
  const npm = req.student.npm;
  const dataKrs = await akademik.krs(npm);

  const semester = Object.entries(dataKrs).map(([tahunAkademik, item]) => ({
    tahun_akademik: tahunAkademik,
    semester: item.semester,
  }));

  const periode = periodeInput || Object.keys(dataKrs)[0];

  ApiResponse.success(res, {
    data: {
      semester,
      krs: dataKrs[periode] || null,
      metadata: await akademik.saya(npm),
      npm,
      periode,
    },
    message: 'Berhasil mengambil data KHS.',
  });
}

async function print(req, res) {
  const periodeRaw = req.query.periode;
  const npm = req.student.npm;
  const dataKrs = await akademik.krs(npm);

  // Port bug urutan apa adanya: akses dataKrs[periodeRaw] SEBELUM validasi/fallback
  // format periode (sama seperti KhsController::print() Laravel) — beda dari index()
  // yang validasi dulu baru akses.
  const dataKrsPeriode = dataKrs[periodeRaw];
  const krsList = dataKrsPeriode ? dataKrsPeriode.krs : [];
  const jumlahRecord = krsList.length;
  const jumlahSudahEdom = krsList.filter((item) => item.cek_edom === 1).length;
  const bolehCetak = jumlahRecord > 0 && jumlahSudahEdom === jumlahRecord;

  if (!bolehCetak) {
    return ApiResponse.error(res, {
      statusCode: 422,
      message: 'Belum semua mata kuliah pada periode ini mengisi EDOM — KHS belum bisa dicetak.',
    });
  }

  const periode = periodeRaw && PERIODE_REGEX.test(periodeRaw) ? periodeRaw : Object.keys(dataKrs)[0];
  const saya = await akademik.saya(npm);
  const krsForPdf = dataKrs[periode] || { krs: [], metadata: { ips: 0, ipk: 0 } };

  const html = await ejs.renderFile(KHS_TEMPLATE, {
    saya,
    npm,
    periode,
    krs: krsForPdf,
    tahunAkademikLabel: tahunAkademikLabel(periode),
    fakultasFontSize: fakultasFontSize(saya.nama_fakultas),
    logoDataUri: getLogoDataUri(),
    tanggal: tanggalHariIni(),
  });
  const pdfBuffer = await renderHtmlToPdf(html);

  const safeNpm = String(npm).replace(/[^a-zA-Z0-9_-]/g, '') || 'npm';
  // Port bug apa adanya: nama file pakai prefix "KRS-" (bukan "KHS-") — sama seperti
  // KhsController::print() Laravel, kemungkinan copy-paste dari KrsController.
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="KRS-${safeNpm}-${periode}.pdf"`);
  res.send(pdfBuffer);
}

module.exports = { index, print };
