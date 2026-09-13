const express = require('express');
const requireStudent = require('../middleware/requireStudent');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/krs.controller');

const router = express.Router();

router.get('/krs', requireStudent, asyncHandler(controller.index));
router.get('/krs/create', requireStudent, asyncHandler(controller.create));
router.post('/krs', requireStudent, asyncHandler(controller.store));
router.delete('/krs/:jadwalId', requireStudent, asyncHandler(controller.destroy));
router.get('/krs/print', requireStudent, asyncHandler(controller.print));

const scopes = [
  { method: 'GET', path: '/simawa/krs', scope: 'simawa:krs:list', description: 'Kartu Rencana Studi per periode' },
  { method: 'GET', path: '/simawa/krs/create', scope: 'simawa:krs:create-form', description: 'Form kontrak KRS (jadwal tersedia untuk dikontrak)' },
  { method: 'POST', path: '/simawa/krs', scope: 'simawa:krs:store', description: 'Kontrak mata kuliah' },
  { method: 'DELETE', path: '/simawa/krs/:jadwalId', scope: 'simawa:krs:destroy', description: 'Batalkan kontrak mata kuliah' },
  { method: 'GET', path: '/simawa/krs/print', scope: 'simawa:krs:print', description: 'Cetak KRS sebagai PDF' },
];

module.exports = { router, scopes };
