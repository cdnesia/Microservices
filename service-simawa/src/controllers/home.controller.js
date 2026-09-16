// Port dari app/Http/Controllers/HomeController.php (SIMAWA Laravel).
const ApiResponse = require('../utils/ApiResponse');
const akademik = require('../services/akademik.service');
const tagihanService = require('../services/tagihan.service');
const beasiswaService = require('../services/beasiswa.service');

async function beranda(req, res) {
  const npm = req.student.npm;
  const krsData = await akademik.krs(npm);

  // Laravel asli (HomeController::index()) menghitung $ipk[] di loop yang sama tapi TIDAK
  // PERNAH menaruhnya ke $d['ipk'] (cuma $d['labels']/$d['ips'] yang dikirim ke view) — dead
  // code, bukan disengaja. Di sini SENGAJA disertakan (menyimpang dari "port apa adanya")
  // atas permintaan eksplisit: FE butuh grafik IPK per semester di halaman Beranda.
  const labels = [];
  const ips = [];
  const ipk = [];
  Object.values(krsData).forEach((item) => {
    labels.push(`Semester ${item.semester}`);
    ips.push(item.metadata.ips);
    ipk.push(item.metadata.ipk);
  });

  const mhs = await akademik.getMahasiswaAktifOrThrow(npm);
  const tahunAktif = await akademik.tahunAkademikAktif(mhs.kode_program_studi);
  const cekBeasiswa = await akademik.cekBeasiswa(npm, tahunAktif);
  // Nama beasiswa (bukan cuma flag boolean cekBeasiswa di atas, yang dipertahankan apa
  // adanya untuk gerbang tagihan) — cuma di-query kalau memang penerima, atas permintaan
  // eksplisit halaman Beranda menampilkan nama beasiswanya.
  const namaBeasiswa = cekBeasiswa ? await beasiswaService.findNamaBeasiswaAktif(npm, tahunAktif) : null;

  // Setara PaymentService::cekTagihanSekarang() + generateTagihanSekarang() — kalau
  // tagihan SPP periode aktif belum ada, coba generate (best-effort, kegagalan
  // diabaikan diam-diam — port dari HomeController.php:48 yang mentolerir HTTP 404).
  const cekTagihanSekarang = tahunAktif
    ? await tagihanService.cekTagihan({ npm: [npm], tahunAkademik: [tahunAktif], jenisTagihan: 'SPP' })
    : [];
  if (cekTagihanSekarang.length === 0 && tahunAktif) {
    await tagihanService.createTagihanSpp({ npm, tahunAkademik: tahunAktif }).catch(() => null);
  }
  // Setara PaymentService::ambilTagihan() — SEMUA tagihan lintas periode, selalu
  // diambil ulang di sini terlepas dari cabang di atas (port apa adanya).
  const ambilTagihan = await tagihanService.cekTagihan({ npm: [npm] });

  const data = { labels, ips, ipk, beasiswa: cekBeasiswa, nama_beasiswa: namaBeasiswa };
  if (!cekBeasiswa) {
    data.tagihan_sekarang = ambilTagihan;
  }
  ApiResponse.success(res, { data, message: 'Berhasil mengambil data beranda.' });
}

async function generateVa() {
  // Port bug apa adanya: routes/web.php Laravel mengarah ke HomeController::generateVA()
  // yang TIDAK PERNAH dideklarasikan di controller — mengakses route ini di aplikasi asli
  // selalu fatal error. Direplikasi dengan memanggil fungsi yang sengaja tidak ada.
  // eslint-disable-next-line no-undef
  generateVA();
}

module.exports = { beranda, generateVa };
