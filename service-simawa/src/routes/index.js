// Gabungkan semua router domain jadi satu — src/index.js tinggal mount hasilnya di
// bawah '/simawa' dan pakai `scopes` gabungan untuk manifest GET /scopes. Tiap file
// domain (mis. krs.routes.js) sudah mendefinisikan path lengkapnya sendiri
// (mis. '/krs/print'), jadi tidak perlu prefix tambahan di sini.
const express = require('express');

const domains = [
  require('./auth.routes'),
  require('./home.routes'),
  require('./jadwal.routes'),
  require('./biodata.routes'),
  require('./khs.routes'),
  require('./krs.routes'),
  require('./transkripNilai.routes'),
  require('./pendaftaranKkn.routes'),
  require('./pendaftaranPkl.routes'),
  require('./pendaftaranSeminar.routes'),
  require('./pendaftaranSidang.routes'),
  require('./riwayatPembayaran.routes'),
  require('./beasiswa.routes'),
  require('./wisuda.routes'),
  require('./edom.routes'),
];

const router = express.Router();
const scopes = [];

domains.forEach((domain) => {
  router.use(domain.router);
  scopes.push(...domain.scopes);
});

module.exports = { router, scopes };
