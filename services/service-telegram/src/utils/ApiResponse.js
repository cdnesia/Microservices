// Single envelope shape for every response di service ini — success dan error sama-sama
// selalu bawa persis { success, message, data }, jadi client tidak perlu cabang tergantung
// endpoint mana yang dipanggil. Diadopsi dari RESTFULL-API-EXPRESSJS/src/utils/ApiResponse.js.
function success(res, { data = null, message = 'Berhasil', statusCode = 200 } = {}) {
  return res.status(statusCode).json({ success: true, message, data });
}

function error(res, { message = 'Terjadi kesalahan', statusCode = 500, data = null } = {}) {
  return res.status(statusCode).json({ success: false, message, data });
}

module.exports = { success, error };
