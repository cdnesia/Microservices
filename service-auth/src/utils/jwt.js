const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET env var wajib di-set');
}

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 menit

function signToken(clientId, scopes) {
  return jwt.sign({ scopes }, JWT_SECRET, {
    subject: clientId,
    issuer: 'service-auth',
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, { issuer: 'service-auth' });
}

module.exports = { signToken, verifyToken, ACCESS_TOKEN_TTL_SECONDS };
