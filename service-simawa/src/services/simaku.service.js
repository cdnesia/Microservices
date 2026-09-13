// Port dari RiwayatPembayaranController::index() + PaymentService::generateTagihanKKN()/
// cekTagihanKKN() (SIMAKU Laravel) — HMAC-SHA256 manual, BUKAN lewat OAuth gateway.
//
// CATATAN PENTING (port bug apa adanya, bukan diperbaiki — lihat instruksi porting):
// di aplikasi Laravel asli, `config('services.simaku_url')`, `hmac_secret`, `hmac_api_key`
// TIDAK PERNAH didefinisikan di config/services.php maupun .env manapun — jadi endpoint
// ini SECARA FAKTUAL TIDAK PERNAH BISA JALAN di SIMAWA sekarang (bukan gap infrastruktur,
// tapi kode yang tidak pernah selesai di-wire). Di service ini perilakunya direplikasi:
// SIMAKU_URL/SIMAKU_HMAC_SECRET/SIMAKU_HMAC_API_KEY sengaja TIDAK diisi di .env.example
// (lihat file itu) — kalau endpoint yang memakai modul ini dipanggil tanpa env var itu
// diisi manual, akan gagal (error koneksi/URL tidak valid), SAMA seperti app asli.
const crypto = require('crypto');
const AppError = require('../utils/AppError');

function sign(path, body) {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  const data = `${timestamp}${nonce}POST${path}${body}`;
  const secret = process.env.SIMAKU_HMAC_SECRET || '';
  const signature = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return { timestamp, nonce, signature };
}

async function callSimaku(path, payload) {
  const baseUrl = process.env.SIMAKU_URL || '';
  const body = JSON.stringify(payload);
  const { timestamp, nonce, signature } = sign(path, body);

  // Port literal: `$url . $path` tanpa separator — kalau SIMAKU_URL tidak diakhiri "/"
  // (atau kosong seperti default), hasil URL bisa salah gabung — sama seperti source asli.
  const url = baseUrl + path;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.SIMAKU_HMAC_API_KEY || '',
        'X-TIMESTAMP': String(timestamp),
        'X-NONCE': nonce,
        'X-SIGNATURE': signature,
      },
      body,
    });
  } catch (err) {
    throw new AppError(502, `Gagal menghubungi SIMAKU: ${err.message}`);
  }

  const json = await response.json().catch(() => null);
  return json;
}

async function riwayatPembayaran(npm) {
  const result = await callSimaku('api/riwayat-pembayaran', { npm });
  return result && result.data ? result.data : [];
}

async function generateTagihanKKN({ npm, tahunAkademik, kegiatanMahasiswaId }) {
  return callSimaku('api/generate-tagihan-kkn', {
    npm,
    tahun_akademik: tahunAkademik,
    kegiatan_mahasiswa_id: kegiatanMahasiswaId,
  });
}

async function cekTagihanKKN({ npm, tahunAkademik }) {
  return callSimaku('api/cek-tagihan-kkn', { npm, tahun_akademik: tahunAkademik });
}

module.exports = { riwayatPembayaran, generateTagihanKKN, cekTagihanKKN };
