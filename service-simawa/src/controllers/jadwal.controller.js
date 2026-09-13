// Port dari app/Http/Controllers/JadwalPerkuliahanController.php (SIMAWA Laravel).
const ApiResponse = require('../utils/ApiResponse');
const akademik = require('../services/akademik.service');

async function list(req, res) {
  const npm = req.student.npm;
  // DataService::krs($npm, $TAAktif) — parameter kedua DEAD di Laravel (tidak dipakai
  // di body method), jadi di sini cukup panggil krs(npm) tanpa parameter kedua.
  const jadwalKuliah = await akademik.krs(npm);
  ApiResponse.success(res, { data: jadwalKuliah, message: 'Berhasil mengambil jadwal kuliah.' });
}

module.exports = { list };
