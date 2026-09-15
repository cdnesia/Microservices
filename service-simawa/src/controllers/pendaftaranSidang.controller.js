// Port dari app/Http/Controllers/PendaftaranSidangController.php (SIMAWA Laravel).
// HANYA index/create/store — sama seperti Seminar Proposal, show/edit/update/destroy
// TIDAK DIDEKLARASIKAN SAMA SEKALI di aplikasi asli (lihat routes/pendaftaranSidang.routes.js).
const ApiResponse = require('../utils/ApiResponse');
const { parseOrThrow } = require('../utils/validate');
const { pendaftaranStoreSchema } = require('../utils/schemas');
const { tryDecryptId, encryptId } = require('../utils/cryptoId');
const akademik = require('../services/akademik.service');
const kegiatanService = require('../services/kegiatanMahasiswa.service');
const tagihanService = require('../services/tagihan.service');
const { ringkasanKrsUntukPendaftaran, sudahKontrakTipe } = require('../services/pendaftaran.service');
const { TIPE_MATA_KULIAH_DIKECUALIKAN_NILAI_D } = require('../utils/constants');

async function index(req, res) {
  const rows = await kegiatanService.findTugasAkhir(req.student.npm, 'SIDANG TUGAS AKHIR');
  ApiResponse.success(res, { data: rows, message: 'Berhasil mengambil data pendaftaran.' });
}

async function create(req, res) {
  const npm = req.student.npm;
  const mhs = await akademik.getMahasiswaAktifOrThrow(npm);
  const tahunAktif = await akademik.tahunAkademikAktif(mhs.kode_program_studi);

  const persyaratan = await kegiatanService.findPersyaratan({
    tipe: 'SIDANG TUGAS AKHIR',
    kelasPerkuliahanId: mhs.program_kuliah_id,
    kodeProdi: mhs.kode_program_studi,
    tahunAngkatan: mhs.tahun_angkatan,
  });

  // TIDAK ada percabangan per fakultas untuk syarat ini (beda dari Seminar) — port apa adanya.
  const sudahKontrakSkripsi = await sudahKontrakTipe(npm, 3);

  const { totalSks, jumlahD, jumlahKosong } = await ringkasanKrsUntukPendaftaran(npm, tahunAktif, {
    kecualikanTipeUntukNilaiD: TIPE_MATA_KULIAH_DIKECUALIKAN_NILAI_D,
  });

  ApiResponse.success(res, {
    data: {
      jadwal_kkn: true,
      data: null,
      persyaratan: persyaratan.map((p) => ({ ...p, encrypted_id: encryptId(String(p.id)), id: undefined })),
      jumlah_sks: totalSks,
      jumlah_d: jumlahD + jumlahKosong,
      sudah_kontrak_skripsi: sudahKontrakSkripsi,
    },
    message: 'Berhasil mengambil syarat pendaftaran Sidang Tugas Akhir.',
  });
}

async function store(req, res) {
  const { id: encryptedId } = parseOrThrow(pendaftaranStoreSchema, req.body);
  const npm = req.student.npm;
  const mhs = await akademik.getMahasiswaAktifOrThrow(npm);
  const tahunAktif = await akademik.tahunAkademikAktif(mhs.kode_program_studi);

  if (!(await sudahKontrakTipe(npm, 3))) {
    return ApiResponse.error(res, { statusCode: 422, message: 'Belum kontrak Skripsi.' });
  }

  const { totalSks, jumlahD, jumlahKosong } = await ringkasanKrsUntukPendaftaran(npm, tahunAktif, {
    kecualikanTipeUntukNilaiD: TIPE_MATA_KULIAH_DIKECUALIKAN_NILAI_D,
  });

  const id = tryDecryptId(encryptedId);
  if (!id) return ApiResponse.error(res, { statusCode: 400, message: 'ID kegiatan tidak valid.' });
  const persyaratan = await kegiatanService.findById(id);

  if (totalSks < persyaratan.minimalSks) {
    return ApiResponse.error(res, { statusCode: 422, message: 'Gagal mendaftar karena tidak memenuhi persyaratan SKS.' });
  }
  if (jumlahD + jumlahKosong > persyaratan.maksimalNilaiD) {
    return ApiResponse.error(res, { statusCode: 422, message: 'Gagal mendaftar karena tidak memenuhi persyaratan nilai D.' });
  }

  const waktuBerakhir = await akademik.waktuBerakhirSidang(tahunAktif);
  try {
    await tagihanService.createTagihan({
      npm,
      tahunAkademik: tahunAktif,
      waktuBerakhir: waktuBerakhir ? new Date(waktuBerakhir).toISOString() : new Date().toISOString(),
      detailTagihan: [{ nominal: Number(persyaratan.biayaPendaftaran), idBipot: persyaratan.idBipot, namaBipot: persyaratan.namaKegiatan || 'Pendaftaran Sidang Tugas Akhir' }],
      detailPotongan: [],
      jenisTagihan: 'SIDANG TUGAS AKHIR',
    });
  } catch (err) {
    return ApiResponse.error(res, { statusCode: 400, message: err.message || 'Gagal membuat tagihan' });
  }

  await kegiatanService.insertTugasAkhir({
    npm,
    kegiatanMahasiswa: 'SIDANG TUGAS AKHIR',
    idBipot: persyaratan.idBipot,
    biayaPendaftaran: persyaratan.biayaPendaftaran,
  });

  ApiResponse.success(res, { message: 'Berhasil mendaftar Sidang Akhir' });
}

module.exports = { index, create, store };
