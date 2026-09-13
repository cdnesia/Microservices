const express = require('express');
const requireStudent = require('../middleware/requireStudent');
const asyncHandler = require('../middleware/asyncHandler');
const controller = require('../controllers/auth.controller');

const router = express.Router();

router.post('/auth/login', asyncHandler(controller.login));
router.post('/auth/logout', requireStudent, asyncHandler(controller.logout));
router.post('/auth/reset-password', requireStudent, asyncHandler(controller.resetPassword));

const scopes = [
  { method: 'POST', path: '/simawa/auth/login', scope: 'simawa:auth:login', description: 'Login mahasiswa (custom, dengan fallback NPM==password untuk first-login)' },
  { method: 'POST', path: '/simawa/auth/logout', scope: 'simawa:auth:logout', description: 'Logout mahasiswa' },
  { method: 'POST', path: '/simawa/auth/reset-password', scope: 'simawa:auth:reset-password', description: 'Reset password (port bug: tidak benar-benar reset, sama seperti logout)' },
];

module.exports = { router, scopes };
