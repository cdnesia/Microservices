// Port dari KrsController::store()/destroy() (SIMAWA Laravel) — kontrak & batal-kontrak
// mata kuliah. TIDAK ADA cek bentrok jadwal atau cek duplikat kontrak di sini — dikonfirmasi
// tidak ada logic itu di app asli juga (lihat spek ekstraksi), port apa adanya.
const { getPool } = require('../db/pools');
const AppError = require('../utils/AppError');

async function insertKrs({ jadwalId, npm, kodeTahunAkademik }) {
  const pool = getPool('SIADE');
  await pool.execute(
    'INSERT INTO tbl_mahasiswa_krs (jadwal_id, npm, kode_tahun_akademik) VALUES (?, ?, ?)',
    [jadwalId, npm, kodeTahunAkademik]
  );
}

async function findKrsByJadwalNpm(jadwalId, npm) {
  const pool = getPool('SIADE');
  const [rows] = await pool.query('SELECT * FROM tbl_mahasiswa_krs WHERE jadwal_id = ? AND npm = ? LIMIT 1', [
    jadwalId,
    npm,
  ]);
  return rows[0] || null;
}

async function deleteKrsAndAbsensi(krsRow) {
  const pool = getPool('SIADE');
  // Hapus absensi dulu (tabel terkait) sebelum hapus KRS-nya, supaya tidak orphan —
  // port KrsController.php:132-140.
  await pool.execute('DELETE FROM tbl_jadwal_pertemuan_absensi WHERE jadwal_id = ? AND npm = ?', [
    krsRow.jadwal_id,
    krsRow.npm,
  ]);
  await pool.execute('DELETE FROM tbl_mahasiswa_krs WHERE id = ?', [krsRow.id]);
}

async function cancelKrs(jadwalId, npm) {
  const krsRow = await findKrsByJadwalNpm(jadwalId, npm);
  if (!krsRow) {
    throw new AppError(404, 'Data tidak ditemukan');
  }
  if (krsRow.persetujuan_pa === 'Y') {
    throw new AppError(403, 'Mata kuliah sudah disetujui PA dan tidak dapat dihapus');
  }
  await deleteKrsAndAbsensi(krsRow);
}

module.exports = { insertKrs, cancelKrs };
