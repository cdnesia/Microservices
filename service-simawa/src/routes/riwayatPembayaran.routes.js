const express = require('express');
const requireStudent = require('../middleware/requireStudent');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/riwayatPembayaran.controller');

const router = express.Router();

router.get('/riwayat-pembayaran', requireStudent, asyncHandler(controller.index));

const scopes = [
  { method: 'GET', path: '/simawa/riwayat-pembayaran', scope: 'simawa:riwayat-pembayaran:list', description: 'Riwayat pembayaran per tahun akademik (dari tabel tagihan lokal — bukan SIMAKU, lihat catatan di riwayatPembayaran.controller.js)' },
];

module.exports = { router, scopes };
