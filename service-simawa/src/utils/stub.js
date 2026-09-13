const ApiResponse = require('./ApiResponse');
const requireStudent = require('../middleware/requireStudent');

// Daftarkan route yang di aplikasi Laravel asli method-nya ADA tapi isinya kosong total
// (200 tanpa data) — lihat catatan "stub kosong" di controller yang memakainya
// (BiodataController, TranskripNilaiController, WisudaController, sebagian
// PendaftaranKKN/PKL). JANGAN dipakai untuk route yang di Laravel aslinya method-nya
// TIDAK ADA SAMA SEKALI (pendaftaran-seminar/sidang bagian show/edit/update/destroy) —
// untuk itu, sengaja jangan daftarkan apa pun supaya jatuh ke 404 generik, bukan 200
// stub palsu (lihat komentar di routes/pendaftaranSeminar.routes.js & pendaftaranSidang.routes.js).
function registerStub(router, method, routePath, message) {
  const fn = method.toLowerCase();
  router[fn](routePath, requireStudent, (req, res) => {
    ApiResponse.success(res, { data: null, message });
  });
}

module.exports = { registerStub };
