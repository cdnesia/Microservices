// Pengganti Laravel `Crypt::encrypt()`/`Crypt::decrypt()` (AES-256-CBC pakai APP_KEY) —
// dipakai SIMAWA asli untuk mengirim id internal (kegiatan mahasiswa, jadwal_id) ke
// client tanpa membocorkan primary key mentah, lalu didekripsi lagi saat submit. Di sini
// AES-256-GCM (authenticated, mendeteksi tampering) dengan key dari env var sendiri.
const crypto = require('crypto');

const SECRET = process.env.SIMAWA_CRYPT_SECRET;
if (!SECRET) {
  throw new Error('SIMAWA_CRYPT_SECRET env var wajib di-set');
}

const KEY = crypto.scryptSync(SECRET, 'simawa-crypto-id', 32);

function encryptId(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64url');
}

function decryptId(token) {
  const raw = Buffer.from(String(token), 'base64url');
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// Setara `rescue(fn() => Crypt::decrypt($id), null)` — dipakai KrsController::create()
// supaya id yang gagal didekripsi (data korup/format lama) tidak menjatuhkan seluruh
// request, cukup dibuang diam-diam dari daftar (port perilaku, bukan diperbaiki).
function tryDecryptId(token) {
  try {
    return decryptId(token);
  } catch {
    return null;
  }
}

module.exports = { encryptId, decryptId, tryDecryptId };
