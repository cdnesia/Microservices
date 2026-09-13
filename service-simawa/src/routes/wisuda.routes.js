// Port dari Route::resource('wisuda', WisudaController::class) — 100% stub di aplikasi
// asli, sama seperti transkrip-nilai. Tidak perlu controller terpisah.
const express = require('express');
const { registerStub } = require('../utils/stub');

const router = express.Router();
const STUB_MESSAGE = 'Stub kosong — belum diimplementasikan di aplikasi asli.';

registerStub(router, 'GET', '/wisuda', STUB_MESSAGE);
registerStub(router, 'GET', '/wisuda/create', STUB_MESSAGE);
registerStub(router, 'POST', '/wisuda', STUB_MESSAGE);
registerStub(router, 'GET', '/wisuda/:id', STUB_MESSAGE);
registerStub(router, 'GET', '/wisuda/:id/edit', STUB_MESSAGE);
registerStub(router, 'PUT', '/wisuda/:id', STUB_MESSAGE);
registerStub(router, 'DELETE', '/wisuda/:id', STUB_MESSAGE);

const scopes = [
  { method: 'GET', path: '/simawa/wisuda', scope: 'simawa:wisuda:list', description: 'Wisuda (stub — belum diimplementasikan di aplikasi asli)' },
  { method: 'GET', path: '/simawa/wisuda/create', scope: 'simawa:wisuda:create-form', description: 'Stub kosong' },
  { method: 'POST', path: '/simawa/wisuda', scope: 'simawa:wisuda:store', description: 'Stub kosong' },
  { method: 'GET', path: '/simawa/wisuda/:id', scope: 'simawa:wisuda:show', description: 'Stub kosong' },
  { method: 'GET', path: '/simawa/wisuda/:id/edit', scope: 'simawa:wisuda:edit-form', description: 'Stub kosong' },
  { method: 'PUT', path: '/simawa/wisuda/:id', scope: 'simawa:wisuda:update', description: 'Stub kosong' },
  { method: 'DELETE', path: '/simawa/wisuda/:id', scope: 'simawa:wisuda:destroy', description: 'Stub kosong' },
];

module.exports = { router, scopes };
