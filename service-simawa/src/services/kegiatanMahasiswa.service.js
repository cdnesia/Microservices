// Port dari Laravel App\Models\KegiatanMahasiswa (connection db_siade, table
// tbl_kegiatan_mahasiswa) — dipakai untuk syarat pendaftaran KKN/PKL/Seminar
// Proposal/Sidang Tugas Akhir. `id` asli tidak pernah diekspos ke client (di Laravel
// diganti `encrypted_id`); di sini kita pakai JWT bertanda tangan sendiri sebagai
// pengganti `Crypt::encrypt()` Laravel (lihat src/utils/cryptoId.js).
const { getPool } = require('../db/pools');
const AppError = require('../utils/AppError');

async function findPersyaratan({ tipe, kelasPerkuliahanId, kodeProdi, tahunAngkatan }) {
  const pool = getPool('SIADE');
  const [rows] = await pool.query(
    `SELECT id, nama_kegiatan AS namaKegiatan, minimal_sks AS minimalSks,
            maksimal_nilai_d AS maksimalNilaiD, biaya_pendaftaran AS biayaPendaftaran,
            id_bipot AS idBipot
     FROM tbl_kegiatan_mahasiswa
     WHERE tipe = ?
       AND kelas_perkuliahan_id = ?
       AND JSON_CONTAINS(kode_program_studi, JSON_QUOTE(?))
       AND JSON_CONTAINS(tahun_angkatan, JSON_QUOTE(?))`,
    [tipe, kelasPerkuliahanId, String(kodeProdi), String(tahunAngkatan)]
  );
  return rows;
}

async function findById(id) {
  const pool = getPool('SIADE');
  const [rows] = await pool.query(
    `SELECT id, nama_kegiatan AS namaKegiatan, minimal_sks AS minimalSks,
            maksimal_nilai_d AS maksimalNilaiD, biaya_pendaftaran AS biayaPendaftaran,
            id_bipot AS idBipot
     FROM tbl_kegiatan_mahasiswa WHERE id = ? LIMIT 1`,
    [id]
  );
  if (rows.length === 0) {
    throw new AppError(400, `Kegiatan mahasiswa dengan id "${id}" tidak ditemukan`);
  }
  return rows[0];
}

// Setara PendaftaranKKN/PendaftaranPKL model (`::insert()` ke tbl_pendaftaran_kegiatan_mahasiswa).
async function insertPendaftaranKegiatan({ npm, kegiatanMahasiswaId, idBipot, biayaPendaftaran }) {
  const pool = getPool('SIADE');
  await pool.execute(
    `INSERT INTO tbl_pendaftaran_kegiatan_mahasiswa
       (npm, kegiatan_mahasiswa_id, tanggal_pendaftaran, id_bipot, biaya_pendaftaran)
     VALUES (?, ?, NOW(), ?, ?)`,
    [npm, kegiatanMahasiswaId, idBipot, biayaPendaftaran]
  );
}

async function findPendaftaranKegiatan(npm, tipeList) {
  const pool = getPool('SIADE');
  const placeholders = tipeList.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT tpkm.*, tkm.nama_kegiatan AS namaKegiatan
     FROM tbl_pendaftaran_kegiatan_mahasiswa tpkm
     JOIN tbl_kegiatan_mahasiswa tkm ON tpkm.kegiatan_mahasiswa_id = tkm.id
     WHERE tpkm.npm = ? AND tkm.tipe IN (${placeholders})`,
    [npm, ...tipeList]
  );
  return rows;
}

// Setara TugasAkhir model (`::insert()` ke tbl_tugas_akhir) — dipakai Seminar Proposal &
// Sidang Tugas Akhir (BUKAN model PendaftaranSeminar/PendaftaranSidang, yang di Laravel
// asli memang tidak pernah dipakai — lihat spek).
async function insertTugasAkhir({ npm, kegiatanMahasiswa, idBipot, biayaPendaftaran }) {
  const pool = getPool('SIADE');
  await pool.execute(
    `INSERT INTO tbl_tugas_akhir
       (npm, kegiatan_mahasiswa, tanggal_pendaftaran, id_bipot, biaya_pendaftaran)
     VALUES (?, ?, NOW(), ?, ?)`,
    [npm, kegiatanMahasiswa, idBipot, biayaPendaftaran]
  );
}

async function findTugasAkhir(npm, kegiatanMahasiswa) {
  const pool = getPool('SIADE');
  if (kegiatanMahasiswa) {
    const [rows] = await pool.query(
      'SELECT * FROM tbl_tugas_akhir WHERE npm = ? AND kegiatan_mahasiswa = ?',
      [npm, kegiatanMahasiswa]
    );
    return rows;
  }
  const [rows] = await pool.query('SELECT * FROM tbl_tugas_akhir WHERE npm = ?', [npm]);
  return rows;
}

module.exports = {
  findPersyaratan,
  findById,
  insertPendaftaranKegiatan,
  findPendaftaranKegiatan,
  insertTugasAkhir,
  findTugasAkhir,
};
