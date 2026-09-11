const { getPool } = require('../db/pools');

// Jadwal + matakuliah + prodi + hari sama-sama di SIADE, jadi bisa satu
// query JOIN. Dosen (pegawai) dan ruang ada di SIADE_OLD (database
// terpisah), jadi diambil lewat batch query sendiri lalu digabung di sini.
async function queryJadwal(pool, tahunAkademik) {
  const [rows] = await pool.query(
    `SELECT
       j.id,
       j.tahun_akademik AS tahunAkademik,
       j.kode_program_studi AS kodeProgramStudi,
       ps.nama_program_studi_idn AS namaProgramStudi,
       kp.nama_program_perkuliahan AS namaKelasPerkuliahan,
       h.nama_hari AS namaHari,
       j.jam_mulai AS jamMulai,
       j.jam_selesai AS jamSelesai,
       j.kelompok,
       j.ruang_id AS ruangId,
       j.dosen_id AS dosenId,
       mk.kode_mata_kuliah AS kodeMataKuliah,
       mk.nama_mata_kuliah_idn AS namaMataKuliah,
       mk.sks_mata_kuliah AS sksMataKuliah
     FROM tbl_jadwal_perkuliahan j
     LEFT JOIN master_program_studi ps ON ps.kode_program_studi = j.kode_program_studi
     LEFT JOIN master_kelas_perkuliahan kp ON kp.id = j.program_kuliah_id
     LEFT JOIN master_hari h ON h.id = j.hari_id
     LEFT JOIN master_kurikulum_matakuliah mk ON mk.id = j.mata_kuliah_id
     WHERE j.tahun_akademik = ? AND j.status = 'A'
     ORDER BY j.hari_id, j.jam_mulai`,
    [tahunAkademik]
  );

  return rows;
}

async function queryDosenMap(ids) {
  if (ids.length === 0) return new Map();

  const pool = getPool('SIADE_OLD');
  const [rows] = await pool.query(
    'SELECT id, nama_lengkap AS namaLengkap, nidn FROM pegawai WHERE id IN (?)',
    [ids]
  );

  return new Map(rows.map((row) => [row.id, { namaLengkap: row.namaLengkap, nidn: row.nidn }]));
}

async function queryRuangMap(ids) {
  if (ids.length === 0) return new Map();

  const pool = getPool('SIADE_OLD');
  const [rows] = await pool.query('SELECT id, nama FROM ruang WHERE id IN (?)', [ids]);

  return new Map(rows.map((row) => [row.id, { nama: row.nama }]));
}

// Mahasiswa + nilai per jadwal, diambil satu batch untuk seluruh jadwal
// sekaligus lalu dikelompokkan per jadwal_id di JS — jauh lebih murah
// daripada satu query per jadwal.
async function queryMahasiswaByJadwal(pool, jadwalIds) {
  const map = new Map();
  if (jadwalIds.length === 0) return map;

  const [rows] = await pool.query(
    `SELECT
       k.jadwal_id AS jadwalId,
       k.npm,
       m.nama_mahasiswa AS namaMahasiswa,
       k.nilai_angka AS nilaiAngka,
       k.nilai_huruf AS nilaiHuruf,
       k.nilai_bobot AS nilaiBobot,
       k.nilai_sikap AS nilaiSikap,
       k.nilai_kuis AS nilaiKuis,
       k.nilai_uts AS nilaiUts,
       k.nilai_ku AS nilaiKu,
       k.nilai_kh AS nilaiKh,
       k.nilai_uas AS nilaiUas,
       k.lulus
     FROM tbl_mahasiswa_krs k
     JOIN master_mahasiswa m ON m.npm = k.npm
     WHERE k.jadwal_id IN (?)
     ORDER BY m.nama_mahasiswa`,
    [jadwalIds]
  );

  for (const row of rows) {
    const { jadwalId, ...mahasiswa } = row;
    if (!map.has(jadwalId)) map.set(jadwalId, []);
    map.get(jadwalId).push(mahasiswa);
  }

  return map;
}

async function findByTahunAkademik(tahunAkademik) {
  const pool = getPool('SIADE');
  const jadwal = await queryJadwal(pool, tahunAkademik);

  const dosenIds = [...new Set(jadwal.map((row) => row.dosenId).filter(Boolean))];
  const ruangIds = [...new Set(jadwal.map((row) => row.ruangId).filter(Boolean))];
  const jadwalIds = jadwal.map((row) => row.id);

  const [dosenMap, ruangMap, mahasiswaMap] = await Promise.all([
    queryDosenMap(dosenIds),
    queryRuangMap(ruangIds),
    queryMahasiswaByJadwal(pool, jadwalIds),
  ]);

  return jadwal.map((row) => ({
    id: row.id,
    tahunAkademik: row.tahunAkademik,
    kodeProgramStudi: row.kodeProgramStudi,
    namaProgramStudi: row.namaProgramStudi || '',
    namaKelasPerkuliahan: row.namaKelasPerkuliahan || '',
    kelompok: row.kelompok,
    hari: { nama: row.namaHari || '' },
    jamMulai: row.jamMulai,
    jamSelesai: row.jamSelesai,
    ruang: ruangMap.get(row.ruangId) || null,
    dosen: dosenMap.get(row.dosenId) || null,
    mataKuliah: {
      kode: row.kodeMataKuliah || '',
      nama: row.namaMataKuliah || '',
      sks: row.sksMataKuliah || 0,
    },
    mahasiswa: mahasiswaMap.get(row.id) || [],
  }));
}

module.exports = { findByTahunAkademik };
