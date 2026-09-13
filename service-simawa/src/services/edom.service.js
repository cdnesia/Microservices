// Port dari EdomController.php (SIMAWA Laravel) — form kuesioner evaluasi dosen (EDOM).
const { getPool } = require('../db/pools');
const AppError = require('../utils/AppError');

// Validasi kepemilikan: pastikan kombinasi npm+periode+matkul+dosen yang diminta
// memang ada di KRS mahasiswa yang sedang login (bukan bisa lihat/isi EDOM matkul
// mahasiswa lain lewat manipulasi parameter) — port EdomController.php:36-53.
async function findMatakuliahForEdom({ npm, periode, idMatakuliah, idDosen }) {
  const pool = getPool('SIADE');
  const [rows] = await pool.query(
    `SELECT
       tbl_mahasiswa_krs.kode_tahun_akademik AS kodeTahunAkademik,
       tbl_mahasiswa_krs.npm,
       master_kurikulum_matakuliah.id AS idMatakuliah,
       master_kurikulum_matakuliah.kode_mata_kuliah AS kodeMataKuliah,
       master_kurikulum_matakuliah.nama_mata_kuliah_idn AS namaMataKuliah,
       tbl_jadwal_perkuliahan.dosen_id AS dosenId
     FROM tbl_mahasiswa_krs
     JOIN tbl_jadwal_perkuliahan ON tbl_jadwal_perkuliahan.id = tbl_mahasiswa_krs.jadwal_id
     JOIN master_kurikulum_matakuliah ON master_kurikulum_matakuliah.id = tbl_jadwal_perkuliahan.mata_kuliah_id
     WHERE tbl_mahasiswa_krs.npm = ?
       AND tbl_mahasiswa_krs.kode_tahun_akademik = ?
       AND master_kurikulum_matakuliah.id = ?
       AND tbl_jadwal_perkuliahan.dosen_id = ?
     LIMIT 1`,
    [npm, periode, idMatakuliah, idDosen]
  );

  if (rows.length === 0) {
    throw new AppError(404, 'Kombinasi matakuliah/dosen/periode tidak ditemukan di KRS Anda.');
  }
  return rows[0];
}

async function getDaftarSoal() {
  const pool = getPool('SIADE');
  const [soalRows] = await pool.query(
    'SELECT id_listsoal, tipe_soal, pertanyaan FROM tbl_listsoal_survey ORDER BY id_listsoal ASC'
  );

  if (soalRows.length === 0) return [];

  const ids = soalRows.map((s) => s.id_listsoal);
  const placeholders = ids.map(() => '?').join(',');
  const [pilihanRows] = await pool.query(
    `SELECT id_listsoal, urut, ket FROM tbl_listpilihan_survey
     WHERE id_listsoal IN (${placeholders}) ORDER BY urut ASC`,
    ids
  );

  const pilihanByListsoal = new Map();
  for (const p of pilihanRows) {
    if (!pilihanByListsoal.has(p.id_listsoal)) pilihanByListsoal.set(p.id_listsoal, []);
    pilihanByListsoal.get(p.id_listsoal).push({ id_listsoal: p.id_listsoal, urut: p.urut, ket: p.ket });
  }

  return soalRows.map((s) => ({
    id_listsoal: s.id_listsoal,
    tipesoal: s.tipe_soal,
    pertanyaan: s.pertanyaan,
    pilihan: pilihanByListsoal.get(s.id_listsoal) || [],
  }));
}

// Port simpan_edome() — TIDAK ADA validasi cross-check terhadap daftar soal asli di
// app Laravel (field dinamis dipercaya mentah dari client); dipertahankan sama persis
// di sini kecuali validasi TIPE dasar via zod di layer route (bukan logic bisnis baru).
async function simpanJawaban({ idMhswKrs, nim, tahunid, idmk, dosenid, jawabanList }) {
  const pool = getPool('SIADE');
  const waktuSelesai = new Date();

  const detailRows = jawabanList.map((j) => [
    j.idListsoal,
    idmk,
    nim,
    dosenid,
    tahunid,
    idMhswKrs,
    j.tipeSoal === 'PG' ? (j.jawaban ?? '') : '',
    j.tipeSoal === 'PG' ? '' : (j.jawabanEsay ?? ''),
  ]);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (detailRows.length > 0) {
      await conn.query(
        `INSERT INTO tbl_jawaban_detail_survey
           (id_listsoal, idmk, nim, dosenid, tahun, id_mhsw_krs, jawaban, jawaban_esay)
         VALUES ?`,
        [detailRows]
      );
    }
    await conn.execute(
      `INSERT INTO tbl_jawaban_header_survey (nim, tahunid, idmk, dosenid, waktu_selesai)
       VALUES (?, ?, ?, ?, ?)`,
      [nim, tahunid, idmk, dosenid, waktuSelesai]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { findMatakuliahForEdom, getDaftarSoal, simpanJawaban };
