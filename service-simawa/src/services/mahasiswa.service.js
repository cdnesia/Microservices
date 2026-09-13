// Salinan privat dari service-tagihan/src/services/mahasiswa.service.js — dipakai
// tagihan.service.js di service ini (lihat CLAUDE.md "Duplikasi kode yang disengaja":
// tidak ada mekanisme service-to-service call di arsitektur ini, tiap container harus
// tetap self-contained).
const { getPool } = require('../db/pools');
const AppError = require('../utils/AppError');

async function findByNpm(npm) {
  const pool = getPool('SIADE');

  const [rows] = await pool.query(
    `SELECT
       m.npm,
       m.nama_mahasiswa AS namaMahasiswa,
       m.va_code AS vaCode,
       f.nama_fakultas_idn AS namaFakultas,
       m.kode_program_studi AS kodeProgramStudi,
       ps.nama_program_studi_idn AS namaProgramStudi,
       m.program_kuliah_id AS idKelasPerkuliahan,
       kp.nama_program_perkuliahan AS namaKelasPerkuliahan,
       m.tahun_angkatan AS tahunAngkatan,
       m.jenis_pendaftaran_id AS jenisPendaftaranId
     FROM master_mahasiswa m
     LEFT JOIN master_program_studi ps ON ps.kode_program_studi = m.kode_program_studi
     LEFT JOIN master_fakultas f ON f.id = ps.fakultas_id
     LEFT JOIN master_kelas_perkuliahan kp ON kp.id = m.program_kuliah_id
     WHERE m.npm = ?
     LIMIT 1`,
    [npm]
  );

  if (rows.length === 0) {
    throw new AppError(404, `Mahasiswa dengan npm "${npm}" tidak ditemukan`);
  }

  const mahasiswa = rows[0];

  if (mahasiswa.idKelasPerkuliahan === null) {
    throw new AppError(
      422,
      `Data akademik mahasiswa npm "${npm}" belum lengkap (kelas perkuliahan belum diisi)`
    );
  }

  return {
    ...mahasiswa,
    idKelasPerkuliahan: String(mahasiswa.idKelasPerkuliahan),
  };
}

module.exports = { findByNpm };
