const AppError = require('./AppError');

// RESTFULL-API-EXPRESSJS mengulang fungsi 8-baris ini persis sama di tiap controller —
// difaktorkan jadi satu helper di sini, dipakai semua route yang validasi body dengan zod.
function parseOrThrow(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new AppError(400, message);
  }
  return result.data;
}

module.exports = { parseOrThrow };
