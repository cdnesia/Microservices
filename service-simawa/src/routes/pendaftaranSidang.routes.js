const express = require('express');
const requireStudent = require('../middleware/requireStudent');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/pendaftaranSidang.controller');

const router = express.Router();

// Sama seperti pendaftaranSeminar.routes.js — HANYA index/create/store, show/edit/
// update/destroy TIDAK ADA di aplikasi asli, sengaja tidak didaftarkan.
router.get('/pendaftaran-sidang-tugas-akhir', requireStudent, asyncHandler(controller.index));
router.get('/pendaftaran-sidang-tugas-akhir/create', requireStudent, asyncHandler(controller.create));
router.post('/pendaftaran-sidang-tugas-akhir', requireStudent, asyncHandler(controller.store));

const scopes = [
  { method: 'GET', path: '/simawa/pendaftaran-sidang-tugas-akhir', scope: 'simawa:pendaftaran-sidang:list', description: 'Daftar pendaftaran sidang tugas akhir' },
  { method: 'GET', path: '/simawa/pendaftaran-sidang-tugas-akhir/create', scope: 'simawa:pendaftaran-sidang:create-form', description: 'Syarat pendaftaran sidang tugas akhir' },
  { method: 'POST', path: '/simawa/pendaftaran-sidang-tugas-akhir', scope: 'simawa:pendaftaran-sidang:store', description: 'Daftar sidang tugas akhir' },
];

module.exports = { router, scopes };
