const crypto = require('crypto');
const pool = require('../db/pool');

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

// Refresh token adalah random string beentropy tinggi (bukan password), jadi hash
// cepat (SHA-256) sudah cukup — tidak perlu bcrypt yang sengaja lambat.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseScopes(value) {
  return value ? value.split(',').filter(Boolean) : [];
}

async function createRefreshToken(clientId, scopes) {
  const token = crypto.randomBytes(48).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  // id di-generate di sini (bukan DEFAULT di kolom) — MariaDB tidak punya fungsi UUID
  // default yang portable lintas versi seperti gen_random_uuid() Postgres.
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO refresh_tokens (id, client_id, token_hash, scopes, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, clientId, tokenHash, scopes.join(','), expiresAt]
  );

  return { token, expiresAt };
}

async function findValidRefreshToken(token) {
  const tokenHash = hashToken(token);
  const [rows] = await pool.query(
    `SELECT id, client_id AS clientId, scopes, expires_at AS expiresAt
     FROM refresh_tokens
     WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()`,
    [tokenHash]
  );
  if (!rows[0]) return null;
  return { ...rows[0], scopes: parseScopes(rows[0].scopes) };
}

async function revokeRefreshTokenById(id) {
  await pool.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [id]);
}

async function revokeRefreshTokenByValue(token) {
  const tokenHash = hashToken(token);
  const [result] = await pool.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL',
    [tokenHash]
  );
  return result.affectedRows > 0;
}

module.exports = {
  REFRESH_TOKEN_TTL_MS,
  createRefreshToken,
  findValidRefreshToken,
  revokeRefreshTokenById,
  revokeRefreshTokenByValue,
};
