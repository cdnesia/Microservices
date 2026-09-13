const express = require('express');
const requireStudent = require('../middleware/requireStudent');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/riwayatPembayaran.controller');

const router = express.Router();

router.get('/riwayat-pembayaran', requireStudent, asyncHandler(controller.index));

const scopes = [
  { method: 'GET', path: '/simawa/riwayat-pembayaran', scope: 'simawa:riwayat-pembayaran:list', description: 'Riwayat pembayaran (via SIMAKU HMAC — belum ter-konfigurasi di aplikasi asli, lihat simaku.service.js)' },
];

module.exports = { router, scopes };
