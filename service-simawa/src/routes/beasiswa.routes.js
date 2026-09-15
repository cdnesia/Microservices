const express = require('express');
const requireStudent = require('../middleware/requireStudent');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/beasiswa.controller');

const router = express.Router();

router.get('/riwayat-beasiswa', requireStudent, asyncHandler(controller.index));

const scopes = [
  {
    method: 'GET',
    path: '/simawa/riwayat-beasiswa',
    scope: 'simawa:riwayat-beasiswa:list',
    description: 'Riwayat beasiswa per tahun akademik (fitur baru, tidak ada di Laravel asli — lihat catatan di beasiswa.service.js)',
  },
];

module.exports = { router, scopes };
