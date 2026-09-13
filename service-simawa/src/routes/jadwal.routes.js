const express = require('express');
const requireStudent = require('../middleware/requireStudent');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/jadwal.controller');

const router = express.Router();

router.get('/jadwal-perkuliahan', requireStudent, asyncHandler(controller.list));

const scopes = [
  { method: 'GET', path: '/simawa/jadwal-perkuliahan', scope: 'simawa:jadwal-perkuliahan:list', description: 'Jadwal kuliah mahasiswa (tahun akademik aktif)' },
];

module.exports = { router, scopes };
