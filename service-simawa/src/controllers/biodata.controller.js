// Port dari app/Http/Controllers/BiodataController.php (SIMAWA Laravel) — HANYA index
// yang punya "logic" (render kosong tanpa data), 6 method lain didaftarkan sebagai stub
// langsung di routes/biodata.routes.js (lihat utils/stub.js).
const ApiResponse = require('../utils/ApiResponse');

async function index(req, res) {
  // Port apa adanya: BiodataController::index() Laravel inject DataService tapi TIDAK
  // memakainya sama sekali — tidak ada data biodata yang benar-benar diambil.
  ApiResponse.success(res, { data: null, message: 'Berhasil.' });
}

module.exports = { index };
