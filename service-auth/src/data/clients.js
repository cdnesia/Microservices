const pool = require('../db/pool');

// allowed_scopes disimpan sebagai TEXT comma-separated (bukan array/JSON native) — MariaDB
// tidak punya tipe array seperti Postgres, dan JSON di MariaDB cuma alias LONGTEXT dengan
// CHECK constraint (server tidak melaporkan tipe kolom JSON asli lewat protokol, jadi driver
// tidak bisa auto-parse baliknya) — comma-separated TEXT lebih simpel & predictable untuk
// dipakai bolak-balik di sini.
function parseScopes(value) {
  return value ? value.split(',').filter(Boolean) : [];
}

function stringifyScopes(scopes) {
  return (scopes || []).join(',');
}

async function findClientById(clientId) {
  const [rows] = await pool.query(
    `SELECT
       client_id          AS clientId,
       client_secret_hash AS clientSecretHash,
       name,
       allowed_scopes      AS allowedScopes,
       status,
       rate_limit_tier     AS rateLimitTier
     FROM clients
     WHERE client_id = ?`,
    [clientId]
  );
  if (!rows[0]) return null;
  return { ...rows[0], allowedScopes: parseScopes(rows[0].allowedScopes) };
}

// Fungsi-fungsi di bawah ini dipakai oleh CLI admin (scripts/manage-client.js), bukan oleh
// jalur request publik — makanya tidak menyaring secret hash out (findClientById di atas
// yang dipakai routes/token.js & routes/verify.js tetap terpisah).

async function listClients() {
  const [rows] = await pool.query(
    `SELECT
       client_id       AS clientId,
       name,
       allowed_scopes  AS allowedScopes,
       status,
       rate_limit_tier AS rateLimitTier,
       created_at      AS createdAt,
       rotated_at      AS rotatedAt
     FROM clients
     ORDER BY created_at DESC`
  );
  return rows.map((row) => ({ ...row, allowedScopes: parseScopes(row.allowedScopes) }));
}

async function createClient({ clientId, clientSecretHash, name, allowedScopes }) {
  await pool.query(
    `INSERT INTO clients (client_id, client_secret_hash, name, allowed_scopes)
     VALUES (?, ?, ?, ?)`,
    [clientId, clientSecretHash, name, stringifyScopes(allowedScopes)]
  );
  return { clientId, name, allowedScopes: allowedScopes || [], status: 'active' };
}

// Invalidates the old secret immediately — client harus pakai secret baru untuk login lagi.
// Access/refresh token yang sudah terbit tidak kepengaruh sampai expired sendiri.
async function regenerateSecret(clientId, clientSecretHash) {
  const [result] = await pool.query(
    `UPDATE clients SET client_secret_hash = ?, rotated_at = NOW() WHERE client_id = ?`,
    [clientSecretHash, clientId]
  );
  return result.affectedRows > 0 ? { clientId } : null;
}

async function updateScopes(clientId, allowedScopes) {
  const [result] = await pool.query(`UPDATE clients SET allowed_scopes = ? WHERE client_id = ?`, [
    stringifyScopes(allowedScopes),
    clientId,
  ]);
  return result.affectedRows > 0 ? { clientId, allowedScopes } : null;
}

async function setStatus(clientId, status) {
  const [result] = await pool.query(`UPDATE clients SET status = ? WHERE client_id = ?`, [
    status,
    clientId,
  ]);
  return result.affectedRows > 0 ? { clientId, status } : null;
}

// Permanen — refresh_tokens milik client ini ikut terhapus lewat ON DELETE CASCADE
// (lihat mariadb/db/init.sql, fk_refresh_tokens_client).
async function deleteClient(clientId) {
  const [result] = await pool.query(`DELETE FROM clients WHERE client_id = ?`, [clientId]);
  return result.affectedRows > 0;
}

async function listScopes() {
  const [rows] = await pool.query(
    `SELECT scope_name AS scopeName, service_name AS serviceName, description
     FROM scopes
     ORDER BY service_name, scope_name`
  );
  return rows;
}

module.exports = {
  findClientById,
  listClients,
  createClient,
  regenerateSecret,
  updateScopes,
  setStatus,
  deleteClient,
  listScopes,
};
