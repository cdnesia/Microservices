const express = require('express');
const requireStudent = require('../middleware/requireStudent');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/edom.controller');

const router = express.Router();

router.get('/edom/view', requireStudent, asyncHandler(controller.view));
router.post('/edom/simpan', requireStudent, asyncHandler(controller.simpan));

const scopes = [
  { method: 'GET', path: '/simawa/edom/view', scope: 'simawa:edom:view', description: 'Form kuesioner EDOM (evaluasi dosen oleh mahasiswa)' },
  { method: 'POST', path: '/simawa/edom/simpan', scope: 'simawa:edom:simpan', description: 'Simpan jawaban EDOM' },
];

module.exports = { router, scopes };
