// Port dari app/Http/Controllers/EdomController.php (SIMAWA Laravel).
const { z } = require('zod');
const ApiResponse = require('../utils/ApiResponse');
const { parseOrThrow } = require('../utils/validate');
const akademik = require('../services/akademik.service');
const edomService = require('../services/edom.service');

const viewQuerySchema = z
  .object({
    npm: z.string().min(1), // dead field di aplikasi asli (cuma dicek "ada", tidak dipakai memfilter) — port apa adanya
    periode: z.string().min(1),
    id_dosen: z.coerce.number(),
    id_matakuliah: z.coerce.number(),
  })
  .passthrough();

async function view(req, res) {
  const { periode, id_dosen: idDosenQuery, id_matakuliah: idMatakuliah } = parseOrThrow(viewQuerySchema, req.query);
  const npm = req.student.npm;

  const matakuliah = await edomService.findMatakuliahForEdom({ npm, periode, idMatakuliah, idDosen: idDosenQuery });
  const idDosen = matakuliah.dosenId;
  const dosen = await akademik.findPegawaiById(idDosen);
  const daftarSoal = await edomService.getDaftarSoal();

  ApiResponse.success(res, {
    data: { matakuliah, dosen, daftar_soal: daftarSoal, id_dosen: idDosen },
    message: 'Berhasil mengambil form EDOM.',
  });
}

const simpanSchema = z
  .object({
    id_mhsw_krs: z.union([z.string(), z.number()]),
    nim: z.string().min(1),
    tahunid: z.string().min(1),
    idmk: z.union([z.string(), z.number()]),
    dosenid: z.union([z.string(), z.number()]),
    jawaban: z.array(
      z.object({
        idListsoal: z.union([z.string(), z.number()]),
        tipeSoal: z.string(),
        jawaban: z.string().optional(),
        jawabanEsay: z.string().optional(),
      })
    ),
  })
  .strict();

async function simpan(req, res) {
  // Port apa adanya: TIDAK ADA validasi cross-check jawaban terhadap daftar soal asli
  // di server (sama seperti simpan_edome() Laravel) — hanya validasi tipe dasar (zod).
  const data = parseOrThrow(simpanSchema, req.body);
  try {
    await edomService.simpanJawaban({
      idMhswKrs: data.id_mhsw_krs,
      nim: data.nim,
      tahunid: data.tahunid,
      idmk: data.idmk,
      dosenid: data.dosenid,
      jawabanList: data.jawaban,
    });
    ApiResponse.success(res, { message: 'Jawaban EDOM berhasil disimpan' });
  } catch (err) {
    ApiResponse.error(res, { statusCode: 500, message: 'Terjadi kesalahan saat menyimpan jawaban...' });
  }
}

module.exports = { view, simpan };
