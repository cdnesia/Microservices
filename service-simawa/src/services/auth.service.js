// Port dari app/Http/Controllers/AuthController.php (SIMAWA Laravel) — login custom
// (BUKAN Keycloak SSO, yang di app asli cuma disiapkan di config tapi tidak pernah
// diimplementasikan, lihat CLAUDE.md/hasil investigasi). Alur & pesan error dipertahankan
// PERSIS termasuk fallback NPM==password untuk first-login (auto-provisioning) — ini
// trade-off keamanan yang SUDAH ADA & disengaja di aplikasi asli, bukan sesuatu yang
// diperbaiki di sini (keputusan eksplisit: "pertahankan persis").
const bcrypt = require('bcryptjs');
const { getPool } = require('../db/pools');
const AppError = require('../utils/AppError');

const GENERIC_LOGIN_ERROR = 'NPM dan Password tidak terdaftar.';

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '') || 'user';
}

async function findLocalUserByIdentifier(identifier) {
  const pool = getPool('SIMAWA');
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE email = ? OR npm = ? LIMIT 1',
    [identifier, identifier]
  );
  return rows[0] || null;
}

async function findMahasiswaByNpmPassword(identifier, plainPassword) {
  // Fallback NPM==password: identifier (dikirim di field `email`) HARUS sama dengan
  // NPM di master_mahasiswa, DAN password yang diketik HARUS SAMA PERSIS dengan NPM
  // itu juga — port literal dari AuthController.php:44-47.
  const pool = getPool('SIADE');
  const [rows] = await pool.query(
    'SELECT npm, nama_mahasiswa, email FROM master_mahasiswa WHERE npm = ? AND npm = ? LIMIT 1',
    [identifier, plainPassword]
  );
  return rows[0] || null;
}

async function emailExists(email) {
  const pool = getPool('SIMAWA');
  const [rows] = await pool.query('SELECT 1 FROM users WHERE email = ? LIMIT 1', [email]);
  return rows.length > 0;
}

function buildFallbackEmail(mhs, alreadyTaken) {
  const localPart = slugify(mhs.nama_mahasiswa || mhs.npm || 'user');
  // Port literal domain quirk Laravel: `@local.test` normal, `@local` (BEDA, bukan typo
  // yang diperbaiki) kalau tabrakan — lihat AuthController.php:58,61.
  return alreadyTaken ? `${localPart}+${mhs.npm || Math.random().toString(36).slice(2, 6)}@local` : `${localPart}@local.test`;
}

async function provisionUserFromMahasiswa(mhs) {
  let email = mhs.email;
  if (!email || !String(email).trim()) {
    email = buildFallbackEmail(mhs, false);
    if (await emailExists(email)) {
      email = buildFallbackEmail(mhs, true);
    }
  }

  const hashed = bcrypt.hashSync(mhs.npm || 'password', 10);
  const pool = getPool('SIMAWA');
  const [result] = await pool.execute(
    'INSERT INTO users (npm, name, email, password, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
    [mhs.npm, mhs.nama_mahasiswa, email, hashed]
  );

  return { id: result.insertId, npm: mhs.npm, name: mhs.nama_mahasiswa, email };
}

// Return { user } kalau sukses. Melempar AppError(401, GENERIC_LOGIN_ERROR) kalau gagal —
// pesan SAMA PERSIS untuk kedua skenario gagal (user lokal ada tapi password salah, ATAU
// fallback NPM tidak ketemu), port literal dari app asli.
async function login({ email: identifier, password: plainPassword }) {
  const localUser = await findLocalUserByIdentifier(identifier);

  if (localUser) {
    const cocok = bcrypt.compareSync(plainPassword, localUser.password);
    if (!cocok) {
      throw new AppError(401, GENERIC_LOGIN_ERROR);
    }
    return { user: { npm: localUser.npm, name: localUser.name, email: localUser.email } };
  }

  const mhs = await findMahasiswaByNpmPassword(identifier, plainPassword);
  if (!mhs) {
    throw new AppError(401, GENERIC_LOGIN_ERROR);
  }

  const user = await provisionUserFromMahasiswa(mhs);
  return { user: { npm: user.npm, name: user.name, email: user.email } };
}

module.exports = { login };
