const express = require('express');
const requireStudent = require('../middleware/requireStudent');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/home.controller');

const router = express.Router();

router.get('/beranda', requireStudent, asyncHandler(controller.beranda));
router.get('/generate-va', requireStudent, asyncHandler(controller.generateVa));

const scopes = [
  { method: 'GET', path: '/simawa/beranda', scope: 'simawa:beranda', description: 'Dashboard mahasiswa (IPS per semester, cek/generate tagihan SPP)' },
  { method: 'GET', path: '/simawa/generate-va', scope: 'simawa:generate-va', description: 'Generate VA (port bug: method tidak pernah diimplementasikan di aplikasi asli, selalu error)' },
];

module.exports = { router, scopes };
