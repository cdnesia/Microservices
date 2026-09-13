// Port dari app/Http/Controllers/RiwayatPembayaranController.php (SIMAWA Laravel) — via
// SIMAKU HMAC (lihat catatan gap konfigurasi di services/simaku.service.js: aplikasi asli
// juga belum pernah mengisi config ini, jadi endpoint ini memang belum bisa jalan).
const ApiResponse = require('../utils/ApiResponse');
const simakuService = require('../services/simaku.service');

async function index(req, res) {
  const data = await simakuService.riwayatPembayaran(req.student.npm);
  ApiResponse.success(res, { data, message: 'Berhasil mengambil riwayat pembayaran.' });
}

module.exports = { index };
