// Skema zod yang dipakai lebih dari satu controller — skema yang cuma dipakai satu
// tempat tetap dikoleksi di controller-nya sendiri.
const { z } = require('zod');
const { PERIODE_REGEX } = require('./constants');

const periodeQuerySchema = z.object({ periode: z.string().regex(PERIODE_REGEX).optional() }).passthrough();

// Dipakai POST /pendaftaran-kkn|pkl|seminar-proposal|sidang-tugas-akhir — body cuma
// berisi id kegiatan mahasiswa (versi terenkripsi, hasil encrypted_id dari endpoint create).
const pendaftaranStoreSchema = z.object({ id: z.string().min(1) }).strict();

module.exports = { periodeQuerySchema, pendaftaranStoreSchema };
