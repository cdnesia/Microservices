// Belum ada fitur "riwayat beasiswa" di Laravel asli — cekBeasiswa() di sana (dan port-nya
// akademik.service.js:cekBeasiswa) cuma flag boolean untuk SATU tahun akademik, dipakai
// gerbang tagihan_sekarang/kontrak KRS (HomeController.php, KrsController.php), tidak
// pernah menampilkan datanya ke mahasiswa. Dibangun BARU di sini (bukan port) dari tabel
// yang sama (tbl_penerima_beasiswa JOIN master_lembaga_beasiswa), atas permintaan
// eksplisit menu "Riwayat Beasiswa".
const { getPool } = require('../db/pools');

// Satu baris = satu penerimaan beasiswa yang bisa mencakup BEBERAPA tahun akademik
// sekaligus (`tahun_akademik` kolom JSON array, mis. ["20251","20242","20241"]) — bukan
// satu baris per tahun, dikonfirmasi dari data asli lewat cekBeasiswa()'s JSON_CONTAINS.
async function findRiwayatBeasiswa(npm) {
  const pool = getPool('SIADE');
  const [rows] = await pool.query(
    `SELECT pb.tahun_akademik, pb.jumlah_jaminan, lb.nama_beasiswa, lb.nama_lembaga
     FROM tbl_penerima_beasiswa pb
     LEFT JOIN master_lembaga_beasiswa lb ON lb.id = pb.id_lembaga
     WHERE pb.npm = ?`,
    [npm]
  );
  return rows;
}

// Nama beasiswa untuk tahun akademik AKTIF saja — dipakai halaman Beranda (home.controller.js)
// supaya badge "Penerima Beasiswa" bisa menampilkan namanya, bukan cuma flag boolean seperti
// akademik.service.js:cekBeasiswa (yang dipertahankan apa adanya untuk gerbang KRS/tagihan).
async function findNamaBeasiswaAktif(npm, tahunAkademik) {
  const pool = getPool('SIADE');
  const [rows] = await pool.query(
    `SELECT lb.nama_beasiswa
     FROM tbl_penerima_beasiswa pb
     LEFT JOIN master_lembaga_beasiswa lb ON lb.id = pb.id_lembaga
     WHERE pb.npm = ? AND JSON_CONTAINS(pb.tahun_akademik, JSON_QUOTE(?))
     LIMIT 1`,
    [npm, String(tahunAkademik)]
  );
  return rows[0]?.nama_beasiswa || null;
}

module.exports = { findRiwayatBeasiswa, findNamaBeasiswaAktif };
