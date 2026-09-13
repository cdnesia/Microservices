// Port dari app/Http/Controllers/AuthController.php (SIMAWA Laravel).
const { z } = require('zod');
const ApiResponse = require('../utils/ApiResponse');
const { parseOrThrow } = require('../utils/validate');
const studentToken = require('../utils/studentToken');
const tokenBlocklist = require('../utils/tokenBlocklist');
const authService = require('../services/auth.service');

const loginSchema = z
  .object({
    email: z.string().trim().min(1), // nama field literal "email" walau bisa diisi NPM — port apa adanya
    password: z.string().min(1),
    remember: z.boolean().optional(),
  })
  .strict();

async function login(req, res) {
  const data = parseOrThrow(loginSchema, req.body);
  const { user } = await authService.login(data);
  const token = studentToken.sign(user);
  ApiResponse.success(res, { data: { token, user }, message: 'Berhasil masuk.' });
}

// jti+exp dari token yang sedang dipakai (diisi requireStudent) diblokir di sini —
// setelah ini token yang sama akan ditolak requireStudent walau belum kedaluwarsa.
function invalidateSession(req, res) {
  tokenBlocklist.block(req.student.jti, req.student.exp);
  ApiResponse.success(res, { message: 'Berhasil keluar.' });
}

async function logout(req, res) {
  invalidateSession(req, res);
}

async function resetPassword(req, res) {
  // Port bug apa adanya: AuthController::resetPassword() Laravel isinya IDENTIK dengan
  // logout() — TIDAK benar-benar mereset password apa pun, tidak baca input sama sekali.
  invalidateSession(req, res);
}

module.exports = { login, logout, resetPassword };
