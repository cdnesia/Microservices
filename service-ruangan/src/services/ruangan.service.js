const { getPool } = require('../db/pools');

// Kolom publik tabel `ruang` — kolom audit (id_created, datetime_created,
// id_updated, datetime_updated, id_deleted, datetime_deleted, NA,
// datetime_timestamp) tidak diikutkan karena tidak relevan buat consumer API.
const SAFE_COLUMNS = `
  id, id_bangunan, id_lantai, kode, nama, kuota, tipe, denah, id_sub_unit
`;

// NA = 'A' berarti aktif (belum dihapus) — data dengan NA = 'N' adalah
// data yang sudah di-soft-delete di sisi SIADE lama.
async function findAll() {
  const pool = getPool('SIADE_OLD');
  const [rows] = await pool.query(`SELECT ${SAFE_COLUMNS} FROM ruang WHERE NA = 'A'`);
  return rows;
}

module.exports = { findAll };
