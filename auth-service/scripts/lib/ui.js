// Helper output terminal kecil, dipisah dari manage-client.js supaya file itu isinya
// prompts + logic, bukan string formatting. Sengaja tidak pakai boxen/string-width (seperti
// referensi di RESTFULL-API-EXPRESSJS) — cukup border '=' lebar tetap, jadi tidak perlu
// hitung ulang lebar terminal dan tidak menambah dependency untuk itu.
const chalk = require('chalk');

const BORDER = '='.repeat(60);

function banner(title) {
  console.log(`\n${chalk.cyan(BORDER)}\n${chalk.bold.cyanBright(title)}\n${chalk.cyan(BORDER)}`);
}

function section(title) {
  console.log('\n' + chalk.bold.whiteBright(title));
}

function kv(label, value) {
  console.log(`  ${chalk.dim(String(label).padEnd(14))} ${chalk.white(value)}`);
}

function scopeText(scopes) {
  if (!scopes || scopes.length === 0) return chalk.dim.italic('(tidak ada akses)');
  return scopes.map((s) => chalk.cyan(s)).join(chalk.dim(', '));
}

function success(text) {
  console.log(chalk.green(`✔ ${text}`));
}

function warn(text) {
  console.log(chalk.yellow(`⚠ ${text}`));
}

function error(text) {
  console.log(chalk.red(`✘ ${text}`));
}

// rows: [{ label, value, emphasize?, raw? }]. `emphasize` dipakai khusus untuk
// client_secret supaya menonjol dari clientId/scopes di box yang sama. `raw` melewati
// bungkus chalk.white default — dipakai kalau value sudah di-style (mis. dari scopeText()).
function credentialsBox(rows) {
  console.log('\n' + chalk.yellow(BORDER));
  console.log(chalk.red.bold('  SIMPAN SEKARANG — tidak akan ditampilkan lagi setelah ini'));
  console.log(chalk.yellow(BORDER));
  rows.forEach(({ label, value, emphasize, raw }) => {
    const valuePart = emphasize ? chalk.bold.yellowBright(value) : raw ? value : chalk.white(value);
    console.log(`  ${chalk.dim(String(label).padEnd(14))} ${valuePart}`);
  });
  console.log(chalk.yellow(BORDER) + '\n');
}

module.exports = { banner, section, kv, scopeText, success, warn, error, credentialsBox };
