// Port dari app/Http/Controllers/KrsController.php (SIMAWA Laravel).
const ejs = require('ejs');
const path = require('path');
const { z } = require('zod');
const ApiResponse = require('../utils/ApiResponse');
const { parseOrThrow } = require('../utils/validate');
const { renderHtmlToPdf } = require('../utils/pdf');
const { periodeQuerySchema } = require('../utils/schemas');
const { PERIODE_REGEX } = require('../utils/constants');
const { getLogoDataUri, tahunAkademikLabel, fakultasFontSize, tanggalHariIni } = require('../utils/pdfLabels');
const { tryDecryptId } = require('../utils/cryptoId');
const akademik = require('../services/akademik.service');
const krsService = require('../services/krs.service');
const tagihanService = require('../services/tagihan.service');

const KRS_TEMPLATE = path.join(__dirname, '../views/krs-print.ejs');
const krsStoreSchema = z.object({ jadwalId: z.string().min(1) }).strict();

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
    data: { semester, krs: dataKrs[periode] || null, metadata: await akademik.saya(npm) },
    message: 'Berhasil mengambil data KRS.',
  });
}

async function create(req, res) {
  const npm = req.student.npm;
  const mhs = await akademik.getMahasiswaAktifOrThrow(npm);
  const kodeProdi = mhs.kode_program_studi;

  const tahunAktif = await akademik.tahunAkademikAktif(kodeProdi);
  const jadwalKontrak = tahunAktif ? await akademik.jadwalKontrakKrs(tahunAktif) : false;

  if (!jadwalKontrak) {
    return ApiResponse.success(res, { data: { state: 'krsError' }, message: 'Jadwal kontrak KRS belum/tidak sedang dibuka.' });
  }

  const cekBeasiswa = await akademik.cekBeasiswa(npm, tahunAktif);
  const cekBolehKontrak = await tagihanService
    .cekTagihan({ npm: [npm], tahunAkademik: [tahunAktif], jenisTagihan: 'SPP' })
    .then((rows) => {
      const t = rows[0];
      if (!t || Number(t.total_tagihan) <= 0) return false;
      return Number(t.nominal_terbayar) / Number(t.total_tagihan) >= 0.6;
    })
    .catch(() => false);

  if (!cekBolehKontrak && !cekBeasiswa) {
    return ApiResponse.success(res, { data: { state: 'krsBB' }, message: 'Pembayaran SPP belum mencukupi syarat kontrak KRS.' });
  }

  const krsData = await akademik.krs(npm);
  const existing = Object.values(krsData)
    .flatMap((item) => item.krs)
    .map((item) => tryDecryptId(item.jadwal_id))
    .filter(Boolean);

  const jadwalPerkuliahan = await akademik.jadwalKuliah(kodeProdi, mhs.program_kuliah_id, tahunAktif);

  ApiResponse.success(res, {
    data: { state: 'jadwal-kuliah', existing, jadwal_perkuliahan: jadwalPerkuliahan, metadata: await akademik.saya(npm) },
    message: 'Berhasil mengambil jadwal kuliah yang tersedia.',
  });
}

async function store(req, res) {
  const { jadwalId } = parseOrThrow(krsStoreSchema, req.body);
  const npm = req.student.npm;
  const mhs = await akademik.getMahasiswaAktifOrThrow(npm);
  const tahunAktif = await akademik.tahunAkademikAktif(mhs.kode_program_studi);

  const jadwalKontrak = tahunAktif ? await akademik.jadwalKontrakKrs(tahunAktif) : false;
  if (!jadwalKontrak) {
    return ApiResponse.error(res, { statusCode: 200, message: 'Jadwal kontrak mata kuliah berakhir.' });
  }

  // Port apa adanya: TIDAK ada cek bentrok jadwal atau duplikat kontrak di sini,
  // sama seperti KrsController::store() Laravel — insert langsung.
  await krsService.insertKrs({ jadwalId, npm, kodeTahunAkademik: tahunAktif });
  ApiResponse.success(res, { message: 'Mata kuliah berhasil di kontrak.' });
}

async function destroy(req, res) {
  const npm = req.student.npm;
  const mhs = await akademik.getMahasiswaAktifOrThrow(npm);
  const tahunAktif = await akademik.tahunAkademikAktif(mhs.kode_program_studi);
  const jadwalKontrak = tahunAktif ? await akademik.jadwalKontrakKrs(tahunAktif) : false;

  if (!jadwalKontrak) {
    return ApiResponse.error(res, { statusCode: 200, message: 'Jadwal kontrak mata kuliah berakhir.' });
  }

  await krsService.cancelKrs(req.params.jadwalId, npm);
  ApiResponse.success(res, { message: 'Mata kuliah berhasil dibatalkan' });
}

async function print(req, res) {
  const npm = req.student.npm;
  const dataKrs = await akademik.krs(npm);
  const periodeRaw = req.query.periode;
  const periode = periodeRaw && PERIODE_REGEX.test(periodeRaw) ? periodeRaw : Object.keys(dataKrs)[0];

  const saya = await akademik.saya(npm);
  const krsForPdf = dataKrs[periode] || { krs: [], metadata: { ips: 0, ipk: 0 } };

  const html = await ejs.renderFile(KRS_TEMPLATE, {
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
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="KRS-${safeNpm}-${periode}.pdf"`);
  res.send(pdfBuffer);
}

module.exports = { index, create, store, destroy, print };
