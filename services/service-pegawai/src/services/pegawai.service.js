const { getPool } = require('../db/pools');
const AppError = require('../utils/AppError');

// Semua kolom tabel `pegawai` KECUALI yang sensitif: password (hash),
// no_ktp, no_kk, no_npwp, no_bpjs_kesehatan, no_bpjs_ketenagakerjaan, kso_key.
const SAFE_COLUMNS = `
  id, pin_absensi, nik, nama_lengkap, id_status_pernikahan, nidn, mulai_bekerja, foto,
  id_status_kepegawaian, id_pendidikan_terakhir, id_fungsional_terakhir,
  id_pangkat_golongan_terakhir, id_pangkat_golongan_mkg_terakhir, id_tipe, id_jenis_kelamin,
  ketik_kota_kabupaten_lahir, id_kota_kabupaten_lahir, tanggal_lahir, no_nktm,
  file_ktp, file_kk, alamat_ktp, provinsi_ktp, kabupaten_kota_ktp, kode_pos_ktp,
  negara_sekarang, provinsi_sekarang, kabupaten_kota_sekarang, alamat_sekarang, kode_pos_sekarang,
  telepon, hp, email_instansi, email_pribadi, status_aktif,
  id_created, datetime_created, id_updated, datetime_updated, id_deleted, datetime_deleted,
  NA, datetime_timestamp, kso_subdomain
`;

async function findAll() {
  const pool = getPool('SIADE_OLD');
  const [rows] = await pool.query(`SELECT ${SAFE_COLUMNS} FROM pegawai`);
  return rows;
}

// Menerima nik, nidn, dan/atau id — semua field yang dikirim client harus
// cocok (AND), jadi client bebas kirim salah satu atau beberapa sekaligus.
async function findByIdentifier({ nik, nidn, id }) {
  const pool = getPool('SIADE_OLD');

  const conditions = [];
  const params = [];
  if (nik) {
    conditions.push('nik = ?');
    params.push(nik);
  }
  if (nidn) {
    conditions.push('nidn = ?');
    params.push(nidn);
  }
  if (id) {
    conditions.push('id = ?');
    params.push(id);
  }

  const [rows] = await pool.query(
    `SELECT ${SAFE_COLUMNS} FROM pegawai WHERE ${conditions.join(' AND ')} LIMIT 1`,
    params
  );

  if (rows.length === 0) {
    throw new AppError(404, 'Pegawai tidak ditemukan');
  }

  return rows[0];
}

module.exports = { findAll, findByIdentifier };
