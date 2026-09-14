// Token identitas MAHASISWA — satu-satunya lapis auth di service-simawa (beda dari 7 service
// bisnis lain yang punya lapis client_id/auth-scope Traefik di depannya; service ini diakses
// langsung React SPA publik, lihat catatan di src/index.js). Token ini memastikan MAHASISWA
// mana yang sedang login (setara sesi `Auth::login($user)` di Laravel, tapi service ini API
// JSON stateless jadi dipakai JWT sendiri, dikirim di header `X-Student-Token`).
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const SECRET = process.env.STUDENT_JWT_SECRET;
if (!SECRET) {
  throw new Error('STUDENT_JWT_SECRET env var wajib di-set');
}

// Mendekati SESSION_LIFETIME Laravel (120 menit) di .env asli SIMAWA.
const TTL_SECONDS = Number(process.env.STUDENT_JWT_TTL_SECONDS) || 2 * 60 * 60;

function sign(user) {
  // jti unik per token — dipakai tokenBlocklist.js supaya logout() bisa menonaktifkan
  // token spesifik ini saja (bukan semua token milik mahasiswa yang sama).
  return jwt.sign({ npm: user.npm, name: user.name, email: user.email, jti: crypto.randomUUID() }, SECRET, {
    expiresIn: TTL_SECONDS,
  });
}

function verify(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { sign, verify };
