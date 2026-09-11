const { getPool } = require('../db/pools');
const AppError = require('../utils/AppError');

// Dosen (PA & Dekan) datanya ada di tabel pegawai (SIADE_OLD), bukan tabel
// tersendiri — pa_id/dekan_id di SIADE mengacu ke pegawai.id di sana.
async function getDosenById(id) {
  if (!id) return null;

  const pool = getPool('SIADE_OLD');
  const [rows] = await pool.query(
    'SELECT nama_lengkap AS namaLengkap, nidn FROM pegawai WHERE id = ? LIMIT 1',
    [id]
  );

  return rows[0] || null;
}

async function getStudent(npm) {
  const pool = getPool('SIADE');

  const [rows] = await pool.query(
    `SELECT
       m.nama_mahasiswa AS namaMahasiswa,
       m.npm,
       m.tahun_angkatan AS tahunAngkatan,
       m.pa_id AS paId,
       f.nama_fakultas_idn AS namaFakultas,
       f.dekan_id AS dekanId,
       ps.nama_program_studi_idn AS namaProgramStudi
     FROM master_mahasiswa m
     LEFT JOIN master_program_studi ps ON ps.kode_program_studi = m.kode_program_studi
     LEFT JOIN master_fakultas f ON f.id = ps.fakultas_id
     WHERE m.npm = ?
     LIMIT 1`,
    [npm]
  );

  if (rows.length === 0) {
    throw new AppError(404, 'Data mahasiswa tidak ditemukan.');
  }

  const mhs = rows[0];
  const [dosenPa, dosenDekan] = await Promise.all([getDosenById(mhs.paId), getDosenById(mhs.dekanId)]);

  return {
    namaMahasiswa: mhs.namaMahasiswa,
    npm: mhs.npm,
    tahunAngkatan: mhs.tahunAngkatan || '',
    namaFakultas: mhs.namaFakultas || '',
    namaProgramStudi: mhs.namaProgramStudi || '',
    namaDekan: dosenDekan?.namaLengkap || String(mhs.dekanId || ''),
    nidnDekan: dosenDekan?.nidn || String(mhs.dekanId || ''),
    nidnPa: dosenPa?.nidn || String(mhs.paId || ''),
    dosenPa: dosenPa?.namaLengkap || String(mhs.paId || ''),
  };
}

// KRS + nilai per mahasiswa, mata kuliahnya diprioritaskan dari jadwal
// (jadwal_id) lalu fallback ke mata_kuliah_id langsung di baris KRS.
async function queryKrs(pool, npm) {
  const [rows] = await pool.query(
    `SELECT
       k.kode_tahun_akademik AS kodeTahunAkademik,
       k.nilai_angka AS nilaiAngka,
       k.nilai_huruf AS nilaiHuruf,
       k.nilai_bobot AS nilaiBobot,
       COALESCE(mkJadwal.kode_mata_kuliah, mkDirect.kode_mata_kuliah, '') AS kodeMataKuliah,
       COALESCE(mkJadwal.nama_mata_kuliah_idn, mkDirect.nama_mata_kuliah_idn, '') AS namaMataKuliah,
       COALESCE(mkJadwal.sks_mata_kuliah, mkDirect.sks_mata_kuliah, 0) AS sksMataKuliah
     FROM tbl_mahasiswa_krs k
     LEFT JOIN tbl_jadwal_perkuliahan j ON j.id = k.jadwal_id
     LEFT JOIN master_kurikulum_matakuliah mkJadwal ON mkJadwal.id = j.mata_kuliah_id
     LEFT JOIN master_kurikulum_matakuliah mkDirect ON mkDirect.id = k.mata_kuliah_id
     WHERE k.npm = ?
     ORDER BY k.kode_tahun_akademik`,
    [npm]
  );

  return rows;
}

// Total SKS + total mutu (bobot x sks) dari sekumpulan baris KRS, dipakai
// untuk menghitung IPS (satu semester) maupun IPK (semua semester).
function mapKrsItems(items) {
  let totalSks = 0;
  let totalBobot = 0;

  const mapped = items.map((item) => {
    const sks = Number(item.sksMataKuliah) || 0;
    const bobot = Number(item.nilaiBobot) || 0;
    totalSks += sks;
    totalBobot += bobot * sks;

    return {
      sksMataKuliah: sks,
      kodeMataKuliah: item.kodeMataKuliah,
      namaMataKuliah: item.namaMataKuliah,
      nilaiAngka: Number(item.nilaiAngka) || 0,
      nilaiHuruf: item.nilaiHuruf || '',
    };
  });

  return { items: mapped, totalSks, totalBobot };
}

function indeksPrestasi({ totalSks, totalBobot }) {
  return totalSks > 0 ? (totalBobot / totalSks).toFixed(2) : '0.00';
}

// KHS satu periode: daftar mata kuliah + nilai semester itu, plus IPS-nya
// dan IPK (dihitung dari seluruh semester mahasiswa).
async function getKhs(npm, periode) {
  const pool = getPool('SIADE');

  const [mhsRows] = await pool.query('SELECT id FROM master_mahasiswa WHERE npm = ? LIMIT 1', [npm]);

  if (mhsRows.length === 0) {
    throw new AppError(404, 'Data mahasiswa tidak ditemukan.');
  }

  const items = await queryKrs(pool, npm);
  const ipk = indeksPrestasi(mapKrsItems(items));

  const entries = items.filter((item) => item.kodeTahunAkademik === periode);
  const mapped = mapKrsItems(entries);

  return {
    krs: mapped.items,
    metadata: { ips: indeksPrestasi(mapped), ipk },
  };
}

module.exports = { getStudent, getKhs };
