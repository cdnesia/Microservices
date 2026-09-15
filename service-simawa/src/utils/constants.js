// Format periode/kode tahun akademik SIADE: YYYYS (S = 1 ganjil, 2 genap), mis. "20241".
const PERIODE_REGEX = /^\d{5}$/;

// tipe_mata_kuliah: 1=KKN, 2=PKL/Kerja Praktek, 3=Skripsi/Tugas Akhir, 4=Seminar Proposal.
// Keempatnya dikecualikan dari hitungan nilai D/E/kosong syarat pendaftaran kegiatan
// mahasiswa (KKN/PKL/Seminar Proposal/Sidang Tugas Akhir) — dipakai bersama oleh semua
// controller pendaftaranKkn/pendaftaranPkl/pendaftaranSeminar/pendaftaranSidang supaya
// daftarnya tidak drift antar file.
const TIPE_MATA_KULIAH_DIKECUALIKAN_NILAI_D = [1, 2, 3, 4];

module.exports = { PERIODE_REGEX, TIPE_MATA_KULIAH_DIKECUALIKAN_NILAI_D };
