// Bungkus handler async supaya rejection-nya otomatis diteruskan ke next(err) —
// Express 4 tidak menangkap promise rejection dari handler async secara otomatis.
function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
