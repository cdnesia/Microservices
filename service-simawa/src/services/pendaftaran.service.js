// Helper bersama untuk controller pendaftaran KKN/PKL/Seminar Proposal/Sidang Tugas
// Akhir — rumus SKS & nilai-D dari KRS mahasiswa, port dari controller-controller
// Laravel yang isinya nyaris identik (PendaftaranKKN/PKL/Seminar/SidangController).
const akademik = require('./akademik.service');

async function ringkasanKrsUntukPendaftaran(npm, tahunAktif, { kecualikanTipeUntukNilaiD = [] } = {}) {
  const krsData = await akademik.krs(npm);
  const semuaKrs = Object.entries(krsData)
    .filter(([ta]) => ta !== String(tahunAktif))
    .flatMap(([, item]) => item.krs);

  const untukNilaiD = kecualikanTipeUntukNilaiD.length
    ? semuaKrs.filter((item) => !kecualikanTipeUntukNilaiD.includes(Number(item.tipe_mata_kuliah)))
    : semuaKrs;

  const totalSks = semuaKrs.reduce((sum, item) => sum + Number(item.sks_matakuliah || 0), 0);
  const jumlahD = untukNilaiD.filter((item) => item.nilai_huruf === 'D').length;
  const jumlahE = untukNilaiD.filter((item) => item.nilai_huruf === 'E').length;
  const jumlahKosong = untukNilaiD.filter((item) => !item.nilai_huruf).length;

  return { totalSks, jumlahD, jumlahE, jumlahKosong, krsData };
}

async function sudahKontrakTipe(npm, tipeMataKuliah) {
  const krsData = await akademik.krs(npm);
  const semuaKrs = Object.values(krsData).flatMap((item) => item.krs);
  return semuaKrs.some((item) => Number(item.tipe_mata_kuliah) === tipeMataKuliah);
}

module.exports = { ringkasanKrsUntukPendaftaran, sudahKontrakTipe };
