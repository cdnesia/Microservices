// Port dari app/Http/Controllers/PendaftaranPKLController.php (SIMAWA Laravel) — struktur
// identik KKN dengan beberapa perbedaan (lihat komentar inline): tagihan lewat gateway
// (ApiService, bukan HMAC SIMAKU) dan pesan/kolom yang berbeda.
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
  const rows = await kegiatanService.findPendaftaranKegiatan(req.student.npm, ['PKL']);
  ApiResponse.success(res, { data: rows, message: 'Berhasil mengambil data pendaftaran PKL.' });
}

async function create(req, res) {
  const npm = req.student.npm;
  const mhs = await akademik.getMahasiswaAktifOrThrow(npm);
  const tahunAktif = await akademik.tahunAkademikAktif(mhs.kode_program_studi);

  const persyaratan = await kegiatanService.findPersyaratan({
    tipe: 'PKL',
    kelasPerkuliahanId: mhs.program_kuliah_id,
    kodeProdi: mhs.kode_program_studi,
    tahunAngkatan: mhs.tahun_angkatan,
  });
  const { totalSks, jumlahD, jumlahKosong } = await ringkasanKrsUntukPendaftaran(npm, tahunAktif, {
    kecualikanTipeUntukNilaiD: TIPE_MATA_KULIAH_DIKECUALIKAN_NILAI_D,
  });

  ApiResponse.success(res, {
    data: {
      jadwal_pkl: true, // port bug override dead-condition, sama seperti pendaftaran-kkn/create
      data: null,
      persyaratan: persyaratan.map((p) => ({ ...p, encrypted_id: encryptId(String(p.id)), id: undefined })),
      jumlah_sks: totalSks,
      jumlah_d: jumlahD + jumlahKosong,
    },
    message: 'Berhasil mengambil syarat pendaftaran PKL.',
  });
}

async function store(req, res) {
  const { id: encryptedId } = parseOrThrow(pendaftaranStoreSchema, req.body);
  const npm = req.student.npm;
  const mhs = await akademik.getMahasiswaAktifOrThrow(npm);
  const tahunAktif = await akademik.tahunAkademikAktif(mhs.kode_program_studi);

  if (!(await sudahKontrakTipe(npm, 2))) {
    return ApiResponse.error(res, { statusCode: 422, message: 'Gagal mendaftar karena belum kontrak Matakuliah PKL.' });
  }

  const { totalSks, jumlahD, jumlahKosong } = await ringkasanKrsUntukPendaftaran(npm, tahunAktif, {
    kecualikanTipeUntukNilaiD: TIPE_MATA_KULIAH_DIKECUALIKAN_NILAI_D,
  });
  const jumlahDE = jumlahD + jumlahKosong;

  const id = tryDecryptId(encryptedId);
  if (!id) return ApiResponse.error(res, { statusCode: 400, message: 'ID kegiatan tidak valid.' });
  const persyaratan = await kegiatanService.findById(id);

  if (totalSks < persyaratan.minimalSks) {
    return ApiResponse.error(res, { statusCode: 422, message: 'Gagal mendaftar karena tidak memenuhi persyaratan SKS.' });
  }
  if (jumlahDE > persyaratan.maksimalNilaiD) {
    return ApiResponse.error(res, { statusCode: 422, message: 'Gagal mendaftar karena tidak memenuhi persyaratan minimal nilai D.' });
  }

  const waktuBerakhir = await akademik.waktuBerakhirPkl(tahunAktif);

  try {
    await tagihanService.createTagihan({
      npm,
      tahunAkademik: tahunAktif,
      waktuBerakhir: waktuBerakhir ? new Date(waktuBerakhir).toISOString() : new Date().toISOString(),
      detailTagihan: [{ nominal: Number(persyaratan.biayaPendaftaran), idBipot: persyaratan.idBipot, namaBipot: persyaratan.namaKegiatan || 'Pendaftaran PKL' }],
      detailPotongan: [],
      jenisTagihan: 'PKL',
    });
  } catch (err) {
    return ApiResponse.error(res, { statusCode: 400, message: err.message || 'Gagal membuat tagihan' });
  }

  await kegiatanService.insertPendaftaranKegiatan({
    npm,
    kegiatanMahasiswaId: persyaratan.id,
    idBipot: persyaratan.idBipot,
    biayaPendaftaran: persyaratan.biayaPendaftaran,
  });

  ApiResponse.success(res, { message: 'Berhasil mendaftar PKL' });
}

module.exports = { index, create, store };
