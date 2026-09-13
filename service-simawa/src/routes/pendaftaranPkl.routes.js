const express = require('express');
const requireStudent = require('../middleware/requireStudent');
const asyncHandler = require('../middleware/asyncHandler');
const { registerStub } = require('../utils/stub');
const controller = require('../controllers/pendaftaranPkl.controller');

const router = express.Router();
const STUB_MESSAGE = 'Stub kosong — belum diimplementasikan di aplikasi asli.';

router.get('/pendaftaran-pkl', requireStudent, asyncHandler(controller.index));
router.get('/pendaftaran-pkl/create', requireStudent, asyncHandler(controller.create));
router.post('/pendaftaran-pkl', requireStudent, asyncHandler(controller.store));
registerStub(router, 'GET', '/pendaftaran-pkl/:id', STUB_MESSAGE);
registerStub(router, 'GET', '/pendaftaran-pkl/:id/edit', STUB_MESSAGE);
registerStub(router, 'PUT', '/pendaftaran-pkl/:id', STUB_MESSAGE);
registerStub(router, 'DELETE', '/pendaftaran-pkl/:id', STUB_MESSAGE);

const scopes = [
  { method: 'GET', path: '/simawa/pendaftaran-pkl', scope: 'simawa:pendaftaran-pkl:list', description: 'Daftar pendaftaran PKL' },
  { method: 'GET', path: '/simawa/pendaftaran-pkl/create', scope: 'simawa:pendaftaran-pkl:create-form', description: 'Syarat & persyaratan pendaftaran PKL' },
  { method: 'POST', path: '/simawa/pendaftaran-pkl', scope: 'simawa:pendaftaran-pkl:store', description: 'Daftar PKL' },
  { method: 'GET', path: '/simawa/pendaftaran-pkl/:id', scope: 'simawa:pendaftaran-pkl:show', description: 'Stub kosong' },
  { method: 'GET', path: '/simawa/pendaftaran-pkl/:id/edit', scope: 'simawa:pendaftaran-pkl:edit-form', description: 'Stub kosong' },
  { method: 'PUT', path: '/simawa/pendaftaran-pkl/:id', scope: 'simawa:pendaftaran-pkl:update', description: 'Stub kosong' },
  { method: 'DELETE', path: '/simawa/pendaftaran-pkl/:id', scope: 'simawa:pendaftaran-pkl:destroy', description: 'Stub kosong' },
];

module.exports = { router, scopes };
