const express = require('express');
const requireStudent = require('../middleware/requireStudent');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/khs.controller');

const router = express.Router();

router.get('/khs', requireStudent, asyncHandler(controller.index));
router.get('/khs/print', requireStudent, asyncHandler(controller.print));

const scopes = [
  { method: 'GET', path: '/simawa/khs', scope: 'simawa:khs:list', description: 'Kartu Hasil Studi per periode' },
  { method: 'GET', path: '/simawa/khs/print', scope: 'simawa:khs:print', description: 'Cetak KHS sebagai PDF (wajib semua matkul periode itu sudah isi EDOM)' },
];

module.exports = { router, scopes };
