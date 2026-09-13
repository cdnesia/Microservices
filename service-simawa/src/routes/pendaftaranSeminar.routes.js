const express = require('express');
const requireStudent = require('../middleware/requireStudent');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/pendaftaranSeminar.controller');

const router = express.Router();

// SENGAJA cuma 3 endpoint (index/create/store) — di aplikasi Laravel asli
// show/edit/update/destroy TIDAK DIDEKLARASIKAN SAMA SEKALI di controller (beda dari
// KKN/PKL yang stub kosong), jadi mengakses itu di app asli menghasilkan fatal error.
// Di sini endpoint itu memang tidak didaftarkan sama sekali — request ke situ jatuh ke
// handler 404 generik (lihat src/index.js), port paling presisi untuk "method tidak
// ada" tanpa membuat stub 200 palsu.
router.get('/pendaftaran-seminar-proposal', requireStudent, asyncHandler(controller.index));
router.get('/pendaftaran-seminar-proposal/create', requireStudent, asyncHandler(controller.create));
router.post('/pendaftaran-seminar-proposal', requireStudent, asyncHandler(controller.store));

const scopes = [
  { method: 'GET', path: '/simawa/pendaftaran-seminar-proposal', scope: 'simawa:pendaftaran-seminar:list', description: 'Daftar pendaftaran seminar proposal & sidang (tabel tbl_tugas_akhir)' },
  { method: 'GET', path: '/simawa/pendaftaran-seminar-proposal/create', scope: 'simawa:pendaftaran-seminar:create-form', description: 'Syarat pendaftaran seminar proposal' },
  { method: 'POST', path: '/simawa/pendaftaran-seminar-proposal', scope: 'simawa:pendaftaran-seminar:store', description: 'Daftar seminar proposal' },
];

module.exports = { router, scopes };
