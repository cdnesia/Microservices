// Port dari app/Services/DataService.php (SIMAWA Laravel) — method paling banyak dipakai
// controller lain di sana. Tabel akademik ada di database SIADE (koneksi `db_siade` di
// Laravel), data pegawai/dosen & ruang ada di SIADE_OLD (koneksi `db_siade_old`) — SAMA
// PERSIS tabel yang dipakai service-pegawai/service-ruangan/service-jadwal di project ini,
// jadi di sini query LANGSUNG ke tabel itu (bukan panggil service lain lewat HTTP — lihat
// catatan "tidak ada mekanisme service-to-service call" di CLAUDE.md).
const { getPool } = require('../db/pools');
const { encryptId } = require('../utils/cryptoId');
const AppError = require('../utils/AppError');

// --- expandTerms / semester index -------------------------------------------------
// Formula identik dengan resolveSemester() di service-tagihan/service-bipot punya
// bipot.service.js (termIndex = tahun*2 + semester - 1) — dipakai di sini untuk
// menghasilkan deret kode tahun akademik (YYYYS, S=1|2) dari satu titik ke titik lain.
function termIndex(kodeTahun) {
  return Number(String(kodeTahun).slice(0, 4)) * 2 + Number(String(kodeTahun).slice(4, 5)) - 1;
}

function termFromIndex(idx) {
  const sem = idx % 2 === 0 ? 1 : 2;
  const year = sem === 1 ? idx / 2 : (idx - 1) / 2;
  return `${year}${sem}`;
}

function expandTerms(start, end) {
  const startIdx = termIndex(start);
  const endIdx = termIndex(end);
  const terms = [];
  for (let idx = startIdx; idx <= endIdx; idx++) {
    terms.push(termFromIndex(idx));
  }
  return terms;
}

// --- tahunAkademikAktif -------------------------------------------------------------
// Kolom tanggal (`tanggal_mulai`/`tanggal_selesai`) mengikuti pola yang sama dengan
// master_kalender_akademik (lihat kalenderExists di bawah) — nama kolom persis di
// master_tahun_akademik tidak ikut terbaca dalam ekstraksi spek, jadi ini asumsi
// berdasarkan konsistensi penamaan tabel master_* lain di skema yang sama.
async function tahunAkademikAktif(kodeProdi) {
  const pool = getPool('SIADE');
  const [rows] = await pool.query(
    `SELECT kode_tahun_akademik AS kodeTahunAkademik
     FROM master_tahun_akademik
     WHERE status = 'A'
       AND JSON_CONTAINS(kode_program_studi, JSON_QUOTE(?))
       AND CURDATE() BETWEEN tanggal_mulai AND tanggal_selesai
     ORDER BY id DESC
     LIMIT 1`,
    [String(kodeProdi)]
  );
  return rows[0] ? rows[0].kodeTahunAkademik : null;
}

// --- kalender akademik (jadwal kontrak KRS, KKN, PKL, Sempro, Sidang) --------------
async function kalenderExists(kolom, tahunAkademik) {
  const pool = getPool('SIADE');
  const [rows] = await pool.query(
    `SELECT 1 FROM master_kalender_akademik
     WHERE ${kolom} = 1 AND status = 'A' AND kode_tahun_akademik = ?
       AND CURDATE() BETWEEN tanggal_mulai AND tanggal_selesai
     LIMIT 1`,
    [tahunAkademik]
  );
  return rows.length > 0;
}

async function kalenderTanggalSelesai(kolom, tahunAkademik) {
  const pool = getPool('SIADE');
  const [rows] = await pool.query(
    `SELECT tanggal_selesai AS tanggalSelesai FROM master_kalender_akademik
     WHERE ${kolom} = 1 AND status = 'A' AND kode_tahun_akademik = ?
       AND CURDATE() BETWEEN tanggal_mulai AND tanggal_selesai
     LIMIT 1`,
    [tahunAkademik]
  );
  return rows[0] ? rows[0].tanggalSelesai : null;
}

const jadwalKontrakKrs = (tahunAkademik) => kalenderExists('keg_kontrak_krs', tahunAkademik);
const jadwalKKN = (tahunAkademik) => kalenderExists('keg_pendaftaran_kkn', tahunAkademik);
const jadwalPKL = (tahunAkademik) => kalenderExists('keg_pendaftaran_pkl', tahunAkademik);
const jadwalSempro = (tahunAkademik) => kalenderExists('keg_pendaftaran_seminar_proposal', tahunAkademik);
const jadwalSidang = (tahunAkademik) => kalenderExists('keg_pendaftaran_sidang_akhir', tahunAkademik);

const waktuBerakhirPkl = (tahunAkademik) => kalenderTanggalSelesai('keg_pendaftaran_pkl', tahunAkademik);
const waktuBerakhirSempro = (tahunAkademik) => kalenderTanggalSelesai('keg_pendaftaran_seminar_proposal', tahunAkademik);
const waktuBerakhirSidang = (tahunAkademik) => kalenderTanggalSelesai('keg_pendaftaran_sidang_akhir', tahunAkademik);

// --- dataDosen / dataRuang ---------------------------------------------------------
// Di Laravel diambil lewat HTTP (api/v1/pegawai/list, api/v1/ruangan/list) ke gateway
// ini sendiri. Di sini langsung ke tabel sumbernya (SIADE_OLD) — tabel & kolom SAMA
// PERSIS yang dipakai service-pegawai/service-ruangan/service-jadwal.
async function dataDosenMap(ids) {
  if (ids.length === 0) return new Map();
  const pool = getPool('SIADE_OLD');
  const [rows] = await pool.query('SELECT id, nama_lengkap AS namaLengkap, nidn FROM pegawai WHERE id IN (?)', [ids]);
  return new Map(rows.map((row) => [row.id, row]));
}

async function dataRuangMap(ids) {
  if (ids.length === 0) return new Map();
  const pool = getPool('SIADE_OLD');
  const [rows] = await pool.query('SELECT id, nama FROM ruang WHERE id IN (?)', [ids]);
  return new Map(rows.map((row) => [row.id, row]));
}

async function findPegawaiById(id) {
  if (!id) return null;
  const pool = getPool('SIADE_OLD');
  const [rows] = await pool.query('SELECT * FROM pegawai WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

// --- cekEdom -------------------------------------------------------------------------
async function cekEdomMap(npm) {
  // Ambil SEMUA row header EDOM milik npm ini sekaligus (bukan satu query per mata
  // kuliah seperti EdomController Laravel yang query per-request) — dikelompokkan di
  // JS jadi Set kombinasi "tahunid:idmk:dosenid" untuk lookup O(1) per baris KRS.
  const pool = getPool('SIADE');
  const [rows] = await pool.query(
    'SELECT tahunid, idmk, dosenid FROM tbl_jawaban_header_survey WHERE nim = ?',
    [npm]
  );
  return new Set(rows.map((r) => `${r.tahunid}:${r.idmk}:${r.dosenid}`));
}

// --- cekBeasiswa ---------------------------------------------------------------------
async function cekBeasiswa(npm, tahunAkademik) {
  const pool = getPool('SIADE');
  const [rows] = await pool.query(
    `SELECT 1 FROM tbl_penerima_beasiswa
     WHERE npm = ? AND JSON_CONTAINS(tahun_akademik, JSON_QUOTE(?)) LIMIT 1`,
    [npm, String(tahunAkademik)]
  );
  return rows.length > 0;
}

// --- getMahasiswaByNpm -----------------------------------------------------------
async function getMahasiswaByNpm(npm) {
  const pool = getPool('SIADE');
  const [rows] = await pool.query('SELECT * FROM master_mahasiswa WHERE npm = ? LIMIT 1', [npm]);
  return rows[0] || null;
}

// Setara `auth('web')->user()->mahasiswa` di Laravel (relasi User::mahasiswa(), 404 kalau
// data akademik mahasiswa belum ada) — dipakai luas oleh controller pendaftaran KKN/PKL/
// Seminar/Sidang/KRS/beranda untuk ambil kode_program_studi, program_kuliah_id, dst.
async function getMahasiswaAktifOrThrow(npm) {
  const mhs = await getMahasiswaByNpm(npm);
  if (!mhs) {
    throw new AppError(404, `Data akademik mahasiswa npm "${npm}" tidak ditemukan.`);
  }
  return mhs;
}

// --- dataProdi / dataKelas / saya ---------------------------------------------------
async function dataProdi(kodeProdi) {
  const pool = getPool('SIADE');
  const [rows] = await pool.query(
    `SELECT ps.kode_program_studi AS kodeProgramStudi, ps.nama_program_studi_idn AS namaProgramStudi,
            ps.fakultas_id AS idFakultas, f.nama_fakultas_idn AS namaFakultas, f.dekan_id AS dekanId
     FROM master_program_studi ps
     LEFT JOIN master_fakultas f ON f.id = ps.fakultas_id
     WHERE ps.kode_program_studi = ?
     LIMIT 1`,
    [kodeProdi]
  );
  return rows[0] || null;
}

async function dataKelas(id) {
  if (!id) return null;
  const pool = getPool('SIADE');
  const [rows] = await pool.query(
    'SELECT id, nama_program_perkuliahan AS namaKelas FROM master_kelas_perkuliahan WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

// Setara DataService::saya($npm) — profil lengkap mahasiswa dipakai luas (form
// pendaftaran KKN/PKL/dst, cetak KHS/KRS). Field `nidn_pa`/`dosen_pa` (PA di
// master_mahasiswa) masih best-effort di bawah (dibungkus try/catch supaya tidak
// menjatuhkan seluruh saya() kalau nama kolomnya ternyata beda di skema produksi asli).
// `nidn_dekan`/`nama_dekan` sudah dipastikan lewat `f.dekan_id` (master_fakultas, lihat
// dataProdi() di atas) — sempat bug hilang karena kolom itu tidak ikut di-SELECT.
async function saya(npm) {
  const mhs = await getMahasiswaByNpm(npm);
  if (!mhs) return null;

  const prodi = await dataProdi(mhs.kode_program_studi);
  const kelas = await dataKelas(mhs.program_kuliah_id);

  let dosenPa = null;
  let nidnPa = null;
  let idPa = mhs.id_pa ?? null;
  if (idPa) {
    try {
      const pegawai = await findPegawaiById(idPa);
      if (pegawai) {
        dosenPa = pegawai.nama_lengkap || null;
        nidnPa = pegawai.nidn || null;
      }
    } catch {
      // Kolom/lookup PA tidak tersedia — biarkan null, jangan jatuhkan saya().
    }
  }

  let namaDekan = null;
  let nidnDekan = null;
  try {
    if (prodi && prodi.dekanId) {
      const pegawai = await findPegawaiById(prodi.dekanId);
      if (pegawai) {
        namaDekan = pegawai.nama_lengkap || null;
        nidnDekan = pegawai.nidn || null;
      }
    }
  } catch {
    // idem — belum terverifikasi terhadap skema asli, degradasi ke null.
  }

  return {
    nama_mahasiswa: mhs.nama_mahasiswa,
    npm: mhs.npm,
    va_code: mhs.va_code,
    tahun_angkatan: mhs.tahun_angkatan,
    kode_program_studi: mhs.kode_program_studi,
    nama_program_studi: prodi ? prodi.namaProgramStudi : null,
    id_fakultas: prodi ? prodi.idFakultas : null,
    nama_fakultas: prodi ? prodi.namaFakultas : null,
    nidn_dekan: nidnDekan,
    nama_dekan: namaDekan,
    id_kelas: kelas ? kelas.id : mhs.program_kuliah_id,
    nama_kelas: kelas ? kelas.namaKelas : null,
    id_pa: idPa,
    dosen_pa: dosenPa,
    nidn_pa: nidnPa,
    isi_biodata: null,
  };
}

// --- krs($npm) -------------------------------------------------------------------
// Method paling kompleks — port dari DataService::krs(). Satu query JOIN (bukan
// Eloquent eager-load N+1) untuk ambil seluruh baris KRS + jadwal + mata kuliah +
// hari, lalu di-enrich dosen/ruang dari SIADE_OLD, dikelompokkan per tahun akademik
// mulai dari tahun_angkatan mahasiswa sampai tahun akademik aktif sekarang.
async function krs(npm) {
  const pool = getPool('SIADE');

  const mhs = await getMahasiswaByNpm(npm);
  if (!mhs) return {};

  const [rows] = await pool.query(
    `SELECT
       k.id AS krsId, k.npm, k.jadwal_id AS jadwalId, k.mata_kuliah_id AS mataKuliahLangsungId,
       k.kode_tahun_akademik AS kodeTahunAkademik, k.nilai_angka AS nilaiAngka,
       k.nilai_huruf AS nilaiHuruf, k.nilai_bobot AS nilaiBobot,
       k.persetujuan_pa AS persetujuanPa, k.lulus,
       j.dosen_id AS dosenId, j.ruang_id AS ruangId, j.jam_mulai AS jamMulai,
       j.jam_selesai AS jamSelesai, j.kelompok, j.mata_kuliah_id AS jadwalMataKuliahId,
       h.nama_hari AS namaHari,
       mkj.id AS mkjId, mkj.kode_mata_kuliah AS mkjKode, mkj.nama_mata_kuliah_idn AS mkjNama,
       mkj.sks_mata_kuliah AS mkjSks, mkj.mata_kuliah_tipe AS mkjTipe,
       mkl.id AS mklId, mkl.kode_mata_kuliah AS mklKode, mkl.nama_mata_kuliah_idn AS mklNama,
       mkl.sks_mata_kuliah AS mklSks, mkl.mata_kuliah_tipe AS mklTipe
     FROM tbl_mahasiswa_krs k
     LEFT JOIN tbl_jadwal_perkuliahan j ON j.id = k.jadwal_id
     LEFT JOIN master_hari h ON h.id = j.hari_id
     LEFT JOIN master_kurikulum_matakuliah mkj ON mkj.id = j.mata_kuliah_id
     LEFT JOIN master_kurikulum_matakuliah mkl ON mkl.id = k.mata_kuliah_id
     WHERE k.npm = ?`,
    [npm]
  );

  const dosenIds = [...new Set(rows.map((r) => r.dosenId).filter(Boolean))];
  const ruangIds = [...new Set(rows.map((r) => r.ruangId).filter(Boolean))];
  const [dosenMap, ruangMap, edomSet] = await Promise.all([
    dataDosenMap(dosenIds),
    dataRuangMap(ruangIds),
    cekEdomMap(npm),
  ]);

  // getMataKuliahAttribute(): jadwal_id == 0 -> mata kuliah "langsung" (mkl), selain
  // itu -> mata kuliah lewat jadwal (mkj).
  const mapped = rows.map((r) => {
    const langsung = Number(r.jadwalId) === 0;
    const mk = langsung
      ? { id: r.mklId, kode: r.mklKode, nama: r.mklNama, sks: r.mklSks, tipe: r.mklTipe }
      : { id: r.mkjId, kode: r.mkjKode, nama: r.mkjNama, sks: r.mkjSks, tipe: r.mkjTipe };

    const dosen = dosenMap.get(r.dosenId);
    const ruang = ruangMap.get(r.ruangId);
    const idMatakuliah = mk.id;
    const cekEdom = edomSet.has(`${r.kodeTahunAkademik}:${idMatakuliah}:${r.dosenId}`) ? 1 : 0;

    return {
      krsId: r.krsId,
      // encrypted_id/jadwal_id SENGAJA dikirim terenkripsi (bukan angka mentah) — port
      // literal DataService::krs() Laravel, yang mengirim keduanya lewat Crypt::encrypt()
      // karena struktur ini dipakai ulang oleh KrsController::destroy() (menerima balik
      // jadwal_id terenkripsi ini sebagai parameter route) dan KrsController::create()
      // (daftar "existing" jadwal yang sudah dikontrak).
      encrypted_id: encryptId(String(r.krsId)),
      jadwal_id: encryptId(String(r.jadwalId)),
      kode_tahun_akademik: r.kodeTahunAkademik,
      nilai_angka: r.nilaiAngka,
      nilai_huruf: r.nilaiHuruf ?? '',
      nilai_bobot: r.nilaiBobot,
      persetujuan_pa: r.persetujuanPa,
      lulus: r.lulus,
      edome: null, // lihat catatan di header file: kolom sumber field ini tidak terverifikasi
      kode_mata_kuliah: mk.kode || '',
      id_matakuliah: idMatakuliah,
      nama_mata_kuliah: mk.nama || '',
      tipe_mata_kuliah: mk.tipe,
      sks_matakuliah: mk.sks || 0,
      jam_mulai: r.jamMulai,
      jam_selesai: r.jamSelesai,
      dosen_id: dosen ? dosen.namaLengkap : null,
      id_dosen: r.dosenId,
      ruang_id: ruang ? ruang.nama : null,
      kelompok: r.kelompok,
      hari: r.namaHari || '',
      cek_edom: cekEdom,
    };
  });

  // Urutkan: kode_tahun_akademik ASC, lalu nama_hari DESC (port literal dari
  // usort Laravel `fn($b,$a) => $a['kode_tahun_akademik'] <=> $b['kode_tahun_akademik']`
  // lalu tie-break nama_hari terbalik — lihat DataService.php:68).
  mapped.sort((a, b) => {
    if (a.kode_tahun_akademik !== b.kode_tahun_akademik) {
      return String(a.kode_tahun_akademik).localeCompare(String(b.kode_tahun_akademik));
    }
    return String(b.hari).localeCompare(String(a.hari));
  });

  const tahunAktif = await tahunAkademikAktif(mhs.kode_program_studi);
  const terms = expandTerms(mhs.tahun_angkatan, tahunAktif || mhs.tahun_angkatan);

  const result = {};
  let kumulatifSks = 0;
  let kumulatifBobot = 0;

  terms.forEach((ta, index) => {
    const krsTahunIni = mapped.filter((item) => String(item.kode_tahun_akademik) === String(ta));
    const jumlahSks = krsTahunIni.reduce((sum, item) => sum + Number(item.sks_matakuliah || 0), 0);
    const totalBobot = krsTahunIni.reduce(
      (sum, item) => sum + Number(item.nilai_bobot || 0) * Number(item.sks_matakuliah || 0),
      0
    );

    kumulatifSks += jumlahSks;
    kumulatifBobot += totalBobot;

    result[ta] = {
      semester: index + 1,
      tahun_akademik: ta,
      jumlah_sks: jumlahSks,
      total_bobot: totalBobot,
      krs: krsTahunIni,
      metadata: {
        ips: jumlahSks > 0 ? Math.round((totalBobot / jumlahSks) * 100) / 100 : 0,
        ipk: kumulatifSks > 0 ? Math.round((kumulatifBobot / kumulatifSks) * 100) / 100 : 0,
      },
    };
  });

  return result;
}

// --- jadwalKuliah -----------------------------------------------------------------
// Setara DataService::jadwalKuliah() — jadwal yang TERSEDIA untuk dikontrak (bukan
// yang sudah dikontrak mahasiswa, itu dari krs()) — dipakai KrsController::create().
async function jadwalKuliah(kodeProdi, kelasPerkuliahanId, tahunAkademik) {
  const pool = getPool('SIADE');
  const [rows] = await pool.query(
    `SELECT
       j.id, j.tahun_akademik AS tahunAkademik, j.kode_program_studi AS kodeProgramStudi,
       j.program_kuliah_id AS programKuliahId, j.kelompok, j.jam_mulai AS jamMulai,
       j.jam_selesai AS jamSelesai, j.ruang_id AS ruangId, j.dosen_id AS dosenId,
       h.nama_hari AS namaHari,
       mk.id AS mataKuliahId, mk.kode_mata_kuliah AS kodeMataKuliah,
       mk.nama_mata_kuliah_idn AS namaMataKuliah, mk.sks_mata_kuliah AS sksMataKuliah
     FROM tbl_jadwal_perkuliahan j
     LEFT JOIN master_hari h ON h.id = j.hari_id
     LEFT JOIN master_kurikulum_matakuliah mk ON mk.id = j.mata_kuliah_id
     WHERE j.tahun_akademik = ? AND j.kode_program_studi = ? AND j.program_kuliah_id = ?
       AND j.status = 'A'
     ORDER BY h.id, j.jam_mulai`,
    [tahunAkademik, kodeProdi, kelasPerkuliahanId]
  );

  const dosenIds = [...new Set(rows.map((r) => r.dosenId).filter(Boolean))];
  const ruangIds = [...new Set(rows.map((r) => r.ruangId).filter(Boolean))];
  const [dosenMap, ruangMap] = await Promise.all([dataDosenMap(dosenIds), dataRuangMap(ruangIds)]);

  return rows.map((r) => ({
    id: r.id,
    tahunAkademik: r.tahunAkademik,
    kelompok: r.kelompok,
    jamMulai: r.jamMulai,
    jamSelesai: r.jamSelesai,
    hari: r.namaHari || '',
    ruang: ruangMap.get(r.ruangId) || null,
    dosen: dosenMap.get(r.dosenId) || null,
    mataKuliah: {
      id: r.mataKuliahId,
      kode: r.kodeMataKuliah || '',
      nama: r.namaMataKuliah || '',
      sks: r.sksMataKuliah || 0,
    },
  }));
}

module.exports = {
  expandTerms,
  tahunAkademikAktif,
  jadwalKontrakKrs,
  jadwalKKN,
  jadwalPKL,
  jadwalSempro,
  jadwalSidang,
  waktuBerakhirPkl,
  waktuBerakhirSempro,
  waktuBerakhirSidang,
  cekBeasiswa,
  saya,
  krs,
  jadwalKuliah,
  getMahasiswaByNpm,
  getMahasiswaAktifOrThrow,
  findPegawaiById,
};
