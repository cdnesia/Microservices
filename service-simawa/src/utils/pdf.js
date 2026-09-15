const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer');

let browserPromise = null;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      // user-data-dir eksplisit — di beberapa environment (proses jalan
      // sebagai root lewat container tanpa HOME yang jelas) Chrome gagal
      // menentukan direktori data sendiri, bikin argumen --database yang
      // dikirim ke chrome_crashpad_handler jadi kosong dan crash saat start.
      userDataDir: path.join(os.tmpdir(), 'puppeteer-simawa-data'),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-crash-reporter',
      ],
    });
  }
  return browserPromise;
}

async function renderHtmlToPdf(html, pdfOptions = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBytes = await page.pdf({
      // F4/Folio (215mm x 330mm) — A4 terlalu kecil untuk cetak KHS/KRS.
      width: '215mm',
      height: '330mm',
      printBackground: true,
      margin: { top: '1cm', bottom: '1cm', left: '1.5cm', right: '1.5cm' },
      ...pdfOptions,
    });
    // puppeteer@23+ balikin Uint8Array biasa, BUKAN Buffer — Express `res.send()` cuma
    // kirim binary mentah kalau `Buffer.isBuffer()` true, kalau tidak dia jatuh ke
    // `res.json()` dan menyerialisasi tiap byte jadi key JSON ({"0":37,"1":80,...}),
    // menghasilkan file "PDF" yang rusak walau header Content-Type sudah benar.
    return Buffer.from(pdfBytes);
  } finally {
    await page.close();
  }
}

async function closeBrowser() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}

module.exports = { renderHtmlToPdf, closeBrowser };
