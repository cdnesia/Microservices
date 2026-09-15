// Port dari app/Http/Controllers/RiwayatPembayaranController.php (SIMAWA Laravel) — TAPI
// SENGAJA MENYIMPANG dari mekanisme aslinya (bukan cuma "port apa adanya"): Laravel asli
// mengambil data ini lewat SIMAKU HMAC yang env-nya TIDAK PERNAH diisi di aplikasi asli
// (lihat services/simaku.service.js) — endpoint itu, sejauh yang bisa diverifikasi, tidak
// pernah benar-benar jalan sekalipun di production Laravel (selalu balas array kosong
// karena request ke URL kosong gagal, ditangkap tanpa penanganan error). Tidak ada
// perilaku nyata untuk di-port apa adanya di sini. Atas permintaan eksplisit ("buatkan
// riwayatnya"), endpoint ini dibangun dari tabel `tagihan` lokal yang sama dipakai
// /simawa/beranda (`tagihan_sekarang`) dan modul KKN/PKL/Seminar/Sidang — data riil,
// bukan simulasi. Dikelompokkan per tahun akademik (mirip struktur blade Laravel), tapi
// granularitas baris per TAGIHAN (jenis_tagihan), bukan per item `nama_bipot` seperti versi
// SIMAKU (yang skema respons aslinya tidak pernah diketahui karena tidak pernah jalan) —
// tabel lokal cuma punya `nominal_terbayar` di level tagihan, bukan per baris rincian.
const ApiResponse = require('../utils/ApiResponse');
const tagihanService = require('../services/tagihan.service');

async function index(req, res) {
  const npm = req.student.npm;
  const rows = await tagihanService.cekTagihan({ npm: [npm] });

  const grouped = new Map();
  rows.forEach((row) => {
    const key = row.tahun_akademik;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  });

  const data = Array.from(grouped.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([tahunAkademik, items]) => ({ tahun_akademik: tahunAkademik, items }));

  ApiResponse.success(res, { data, message: 'Berhasil mengambil riwayat pembayaran.' });
}

module.exports = { index };
