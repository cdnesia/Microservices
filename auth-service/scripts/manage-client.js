// CLI interaktif tunggal untuk semua hal terkait client: daftarkan client baru, atau kelola
// client yang sudah ada (generate ulang secret, ubah allowed_scopes, suspend/aktifkan) —
// satu entry point (`npm run manage-client`) alih-alih script terpisah per aksi.
//
// Pilihan scope diambil dari tabel `scopes` (diisi otomatis oleh scopeRegistry.discoverScopes()
// dari manifest /scopes tiap service — lihat src/scopeRegistry.js), bukan daftar hardcoded,
// supaya tetap konsisten dengan prinsip "route->scope tidak ditulis manual dua kali" di project
// ini.
const { input, checkbox, confirm, select, search } = require('@inquirer/prompts');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../src/db/pool');
const clientsData = require('../src/data/clients');
const ui = require('./lib/ui');

const SALT_ROUNDS = 10; // sama dengan cost factor hash seed di db/init.sql ($2a$10$...)

function generateClientSecret() {
  return crypto.randomBytes(32).toString('hex');
}

async function scopeChoices(currentScopes = []) {
  const scopes = await clientsData.listScopes();
  if (scopes.length === 0) {
    ui.warn(
      'Belum ada scope yang ter-discover. Pastikan service lain sudah expose GET /scopes dan ' +
        'auth-service sudah sempat fetch (lihat src/scopeRegistry.js).'
    );
  }
  return scopes.map((s) => ({
    name: `${s.scopeName}  (${s.serviceName})`,
    value: s.scopeName,
    checked: currentScopes.includes(s.scopeName),
  }));
}

async function createClient() {
  ui.section('Client baru');

  const name = await input({
    message: 'Nama client (nama aplikasi/partner):',
    validate: (value) => {
      const trimmed = value.trim();
      if (trimmed.length < 2 || trimmed.length > 100) {
        return 'Nama harus 2-100 karakter.';
      }
      return true;
    },
  });

  const clientId = await input({
    message: 'client_id (slug unik, huruf kecil/angka/tanda "-"):',
    // Random murni (bukan slug dari nama) supaya client_id tidak gampang ditebak dari nama
    // aplikasi/partner — operator tetap bisa timpa manual kalau mau id yang lebih rapi, ini
    // cuma default yang disarankan.
    default: crypto.randomBytes(6).toString('hex'),
    validate: async (value) => {
      const trimmed = value.trim();
      if (!/^[a-z0-9-]{3,50}$/.test(trimmed)) {
        return 'Hanya huruf kecil, angka, dan tanda "-", 3-50 karakter.';
      }
      const existing = await clientsData.findClientById(trimmed);
      if (existing) {
        return 'client_id sudah dipakai, pilih yang lain.';
      }
      return true;
    },
  });

  const scopes = await checkbox({
    message: 'Pilih allowed_scopes (spasi untuk pilih, enter untuk lanjut):',
    choices: await scopeChoices(),
  });

  ui.section('Ringkasan');
  ui.kv('client_id', clientId.trim());
  ui.kv('Nama', name.trim());
  ui.kv('Scopes', ui.scopeText(scopes));
  console.log();

  const proceed = await confirm({ message: 'Daftarkan client ini?', default: false });
  if (!proceed) {
    ui.warn('Dibatalkan.');
    return;
  }

  const clientSecret = generateClientSecret();
  const clientSecretHash = await bcrypt.hash(clientSecret, SALT_ROUNDS);

  await clientsData.createClient({
    clientId: clientId.trim(),
    clientSecretHash,
    name: name.trim(),
    allowedScopes: scopes,
  });

  ui.success('Client berhasil didaftarkan.');
  ui.credentialsBox([
    { label: 'client_id', value: clientId.trim() },
    { label: 'client_secret', value: clientSecret, emphasize: true },
    { label: 'Scopes', value: ui.scopeText(scopes), raw: true },
  ]);
}

async function pickClient() {
  const all = await clientsData.listClients();
  if (all.length === 0) {
    ui.warn('Belum ada client terdaftar.');
    return null;
  }

  const clientId = await search({
    message: 'Cari client (nama atau client_id):',
    source: (term) => {
      const filtered = !term
        ? all
        : all.filter(
            (c) =>
              c.name.toLowerCase().includes(term.toLowerCase()) ||
              c.clientId.toLowerCase().includes(term.toLowerCase())
          );

      if (filtered.length === 0) {
        return [{ name: '(tidak ada client cocok)', value: null, disabled: true }];
      }

      return filtered.map((c) => ({
        name: `${c.name}  [${c.clientId}]  (${c.status})  scopes: ${
          c.allowedScopes.length ? c.allowedScopes.join(', ') : '(tidak ada)'
        }`,
        value: c.clientId,
      }));
    },
  });

  return all.find((c) => c.clientId === clientId) || null;
}

async function manageClient() {
  const client = await pickClient();
  if (!client) return;

  ui.section('Client dipilih');
  ui.kv('client_id', client.clientId);
  ui.kv('Nama', client.name);
  ui.kv('Status', client.status);
  ui.kv('Scopes', ui.scopeText(client.allowedScopes));

  const statusAction = client.status === 'active' ? 'Suspend client' : 'Aktifkan kembali client';

  const actions = await checkbox({
    message: 'Apa yang mau diubah? (spasi untuk centang, enter untuk lanjut)',
    validate: (choices) =>
      choices.length > 0 || 'Pilih minimal satu: tekan spasi di salah satu opsi, baru enter.',
    choices: [
      { name: 'Generate ulang client_secret', value: 'secret' },
      { name: 'Ubah allowed_scopes', value: 'scope' },
      { name: statusAction, value: 'status' },
    ],
  });

  if (actions.includes('secret')) {
    const proceed = await confirm({
      message: 'Yakin generate ulang secret? Secret lama langsung tidak berlaku.',
      default: false,
    });

    if (proceed) {
      const clientSecret = generateClientSecret();
      const clientSecretHash = await bcrypt.hash(clientSecret, SALT_ROUNDS);
      await clientsData.regenerateSecret(client.clientId, clientSecretHash);
      ui.credentialsBox([
        { label: 'client_id', value: client.clientId },
        { label: 'client_secret', value: clientSecret, emphasize: true },
      ]);
    } else {
      ui.warn('Lewati generate ulang secret.');
    }
  }

  if (actions.includes('scope')) {
    const scopes = await checkbox({
      message: 'Pilih allowed_scopes baru:',
      choices: await scopeChoices(client.allowedScopes),
    });

    ui.section('Scope baru');
    ui.kv('Scopes', ui.scopeText(scopes));
    console.log();

    const proceed = await confirm({ message: 'Simpan scope ini?', default: true });

    if (proceed) {
      await clientsData.updateScopes(client.clientId, scopes);
      ui.success('Scope berhasil diperbarui.');
    } else {
      ui.warn('Lewati perubahan scope.');
    }
  }

  if (actions.includes('status')) {
    const nextStatus = client.status === 'active' ? 'suspended' : 'active';
    const proceed = await confirm({
      message: `Yakin ubah status jadi "${nextStatus}"?`,
      default: false,
    });

    if (proceed) {
      await clientsData.setStatus(client.clientId, nextStatus);
      ui.success(`Status client diubah jadi "${nextStatus}".`);
    } else {
      ui.warn('Lewati perubahan status.');
    }
  }

  console.log();
  ui.success('Selesai.');
}

async function main() {
  ui.banner('Kelola Client — Microcervices Gateway');

  const mode = await select({
    message: 'Mau apa?',
    choices: [
      { name: 'Daftarkan client baru', value: 'create' },
      { name: 'Kelola client yang sudah ada', value: 'manage' },
    ],
  });

  if (mode === 'create') {
    await createClient();
  } else {
    await manageClient();
  }
}

main()
  .catch((err) => {
    ui.error(`Gagal: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
