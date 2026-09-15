// Port dari app/Http/Controllers/PendaftaranSeminarController.php (SIMAWA Laravel).
// HANYA index/create/store — di aplikasi asli show/edit/update/destroy TIDAK
// DIDEKLARASIKAN SAMA SEKALI (beda dari KKN/PKL yang stub kosong), jadi endpoint itu
// SENGAJA tidak didaftarkan di routes/pendaftaranSeminar.routes.js sama sekali.
const ApiResponse = require('../utils/ApiResponse');
const { parseOrThrow } = require('../utils/validate');
const { pendaftaranStoreSchema } = require('../utils/schemas');
const { tryDecryptId, encryptId } = require('../utils/cryptoId');
const akademik = require('../services/akademik.service');
const kegiatanService = require('../services/kegiatanMahasiswa.service');
const tagihanService = require('../services/tagihan.service');
const { ringkasanKrsUntukPendaftaran, sudahKontrakTipe } = require('../services/pendaftaran.service');
const { TIPE_MATA_KULIAH_DIKECUALIKAN_NILAI_D } = require('../utils/constants');

const EXCLUDE_FAKULTAS = [2];

async function index(req, res) {
  const rows = await kegiatanService.findTugasAkhir(req.student.npm);
  ApiResponse.success(res, { data: rows, message: 'Berhasil mengambil data pendaftaran.' });
}

async function create(req, res) {
  const npm = req.student.npm;
  const mhs = await akademik.getMahasiswaAktifOrThrow(npm);
  const tahunAktif = await akademik.tahunAkademikAktif(mhs.kode_program_studi);

  const persyaratan = await kegiatanService.findPersyaratan({
    tipe: 'SEMINAR PROPOSAL',
    kelasPerkuliahanId: mhs.program_kuliah_id,
    kodeProdi: mhs.kode_program_studi,
    tahunAngkatan: mhs.tahun_angkatan,
  });

  const sudahKontrakSempro = !EXCLUDE_FAKULTAS.includes(Number(mhs.id_fakultas))
    ? await sudahKontrakTipe(npm, 4)
    : await sudahKontrakTipe(npm, 2);

  const { totalSks, jumlahD, jumlahKosong } = await ringkasanKrsUntukPendaftaran(npm, tahunAktif, {
    kecualikanTipeUntukNilaiD: TIPE_MATA_KULIAH_DIKECUALIKAN_NILAI_D,
  });

  ApiResponse.success(res, {
    data: {
      jadwal_kkn: true, // nama key literal "jadwal_kkn" di aplikasi asli walau modul Seminar — port apa adanya
      data: null,
      persyaratan: persyaratan.map((p) => ({ ...p, encrypted_id: encryptId(String(p.id)), id: undefined })),
      jumlah_sks: totalSks,
      jumlah_d: jumlahD + jumlahKosong,
      sudah_kontrak_sempro: sudahKontrakSempro,
    },
    message: 'Berhasil mengambil syarat pendaftaran Seminar Proposal.',
  });
}

async function store(req, res) {
  const { id: encryptedId } = parseOrThrow(pendaftaranStoreSchema, req.body);
  const npm = req.student.npm;
  const mhs = await akademik.getMahasiswaAktifOrThrow(npm);
  const tahunAktif = await akademik.tahunAkademikAktif(mhs.kode_program_studi);

  if (!EXCLUDE_FAKULTAS.includes(Number(mhs.id_fakultas))) {
    if (!(await sudahKontrakTipe(npm, 1))) {
      return ApiResponse.error(res, { statusCode: 422, message: 'Belum kontrak KKN.' });
    }
    if (!(await sudahKontrakTipe(npm, 4))) {
      return ApiResponse.error(res, { statusCode: 422, message: 'Belum kontrak Seminar Proposal.' });
    }
  } else if (!(await sudahKontrakTipe(npm, 2))) {
    return ApiResponse.error(res, { statusCode: 422, message: 'Belum kontrak PKL.' });
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

  const waktuBerakhir = await akademik.waktuBerakhirSempro(tahunAktif);
  try {
    await tagihanService.createTagihan({
      npm,
      tahunAkademik: tahunAktif,
      waktuBerakhir: waktuBerakhir ? new Date(waktuBerakhir).toISOString() : new Date().toISOString(),
      detailTagihan: [{ nominal: Number(persyaratan.biayaPendaftaran), idBipot: persyaratan.idBipot, namaBipot: persyaratan.namaKegiatan || 'Pendaftaran Seminar Proposal' }],
      detailPotongan: [],
      jenisTagihan: 'SEMINAR PROPOSAL',
    });
  } catch (err) {
    return ApiResponse.error(res, { statusCode: 400, message: err.message || 'Gagal membuat tagihan' });
  }

  await kegiatanService.insertTugasAkhir({
    npm,
    kegiatanMahasiswa: 'SEMINAR PROPOSAL',
    idBipot: persyaratan.idBipot,
    biayaPendaftaran: persyaratan.biayaPendaftaran,
  });

  ApiResponse.success(res, { message: 'Berhasil mendaftar Seminar Proposal' });
}

module.exports = { index, create, store };
