const express = require('express');
const requireStudent = require('../middleware/requireStudent');
const asyncHandler = require('../middleware/asyncHandler');
const { registerStub } = require('../utils/stub');
const controller = require('../controllers/pendaftaranKkn.controller');

const router = express.Router();
const STUB_MESSAGE = 'Stub kosong — belum diimplementasikan di aplikasi asli.';

router.get('/pendaftaran-kkn', requireStudent, asyncHandler(controller.index));
router.get('/pendaftaran-kkn/create', requireStudent, asyncHandler(controller.create));
router.post('/pendaftaran-kkn', requireStudent, asyncHandler(controller.store));
registerStub(router, 'GET', '/pendaftaran-kkn/:id', STUB_MESSAGE);
registerStub(router, 'GET', '/pendaftaran-kkn/:id/edit', STUB_MESSAGE);
registerStub(router, 'PUT', '/pendaftaran-kkn/:id', STUB_MESSAGE);
registerStub(router, 'DELETE', '/pendaftaran-kkn/:id', STUB_MESSAGE);

const scopes = [
  { method: 'GET', path: '/simawa/pendaftaran-kkn', scope: 'simawa:pendaftaran-kkn:list', description: 'Daftar pendaftaran KKN (dan PKL — port bug filter tipe di aplikasi asli)' },
  { method: 'GET', path: '/simawa/pendaftaran-kkn/create', scope: 'simawa:pendaftaran-kkn:create-form', description: 'Syarat & persyaratan pendaftaran KKN' },
  { method: 'POST', path: '/simawa/pendaftaran-kkn', scope: 'simawa:pendaftaran-kkn:store', description: 'Daftar KKN' },
  { method: 'GET', path: '/simawa/pendaftaran-kkn/:id', scope: 'simawa:pendaftaran-kkn:show', description: 'Stub kosong' },
  { method: 'GET', path: '/simawa/pendaftaran-kkn/:id/edit', scope: 'simawa:pendaftaran-kkn:edit-form', description: 'Stub kosong' },
  { method: 'PUT', path: '/simawa/pendaftaran-kkn/:id', scope: 'simawa:pendaftaran-kkn:update', description: 'Stub kosong' },
  { method: 'DELETE', path: '/simawa/pendaftaran-kkn/:id', scope: 'simawa:pendaftaran-kkn:destroy', description: 'Stub kosong' },
];

module.exports = { router, scopes };
