const ApiResponse = require('../utils/ApiResponse');
const studentToken = require('../utils/studentToken');
const tokenBlocklist = require('../utils/tokenBlocklist');

// Satu-satunya lapis auth di service ini — identitas MAHASISWA (X-Student-Token). Berbeda
// dari 7 service bisnis lain, service-simawa TIDAK punya lapis client_id/auth-scope di
// depannya (lihat src/index.js) karena konsumennya React SPA publik, bukan client_credentials
// server-to-server. Lihat komentar lengkap di src/utils/studentToken.js.
function requireStudent(req, res, next) {
  const token = req.headers['x-student-token'];
  if (!token) {
    return ApiResponse.error(res, { message: 'Header X-Student-Token wajib diisi.', statusCode: 401 });
  }
  try {
    const decoded = studentToken.verify(token);
    if (tokenBlocklist.isBlocked(decoded.jti)) {
      return ApiResponse.error(res, { message: 'X-Student-Token sudah tidak berlaku (sudah logout).', statusCode: 401 });
    }
    req.student = decoded;
    next();
  } catch (err) {
    ApiResponse.error(res, { message: 'X-Student-Token tidak valid atau kedaluwarsa.', statusCode: 401 });
  }
}

module.exports = requireStudent;
