// Port dari Route::resource('transkrip-nilai', TranskripNilaiController::class) — 100%
// stub di aplikasi asli (semua 7 method dideklarasikan tapi isinya kosong `//`, tidak
// ada logic bisnis untuk diekstrak). Tidak perlu controller terpisah.
const express = require('express');
const { registerStub } = require('../utils/stub');

const router = express.Router();
const STUB_MESSAGE = 'Stub kosong — belum diimplementasikan di aplikasi asli.';

registerStub(router, 'GET', '/transkrip-nilai', STUB_MESSAGE);
registerStub(router, 'GET', '/transkrip-nilai/create', STUB_MESSAGE);
registerStub(router, 'POST', '/transkrip-nilai', STUB_MESSAGE);
registerStub(router, 'GET', '/transkrip-nilai/:id', STUB_MESSAGE);
registerStub(router, 'GET', '/transkrip-nilai/:id/edit', STUB_MESSAGE);
registerStub(router, 'PUT', '/transkrip-nilai/:id', STUB_MESSAGE);
registerStub(router, 'DELETE', '/transkrip-nilai/:id', STUB_MESSAGE);

const scopes = [
  { method: 'GET', path: '/simawa/transkrip-nilai', scope: 'simawa:transkrip-nilai:list', description: 'Transkrip nilai (stub — belum diimplementasikan di aplikasi asli)' },
  { method: 'GET', path: '/simawa/transkrip-nilai/create', scope: 'simawa:transkrip-nilai:create-form', description: 'Stub kosong' },
  { method: 'POST', path: '/simawa/transkrip-nilai', scope: 'simawa:transkrip-nilai:store', description: 'Stub kosong' },
  { method: 'GET', path: '/simawa/transkrip-nilai/:id', scope: 'simawa:transkrip-nilai:show', description: 'Stub kosong' },
  { method: 'GET', path: '/simawa/transkrip-nilai/:id/edit', scope: 'simawa:transkrip-nilai:edit-form', description: 'Stub kosong' },
  { method: 'PUT', path: '/simawa/transkrip-nilai/:id', scope: 'simawa:transkrip-nilai:update', description: 'Stub kosong' },
  { method: 'DELETE', path: '/simawa/transkrip-nilai/:id', scope: 'simawa:transkrip-nilai:destroy', description: 'Stub kosong' },
];

module.exports = { router, scopes };
