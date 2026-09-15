// Lihat catatan "fitur baru, bukan port" di services/beasiswa.service.js. Baris
// tbl_penerima_beasiswa (satu beasiswa bisa cover beberapa tahun) diratakan (flatten) per
// tahun akademik di sini supaya FE tinggal render "per tahun" tanpa mengurai JSON sendiri.
const ApiResponse = require('../utils/ApiResponse');
const beasiswaService = require('../services/beasiswa.service');

// Kolom JSON — driver bisa balikin string mentah atau array yang sudah ter-parse
// tergantung tipe kolom sebenarnya (sama ambiguitas dengan detail_tagihan, lihat
// tagihan.service.js) — selalu lewat parser ini, jangan asumsikan salah satu bentuk.
function parseTahunAkademik(value) {
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value : [];
}

async function index(req, res) {
  const npm = req.student.npm;
  const rows = await beasiswaService.findRiwayatBeasiswa(npm);

  const grouped = new Map();
  rows.forEach((row) => {
    parseTahunAkademik(row.tahun_akademik).forEach((tahun) => {
      if (!grouped.has(tahun)) grouped.set(tahun, []);
      grouped.get(tahun).push({
        nama_beasiswa: row.nama_beasiswa,
        nama_lembaga: row.nama_lembaga,
        jumlah_jaminan: row.jumlah_jaminan,
      });
    });
  });

  const data = Array.from(grouped.entries())
    .sort(([a], [b]) => String(b).localeCompare(String(a)))
    .map(([tahunAkademik, items]) => ({ tahun_akademik: tahunAkademik, items }));

  ApiResponse.success(res, { data, message: 'Berhasil mengambil riwayat beasiswa.' });
}

module.exports = { index };
