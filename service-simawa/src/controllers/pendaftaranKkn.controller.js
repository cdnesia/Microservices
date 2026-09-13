// Port dari app/Http/Controllers/PendaftaranKKNController.php (SIMAWA Laravel).
// show/edit/update/destroy didaftarkan sebagai stub kosong langsung di
// routes/pendaftaranKkn.routes.js (di aplikasi asli method-nya ADA tapi isinya kosong).
const ApiResponse = require('../utils/ApiResponse');
const { parseOrThrow } = require('../utils/validate');
const { pendaftaranStoreSchema } = require('../utils/schemas');
const { tryDecryptId, encryptId } = require('../utils/cryptoId');
const akademik = require('../services/akademik.service');
const kegiatanService = require('../services/kegiatanMahasiswa.service');
const simakuService = require('../services/simaku.service');
const { ringkasanKrsUntukPendaftaran, sudahKontrakTipe } = require('../services/pendaftaran.service');

async function index(req, res) {
  // Port bug apa adanya: index KKN Laravel filter tipe IN ('KKN','PKL') — jadi
  // sebenarnya menampilkan KEDUANYA, bukan cuma KKN.
  const rows = await kegiatanService.findPendaftaranKegiatan(req.student.npm, ['KKN', 'PKL']);
  ApiResponse.success(res, { data: rows, message: 'Berhasil mengambil data pendaftaran KKN.' });
}

async function create(req, res) {
  const npm = req.student.npm;
  const mhs = await akademik.getMahasiswaAktifOrThrow(npm);
  const tahunAktif = await akademik.tahunAkademikAktif(mhs.kode_program_studi);

  const persyaratan = await kegiatanService.findPersyaratan({
    tipe: 'KKN',
    kelasPerkuliahanId: mhs.program_kuliah_id,
    kodeProdi: mhs.kode_program_studi,
    tahunAngkatan: mhs.tahun_angkatan,
  });
  const { totalSks, jumlahD, jumlahKosong } = await ringkasanKrsUntukPendaftaran(npm, tahunAktif);

  ApiResponse.success(res, {
    data: {
      // Port bug apa adanya: DataService::jadwalKKN() hasilnya selalu di-override jadi
      // true tanpa syarat (dead condition) di controller Laravel — lihat spek.
      jadwal_kkn: true,
      data: null,
      persyaratan: persyaratan.map((p) => ({ ...p, encrypted_id: encryptId(String(p.id)), id: undefined })),
      jumlah_sks: totalSks,
      jumlah_d: jumlahD + jumlahKosong,
    },
    message: 'Berhasil mengambil syarat pendaftaran KKN.',
  });
}

async function store(req, res) {
  const { id: encryptedId } = parseOrThrow(pendaftaranStoreSchema, req.body);
  const npm = req.student.npm;
  const mhs = await akademik.getMahasiswaAktifOrThrow(npm);
  const tahunAktif = await akademik.tahunAkademikAktif(mhs.kode_program_studi);

  const excludeFakultas = [2];
  if (!excludeFakultas.includes(Number(mhs.id_fakultas)) && !(await sudahKontrakTipe(npm, 1))) {
    return ApiResponse.error(res, { statusCode: 422, message: 'Gagal mendaftar karena belum kontrak Matakuliah KKN.' });
  }

  const { totalSks, jumlahD, jumlahKosong } = await ringkasanKrsUntukPendaftaran(npm, tahunAktif);
  // store() KKN menghitung nilai D TERMASUK 'E' (beda dari create()) — port apa adanya.
  const jumlahDE = jumlahD + jumlahKosong;

  const id = tryDecryptId(encryptedId);
  if (!id) {
    return ApiResponse.error(res, { statusCode: 400, message: 'ID kegiatan tidak valid.' });
  }
  const persyaratan = await kegiatanService.findById(id);

  if (totalSks < persyaratan.minimalSks) {
    return ApiResponse.error(res, { statusCode: 422, message: 'Gagal mendaftar karena tidak memenuhi persyaratan SKS.' });
  }
  if (jumlahDE > persyaratan.maksimalNilaiD) {
    return ApiResponse.error(res, { statusCode: 422, message: 'Gagal mendaftar karena tidak memenuhi persyaratan minimal nilai D.' });
  }

  // Via HMAC SIMAKU (BUKAN gateway/ApiService) — lihat catatan gap konfigurasi di
  // simaku.service.js: modul ini secara faktual belum bisa jalan sampai
  // SIMAKU_URL/SIMAKU_HMAC_SECRET/SIMAKU_HMAC_API_KEY diisi.
  let generateResult;
  try {
    generateResult = await simakuService.generateTagihanKKN({ npm, tahunAkademik: tahunAktif, kegiatanMahasiswaId: id });
  } catch (err) {
    return ApiResponse.error(res, { statusCode: 400, message: err.message || 'Gagal membuat tagihan' });
  }
  if (!generateResult || !generateResult.success) {
    return ApiResponse.error(res, { statusCode: 400, message: (generateResult && generateResult.message) || 'Gagal membuat tagihan' });
  }

  await kegiatanService.insertPendaftaranKegiatan({
    npm,
    kegiatanMahasiswaId: persyaratan.id,
    idBipot: persyaratan.idBipot,
    biayaPendaftaran: persyaratan.biayaPendaftaran,
  });

  ApiResponse.success(res, { message: 'Berhasil mendaftar KKN' });
}

module.exports = { index, create, store };
