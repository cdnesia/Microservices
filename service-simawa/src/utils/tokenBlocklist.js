// Blocklist token mahasiswa (X-Student-Token) berbasis file JSON — dipakai supaya
// logout() benar-benar menonaktifkan token walau skemanya JWT stateless (tanpa DB/Redis
// tambahan). Menyimpan { [jti]: expEpochSeconds } — entri dibuang otomatis begitu lewat
// waktu expired token itu sendiri, supaya file tidak tumbuh tanpa batas.
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', '..', 'data', 'blocklist.json');

function ensureFile() {
  const dir = path.dirname(FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, '{}');
  }
}

function readAll() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeAll(data) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(data));
}

// Buang entri yang token aslinya sudah lewat expired — blocklist cuma perlu menyimpan
// entri sampai sebatas itu (setelah expired, token toh sudah ditolak studentToken.verify
// sendiri, jadi tidak perlu diblokir lagi).
function prune(data) {
  const now = Math.floor(Date.now() / 1000);
  let changed = false;
  for (const jti of Object.keys(data)) {
    if (data[jti] <= now) {
      delete data[jti];
      changed = true;
    }
  }
  return changed;
}

function block(jti, exp) {
  if (!jti || !exp) return;
  const data = readAll();
  data[jti] = exp;
  prune(data);
  writeAll(data);
}

function isBlocked(jti) {
  if (!jti) return false;
  const data = readAll();
  if (prune(data)) writeAll(data);
  return Object.prototype.hasOwnProperty.call(data, jti);
}

module.exports = { block, isBlocked };
