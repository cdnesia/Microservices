const { getPool } = require('../db/pools');
const AppError = require('../utils/AppError');
const mahasiswaService = require('./mahasiswa.service');

const JALUR_MASUK_RPL = [13, 16];

const STATUS_AWAL_RPL = 4;
const STATUS_AWAL_REGULER = 1;

function resolveStatusAwal(jenisPendaftaranId) {
  return JALUR_MASUK_RPL.includes(jenisPendaftaranId) ? STATUS_AWAL_RPL : STATUS_AWAL_REGULER;
}

function resolveSemester(tahunAngkatan, tahunAkademik) {
  const termIndex = (kodeTahun) => Number(kodeTahun.slice(0, 4)) * 2 + Number(kodeTahun.slice(4, 5)) - 1;

  const semester = termIndex(tahunAkademik) - termIndex(tahunAngkatan) + 1;

  if (semester < 1) {
    throw new AppError(
      422,
      `Tahun akademik ${tahunAkademik} berada sebelum tahun masuk mahasiswa (${tahunAngkatan}).`
    );
  }

  return semester;
}

async function getRincianBiaya({ kodeProdi, tahunAngkatan, semester, programKuliahId, statusAwal }) {
  const pool = getPool('SIMAKU');

  const [angkatanRows] = await pool.query(
    `SELECT id FROM master_bipot_per_angkatan
     WHERE kode_prodi = ? AND kode_tahun = ? AND id_program_kuliah = ?`,
    [kodeProdi, tahunAngkatan, programKuliahId]
  );

  if (angkatanRows.length === 0) {
    return [];
  }

  const angkatanIds = angkatanRows.map((row) => row.id);
  const placeholders = angkatanIds.map(() => '?').join(',');

  const [rows] = await pool.query(
    `SELECT bs.nominal, bs.semester, b.id AS idBipot, b.nama_bipot AS namaBipot, b.trxid, b.urutan
     FROM master_bipot_per_semester bs
     JOIN master_bipot b ON b.id = bs.id_bipot
     WHERE bs.id_bipot_angkatan IN (${placeholders})
       AND bs.semester = ?
       AND JSON_CONTAINS(bs.status_awal, ?)
     ORDER BY b.urutan ASC`,
    [...angkatanIds, semester, JSON.stringify(statusAwal)]
  );

  return rows;
}

async function getRincianBiayaMahasiswa({ npm, tahunAkademik }) {
  const mahasiswa = await mahasiswaService.findByNpm(npm);

  const semester = resolveSemester(mahasiswa.tahunAngkatan, tahunAkademik);
  const statusAwal = resolveStatusAwal(mahasiswa.jenisPendaftaranId);

  const rincian = await getRincianBiaya({
    kodeProdi: mahasiswa.kodeProgramStudi,
    tahunAngkatan: mahasiswa.tahunAngkatan,
    semester,
    programKuliahId: Number(mahasiswa.idKelasPerkuliahan),
    statusAwal,
  });

  if (rincian.length === 0) {
    throw new AppError(
      404,
      `Rincian biaya bipot tidak ditemukan untuk prodi ${mahasiswa.kodeProgramStudi} angkatan ${mahasiswa.tahunAngkatan} semester ${semester}.`
    );
  }

  const detailTagihan = rincian
    .filter((item) => item.trxid >= 0)
    .map((item) => ({ idBipot: item.idBipot, namaBipot: item.namaBipot, nominal: Number(item.nominal) }));

  const detailPotongan = rincian
    .filter((item) => item.trxid < 0)
    .map((item) => ({ idBipot: item.idBipot, namaBipot: item.namaBipot, nominal: Math.abs(Number(item.nominal)) }));

  return {
    npm: mahasiswa.npm,
    namaMahasiswa: mahasiswa.namaMahasiswa,
    tahunAkademik,
    semester,
    detailTagihan,
    totalTagihan: detailTagihan.reduce((sum, item) => sum + item.nominal, 0),
    detailPotongan,
    totalPotongan: detailPotongan.reduce((sum, item) => sum + item.nominal, 0),
  };
}

module.exports = { getRincianBiayaMahasiswa };
