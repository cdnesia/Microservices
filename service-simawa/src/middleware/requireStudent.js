const ApiResponse = require('../utils/ApiResponse');
const studentToken = require('../utils/studentToken');
const tokenBlocklist = require('../utils/tokenBlocklist');

// Lapis auth KEDUA — identitas MAHASISWA, terpisah dari X-Client-Id (identitas
// APLIKASI/client gateway, dicek sekali di src/index.js sebelum router domain manapun
// dipasang). Lihat komentar lengkap di src/utils/studentToken.js untuk kenapa dua lapis
// ini dipisah (client gateway vs mahasiswa yang sedang login).
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
