// Sebagian besar disalin dari service-tagihan/src/services/tagihan.service.js (tabel
// `tagihan` di database PAYMENT yang SAMA — lihat CLAUDE.md "Service bisnis baru": ini
// database eksternal kampus, bukan mariadb gateway). Di Laravel (SIMAWA asli), operasi ini
// dilakukan lewat panggilan HTTP ke gateway (ApiService -> api/v1/tagihan/*); di sini
// dilakukan langsung terhadap tabel yang sama untuk menghindari service-to-service call
// (lihat catatan self-contained di mahasiswa.service.js). `updateTagihan` tidak di-port
// karena tidak ada satu pun alur SIMAWA yang memanggilnya.
const crypto = require('crypto');
const { getPool } = require('../db/pools');
const AppError = require('../utils/AppError');
const mahasiswaService = require('./mahasiswa.service');
const bipotService = require('./bipot.service');

function generateNomorTagihan(tahunAkademik, vaCode) {
  const kodeDepan = tahunAkademik.slice(-3);
  const ekor = String(vaCode).replace(/\D/g, '').padStart(6, '0');
  return `${kodeDepan}${ekor}`;
}

async function generateIdRecordTagihan(pool) {
  while (true) {
    const now = new Date();
    const year = now.getFullYear();
    const hhmmss = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map((n) => String(n).padStart(2, '0'))
      .join('');
    const random5 = crypto.randomInt(0, 100000).toString().padStart(5, '0');
    const candidate = `${year}-${hhmmss}${random5}`;

    const [rows] = await pool.query('SELECT 1 FROM tagihan WHERE id_record_tagihan = ? LIMIT 1', [candidate]);

    if (rows.length === 0) {
      return candidate;
    }
  }
}

function sumNominal(items) {
  return (items || []).reduce((sum, item) => sum + Number(item.nominal), 0);
}

function toSnakeCaseDetail(items) {
  return (items || []).map(({ idBipot, namaBipot, nominal }) => ({
    id_bipot: idBipot,
    nama_bipot: namaBipot,
    nominal,
  }));
}

async function assertNotDuplicate(pool, { npm, tahunAkademik, jenisTagihan }) {
  const [rows] = await pool.query(
    `SELECT id FROM tagihan
     WHERE npm = ? AND tahun_akademik = ? AND jenis_tagihan = ? AND deleted_at IS NULL
     LIMIT 1`,
    [npm, tahunAkademik, jenisTagihan]
  );

  if (rows.length > 0) {
    throw new AppError(
      409,
      `Tagihan untuk npm "${npm}", tahun akademik "${tahunAkademik}", jenis "${jenisTagihan}" sudah ada`
    );
  }
}

async function createTagihan(data) {
  const pool = getPool('PAYMENT');

  const mahasiswa = await mahasiswaService.findByNpm(data.npm);
  const jenisTagihan = data.jenisTagihan;

  await assertNotDuplicate(pool, { npm: mahasiswa.npm, tahunAkademik: data.tahunAkademik, jenisTagihan });

  const idRecordTagihan = await generateIdRecordTagihan(pool);
  const nomorTagihan = generateNomorTagihan(data.tahunAkademik, mahasiswa.vaCode);

  const totalTagihan = sumNominal(data.detailTagihan);
  const totalPotongan = sumNominal(data.detailPotongan);
  const nominalDitagih = totalTagihan - totalPotongan;

  if (nominalDitagih < 0) {
    throw new AppError(400, 'Total potongan tidak boleh lebih besar dari total tagihan');
  }

  const [result] = await pool.execute(
    `INSERT INTO tagihan (
      id_record_tagihan, nomor_tagihan, npm, nama_mahasiswa, nama_fakultas,
      kode_program_studi, nama_program_studi, id_kelas_perkuliahan, nama_kelas_perkuliahan,
      tahun_akademik, waktu_berakhir, detail_tagihan, total_tagihan,
      detail_potongan, total_potongan, nominal_ditagih, nominal_terbayar,
      jenis_tagihan, status_aktif
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      idRecordTagihan,
      nomorTagihan,
      mahasiswa.npm,
      mahasiswa.namaMahasiswa,
      mahasiswa.namaFakultas,
      mahasiswa.kodeProgramStudi,
      mahasiswa.namaProgramStudi,
      mahasiswa.idKelasPerkuliahan,
      mahasiswa.namaKelasPerkuliahan || null,
      data.tahunAkademik,
      new Date(data.waktuBerakhir),
      JSON.stringify(toSnakeCaseDetail(data.detailTagihan)),
      totalTagihan.toFixed(2),
      data.detailPotongan ? JSON.stringify(toSnakeCaseDetail(data.detailPotongan)) : null,
      totalPotongan.toFixed(2),
      nominalDitagih.toFixed(2),
      '0.00',
      jenisTagihan,
      'Y',
    ]
  );

  const [rows] = await pool.query('SELECT * FROM tagihan WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function findExistingSpp(pool, npm, tahunAkademik) {
  const [rows] = await pool.query(
    `SELECT * FROM tagihan
     WHERE npm = ? AND tahun_akademik = ? AND jenis_tagihan = 'SPP' AND deleted_at IS NULL
     LIMIT 1`,
    [npm, tahunAkademik]
  );

  return rows[0] || null;
}

// Setara PaymentService::generateTagihanSekarang() (Laravel) — idempoten: kalau tagihan
// SPP untuk npm+tahunAkademik ini sudah ada, dikembalikan apa adanya (skipped).
async function createTagihanSpp({ npm, tahunAkademik }) {
  const pool = getPool('PAYMENT');
  const mahasiswa = await mahasiswaService.findByNpm(npm);

  const existing = await findExistingSpp(pool, mahasiswa.npm, tahunAkademik);
  if (existing) {
    return { skipped: true, tagihan: existing };
  }

  const { detailTagihan, detailPotongan } = await bipotService.getRincianBiayaMahasiswa({
    npm: mahasiswa.npm,
    tahunAkademik,
  });

  const waktuBerakhir = new Date();
  waktuBerakhir.setFullYear(waktuBerakhir.getFullYear() + 1);

  const tagihan = await createTagihan({
    npm: mahasiswa.npm,
    tahunAkademik,
    waktuBerakhir: waktuBerakhir.toISOString(),
    detailTagihan,
    detailPotongan: detailPotongan.length ? detailPotongan : undefined,
    jenisTagihan: 'SPP',
  });

  return { skipped: false, tagihan };
}

// Setara PaymentService::cekTagihanSekarang() / ambilTagihan() / cekKontrakMk() (Laravel) —
// satu fungsi query, filter opsional (tahunAkademik/jenisTagihan) dipakai berbeda-beda oleh
// pemanggil di akademik.service.js.
async function cekTagihan({ npm, tahunAkademik, jenisTagihan }) {
  const pool = getPool('PAYMENT');

  const conditions = ['npm IN (?)', 'deleted_at IS NULL'];
  const params = [npm];

  if (tahunAkademik) {
    conditions.push('tahun_akademik IN (?)');
    params.push(tahunAkademik);
  }

  if (jenisTagihan) {
    conditions.push('jenis_tagihan = ?');
    params.push(jenisTagihan);
  }

  const [rows] = await pool.query(
    `SELECT * FROM tagihan WHERE ${conditions.join(' AND ')} ORDER BY npm, jenis_tagihan`,
    params
  );

  return rows;
}

module.exports = { createTagihan, createTagihanSpp, cekTagihan };
