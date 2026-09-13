// Helper kecil dipakai bareng oleh khs.controller.js & krs.controller.js saat
// render PDF (khs-print.ejs / krs-print.ejs).
const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '../assets/favicon-32x32.png');

function getLogoDataUri() {
  try {
    const buffer = fs.readFileSync(LOGO_PATH);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

function tahunAkademikLabel(periode) {
  const tahun = Number(String(periode).slice(0, 4));
  const sem = Number(String(periode).slice(-1));
  return `${tahun}/${tahun + 1} ${sem % 2 === 0 ? 'Genap' : 'Ganjil'}`;
}

function fakultasFontSize(nama) {
  const len = (nama || '').length;
  if (len <= 25) return '24px';
  if (len <= 40) return '22px';
  if (len <= 50) return '20px';
  return '22px';
}

function tanggalHariIni() {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());
}

module.exports = { getLogoDataUri, tahunAkademikLabel, fakultasFontSize, tanggalHariIni };
