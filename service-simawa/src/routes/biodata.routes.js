const express = require('express');
const requireStudent = require('../middleware/requireStudent');
const asyncHandler = require('../middleware/asyncHandler');
const { registerStub } = require('../utils/stub');
const controller = require('../controllers/biodata.controller');

const router = express.Router();
const STUB_MESSAGE = 'Stub kosong — belum diimplementasikan di aplikasi asli.';

// Port dari Route::resource('biodata', BiodataController::class) — SELURUHNYA STUB di
// aplikasi asli kecuali index (dan index sendiri pun tidak mengambil data apa pun).
router.get('/biodata', requireStudent, asyncHandler(controller.index));
registerStub(router, 'GET', '/biodata/create', STUB_MESSAGE);
registerStub(router, 'POST', '/biodata', STUB_MESSAGE);
registerStub(router, 'GET', '/biodata/:id', STUB_MESSAGE);
registerStub(router, 'GET', '/biodata/:id/edit', STUB_MESSAGE);
registerStub(router, 'PUT', '/biodata/:id', STUB_MESSAGE);
registerStub(router, 'DELETE', '/biodata/:id', STUB_MESSAGE);

const scopes = [
  { method: 'GET', path: '/simawa/biodata', scope: 'simawa:biodata:list', description: 'Biodata mahasiswa (stub — aplikasi asli belum mengambil data apa pun di sini)' },
  { method: 'GET', path: '/simawa/biodata/create', scope: 'simawa:biodata:create-form', description: 'Form tambah biodata (stub kosong)' },
  { method: 'POST', path: '/simawa/biodata', scope: 'simawa:biodata:store', description: 'Simpan biodata (stub kosong)' },
  { method: 'GET', path: '/simawa/biodata/:id', scope: 'simawa:biodata:show', description: 'Detail biodata (stub kosong)' },
  { method: 'GET', path: '/simawa/biodata/:id/edit', scope: 'simawa:biodata:edit-form', description: 'Form edit biodata (stub kosong)' },
  { method: 'PUT', path: '/simawa/biodata/:id', scope: 'simawa:biodata:update', description: 'Update biodata (stub kosong)' },
  { method: 'DELETE', path: '/simawa/biodata/:id', scope: 'simawa:biodata:destroy', description: 'Hapus biodata (stub kosong)' },
];

module.exports = { router, scopes };
